<?php
/**
 * Plugin Name: LigerBots Carpool Integration
 * Description: Adds an authenticated WordPress launch flow for the LigerBots Carpool application.
 * Version: 0.1.0
 * Requires at least: 6.0
 * Requires PHP: 8.0
 * Author: LigerBots
 * License: GPL-2.0-or-later
 * Text Domain: ligerbots-carpool-integration
 */

declare(strict_types=1);

namespace LigerBots\CarpoolIntegration;

if (!defined('ABSPATH')) {
    exit;
}

$autoload = __DIR__ . '/vendor/autoload.php';
if (is_readable($autoload)) {
    require_once $autoload;
}

final class Plugin
{
    private const ACTION = 'ligerbots_carpool_launch';
    private const TOKEN_TTL = 60;
    private const MAX_CODE_LENGTH = 512;

    public static function register(): void
    {
        add_filter('wp_nav_menu_objects', [self::class, 'prepare_existing_menu_item'], 20, 2);
        add_filter('render_block_data', [self::class, 'prepare_navigation_block'], 20, 3);
        add_filter('render_block_core/navigation-link', [self::class, 'prepare_rendered_navigation_link'], 20, 2);
        add_action('admin_post_' . self::ACTION, [self::class, 'handle_launch']);
        add_action('admin_post_nopriv_' . self::ACTION, [self::class, 'handle_launch']);
    }

    /**
     * Point the existing menu item at the nonce-protected launch handler.
     *
     * @param array<int, object> $items Menu items.
     * @param object $args Menu arguments.
     */
    public static function prepare_existing_menu_item(array $items, $args): array
    {
        if (!is_user_logged_in()) {
            return $items;
        }

        $launch_url = self::launch_handler_url();

        $menu_item_id = (int) apply_filters('ligerbots_carpool_menu_item_id', 0);
        foreach ($items as $item) {
            $is_configured_item = $menu_item_id > 0 && (int) $item->ID === $menu_item_id;
            $is_named_item = in_array(
                strtolower(trim((string) $item->title)),
                ['carpools', 'resources / carpools'],
                true
            );

            if ($is_configured_item || $is_named_item) {
                $item->url = $launch_url;
                $item->target = '';
            }
        }

        return $items;
    }

    /**
     * Point a block-theme Navigation link at the launch handler.
     *
     * @param array<string, mixed> $parsed_block Parsed block.
     * @param array<string, mixed>|null $source_block Original block.
     * @param array<string, mixed>|null $parent_block Parent block.
     * @return array<string, mixed>
     */
    public static function prepare_navigation_block(array $parsed_block, $source_block, $parent_block): array
    {
        if (!is_user_logged_in() || ($parsed_block['blockName'] ?? '') !== 'core/navigation-link') {
            return $parsed_block;
        }

        $label = strtolower(trim((string) ($parsed_block['attrs']['label'] ?? '')));
        if ($label === 'carpools' || $label === 'resources / carpools') {
            $parsed_block['attrs']['url'] = self::launch_handler_url();
        }

        return $parsed_block;
    }

    /**
     * Rewrite a referenced block-theme navigation link after it is rendered.
     *
     * @param string $block_content Rendered navigation-link markup.
     * @param array<string, mixed> $block Parsed block.
     */
    public static function prepare_rendered_navigation_link(string $block_content, array $block): string
    {
        if (!is_user_logged_in()) {
            return $block_content;
        }

        $label = strtolower(trim((string) ($block['attrs']['label'] ?? '')));
        if ($label !== 'carpools' && $label !== 'resources / carpools') {
            return $block_content;
        }

        $launch_url = esc_url(self::launch_handler_url());
        $updated = preg_replace_callback(
            '/(<a\b[^>]*\bhref=)(["\'])(.*?)\2/i',
            static function (array $matches) use ($launch_url): string {
                return $matches[1] . $matches[2] . $launch_url . $matches[2];
            },
            $block_content,
            1
        );

        return is_string($updated) ? $updated : $block_content;
    }

    private static function launch_handler_url(): string
    {
        return wp_nonce_url(
            add_query_arg(
                ['action' => self::ACTION],
                admin_url('admin-post.php')
            ),
            self::ACTION
        );
    }

    public static function handle_launch(): void
    {
        $correlation_id = wp_generate_uuid4();
        self::log_event('launch_started', $correlation_id);

        if (!is_user_logged_in()) {
            self::log_event('launch_rejected', $correlation_id, ['reason' => 'not_authenticated']);
            self::fail('Please log into the LigerBots web site first and click Resources/Carpools', 403, $correlation_id);
        }

        self::log_event('nonce_check_started', $correlation_id);
        check_admin_referer(self::ACTION);
        self::log_event('nonce_verified', $correlation_id);

        try {
            $config = self::config();
            self::log_event('configuration_validated', $correlation_id);
            $profile = self::current_profile();
            self::log_event('profile_validated', $correlation_id, [
                'profile_fields' => array_keys($profile),
            ]);
            $token = self::create_provisioning_token($profile, $config);
            self::log_event('provisioning_token_created', $correlation_id);
            self::log_event('provisioning_request_started', $correlation_id);
            $response = self::provision($token, $config, $correlation_id);
            self::log_event('provisioning_response_validated', $correlation_id);
            $launch_url = self::launch_url($response['launch_code'], $config);
            self::log_event('launch_url_created', $correlation_id);
        } catch (\Throwable $error) {
            self::log_failure($correlation_id, $error);
            self::fail(
                'Carpool is temporarily unavailable. Please try again later. Reference: ' . $correlation_id,
                502,
                $correlation_id,
                false
            );
        }

        self::log_event('launch_redirect_ready', $correlation_id);
        wp_redirect($launch_url, 303, 'LigerBots Carpool Integration');
        exit;
    }

    /**
     * @return array<string, mixed>
     */
    private static function config(): array
    {
        $config = [
            'provisioning_url' => '',
            'launch_url' => '',
            'issuer' => home_url('/'),
            'audience' => 'carpool-provisioning',
            'key_id' => '',
            'private_key' => defined('LIGERBOTS_CARPOOL_PRIVATE_KEY') ? LIGERBOTS_CARPOOL_PRIVATE_KEY : '',
            'timeout' => 10,
        ];

        /** @var array<string, mixed> $filtered */
        $filtered = apply_filters('ligerbots_carpool_config', $config);
        $config = array_merge($config, $filtered);

        foreach (['provisioning_url', 'launch_url', 'issuer', 'audience', 'key_id', 'private_key'] as $required) {
            if (!is_string($config[$required]) || $config[$required] === '') {
                throw new \RuntimeException('Missing Carpool integration configuration: ' . $required);
            }
        }

        if (
            !self::local_http_enabled() &&
            (!self::is_https_url($config['provisioning_url']) || !self::is_https_url($config['launch_url']))
        ) {
            throw new \RuntimeException('Carpool integration URLs must use HTTPS');
        }

        $config['timeout'] = max(1, min(30, (int) $config['timeout']));

        return $config;
    }

    private static function local_http_enabled(): bool
    {
        return defined('LIGERBOTS_CARPOOL_ALLOW_HTTP') &&
            LIGERBOTS_CARPOOL_ALLOW_HTTP === true &&
            function_exists('wp_get_environment_type') &&
            wp_get_environment_type() === 'local';
    }

    /**
     * @return array{uid: string, first_name: string, last_name: string, email: string, telephone?: string}
     */
    private static function current_profile(): array
    {
        $user = wp_get_current_user();
        if (!$user || !$user->exists()) {
            throw new \RuntimeException('Authenticated WordPress user was not available');
        }

        $email = sanitize_email((string) $user->user_email);
        $first_name = sanitize_text_field((string) $user->first_name);
        $last_name = sanitize_text_field((string) $user->last_name);

        if ($first_name === '' || $last_name === '' || !is_email($email)) {
            throw new \RuntimeException('WordPress profile is missing a valid name or email');
        }

        $profile = [
            'uid' => (string) $user->ID,
            'first_name' => $first_name,
            'last_name' => $last_name,
            'email' => $email,
        ];

        $telephone = self::telephone($user->ID);
        if ($telephone !== '') {
            $profile['telephone'] = $telephone;
        }

        return $profile;
    }

    private static function telephone(int $user_id): string
    {
        $meta_keys = apply_filters(
            'ligerbots_carpool_telephone_meta_keys',
            ['phone_number', 'telephone', 'phone']
        );

        foreach ($meta_keys as $meta_key) {
            $value = sanitize_text_field((string) get_user_meta($user_id, (string) $meta_key, true));
            if ($value !== '') {
                return $value;
            }
        }

        return '';
    }

    /**
     * @param array{uid: string, first_name: string, last_name: string, email: string, telephone?: string} $profile
     * @param array<string, mixed> $config
     */
    private static function create_provisioning_token(array $profile, array $config): string
    {
        if (!class_exists('\\Firebase\\JWT\\JWT')) {
            throw new \RuntimeException('firebase/php-jwt is not installed');
        }

        $now = time();
        $payload = [
            'iss' => $config['issuer'],
            'sub' => $profile['uid'],
            'aud' => $config['audience'],
            'iat' => $now,
            'nbf' => $now,
            'exp' => $now + self::TOKEN_TTL,
            'jti' => wp_generate_uuid4(),
            'user' => [
                'first_name' => $profile['first_name'],
                'last_name' => $profile['last_name'],
                'email' => $profile['email'],
            ],
        ];

        if (isset($profile['telephone'])) {
            $payload['user']['telephone'] = $profile['telephone'];
        }

        return \Firebase\JWT\JWT::encode(
            $payload,
            $config['private_key'],
            'RS256',
            $config['key_id']
        );
    }

    /**
     * @param array<string, mixed> $config
     * @return array{launch_code: string}
     */
    private static function provision(string $token, array $config, string $correlation_id): array
    {
        $response = wp_remote_post(
            $config['provisioning_url'],
            [
                'timeout' => $config['timeout'],
                'redirection' => 0,
                'blocking' => true,
                'headers' => [
                    'Authorization' => 'Bearer ' . $token,
                    'Content-Type' => 'application/json',
                    'X-Correlation-ID' => $correlation_id,
                ],
                'body' => wp_json_encode(['source_system' => 'wordpress']),
                'sslverify' => true,
            ]
        );

        if (is_wp_error($response)) {
            throw new \RuntimeException('Provisioning request failed: ' . $response->get_error_code());
        }

        $status = wp_remote_retrieve_response_code($response);
        if ($status < 200 || $status >= 300) {
            throw new \RuntimeException('Provisioning request returned HTTP ' . $status);
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($body) || !isset($body['launch_code']) || !is_string($body['launch_code'])) {
            throw new \RuntimeException('Provisioning response did not contain a launch code');
        }

        $code = $body['launch_code'];
        if (strlen($code) < 32 || strlen($code) > self::MAX_CODE_LENGTH || !preg_match('/^[A-Za-z0-9_-]+$/', $code)) {
            throw new \RuntimeException('Provisioning response contained an invalid launch code');
        }

        return ['launch_code' => $code];
    }

    /**
     * @param array<string, mixed> $config
     */
    private static function launch_url(string $code, array $config): string
    {
        $url = add_query_arg('code', $code, $config['launch_url']);
        if (!self::local_http_enabled() && !self::is_https_url($url)) {
            throw new \RuntimeException('Generated launch URL is not HTTPS');
        }

        return $url;
    }

    private static function is_https_url(string $url): bool
    {
        $parts = wp_parse_url($url);
        return is_array($parts)
            && isset($parts['scheme'], $parts['host'])
            && strtolower($parts['scheme']) === 'https';
    }

    private static function log_failure(string $correlation_id, \Throwable $error): void
    {
        self::log_event('launch_failed', $correlation_id, ['reason' => $error->getMessage()]);
    }

    /**
     * Log workflow progress without logging credentials or profile values.
     *
     * @param array<string, scalar|array<int, string>> $context
     */
    private static function log_event(string $event, string $correlation_id, array $context = []): void
    {
        $payload = array_merge([
            'event' => $event,
            'correlation_id' => $correlation_id,
        ], $context);

        error_log('[LigerBots Carpool] ' . wp_json_encode($payload));
    }

    private static function fail(string $message, int $status, string $correlation_id, bool $log = true): void
    {
        if ($log) {
            error_log(sprintf(
                '[LigerBots Carpool] launch rejected correlation_id=%s reason=%s',
                $correlation_id,
                $message
            ));
        }

        wp_die(
            esc_html($message),
            esc_html__('Carpool launch unavailable', 'ligerbots-carpool-integration'),
            ['response' => $status]
        );
    }
}

Plugin::register();

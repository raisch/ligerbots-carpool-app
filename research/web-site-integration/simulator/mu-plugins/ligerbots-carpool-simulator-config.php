<?php
/**
 * Local-only Carpool integration configuration for the simulator.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('WP_ENVIRONMENT_TYPE')) {
    define('WP_ENVIRONMENT_TYPE', 'local');
}

if (!defined('LIGERBOTS_CARPOOL_ALLOW_HTTP')) {
    define('LIGERBOTS_CARPOOL_ALLOW_HTTP', true);
}

if (!defined('LIGERBOTS_CARPOOL_PRIVATE_KEY')) {
    define(
        'LIGERBOTS_CARPOOL_PRIVATE_KEY',
        is_readable('/run/keys/wordpress-private.pem')
            ? file_get_contents('/run/keys/wordpress-private.pem')
            : ''
    );
}

add_filter('ligerbots_carpool_config', static function (array $config): array {
    $config['provisioning_url'] =
        'http://carpool:3000/api/integration/wordpress/provision';
    $config['launch_url'] = 'http://localhost:3000/launch';
    $config['issuer'] = 'https://www.ligerbots.org';
    $config['audience'] = 'carpool-provisioning';
    $config['key_id'] = 'wordpress-development';

    return $config;
});

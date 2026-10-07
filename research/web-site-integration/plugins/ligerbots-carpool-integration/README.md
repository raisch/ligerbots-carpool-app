# LigerBots Carpool Integration

This WordPress plugin implements the production-side half of the web-site
integration plan. It connects the existing **Resources / Carpools** menu item
to an authenticated WordPress handler and sends a short-lived RS256
provisioning JWT to the Carpool service before redirecting the browser with
the returned one-time launch code.

The plugin does not authenticate users itself. WordPress login remains the
source of truth, and the Carpool service must validate the JWT, upsert the
profile, consume the launch code atomically, and create its own session.

The plugin requires PHP 8.0 or newer because it uses the maintained 7.x
release line of `firebase/php-jwt`.

## Install

From this directory:

```sh
composer install --no-dev --prefer-dist
```

Copy the complete `plugins/ligerbots-carpool-integration/` directory,
including `vendor/`, into the WordPress `wp-content/plugins/` directory and
activate **LigerBots Carpool Integration** from the WordPress admin screen.

The plugin intentionally fails closed if the JWT dependency or required
configuration is missing.

## Existing menu item

The plugin does not create or append a menu item. It updates the URL of the
existing item at render time so that logged-in users receive a
nonce-protected link to the server-side launch handler. It supports both
classic WordPress menus and block-theme Navigation blocks.

The default matching titles are `Carpools` and `Resources / Carpools`. If the
site uses a different title, configure the WordPress menu item ID:

```php
add_filter('ligerbots_carpool_menu_item_id', static function (): int {
    return 123; // Existing WordPress menu item ID.
});
```

The menu item remains hidden or unchanged for logged-out users; the handler
also checks authentication independently.

## Configuration

Define the private key in protected server configuration, outside the plugin
directory and web root. For example, in `wp-config.php`:

```php
define('LIGERBOTS_CARPOOL_PRIVATE_KEY', file_get_contents('/run/secrets/ligerbots-carpool-wordpress-private.pem'));
```

The integration settings are supplied through the `ligerbots_carpool_config`
filter:

```php
add_filter('ligerbots_carpool_config', static function (array $config): array {
    $config['provisioning_url'] = 'https://carpool.example.org/api/integration/wordpress/provision';
    $config['launch_url'] = 'https://carpool.example.org/launch';
    $config['issuer'] = 'https://www.ligerbots.org';
    $config['audience'] = 'carpool-provisioning';
    $config['key_id'] = 'wordpress-production-2026-01';
    return $config;
});
```

The private key, provisioning URL, issuer, audience, and key ID are required.
Provisioning and launch URLs must use HTTPS. Use separate key IDs and
configuration for development, staging, and production.

For the local Docker simulator only, HTTP can be explicitly enabled by setting
both of these values in `wp-config.php`:

```php
define('WP_ENVIRONMENT_TYPE', 'local');
define('LIGERBOTS_CARPOOL_ALLOW_HTTP', true);
```

This opt-in is ignored unless WordPress reports the environment as `local`.
Never enable it in staging or production.

The simulator uses these local endpoints:

```php
add_filter('ligerbots_carpool_config', static function (array $config): array {
    $config['provisioning_url'] = 'http://carpool:3000/api/integration/wordpress/provision';
    $config['launch_url'] = 'http://localhost:3000/launch';
    $config['issuer'] = 'https://www.ligerbots.org';
    $config['audience'] = 'carpool-provisioning';
    $config['key_id'] = 'wordpress-development';
    return $config;
});
```

The provisioning URL uses the Docker Compose service name because WordPress
calls it from inside the container. The launch URL uses `localhost` because
the user's browser follows it from the host machine.

The telephone number is optional. By default, the plugin checks the
`phone_number`, `telephone`, and `phone` user-meta fields in that order. Sites
with a different field can change the list with
`ligerbots_carpool_telephone_meta_keys`.

## Behavior

1. The existing menu item is pointed at the nonce-protected handler for
   logged-in users.
2. The handler independently checks WordPress authentication and the WordPress
   nonce.
3. The current user's WordPress numeric ID is sent as the stable `sub` value.
4. The JWT contains `iss`, `sub`, `aud`, `iat`, `nbf`, `exp`, `jti`, and the
   approved profile fields.
5. The JWT is sent only in an HTTPS `Authorization` header with a bounded
   timeout and TLS verification enabled.
6. Only a validated opaque launch code is accepted from the Carpool response.
7. The browser is redirected to the configured Carpool launch URL with the
   code; the JWT and profile are never placed in the URL.
8. Failures show a generic user-safe message and log only a correlation ID and
   non-sensitive failure reason.

## Logging

The launch handler logs each workflow step to the WordPress PHP error log.
Every event includes the same correlation ID so the WordPress and Carpool
service logs can be matched:

```text
[LigerBots Carpool] {"event":"provisioning_request_started","correlation_id":"..."}
```

Typical events are:

```text
launch_started
nonce_check_started
nonce_verified
configuration_validated
profile_validated
provisioning_token_created
provisioning_request_started
provisioning_response_validated
launch_url_created
launch_redirect_ready
launch_failed
```

The plugin does not log JWTs, authorization headers, WordPress nonces, launch
codes, private keys, passwords, email addresses, or telephone numbers. The
`profile_validated` event records only the names of fields that were present.

## Operational requirements

- Keep the private key out of source control and outside the web root.
- Configure the matching public key on Carpool and support overlapping `kid`
  values during key rotation.
- Do not log authorization headers, JWTs, launch codes, email addresses, or
  telephone numbers.
- Keep WordPress and Carpool clocks synchronized.
- Deploy the Carpool provisioning endpoint and public key before enabling this
  plugin for users.

The local JavaScript test jig at
[`../test-jigs/production-side.test.mjs`](../test-jigs/production-side.test.mjs)
provides the contract scenarios this plugin is intended to satisfy. The local
jig uses an HS256 test secret for portability; this plugin uses RS256 as
required for production.

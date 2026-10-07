# Web-Site Integration Simulator

This directory provides a local WordPress and MySQL environment for
developing the LigerBots Carpool web-site integration. It is intended for
manual WordPress setup and plugin verification; it does not contain production
data or production credentials.

## Services

| Service | Local address | Purpose |
| --- | --- | --- |
| WordPress | <http://localhost:8080> | Local WordPress site |
| MySQL | internal Compose service `db:3306` | WordPress database |
| Carpool auth service | <http://localhost:3000> | Local provisioning, launch-code, and session boundary |

The WordPress container mounts the plugin from
`../plugins/ligerbots-carpool-integration/` into the standard WordPress plugin
directory. It also mounts a simulator-only must-use plugin that applies the
local Carpool configuration on every WordPress run. The Carpool container
mounts the development public key from `keys/`. The MySQL data and WordPress
installation are stored in the named volumes declared by
[docker-compose.yml](./docker-compose.yml).

## Start

From this directory, generate the development RSA key pair required by the
Carpool service, then start the services:

```sh
mkdir -p keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  -out keys/wordpress-private.pem
openssl rsa -in keys/wordpress-private.pem -pubout \
  -out keys/wordpress-public.pem
chmod 600 keys/wordpress-private.pem

docker compose up -d
docker compose ps
```

Open <http://localhost:8080> and complete the initial WordPress installation.
Use the local development credentials stored in `creds.txt`; do not publish
that file or copy its values into documentation.

To stop the services while preserving their data:

```sh
docker compose down
```

To remove the local WordPress and MySQL volumes as well:

```sh
docker compose down -v
```

## Plugin setup

Install the plugin dependency before activating the plugin. From the
repository root:

```sh
cd research/web-site-integration/plugins/ligerbots-carpool-integration
composer install --no-dev --prefer-dist
```

### Use Composer through Docker

From the plugin directory:

```sh
cd ../plugins/ligerbots-carpool-integration
docker run --rm \
  -v "$PWD:/app" \
  -w /app \
  composer:2 install --no-dev --prefer-dist
```

The command uses the official Composer image, mounts the current plugin
directory, and writes `vendor/` and `vendor/autoload.php` into that directory.
Because the plugin directory is bind-mounted into the WordPress service, the
new dependency files are immediately visible to WordPress. The Composer
container is removed after the command completes. The plugin requires PHP 8.0
or newer; the `wordpress:latest` simulator image should be checked before
activation if the tag is pinned to an older WordPress/PHP image.

In the WordPress admin UI:

1. Activate **LigerBots Carpool Integration** under **Plugins**.
2. Go to **Appearance → Editor → Navigation**.
3. Select the primary navigation and add a parent item named `Resources`.
4. Add a child item named `Carpools` under `Resources`. Its initial URL can be
   `#`; the plugin replaces it with the nonce-protected launch URL for logged-in
   users.
5. Sign in as a test user with first name, last name, email, and optional
   telephone metadata.
6. Use the `Resources → Carpools` item to exercise the launch handler.

Classic themes may instead use **Appearance → Menus**. In that case, create
the same `Resources → Carpools` hierarchy in the primary menu location.

See the [plugin README](../plugins/ligerbots-carpool-integration/README.md) for
the configuration contract and security requirements.

See the [Carpool service README](./carpool-service/README.md) for the local
endpoint contract and WordPress key configuration values.

To watch the WordPress plugin's step-level logs together with the Carpool
service logs:

```sh
docker compose logs -f wordpress carpool
```

## Current limitations

- The plugin requires HTTPS provisioning and launch URLs. The default
  simulator exposes WordPress over HTTP only, so a local HTTPS reverse proxy or
  a separately running Carpool HTTPS endpoint is required for a complete
  browser launch.
- The Carpool service stores users, launch codes, and sessions in memory. It
  does not provide Directus or durable persistence.
- `creds.txt` is a local development aid and must remain uncommitted and
  undisclosed.

The simulator configuration is loaded from
[mu-plugins/ligerbots-carpool-simulator-config.php](./mu-plugins/ligerbots-carpool-simulator-config.php)
on every run; no manual `wp-config.php` edit is required.

The protocol-level behavior can be exercised without this environment using
the [integration test jigs](../test-jigs/README.md).

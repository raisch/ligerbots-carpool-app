# Carpool auth service simulator

This Node.js service provides the Carpool-side authentication boundary for the
local simulator. It is intentionally small and in-memory; it does not connect
to Directus or persist data across restarts.

## Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/health` | Service readiness check |
| `POST` | `/api/integration/wordpress/provision` | Verify the WordPress RS256 JWT, upsert the user, and return a one-time launch code |
| `GET` | `/launch?code=...` | Atomically consume the launch code and create a session |
| `GET` | `/api/carpool/me` | Return the authenticated simulator user |
| `GET` | `/carpool` | Render a minimal authenticated Carpool page |

The service validates the JWT signature, algorithm, `kid`, issuer, audience,
expiration, profile shape, and replayed `jti` values. Launch codes are stored
as SHA-256 hashes and can be consumed only once.

## Logging

Each request produces one structured JSON log entry containing:

- request ID;
- optional WordPress correlation ID;
- HTTP method;
- URL path without query strings;
- response status; and
- duration in milliseconds.

JWTs, authorization headers, cookies, and launch codes are not logged.

Follow the service logs with:

```sh
docker compose logs -f carpool
```

Example:

```text
{"event":"http_request","request_id":"...","correlation_id":"...","method":"POST","path":"/api/integration/wordpress/provision","status":200,"duration_ms":8}
```

The Compose simulator explicitly enables `LOG_PROFILE_DATA=true` so local
development can confirm exactly what profile data was shared. Successful
provisioning additionally emits a `user_provisioned` event containing the
WordPress source UID, first name, last name, email, and telephone value.
Disable this setting for any shared environment:

```yaml
LOG_PROFILE_DATA: "false"
```

This profile-data logging is for the local simulator only and must not be
carried into production logging.

## Development keys

Generate a development key pair before starting Compose:

```sh
cd research/web-site-integration/simulator
mkdir -p keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  -out keys/wordpress-private.pem
openssl rsa -in keys/wordpress-private.pem -pubout \
  -out keys/wordpress-public.pem
chmod 600 keys/wordpress-private.pem
```

The private key is mounted into WordPress at `/run/keys` for local
configuration. The public key is mounted into the Carpool service. The
`keys/` directory is local-only and must not be committed.

The WordPress plugin must use the matching values:

```text
issuer: https://www.ligerbots.org
audience: carpool-provisioning
key_id: wordpress-development
provisioning URL: http://carpool:3000/api/integration/wordpress/provision
launch URL: http://localhost:3000/launch
```

The provisioning URL uses the Compose service name when called from the
WordPress container. The launch URL uses `localhost` because the browser
follows it from the host machine.

## Start

From this directory:

```sh
docker compose build carpool
docker compose up -d
curl http://localhost:3000/health
```

Expected readiness response:

```json
{"status":"ok"}
```

The simulator uses `SESSION_COOKIE_SECURE=false` so the local HTTP endpoint
can be exercised. The production WordPress plugin requires HTTPS URLs and
should not be weakened for production; use a local TLS reverse proxy when
testing the complete browser launch through WordPress.

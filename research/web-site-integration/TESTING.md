# Web-Site Integration Testing

This guide covers browser and `curl` checks for the local WordPress-to-Carpool
authentication workflow.

The simulator is local-only. It uses an in-memory Carpool service, development
RSA keys, and a persistent WordPress/MySQL Docker volume. Do not use
production credentials, keys, profile data, or URLs in these tests.

## Prerequisites

From the simulator directory:

```sh
cd research/web-site-integration/simulator
```

Generate the development key pair if it does not already exist:

```sh
mkdir -p keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  -out keys/wordpress-private.pem
openssl rsa -in keys/wordpress-private.pem -pubout \
  -out keys/wordpress-public.pem
chmod 600 keys/wordpress-private.pem
```

Install the WordPress plugin dependency:

```sh
cd ../plugins/ligerbots-carpool-integration
docker run --rm \
  -v "$PWD:/app" \
  -w /app \
  composer:2 install --no-dev --prefer-dist
cd ../../simulator
```

Start the simulator:

```sh
docker compose up -d --build
docker compose ps
```

Expected services:

| Service | Address |
| --- | --- |
| WordPress | <http://localhost:8080> |
| Carpool | <http://localhost:3000> |
| MySQL | Docker network only |

Check readiness:

```sh
curl -i http://localhost:3000/health
```

Expected:

```http
HTTP/1.1 200 OK
```

```json
{"status":"ok"}
```

## WordPress browser setup

Complete the initial WordPress installation at
<http://localhost:8080> if the database is empty.

In the WordPress admin UI:

1. Activate **LigerBots Carpool Integration**.
2. Open **Appearance → Editor → Navigation**.
3. Create or confirm this navigation structure:

   ```text
   Resources
   └── Carpools
   ```

4. Create a WordPress test user with a first name, last name, and email.
5. Sign in as that test user.

The simulator configuration is loaded by the mounted must-use plugin at
[`simulator/mu-plugins/ligerbots-carpool-simulator-config.php`](./simulator/mu-plugins/ligerbots-carpool-simulator-config.php).

## Browser tests

### B1. Logged-out WordPress home page

Use an incognito window and open:

<http://localhost:8080>

Expected:

- WordPress responds successfully.
- The user is not authenticated.
- The `Carpools` link must not create a provisioning request.

### B2. Logged-out WordPress launch handler

In an incognito window, open:

<http://localhost:8080/wp-admin/admin-post.php?action=ligerbots_carpool_launch>

Expected:

- A user-safe response instructs the user to log into the LigerBots web site
  first.
- No JWT is created.
- Carpool receives no provisioning request.

### B3. Logged-in navigation launch

In a browser where the WordPress test user is logged in:

1. Open <http://localhost:8080>.
2. Open **Resources**.
3. Click **Carpools**.

Expected request sequence:

```text
GET  /wp-admin/admin-post.php?action=ligerbots_carpool_launch&_wpnonce=...
POST /api/integration/wordpress/provision
GET  /launch?code=...
GET  /carpool
```

Expected result:

- WordPress returns a `303` redirect.
- Carpool returns a `303` redirect from `/launch`.
- The browser receives a `carpool_session` cookie.
- The browser lands on <http://localhost:3000/carpool>.
- The page displays `LigerBots Carpool`.

The nonce and launch code are short-lived credentials. Do not copy them into
issue reports or chat.

### B4. Direct Carpool page without a session

Use an incognito window or clear the `carpool_session` cookie, then open:

<http://localhost:3000/carpool>

Expected:

```text
401 Carpool session required
```

### B5. Direct Carpool launch without a code

Open:

<http://localhost:3000/launch>

Expected:

```text
Please log into the Ligerbots web site first and click Resources/Carpools
```

The response status is `400`.

### B6. Direct Carpool launch with an invalid code

Open:

<http://localhost:3000/launch?code=not-a-real-code>

Expected:

- Status `400`.
- The same generic guidance as B5.
- No user or UID disclosure.

### B7. Launch-code replay

Complete B3, then refresh or revisit the exact `/launch?code=...` URL before
the browser has changed it.

Expected:

- Status `400`.
- The same generic guidance as B5.
- No second session is created.

## `curl` tests

### C1. Carpool health check

```sh
curl -i http://localhost:3000/health
```

Expected: `200` and `{"status":"ok"}`.

### C2. Carpool page without a session

```sh
curl -i http://localhost:3000/carpool
```

Expected:

```http
HTTP/1.1 401 Unauthorized
```

```html
<p>Carpool session required</p>
```

### C3. Current-user API without a session

```sh
curl -i http://localhost:3000/api/carpool/me
```

Expected:

```http
HTTP/1.1 401 Unauthorized
```

```json
{"error":"unauthorized"}
```

### C4. Launch without a code

```sh
curl -i http://localhost:3000/launch
```

Expected: `400` with the generic WordPress login guidance.

### C5. Launch with an invalid code

```sh
curl -i 'http://localhost:3000/launch?code=not-a-real-code'
```

Expected: `400` with the same generic guidance.

### C6. Provisioning without authorization

```sh
curl -i \
  -X POST \
  -H 'content-type: application/json' \
  --data '{"source_system":"wordpress"}' \
  http://localhost:3000/api/integration/wordpress/provision
```

Expected:

```http
HTTP/1.1 401 Unauthorized
```

```json
{"error":"unauthorized"}
```

No user or launch code is created.

### C7. Provisioning with an invalid token

```sh
curl -i \
  -X POST \
  -H 'Authorization: Bearer not-a-jwt' \
  -H 'content-type: application/json' \
  --data '{"source_system":"wordpress"}' \
  http://localhost:3000/api/integration/wordpress/provision
```

Expected: `401` with `{"error":"unauthorized"}`.

### C8. Valid provisioning request

The valid request requires an RS256 JWT signed with the local private key and
containing:

- `iss`: `https://www.ligerbots.org`;
- `aud`: `carpool-provisioning`;
- `sub`: a stable WordPress user ID;
- `kid`: `wordpress-development`;
- valid `iat`, `nbf`, `exp`, and unique `jti`;
- `user.first_name`;
- `user.last_name`;
- `user.email`; and
- optional `user.telephone`.

The easiest way to generate a valid local request is to use the existing
WordPress browser flow. The request sent by the plugin is equivalent to:

```sh
curl -i \
  -X POST \
  -H 'Authorization: Bearer <RS256_TEST_TOKEN>' \
  -H 'X-Correlation-ID: curl-test-correlation' \
  -H 'content-type: application/json' \
  --data '{"source_system":"wordpress"}' \
  http://localhost:3000/api/integration/wordpress/provision
```

Expected:

```http
HTTP/1.1 200 OK
```

```json
{"launch_code":"<opaque-code>","expires_in":60}
```

The response also includes an `X-Request-ID` header. Do not log or share the
launch code.

### C9. Launch-code exchange with `curl`

Use a launch code returned from C8:

```sh
curl -i \
  --max-redirs 0 \
  'http://localhost:3000/launch?code=<opaque-code>'
```

Expected:

- Status `303`.
- `Location: /carpool`.
- `Set-Cookie: carpool_session=...; HttpOnly; SameSite=Lax; Path=/`.

Capture the cookie value from the response, then call:

```sh
curl -i \
  -H 'Cookie: carpool_session=<session-id>' \
  http://localhost:3000/api/carpool/me
```

Expected: `200` with the provisioned user profile.

### C10. Launch-code replay with `curl`

Repeat C9 with the same code:

```sh
curl -i \
  --max-redirs 0 \
  'http://localhost:3000/launch?code=<same-opaque-code>'
```

Expected: `400` with the generic login guidance.

## Logs and evidence

Follow the simulator logs:

```sh
docker compose logs -f wordpress carpool
```

The Carpool service logs structured request events:

```json
{
  "event": "http_request",
  "request_id": "...",
  "correlation_id": "...",
  "method": "POST",
  "path": "/api/integration/wordpress/provision",
  "status": 200,
  "duration_ms": 2
}
```

The local Compose configuration also enables profile-data logging and emits a
`user_provisioned` event. Treat those logs as sensitive local test output.

Do not include the following in test reports:

- passwords;
- private keys;
- JWTs;
- authorization headers;
- WordPress nonces;
- launch codes;
- session cookies; or
- unnecessary personal data.

## Reset behavior

The Carpool service stores users, replay IDs, launch codes, and sessions in
memory. Restarting the Carpool container clears that state:

```sh
docker compose restart carpool
```

WordPress UI and database state are persistent across:

```sh
docker compose down
docker compose up -d
```

Do not use `docker compose down -v` unless you intentionally want to delete
the WordPress and MySQL volumes.

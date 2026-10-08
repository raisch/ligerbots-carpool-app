# JWT Integration Design

## Goal and scope

The Ligerbots WordPress site is the source of authentication. A user must
already be authenticated by WordPress before the Carpool application can be
opened. WordPress should provide only the identity and contact data that
Carpool needs to operate:

- A stable WordPress user identifier (`uid`).
- First name and last name.
- Email address.
- Telephone number, if Carpool requires it for its workflows.

Carpool must not trust a user-supplied `uid`, a Directus record lookup by
itself, or the presence of a link click as proof of authentication. The
Carpool backend is responsible for validating a signed credential before
creating a Carpool session.

This design assumes that no WordPress integration currently exists beyond the
inactive menu item. The WordPress implementation should therefore be delivered
as a small, site-specific plugin (or an equivalent maintained plugin module),
not as edits to the WordPress theme.

## Recommended protocol

Use two related credentials:

1. A short-lived, signed **provisioning JWT** for the WordPress-to-Carpool
   server-to-server request.
2. A short-lived, single-use **launch credential** for the browser redirect.

The provisioning JWT proves that the request came from the trusted WordPress
installation. The launch credential proves that the browser has just completed
the WordPress-controlled launch flow. After validation, Carpool creates its own
session cookie. The browser does not use the JWT as its long-lived session.

### 1. User authenticates to WordPress

WordPress's existing login mechanism remains the source of truth. The
Carpool menu item must be rendered only for an authenticated WordPress user.
The server-side handler must independently check the WordPress authentication
state; hiding the menu item in the browser is not a security control.

The menu item should link to a WordPress handler such as
`/wp-admin/admin-post.php?action=ligerbots_carpool_launch`, rather than directly
to Carpool. This gives the plugin a controlled place to validate the user and
perform the integration request.

### 2. WordPress creates a provisioning JWT

The WordPress plugin creates a JWT for each launch. It should use an asymmetric
algorithm such as `RS256` or `ES256`, with the private key stored outside the
web root and supplied through protected server configuration or a secrets
manager. The private key must never be committed to the WordPress plugin,
exposed to JavaScript, or sent to the browser.

The JWT should contain only the claims needed for this request:

```json
{
  "iss": "https://www.ligerbots.org",
  "sub": "wordpress-user-12345",
  "aud": "carpool-provisioning",
  "iat": 1791390000,
  "nbf": 1791390000,
  "exp": 1791390060,
  "jti": "a-unique-request-id",
  "user": {
    "first_name": "First",
    "last_name": "Last",
    "email": "user@example.com",
    "telephone": "+15551234567"
  }
}
```

Implementation requirements:

- `iss` identifies the exact WordPress site and is allowlisted by Carpool.
- `aud` is a fixed Carpool integration audience.
- `sub` is the stable WordPress UID, not an email address.
- `iat`, `nbf`, and `exp` limit the token lifetime (target: 60 seconds).
- `jti` uniquely identifies the request and supports replay detection.
- A `kid` header identifies the signing key for rotation.
- Personal data is sent over HTTPS and is not placed in the URL.
- The telephone claim may be omitted when it is not required; it must not be
  invented or populated with an unverified value.

The WordPress plugin sends this JWT as an `Authorization: Bearer` header to a
Carpool provisioning endpoint. The request body may contain only the data
needed to upsert the user. Keeping the claims and request body deliberately
small makes the data contract explicit.

### 3. Carpool validates the provisioning request

The Carpool backend, never the browser, performs all of the following checks:

1. Require HTTPS and a valid `Authorization` header.
2. Select the WordPress public key using the JWT `kid`. The public key may be
   configured initially and later exposed through a controlled JWKS endpoint.
3. Verify the JWT signature and reject unsupported algorithms.
4. Validate `iss`, `aud`, `sub`, `iat`, `nbf`, and `exp`, allowing only a small
   clock-skew window.
5. Reject a previously consumed `jti` or otherwise enforce the endpoint's
   replay policy.
6. Validate field formats and lengths, including email and telephone values.
7. Upsert the Directus user record by `(source_system, source_uid)`, not by
   email. A changed email address must update the existing user rather than
   create a second identity.
8. Store only the approved fields and an `updated_at` timestamp. Do not store
   the provisioning JWT.

Directus should be reachable only by the Carpool backend using a restricted
service account. The browser must not receive Directus credentials or call
Directus directly.

The endpoint should return a generic success response and a short-lived,
single-use launch code. It must not disclose whether an arbitrary UID exists.
Errors should be logged server-side with a correlation ID and returned to
WordPress as a user-safe failure.

### 4. Carpool issues a one-time launch credential

After a successful upsert, Carpool generates a cryptographically random,
high-entropy launch code. It stores only a hash of the code with:

- The verified `source_uid`.
- An expiration time (target: 60 seconds).
- A consumed flag or consumed timestamp.
- The provisioning request correlation ID.

WordPress redirects the browser to a URL such as:

```text
https://carpool.example.org/launch?code=<opaque-code>
```

The URL contains no UID, name, email, telephone number, or reusable JWT. The
code is exchanged immediately over HTTPS, invalidated atomically, and removed
from the browser address bar with a redirect to the normal Carpool route.
Carpool then creates a Secure, HttpOnly, SameSite session cookie containing
only a session identifier. The session is governed by Carpool's normal idle
timeout, absolute timeout, logout, and authorization rules.

An alternative implementation may use a signed launch JWT submitted in a
one-time browser POST. If that option is selected, Carpool must still enforce
`jti` replay protection, a very short expiration, and immediate exchange for a
session cookie. An opaque one-time code is preferred because it minimizes
personal-data and token leakage through browser history, access logs, referrer
headers, and monitoring tools.

### 5. Failure and authorization behavior

The launch handler must show the existing guidance when the user has not
completed the WordPress launch flow:

> Please log into the Ligerbots web site first and click Resources/Carpools.

Use the same user-safe response for an expired, already-used, malformed, or
unknown launch code. Do not reveal whether a particular UID or Directus record
exists. A successful identity handshake does not automatically grant every
Carpool capability; Carpool must apply its own authorization rules to the
authenticated session.

If the WordPress-to-Carpool call fails, WordPress should not redirect the user
to an apparently authenticated Carpool page. It should show a retry-safe error
with a correlation ID and log the technical detail on the server. Timeouts,
non-2xx responses, and invalid responses must be treated as failures rather
than as successful provisioning.

## Key management and operational controls

- Generate a dedicated WordPress signing key pair for this integration.
- Configure the Carpool public key through deployment configuration or a
  secrets/configuration store; do not hard-code private material.
- Support key rotation with overlapping `kid` values so the old public key
  remains valid only for the planned transition window.
- Use separate keys and audiences for development, staging, and production.
- Restrict the provisioning endpoint by authentication first; optional
  network allowlisting may be added as defense in depth, not as a replacement
  for JWT validation.
- Rate-limit launch and provisioning endpoints.
- Redact JWTs, authorization headers, launch codes, email addresses, and
  telephone numbers from application logs.
- Add audit events for successful provisioning, rejected tokens, replay
  attempts, and launch-code failures without logging credential contents.
- Use a clock-synchronized server environment.
- Document a key compromise procedure: disable the affected `kid`, deploy a
  replacement public key, rotate the WordPress private key, and invalidate
  outstanding launch credentials.

## WordPress/PHP implementation outline

The WordPress plugin should:

1. Register the authenticated Carpool menu item and its server-side launch
   handler.
2. Check `is_user_logged_in()` and load the current user through WordPress's
   user APIs.
3. Normalize and validate the approved fields before sending them.
4. Create the JWT with a vetted, maintained PHP JWT library. Do not implement
   JWT signing or cryptographic verification manually.
5. Send the request with WordPress's HTTP API (`wp_remote_post`) over HTTPS,
   using bounded connect and response timeouts and explicit handling of every
   error.
6. Validate the response schema and redirect only when a launch code is
   present and valid.
7. Avoid putting user data, JWTs, or internal error details into the redirect.
8. Make the handler safe against repeated clicks: each click may create a new
   short-lived launch attempt, but it must not create duplicate Directus
   identities.

The plugin should use WordPress nonces where appropriate for the launch action
to reduce CSRF risk, while recognizing that a nonce does not replace the
Carpool JWT validation or the WordPress login check.

## Carpool implementation outline

The Carpool service should expose:

- `POST /api/integration/wordpress/provision`: validates the provisioning JWT,
  validates the minimal profile, upserts Directus, and returns a one-time
  launch code.
- `GET /launch?code=...`: atomically exchanges the code for a Carpool session
  and redirects to the application.
- A normal authenticated-session endpoint/middleware used by every protected
  Carpool route.

The provisioning and launch-code stores need atomic create/consume behavior.
Redis, a database table, or an equivalent transactional store may be used.
The choice should follow the Carpool application's existing persistence
patterns. Directus remains the profile system of record for the data Carpool
needs; the session store remains separate from profile data.

## Development milestones

### Milestone 1: Confirm the contract and environments

- Identify the production WordPress URL, Carpool URL, and environment URLs.
- Confirm the exact stable UID source and telephone requirement.
- Define the approved profile fields, validation rules, retention expectations,
  and Carpool authorization roles.
- Define error messages, correlation IDs, timeout limits, and logout behavior.
- Record the issuer, audience, key IDs, and clock-skew policy for each
  environment.

**Exit criteria:** an approved request/response contract and an approved
  security/data-minimization checklist.

### Milestone 2: Build the Carpool integration boundary

- Implement JWT signature, issuer, audience, time, `kid`, and replay
  validation.
- Implement profile validation and Directus upsert by source UID.
- Add the restricted Directus service account and configuration.
- Implement hashed, expiring, single-use launch codes and atomic consumption.
- Add protected-route session middleware, logout, rate limiting, safe errors,
  correlation IDs, and credential-redacted audit logging.

**Exit criteria:** automated tests reject forged, expired, wrong-audience,
wrong-issuer, replayed, malformed, and over-sized requests, while valid
requests create exactly one user record and one usable launch attempt.

### Milestone 3: Build the WordPress integration plugin

- Add the authenticated menu item handler.
- Add WordPress login and nonce checks.
- Integrate a maintained PHP JWT library and secure private-key configuration.
- Implement the HTTPS `wp_remote_post` call and strict response handling.
- Add the user-safe error and retry experience.
- Enable the currently inactive menu item only after the handler is deployed
  and configured for the target environment.

**Exit criteria:** an authenticated WordPress user can initiate a launch in a
non-production environment, and an unauthenticated user cannot obtain a
launch credential by calling the handler directly.

### Milestone 4: Complete end-to-end and security testing

- Test first launch, repeated clicks, refreshes, expired codes, replayed codes,
  missing Directus records, changed profile data, and logout.
- Test unauthenticated WordPress requests and direct Carpool URL access.
- Verify that UID, personal data, JWTs, and launch codes do not appear in
  browser history, referrer headers, or normal logs beyond the unavoidable
  short-lived code before exchange.
- Test key rotation, invalid keys, clock skew, rate limits, and timeout/error
  handling.
- Run dependency and static security checks for both the PHP plugin and
  Carpool service.

**Exit criteria:** end-to-end tests pass, security review findings are
resolved or accepted, and operational alerts/logging are verified.

### Milestone 5: Production rollout and operations

- Generate production keys and store them in approved secret/configuration
  systems.
- Deploy Carpool validation and Directus configuration first.
- Deploy the WordPress plugin disabled or restricted to an administrator test
  path.
- Perform a production smoke test with a test account.
- Enable the Resources/Carpools menu item for users.
- Monitor provisioning failures, rejected tokens, replay attempts, and
  launch-code exchange latency.
- Document rollback and key-compromise procedures.

**Exit criteria:** a production user can complete the flow, unauthenticated
access is denied, and support staff have a documented diagnosis path that
does not require exposing tokens or personal data.

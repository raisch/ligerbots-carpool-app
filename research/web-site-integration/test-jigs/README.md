# Integration test jigs

These jigs turn the web-site integration plan into executable acceptance
examples before the production endpoints are implemented. They are deliberately
isolated under `research/` and do not change the SvelteKit application.

## Jigs

- [`service-side.test.mjs`](./service-side.test.mjs) covers the Carpool
  provisioning boundary: signed credentials, issuer/audience checks, replay
  protection, profile upsert behavior, and atomic one-time launch-code
  consumption.
- [`production-side.test.mjs`](./production-side.test.mjs) covers the
  WordPress-to-Carpool launch flow: authenticated provisioning, session-cookie
  exchange, protected access, and the user-safe failure message.

[`fixture.mjs`](./fixture.mjs) is a small in-memory HTTP service that stands in
for the future Carpool integration boundary. It uses no production data and
does not contact Directus. The fixture is useful for contract-first work; once
the endpoints exist, the same scenarios should be pointed at the deployed
non-production service and the fixture should remain as a fast regression
double.

## Run

From this directory:

```sh
npm test
```

Or from the repository root:

```sh
node --test research/test-jigs/*.test.mjs
```

The current fixture uses an HS256 test secret solely to keep the jig
self-contained. The production implementation must use the plan's asymmetric
algorithm, `kid`-based key rotation, HTTPS, and secrets outside the web root.

## Production-side acceptance contract

The production implementation should preserve these observable outcomes:

1. A WordPress-authenticated user receives a short-lived, single-use launch
   credential after successful provisioning.
2. The browser exchanges that credential for a Secure, HttpOnly, SameSite
   Carpool session cookie and is redirected to the normal app route.
3. Missing, malformed, expired, or replayed credentials receive the same
   guidance and do not disclose whether a UID or Directus record exists.
4. A request without a trusted provisioning credential cannot create a user or
   launch credential.

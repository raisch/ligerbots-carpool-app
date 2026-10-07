# LigerBots Web-Site Integration

This project connects the authenticated LigerBots WordPress site to the
LigerBots Carpool application.

WordPress remains the source of authentication. When an authenticated user
selects the existing **Resources / Carpools** menu item, WordPress sends a
short-lived, signed provisioning credential to Carpool. Carpool validates the
credential, upserts the user's approved profile data, returns a short-lived
single-use launch code, and exchanges that code for a Carpool session.

The design intentionally avoids treating a user-supplied UID as proof of
identity and avoids putting JWTs or profile data in browser URLs.

## Project artifacts

### Integration plan

The [web-site integration plan](./web-site-integration-plan.md) defines the
protocol, security requirements, failure behavior, key-management expectations,
implementation milestones, and production rollout steps.

### Test jigs

The [test-jigs README](./test-jigs/README.md) describes the executable
contract tests for both sides of the integration:

- [Service-side jig](./test-jigs/service-side.test.mjs) — provisioning JWT
  validation, profile upsert behavior, replay protection, and one-time launch
  code consumption.
- [Production-side jig](./test-jigs/production-side.test.mjs) — WordPress
  launch behavior, session-cookie exchange, protected access, and safe failure
  handling.

Run the jigs from this directory with:

```sh
cd test-jigs
npm test
```

The jigs use an in-memory HTTP fixture and do not contact production systems or
Directus.

### WordPress plugin

The [WordPress plugin README](./plugins/ligerbots-carpool-integration/README.md) documents the
production-side implementation. The plugin:

- connects the existing WordPress menu item to a nonce-protected handler;
- requires an authenticated WordPress user;
- creates a short-lived RS256 provisioning JWT;
- sends the JWT to the Carpool provisioning endpoint over HTTPS;
- validates the returned opaque launch code; and
- redirects the browser to Carpool without exposing the JWT or profile data in
  the URL.

The plugin source and dependency manifest are in
[plugins/ligerbots-carpool-integration/](./plugins/ligerbots-carpool-integration/).

### Local simulator

The [simulator README](./simulator/README.md) documents the Docker Compose
environment for local WordPress and MySQL setup. It explains how to start the
services, install the plugin dependencies, activate the plugin, and exercise
the existing menu item. The simulator does not replace the Carpool service or
the protocol-level test jigs.

### Testing guide

[TESTING.md](./TESTING.md) contains the browser and `curl` test cases for the
complete local workflow, including expected responses, failure cases, replay
protection, logs, and reset behavior.

## Current boundary

The WordPress plugin and test jigs are isolated under this research directory.
The Carpool service endpoints described by the plan still need to be
implemented in the application before the plugin can be deployed against a
non-production environment.
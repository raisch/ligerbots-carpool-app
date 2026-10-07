# Carpool-only site extraction plan

## 1. Objective

Reconfigure this repository from a LigerBots content site with a carpool feature into a carpool-only application whose landing page is the carpool event dashboard.

The result should:

- serve the carpool workflow from `/`;
- let authenticated team members view events, choose transportation, join or leave rides, and view rider information;
- let eligible drivers manage their vehicles and let authorized administrators manage events, trips, vehicles, assignments, riders, exports, and opt-outs;
- retain login, signup, logout, password changes, error handling, maintenance mode, and the Directus integration only where they support the carpool product;
- remove the legacy blog, announcement, social, photo, directory, sponsor, and generic CMS surface from the runtime application;
- have one canonical UI route set and one canonical API surface;
- enforce all permissions on the server, not only in Svelte components;
- preserve existing carpool data and provide redirects for old URLs during the cutover.

This document is an implementation plan, not a request to delete production data. Archive or migrate records in Directus; do not drop collections as part of the frontend extraction.

## 2. Assumptions and decisions

### Product entry behavior

`/` becomes the app entry point. It is a carpool dashboard, not a marketing homepage. The recommended behavior is:

- unauthenticated visitors see a small carpool welcome/sign-in screen with a preserved `redirect=/` or requested route;
- authenticated visitors see the published event list and their current transportation status;
- event and ride operations require login;
- public event data should not be exposed until the team explicitly decides that event names, locations, dates, or rider information are public. The existing app protects carpool routes, so the initial extraction should preserve that privacy boundary.

If the team wants a public event directory later, make that a deliberate read-only policy change; do not infer it from moving the route to `/`.

### Canonical URL set

Use the following URLs as the target surface:

| URL | Purpose | Access |
| --- | --- | --- |
| `/` | Authenticated carpool event dashboard; unauthenticated sign-in entry | Team member |
| `/events/[id]` | Event detail, destination/return trips, ride selection, opt-out state | Team member |
| `/events/[id]/attendees` | Printable event attendee list | Authenticated |
| `/events/[id]/riders` | Printable rider-by-vehicle list | Authenticated; restrict contact fields by role/query policy |
| `/events/[id]/export` | XLSX rider/driver export | Authenticated; preferably admin/authorized staff only |
| `/vehicles` | Current user’s vehicles; admin sees all vehicles | Eligible driver or admin |
| `/vehicles/[id]` | Vehicle/assigned ride details | Owner, assigned driver, or admin |
| `/admin` | Administrative carpool controls, if a separate admin landing page is useful | Admin |
| `/login` | Login | Public |
| `/signup` | Team-member registration | Public or invitation/registration-key gated |
| `/logout` | Clear session and return to `/login` | Authenticated |
| `/settings/change-password` | Password change | Authenticated |

Keep `/carpool` and existing `/carpool/[id]` URLs as temporary compatibility redirects. Do not maintain two independent implementations.

### Naming

The Directus schema currently uses `event`, `destination_trip`, `return_trip`, `ride`, `trip_ride`, `trip_ride_riders`, and event-attendee relationships. Keep those backend collection names initially to avoid a data migration. Use product-facing names consistently in the UI:

- event = carpool event;
- trip = one direction/date/time within an event;
- vehicle = a driver’s vehicle record (`ride` in Directus);
- ride option = a vehicle assigned to one trip (`trip_ride` in Directus);
- rider = a team member assigned to a ride option;
- opt-out = an explicit no-transport selection for one direction.

The frontend and API may call a Directus `ride` a `vehicle`, but the translation should happen in one server module, not throughout components.

## 3. Current-state findings

### Application shell

- `src/routes/+page.svelte` is the current homepage and renders `BlogBlock`, `UpcomingEventsBlock`, `AnnouncementsBlock`, `TwitterBlock`, and `BottomRowBlock`.
- `src/routes/+page.server.js` only loads the generic Directus site config.
- `src/routes/+layout.svelte` wraps every page in `Masthead`, `Navbar`, `MainPane`, and `Footer`.
- `src/lib/components/Masthead.svelte` contains LigerBots social links, sponsor links, and CMS asset URLs.
- `src/lib/components/Navbar.svelte` loads a generic `navbar_config` from `/api/navbar`.
- `src/lib/components/Footer.svelte` renders sponsor graphics and a sponsor-page link.
- `src/app.html` loads Bootstrap 3, jQuery 3.1, Font Awesome, Google fonts, and `/css/ligerbots.css`; the carpool components also use a mixture of Bootstrap classes, local styles, and Tailwind imports.

### Existing carpool implementation

The main flow is already recognizable:

1. `src/routes/carpool/+page.server.js` validates the JWT and loads published events.
2. `src/routes/carpool/+page.svelte` lists events and exposes admin event/vehicle actions.
3. `src/routes/carpool/[id]/+page.server.js` loads a complete event, current user selections, available vehicles, and users.
4. `src/routes/carpool/[id]/+page.svelte` displays destination and return trips and uses `CarpoolTrip.svelte` for vehicle selection, rider display, admin assignment, and move/add flows.
5. `src/lib/server/event.js`, `trip.js`, `ride.js`, `rider.js`, and `vehicle.js` call Directus GraphQL operations.
6. `src/lib/server/spreadsheet.js` creates the event XLSX export.
7. `src/routes/carpool/[id]/attendees`, `riderlist`, and `export` provide operational/print views.

There are two overlapping implementations:

- newer-looking `/api/carpool/*` endpoints and the command functions in `src/routes/carpool/ride.remote.js`;
- older/general `/api/events/*`, `/api/rides/*`, `/api/triprides/*`, and `/api/trips/*` endpoints, plus `/carpool/create`, `/carpool/[id]/edit`, and `/carpool/admin`.

The extraction must consolidate these rather than expose both.

### Current gaps and risks to resolve during extraction

- `src/routes/carpool/+page.server.js` redirects missing users to `/login?redirect=/carpool/vehicles`, even when the requested page is `/carpool`; preserve the original requested path in a shared auth helper.
- Several mutation endpoints check only that a JWT validates; they do not verify admin role, driver eligibility, resource ownership, event membership, or whether the requested user ID is the logged-in user.
- `src/routes/api/events/+server.js` has a POST path that must be brought under the same authorization policy as the carpool event endpoint.
- `src/routes/api/triprides/[id]/join/+server.js` accepts `userId` from the request body. A caller must never be able to join a ride as another user.
- `src/routes/api/triprides/[id]/leave/+server.js` calls `User.validate` without importing `User`; this route is a concrete runtime defect.
- `/api/triprides` tries three different payload formats and logs each attempt. Replace this probing implementation with one validated contract.
- `/api/triprides/[id]` exposes GET without the same auth boundary and PUT without a complete auth/ownership boundary.
- `/api/carpool/event/[id]`, `/api/carpool/trip/[id]`, and vehicle/event endpoints expose low-level mutations without a single policy layer. The trip delete handler also selects a different mutation for destination versus non-destination collections and needs explicit tests for both types.
- `/carpool/[id]/edit`, `/carpool/create`, and `/carpool/admin` derive authorization in the browser from `sessionStorage`; this is not a security control.
- `src/routes/carpool/[id]/edit/+page.server.js` performs event loading and form actions without the same server-side admin guard used by the main route.
- Event and trip forms use inconsistent field names (`type` vs `vehicle_type`, `arrives_at` in the UI but not consistently in the GraphQL types) and sometimes return raw GraphQL response shapes to the browser.
- `src/routes/carpool/ride.remote.js` uses `forEach(async ...)` and does not await all rider mutations before returning. Reservation changes need a transaction-like server operation or `Promise.all` with explicit failure handling.
- The current event page uses `-1` as an opt-out sentinel and the use-case document says opt-out is mandatory, but there is no durable, explicit opt-out model/API. This must be formalized before calling the extraction complete.
- Many server modules and components still log JWTs, user objects, backend responses, or contact data. Remove secrets and personal data from production logs.
- Contact information is rendered into ride detail pages and print views. Define role-based/contact-visibility rules before making the app the primary landing surface.

## 4. Target architecture

### Request flow

Use a single server-side session helper for all pages and API handlers:

```text
request
  -> hooks/server session normalization
  -> requireUser() / requireAdmin() / requireDriverOrAdmin()
  -> carpool service
  -> Directus GraphQL adapter
```

Components should call SvelteKit form actions or the canonical API. Components must not construct GraphQL payloads, trust client-supplied roles, or send a JWT/user ID as an authorization argument.

### Suggested module boundaries

Create or refactor toward:

- `src/lib/server/auth.js` — read cookie, validate JWT, load current user, require role, build login redirect;
- `src/lib/server/carpool/event-service.js` — list/get/create/update/archive events;
- `src/lib/server/carpool/trip-service.js` — create/update/delete trips and attach/detach vehicles;
- `src/lib/server/carpool/vehicle-service.js` — list/create/update/delete vehicles with driver rules;
- `src/lib/server/carpool/transport-service.js` — join, leave, opt-in, opt-out, move rider, and current-user status;
- `src/lib/server/carpool/export-service.js` — XLSX generation, using the existing spreadsheet code after it is made null-safe;
- `src/lib/server/carpool/validation.js` — Joi or equivalent schemas for every request body and normalized response DTO;
- `src/lib/server/directus.js` or the existing `client.js` — one backend client adapter with query/mutation error normalization.

The existing `event.js`, `trip.js`, `ride.js`, `rider.js`, and `vehicle.js` may be migrated into these modules incrementally. Avoid keeping duplicate public method names that represent the same operation.

### Data returned to the browser

Return a normalized DTO rather than raw Directus polymorphic relationship objects. At minimum:

```js
{
  id,
  name,
  description,
  startDate,
  endDate,
  location,
  status,
  trips: [{
    id,
    direction: 'outbound' | 'return',
    destination,
    departsFrom,
    departsOn,
    departsAt,
    arrivesAt,
    rideOptions: [{
      id,
      vehicle: { id, name, type, seats },
      drivers: [{ id, firstName, lastName }],
      riders: [{ id, firstName, lastName }],
      availableSeats
    }]
  }],
  currentUser: {
    eventStatus: 'unregistered' | 'registered',
    outbound: { state: 'selected' | 'opted_out' | 'unresolved', rideId: null },
    return: { state: 'selected' | 'opted_out' | 'unresolved', rideId: null }
  }
}
```

Do not send passwords, JWTs, administrative flags, parent/emergency data, or broad directory records to the browser when a smaller DTO will do.

## 5. Route extraction work

### 5.1 Make the root route the carpool dashboard

Refactor:

- `src/routes/+page.server.js`: require/resolve the current user, load published events, compute each event’s current-user summary, and return only carpool data plus maintenance state if needed.
- `src/routes/+page.svelte`: replace all content-site blocks with the event dashboard currently in `src/routes/carpool/+page.svelte`. Add an explicit empty state, loading/error state, login CTA for unauthenticated visitors, and accessible admin controls.
- Move reusable event-list UI into `src/lib/components/carpool/EventDashboard.svelte` rather than leaving a second copy in `/carpool`.
- Add `<svelte:head>` title and description such as “Carpool — LigerBots” and a carpool-specific metadata description.

Choose one of these implementation shapes and use it consistently:

1. **Preferred:** make `/` canonical and have `/carpool` be a redirect-only route.
2. **Transitional:** have `/` server-redirect to `/carpool` while the extraction is staged, then remove the extra route after the dashboard is moved.

Do not leave `/` rendering blog/news blocks after the extraction.

### 5.2 Normalize detail and management routes

Move or copy the useful carpool screens into the canonical URL set:

- `src/routes/carpool/[id]/+page.server.js` and `+page.svelte` → `/events/[id]`.
- `src/routes/carpool/[id]/attendees/*` → `/events/[id]/attendees`.
- `src/routes/carpool/[id]/riderlist/*` → `/events/[id]/riders`.
- `src/routes/carpool/[id]/export/+server.js` → `/events/[id]/export`.
- `src/routes/carpool/vehicles/*` → `/vehicles`.
- `src/routes/carpool/vehicle/[id]/*` → `/vehicles/[id]`.
- `src/routes/carpool/admin/*` → `/admin` only if its separate administrative page remains necessary; otherwise fold its vehicle controls into `/vehicles`.
- Replace `/carpool/create` and `/carpool/[id]/edit` with admin-only event create/edit UI under the dashboard and event detail page, or move them to `/admin/events/new` and `/admin/events/[id]/edit`.

Add redirect-only legacy routes for at least:

- `/carpool` → `/`;
- `/carpool/[id]` → `/events/[id]`;
- `/carpool/[id]/attendees` → `/events/[id]/attendees`;
- `/carpool/[id]/riderlist` → `/events/[id]/riders`;
- `/carpool/[id]/export` → `/events/[id]/export`;
- `/carpool/vehicles` → `/vehicles`;
- `/carpool/vehicle/[id]` → `/vehicles/[id]`.

Use SvelteKit `redirect(308, ...)` for permanent canonicalization once deployed. Preserve the event/vehicle ID and any safe query string such as `hide-contact`; never preserve arbitrary authorization-like query parameters.

### 5.3 Keep support routes, but make them carpool-specific

Retain:

- `/login`, `/logout`, `/signup`, `/settings/change-password`, and `+error.svelte`;
- maintenance mode handling if operations still need a kill switch;
- the login redirect parameter, validated to prevent open redirects;
- the user model fields required for carpool identity, driver eligibility, and admin authorization.

Rewrite titles, copy, and navigation so users never see references to the old general LigerBots website.

### 5.4 Remove non-carpool routes from the active surface

Delete or move to an explicit archive branch after redirects/data-retention review:

- `src/routes/[slug]/*` generic CMS pages;
- `src/routes/announcement/*`;
- `src/routes/blog/*`;
- `src/routes/post/*`;
- `src/routes/directory/*`;
- `src/routes/facebook/*`;
- `src/routes/photos/*`;
- any sponsor/current-sponsor page reached through the old CMS route.

If old public URLs must remain reachable for a period, replace these route files with a small `410 Gone` page or a deliberate redirect to `/`, documented in the cutover section. Do not leave them accidentally handled by a generic `[slug]` route.

## 6. API consolidation

### 6.1 Canonical API contracts

Use resource-oriented routes and server-derived identity. The exact names can be adjusted, but the following capability set must exist exactly once:

| Capability | Canonical endpoint | Rules |
| --- | --- | --- |
| List events | `GET /api/events?status=published` | Authenticated; only allowed statuses |
| Create event | `POST /api/events` | Admin only; validate dates/status |
| Read event | `GET /api/events/[id]` | Authenticated; normalized DTO |
| Update/archive event | `PATCH /api/events/[id]` | Admin only; archive rather than hard-delete by default |
| Create trip | `POST /api/events/[id]/trips` | Admin only; direction/date/time validated |
| Update/delete trip | `PATCH/DELETE /api/trips/[id]` | Admin only; reject deletion if policy says riders exist, or perform a safe cascade |
| List vehicles | `GET /api/vehicles` | Admin sees all; driver sees owned vehicles |
| Create/update/delete vehicle | `POST/PATCH/DELETE /api/vehicles/[id]` | Eligible driver owns; admin can manage all |
| Attach vehicle to trip | `POST /api/trips/[id]/ride-options` | Driver may attach owned vehicle; admin any allowed vehicle |
| Detach vehicle | `DELETE /api/trip-rides/[id]` | Owner/admin; validate existing riders and confirmation policy |
| Join ride | `POST /api/trip-rides/[id]/join` | Identity comes from session; capacity and one-seat rule enforced |
| Leave ride | `DELETE /api/trip-rides/[id]/membership` | Identity comes from session; admin may remove another rider via a separate explicit action |
| Update transportation choice | `PUT /api/events/[id]/transportation` | Atomic update for outbound/return selection or opt-out |
| Current-user status | `GET /api/events/[id]/transportation` | Session-scoped; no user ID parameter |
| Admin add/move/remove rider | `POST/DELETE /api/trip-rides/[id]/riders/[userId]` | Admin only; audit the actor |
| Event export | `GET /events/[id]/export` | Authenticated and role-restricted; no raw data in error output |

Normalize all errors to `{ error: { code, message, fieldErrors? } }` with appropriate 400/401/403/404/409/422/500 statuses. Do not return raw GraphQL errors, stack traces, response bodies, JWTs, or Directus internals to clients.

### 6.2 Remove/alias duplicate APIs

Migrate callers away from:

- `/api/carpool/event/*`;
- `/api/carpool/trip/*`;
- `/api/carpool/vehicle/*`;
- `/api/carpool/confirm`;
- `/api/events/[id]/trips` once the canonical event-trip endpoint exists;
- `/api/rides/*`;
- `/api/triprides/*`;
- `/api/trips/[triptype]`.

During migration, make old endpoints thin adapters to the new service or return a documented deprecation response. Do not leave old handlers calling Directus independently. Remove them after logs show no remaining client usage.

### 6.3 Make transportation selection atomic

Replace the current client-driven sequence in `src/routes/carpool/ride.remote.js` with one server operation that:

1. loads the authenticated user and target event;
2. confirms the event is published/eligible for registration;
3. validates both directions in one request;
4. removes or replaces the user’s previous selection for each direction;
5. writes exactly one selected ride or explicit opt-out per direction;
6. rejects a full ride with `409`;
7. rejects a second ride for the same direction with `409`;
8. returns the complete updated status and normalized event summary.

If Directus cannot provide a transaction for the required writes, implement an idempotent compensation strategy and optimistic concurrency check. Do not use `forEach(async ...)` for business-critical writes.

## 7. Business rules to implement and test

The existing `dev-plan/use-cases-summary.md` describes these rules; the extraction must make them real at both service and UI levels:

1. **One seat per direction:** a user can select no more than one ride option for outbound and one for return.
2. **Mandatory resolution:** before confirming registration, each direction must be either a selected ride or explicit opt-out. An unresolved direction is not a valid registration.
3. **Capacity:** a ride cannot exceed its available seats. Define whether `seats` means passenger seats excluding the driver; apply the same definition in UI, API, and XLSX output.
4. **Eligibility:** only `carpool_driver_eligible` users may create/own vehicles; admins may manage them according to policy.
5. **Ownership:** a non-admin can edit/delete/attach only their own vehicle and cannot remove another driver’s vehicle from a trip.
6. **Membership:** a normal user can join/leave only as themselves; an admin can add/move/remove another rider through explicit admin operations.
7. **Event state:** only published events can accept ordinary registration; drafts are admin-only; archived events are read-only.
8. **Trip state:** only published/active trips accept ride assignments; deleted/archived trips must not remain selectable.
9. **Idempotency:** repeating join/leave/opt-out requests produces the same state, not duplicate relationships.
10. **Concurrency:** two simultaneous joins cannot both consume the last seat.
11. **Privacy:** attendee/rider contact fields are returned only to roles that need them, and print/export views obey the same policy.
12. **Auditability:** admin changes, rider moves, opt-in/opt-out, and capacity conflicts should be logged with actor, event, trip, target user, and timestamp without logging credentials.

Add durable opt-out state. Prefer a dedicated event-direction membership/transportation record if the Directus schema permits it. If the current schema must be preserved, define a documented relationship/status representation and remove the magic `-1` sentinel from the public API. The UI may use an internal enum, but the backend must store an explicit state.

## 8. Authentication and authorization hardening

### Shared server guards

Implement and use helpers such as:

- `getSessionUser(cookies)` — validate signature and expiry, then load/confirm the current user where needed;
- `requireUser(event)` — returns the current user or redirects/returns 401;
- `requireAdmin(event)` — returns 403 for a valid non-admin;
- `requireEligibleDriverOrAdmin(event)` — validates the current user’s current driver eligibility, not only a stale client payload;
- `requireEventAccess(eventId, user)` — centralizes event visibility and archived-event rules.

Every page `load`, form action, and API mutation must use the appropriate guard. UI conditionals are for usability only.

### Cookie/session rules

- Set the JWT cookie with `HttpOnly`, `Secure` in production, `SameSite=Lax` or stricter, an explicit path, and an appropriate expiry.
- Stop using `sessionStorage` as the source of identity or admin status. Remove the browser-side `sessionStorage.getItem('user')` branches in carpool pages.
- Do not pass `jwt`, `user`, or `isAdmin` from the browser as authority-bearing request fields. The server derives them from cookies.
- Validate login redirect destinations as same-origin paths to prevent open redirects.
- Avoid logging JWTs; remove existing `console.log` calls that print tokens, full user objects, contact lists, or backend responses.
- Review password handling in `src/lib/server/user.js` and preserve only the registration/login/change-password operations needed by the app.

### Endpoint authorization matrix

Write tests that prove:

- a logged-out request receives 401/redirect;
- a valid team member receives 403 for admin-only writes;
- an ineligible driver receives 403 for vehicle writes;
- a driver cannot mutate another driver’s vehicle or ride assignment;
- a user cannot join or remove another user by changing a request body ID;
- an admin can perform approved administrative actions;
- archived events reject new reservations;
- raw backend failure details are not leaked.

## 9. Frontend rework

### Shared app shell

Replace the general site shell with a focused carpool shell:

- `Masthead.svelte` becomes a small carpool brand/header with a home link, current-user identity, and sign-out.
- `Navbar.svelte` becomes static or server-provided carpool navigation: Events, My vehicles, and Admin when authorized. Remove generic `navbar_config` and `/api/navbar` dependency.
- `MainPane.svelte` may be retained as a layout primitive but remove old homepage classes and Bootstrap-specific assumptions.
- `Footer.svelte` becomes a minimal support/footer block or is removed if it adds no carpool value.
- Add accessible focus states, labels, keyboard support, responsive layout, and explicit success/error/status messages.
- Pick one styling strategy. The current app mixes Bootstrap 3, Tailwind v3/v4 imports, inline styles, and component-local CSS. Prefer the project’s current Svelte/Tailwind setup or a small local CSS system, then remove unused Bootstrap/jQuery dependencies and global legacy rules.

### Event dashboard

The root dashboard should show:

- active/published events sorted by start date;
- event name, date range, location, registration state, and a clear “Open event” action;
- the user’s outbound/return status when available;
- an admin-only create/edit/archive control;
- a helpful empty state and backend error state;
- no blog, announcements, social embeds, sponsor blocks, or generic CMS cards.

### Event detail

Refactor the existing `src/routes/carpool/[id]/+page.svelte` and `CarpoolTrip.svelte` into smaller components, for example:

- `EventSummary.svelte`;
- `TripDirectionPanel.svelte`;
- `RideOptionCard.svelte`;
- `TransportationStatus.svelte`;
- `VehicleAssignmentControls.svelte`;
- `RiderManagementDialog.svelte`;
- `EventAdminActions.svelte`.

The detail screen must make the user’s state obvious: selected ride, opt-out, or unresolved. Confirm should be disabled until both directions resolve. Leave/replace actions need confirmation and recoverable error handling.

### Forms and dialogs

Replace absolutely positioned modal-like divs in `CreateOrModifyEventSignup.svelte`, `CreateOrModifySignup.svelte`, and `CreateOrModifyVehicle.svelte` with accessible dialog/form components or route-level forms. Use one field schema and one API contract. Handle server validation errors inline, preserve entered values, disable submit while pending, and refresh data through `invalidate` rather than `location.reload()` where practical.

### Print/export views

Keep the attendees, riders, and XLSX export because they are carpool operations. Remove general site chrome from print media. The rider view must support contact-hidden modes through an explicit server-approved policy, not only a client query-string toggle.

## 10. File-by-file change map

### Keep and refactor

| File/area | Action |
| --- | --- |
| `src/routes/+page.server.js`, `src/routes/+page.svelte` | Convert to canonical carpool dashboard |
| `src/routes/+layout.svelte` | Keep as carpool shell; simplify imports |
| `src/routes/login`, `logout`, `signup` | Keep; carpool copy, redirect safety, server-derived session |
| `src/routes/carpool/[id]/*` | Move to `/events/[id]/*`; keep only one implementation during transition |
| `src/routes/carpool/vehicles/*`, `vehicle/[id]/*` | Move to `/vehicles/*`; server-gate access |
| `src/routes/carpool/[id]/export/+server.js` | Keep as canonical export handler after role/privacy hardening |
| `src/lib/server/client.js` | Keep as Directus adapter; remove token logging and normalize errors |
| `src/lib/server/user.js` | Keep auth, identity, eligibility, admin lookup, password operations; remove directory/Facebook-only methods |
| `src/lib/server/event.js`, `trip.js`, `ride.js`, `rider.js`, `vehicle.js` | Consolidate into carpool service modules or refactor in place; eliminate duplicate semantics |
| `src/lib/server/graphql/event.js`, `ride.js`, `trip.js`, `trip_ride.js`, `rider.js` | Keep only queries/mutations used by the canonical service layer; parameterize values instead of string interpolation |
| `src/lib/server/spreadsheet.js` | Keep and test against normalized event DTOs; fix passenger/driver seat semantics and opt-out rendering |
| `src/lib/schemata/event.js` | Expand into all request schemas or replace with a carpool validation module |
| `src/lib/components/CarpoolTrip.svelte` and carpool dialogs/lists | Refactor into accessible, normalized carpool components |
| `src/lib/server/tests/*` | Preserve useful unit tests and add authorization/business-rule/API tests |

### Replace or remove from runtime

| File/area | Action |
| --- | --- |
| `src/lib/components/BlogBlock.svelte`, `UpcomingEventsBlock.svelte`, `AnnouncementsBlock.svelte`, `TwitterBlock.svelte`, `BottomRowBlock.svelte` | Remove from app; archive/delete after no references remain |
| `src/lib/components/Masthead.svelte`, `Navbar.svelte`, `Footer.svelte` | Replace with carpool shell versions |
| `src/lib/server/announcements.js`, `page.js`, `post.js`, `files.js` | Remove unless a remaining carpool flow proves a dependency |
| `src/lib/server/graphql/post.js` and CMS-only models | Remove with content routes |
| `src/routes/[slug]`, `announcement`, `blog`, `post`, `directory`, `facebook`, `photos` | Delete, archive, or explicit 410/redirect routes |
| `src/routes/api/announcements`, `api/navbar`, CMS debug endpoints | Remove from production surface; retain debug tools only in a separately protected development route if needed |
| `src/routes/api/events`, `api/rides`, `api/triprides`, `api/trips`, `api/carpool/*` | Migrate callers to canonical endpoints, then make compatibility adapters and remove |
| `src/routes/carpool/create`, `carpool/[id]/edit`, `carpool/admin` | Replace with canonical admin pages; do not retain browser-only auth checks |
| `src/app.html` legacy CDN/bootstrap/jquery scripts | Remove after CSS/component migration |
| `static/css/gallery.css`, old sponsor/social/gallery assets, legacy JS | Remove when no route references remain |
| `src/lib/server/models/*` that only describe CMS content | Remove or move to archive; retain event/ride/trip/user relationship models if still used by tests/tooling |

Before deleting any file, run a repository-wide import/reference search and confirm it is not required by deployment scripts or the Directus schema tooling.

## 11. Directus/data migration plan

1. Inventory the production Directus collections and fields used by the current GraphQL queries. Record IDs and relationship semantics before changing frontend code.
2. Back up event, trip, ride/vehicle, event-attendee, trip-ride, and rider relationship data.
3. Decide where explicit outbound/return opt-out state will live. Add the chosen collection/field and an audit record if it does not already exist.
4. Normalize existing data:
   - identify events with missing dates/location/status;
   - identify trips with invalid direction/date/time;
   - identify duplicate rider relationships for one user/direction;
   - identify rides whose seat counts are ambiguous or negative;
   - identify orphaned trip-ride relationships and vehicles with no eligible driver.
5. Repair or quarantine invalid records before enabling the new reservation API.
6. Preserve old event IDs so old URLs can redirect correctly.
7. Keep archived events read-only and retain their export capability for a defined period.
8. After the new app is stable, remove only unused CMS fields/collections under a separately approved backend migration. The frontend extraction alone should not delete Directus content.

## 12. Verification strategy

### Static and build checks

Run after each migration slice:

```text
pnpm check
pnpm test
pnpm build
```

The current environment may need network/package-store access before `pnpm check`; record the exact failure if dependency installation is unavailable. Do not treat a dependency-download failure as proof that the code passes.

Add a CI check that fails if production source still references removed content routes/components or old duplicate APIs, except for documented redirect adapters.

### Unit/service tests

Add coverage for:

- event/trip/vehicle validation and normalization;
- one-seat-per-direction rule;
- mandatory outbound/return resolution;
- opt-in/opt-out idempotency;
- capacity and concurrent last-seat reservation;
- ownership/admin checks;
- archived/draft event behavior;
- event deletion/archive policy;
- export generation with drivers, riders, empty rides, and opt-outs;
- safe error normalization and no secret/PII logging.

### Route/API tests

Test every canonical route as logged-out, normal member, eligible driver, ineligible driver, and admin where applicable. Verify status codes, redirects, payload shapes, and that old routes redirect to the new routes.

### Browser acceptance scenarios

At minimum:

1. Logged out at `/` → carpool sign-in screen → successful login returns to `/`.
2. Member opens an active event, selects one outbound and one return ride, confirms, refreshes, and sees the same state.
3. Member opts out of one direction and selects a ride for the other; unresolved-state validation prevents incomplete submission.
4. Member attempts a full ride; UI and API both reject it without changing existing selections.
5. Member leaves a ride; rider count and available seats update without duplicate relationships.
6. Eligible driver creates a vehicle and assigns it to a trip; another driver cannot edit/remove it.
7. Admin creates, edits, archives an event; normal members cannot perform those actions even by calling the API directly.
8. Admin adds/moves/removes a rider and can view the audit record.
9. Attendee/rider print views hide contact fields according to policy.
10. XLSX export opens and contains correct event, direction, vehicle, driver, rider, and opt-out rows.
11. Old `/carpool` and `/carpool/[id]` URLs redirect once and preserve the resource ID.
12. No homepage response contains blog, announcement, Twitter, sponsor, directory, or photo UI.

### Accessibility and responsive checks

Test keyboard-only navigation, dialog focus trapping, labels/errors, color contrast, screen-reader names for ride cards, and mobile layouts at the widths used by drivers/team members in the field.

## 13. Delivery sequence

### Phase 0 — baseline and safety

- Create a feature branch.
- Capture current route/API inventory and Directus schema/data backup.
- Add/repair the shared auth helper and endpoint authorization tests before moving URLs.
- Fix obvious runtime defects such as the missing `User` import and remove sensitive logging.

### Phase 1 — service/API consolidation

- Define DTOs and validation schemas.
- Implement the canonical event/trip/vehicle/transportation services.
- Implement explicit opt-out state and atomic selection updates.
- Add compatibility adapters for old API paths.
- Update carpool components to use the canonical API.

### Phase 2 — root and shell extraction

- Convert `/` to the carpool dashboard.
- Replace the generic shell with the carpool shell.
- Remove homepage content-site components and dependencies.
- Move detail/vehicle/print routes to canonical locations and add legacy redirects.

### Phase 3 — admin/operational completion

- Finish event/trip/vehicle CRUD with server-side permission checks.
- Finish add/move/remove rider flows.
- Harden attendee/rider privacy and export authorization.
- Refactor dialogs and remove full-page reloads where practical.

### Phase 4 — content-surface removal

- Remove non-carpool routes, CMS-only services, models, assets, Bootstrap/jQuery scripts, and duplicate APIs after reference checks.
- Update README, deployment docs, route documentation, and use-case docs to describe the carpool-only app.
- Keep a changelog of removed URLs and redirect/410 behavior.

### Phase 5 — cutover and cleanup

- Deploy behind the existing host with `/` as the carpool entry.
- Monitor authentication failures, 403s, reservation conflicts, Directus errors, and legacy URL hits.
- Remove compatibility APIs only after the deprecation window and client logs show no remaining callers.
- Re-run full build, tests, browser acceptance, and a production-like smoke test with a non-admin and admin account.

## 14. Definition of done

The extraction is complete when:

- `/` is visibly and functionally the carpool dashboard;
- no content-site component or route is reachable from the primary navigation or homepage;
- every supported carpool action has one canonical route and API contract;
- all writes enforce role, ownership, capacity, event-state, and identity rules on the server;
- outbound/return selections are explicit, durable, atomic/idempotent, and tested;
- old carpool URLs either redirect to the canonical route or are intentionally retired;
- login, signup, logout, password change, maintenance mode, error handling, event detail, vehicles, rider lists, and export all work in the new shell;
- `pnpm check`, `pnpm test`, and `pnpm build` pass in a network-complete environment;
- production logs contain no JWTs or unnecessary personal data;
- the repository documentation and deployment configuration describe a carpool-only application.


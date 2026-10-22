# Carpool-only extraction development plan

**Prepared:** October 22, 2026

**Status:** Proposed implementation plan; no application extraction has been performed.

**Decision update:** October 22, 2026. Authentication is deferred to a later project. The carpool app must not implement local login or external-auth integration in this extraction. An isolated demo/staging-only provisioning UI may create Directus users with temporary passwords; production provisioning and authentication remain disabled.

**Goal:** Turn this repository into the standalone LigerBots carpool application, not a replacement for the public LigerBots website.

## 1. Outcome and scope

The server's root URL, `/`, will directly serve the carpool event list. Authentication is intentionally out of scope for this extraction and will be designed and implemented later. Until then, an isolated demo/staging environment may expose a clearly marked operator-only user-provisioning UI; it is not a public signup or authentication mechanism. The application will have no site navbar and no public-website masthead. It will have a small, accessible carpool footer on normal pages and application error/access states.

Keep everything necessary to operate the existing carpool application: user lookup and driver eligibility, event/trip/vehicle/rider management, attendance and rider reports, spreadsheet export, authorization, validation, and deployment support. Remove local credential login, signup, password management, token-login, public-website pages, content blocks, content APIs, site navigation configuration, sponsor presentations, gallery resources, and unreachable website-only code. Add only the temporary isolated provisioning flow needed to prepare demo data; it must be removed or replaced when authentication is implemented.

This is a focused extraction, not a framework rewrite or a new carpool feature project. Keep SvelteKit, Svelte, Directus, and the current data relationships. Do not treat unfinished features described in older planning documents as extraction requirements.

### Requirements

| ID | Requirement | Completion evidence |
|---|---|---|
| REQ-001 | `/` directly renders the authenticated carpool event list. | Root loader/rendering and browser tests; no redirect from `/` to `/carpool`. |
| REQ-002 | No site navbar, public-website masthead, sponsor panels, or home-page content blocks remain. | DOM, source, route, and network assertions. |
| REQ-003 | A minimal carpool footer is present and usable across supported page states. | Footer component and responsive/keyboard tests. |
| REQ-004 | Authentication is deferred; this app must not expose local login or public signup. A restricted demo/staging provisioning UI may create Directus users with temporary passwords, while production provisioning remains disabled. | Environment guard, operator-only provisioning tests, Directus user records, no plaintext-password persistence/logging, and retired local-auth route assertions. |
| REQ-005 | Existing supported carpool workflows, permissions, and persisted data are preserved. | Before/after journey and API contract results. |
| REQ-006 | Website-only page routes and APIs are removed, not just hidden. | Explicit retired-route HTTP tests and route-manifest review. |
| REQ-007 | Runtime code, models, assets, dependencies, scripts, and generated documentation contain only carpool-relevant material. | Reviewed disposition inventory, dependency/reference checks, regenerated documentation, and production build. |
| REQ-008 | Retained runtime flows do not require website content/configuration collections. | Real Directus test with website collection access denied; request/query assertions. |
| REQ-009 | Deployment, developer documentation, and configuration describe a standalone carpool service. | Clean-checkout install/build/start and deployment smoke tests. |
| REQ-010 | Extraction is reversible, test-gated, and supported by explicit acceptance evidence. | Baseline, milestone checks, release checklist, and tested rollback procedure. |

### Non-goals and safety boundaries

- Do not modify the existing public `ligerbots.org` website, its DNS, or its deployment.
- Do not delete or migrate shared Directus collections, records, files, users, or permissions in production as part of frontend cleanup.
- Do not build an identity provider, local credential/account-management UI, database replacement, component framework, or general-purpose navigation system. Integrate the separately provided authentication server.
- Do not implement search, notifications, GPS, calendar integration, or every proposed use case in [the older use-case summary](dev-plan/use-cases-summary.md).
- Do not rename every `/carpool/...` URL or `/api/...` endpoint merely to make names uniform.
- Do not remove existing carpool tests to obtain a passing result. Separate live-backend tests from deterministic tests without discarding their intent.
- Fix extraction-caused regressions and tightly coupled blockers. Record unrelated pre-existing defects separately rather than silently expanding scope.
- Never publish credentials, real user records, session tokens, or private exports in tests, screenshots, logs, or documentation.

## 2. Verified current state

This plan is grounded in the checked-in sources, not solely in older architecture or use-case descriptions.

| Surface | Current implementation | Extraction consequence |
|---|---|---|
| Root page | [Root loader](src/routes/+page.server.js) reads Directus site configuration; [root page](src/routes/+page.svelte) displays maintenance or website blocks. | Replace both with the event-list implementation. Remove website configuration dependency. |
| Carpool entry | [Carpool loader](src/routes/carpool/+page.server.js) validates JWT and loads events/admin status; [carpool page](src/routes/carpool/+page.svelte) renders events and admin controls. | Reuse this behavior at `/`; correct its login return target, currently `/carpool/vehicles`. |
| Shared shell | [Layout](src/routes/+layout.svelte) renders `Masthead`, `Navbar`, `MainPane`, and `Footer`, with browser-cookie state for navbar refresh. | Remove masthead/navbar and navbar-only state; replace website wrappers deliberately. |
| Existing footer | [Footer](src/lib/components/Footer.svelte) embeds sponsor SVGs and links to `/current-sponsors`. | Keep the footer concept, not its current website content. |
| Error page | [Error page](src/routes/+error.svelte) imports the site-config type and fetches `/api/site`. | Decouple before deleting the site service/API; test failures as well as normal pages. |
| Authentication | [Login](src/routes/login/+page.svelte), [login API](src/routes/api/login/+server.js), [logout loader](src/routes/logout/+page.server.js), and [user service](src/lib/server/user.js) currently implement local login/JWT behavior. | Replace identity consumption with the external handoff, then remove local credential checking and token issuance. Retain application authorization. |
| Account entry/provisioning | [Token entry](src/routes/u/[id]/+server.js) signs in and redirects to `/carpool`; [signup API](src/routes/api/signup/+server.js) provisions users/tokens. | Retire both; transfer any operational consumers to the external server before removal. Do not preserve a second login path. |
| Signup mismatch | [Signup form](src/routes/signup/+page.svelte) sends fields unlike the signup API contract and references an absent `/signup/success` route. | Remove the local form and its links rather than repairing website-era registration. |
| Core interactions | [Remote commands](src/routes/carpool/ride.remote.js) are imported by carpool components. | Keep remote-function support and command entry points; not all carpool mutations use REST. |
| Reports | Attendee/rider pages and [XLSX endpoint](src/routes/carpool/[id]/export/+server.js) are linked from event details. | Keep report routes, user/contact data needed by them, and ExcelJS. |
| Shared backend | [Directus client](src/lib/server/client.js), event/trip/ride/rider/vehicle/user services and GraphQL modules. | Directus is a carpool dependency, not disposable website infrastructure. |
| Styles/scripts | [App template](src/app.html) loads Bootstrap 3 CSS, fonts, Font Awesome, website CSS, jQuery, Bootstrap JS, and website JS. Carpool templates use Bootstrap-style classes. | Establish retained styling requirements before removing global resources. |
| Asset delivery | [Server hook](src/hooks.server.js) redirects `/assets`; [production nginx](system/prod/nginx.conf) separately proxies it. | Review both deployment paths, including favicon and retained GraphQL photo fields. |
| Tests | Five service suites in [server tests](src/lib/server/tests/) mock the client; [older event tests](src/lib/tests/event.test.js) use a real backend and fixed event ID. | Preserve service suites; isolate/seed live integration tests. Do not run them against production. |
| Tooling | [Package scripts](package.json) use Vitest; `check` points at `tsconfig.json`, but the tracked project config is [jsconfig.json](jsconfig.json). No tracked browser-test setup or CI workflow was found. | Establish a valid check command and browser/CI test entry points before relying on quality gates. |
| Deployment | [Dockerfile](Dockerfile), [installation instructions](system/INSTALLATION.md), and [systemd service](system/prod/systemd.ligerbots.service) retain website-era settings. | Reconcile actual Node/port/origin/start behavior; remove embedded deployment credentials and inject secrets through the deployment environment. |

### Planning-time verification limits

- Available locally: Node `v26.9.0`, pnpm `12.5.1`. The Docker daemon was unavailable when checked. The container currently specifies Node 22; choose and verify a supported, mutually compatible Node/pnpm pair during M0 rather than assuming local versions are the deployment baseline.
- No application builds, tests, browser sessions, backend calls, or production operations were performed for this documentation-only task. Passing counts and current runtime behavior remain to be established in M0.
- Playwright is proposed below; its package/browser availability has not been verified or installed.
- There is no supplied feature-spec/constitution artifact. The requirements above come from the request and inspected code. This single document contains the plan, task breakdown, and traceability; no separate planning artifacts are required.
- Available migration guidelines concern Java/Struts/Spring and do not apply. Follow existing SvelteKit/Svelte/Directus patterns instead.

## 3. Target behavior and decisions

### 3.1 Routing policy

| URL | Target behavior |
|---|---|
| `/` | Canonical carpool event list. Authenticated request: `200`; unauthenticated request: redirect to the approved external authentication entry with a return destination of `/`. No CMS website loader. |
| `/carpool` and normalized `/carpool/` | Permanent redirect (`308`) to `/`, preserving relevant query parameters. Do not redirect the entire `/carpool/*` subtree. Verify SvelteKit trailing-slash behavior does not introduce loops. |
| `/carpool/[id]`, `/carpool/[id]/attendees`, `/carpool/[id]/riderlist`, `/carpool/[id]/export` | Retain existing event detail/report URLs and permissions. |
| `/carpool/vehicles`, `/carpool/vehicle/[id]` | Retain functioning vehicle-management and detail flows. |
| `/carpool/create`, `/carpool/[id]/edit`, `/carpool/admin` | Initially retain and characterize. Remove a redundant screen only after its supported actions and inbound links are covered by the retained UI. These are carpool routes, not website pages. |
| `/login`, `/logout`, `/signup`, `/api/login`, `/api/signup`, `/api/settings/change-password`, `/u/[id]` | Remove local implementations; target `404`. Footer links go to approved external auth/account destinations. Add only protocol-required integration endpoints if the selected contract requires them, not legacy credential/token-login aliases. |
| Website page/API routes listed below | `404`, with no content query or catch-all page fallback. Wrong methods must not revive removed functionality. |
| Framework-generated remote-function endpoints | Retain as required by carpool remote commands; do not mistake them for website APIs. |

Change internal links that mean "event list/home" to `/`, including post-delete and cancel destinations. Leave event, vehicle, report, and API deep links under their existing paths. External authentication must return each protected screen to its own destination. Allowlist the external authentication origin and registered callback destinations; validate application return destinations as same-origin local paths, preserving safe query parameters and rejecting arbitrary external/protocol-relative destinations. API and remote-command requests must receive protocol-appropriate unauthenticated/forbidden responses, not HTML login pages.

Do not promise server-side fragment preservation: URL fragments are not sent to the server. Test browser behavior for any supported fragment links.

### 3.2 No-navbar shell and footer

- Use a simple semantic page structure: skip link, `main`, and `footer`. A plain page title/brand is sufficient; remove the public-site masthead rather than replacing it with a disguised navbar.
- Put context-specific Back to Events, vehicle-management, and administrative actions in page content. Put a Home link and approved external Sign in/Sign out links in the footer, conditional on server-validated session state. These must not require `/api/navbar` or local credential routes.
- Footer default: "LigerBots Carpool", current copyright year/team attribution, Home, and appropriate account action. An optional single external link to `https://ligerbots.org` may point to the real website; it must not recreate public-site content locally.
- No sponsor bar, donor links, social feeds, embedded SVG objects, public-site menus, dropdowns, or empty header spacers.
- Short pages keep the footer at the bottom of the viewport using document flow/flex layout; long pages scroll naturally. Do not use a fixed footer that overlays controls.
- Verify footer readability and keyboard access at 360, 768, and 1280 CSS-pixel widths and at 200% zoom. No horizontal overflow caused by the new shell.
- Apply the shell to carpool empty-event, access-denied, authentication-unavailable, not-found, and handled backend-error states. Pages hosted on the external authentication server are outside this shell's ownership. Binary exports and JSON endpoints do not render HTML footers.

### 3.3 Decisions to close in M0

These are implementation gates, not reasons to delay writing this plan.

| Decision | Recommended default | Required confirmation/evidence |
|---|---|---|
| Authentication timing and ownership | **Defer authentication and external-auth integration to a later project.** Do not implement a mock or local login in this extraction. | Record the future authentication owner and open contract questions as follow-up work. The extraction must remain usable only within its explicitly supported unauthenticated/demo boundary. |
| Temporary user provisioning | **Provide an operator-only UI in isolated demo/staging.** Create Directus user records with first name, last name, email, phone, groups/role, driver eligibility, status, and a generated temporary password. | Provisioning is disabled in production and is not public signup. Passwords are shown only once to the operator, never logged, persisted, exported, or placed in URLs. |
| Maintenance mode | Remove the website global/maintenance content dependency; rely on deployment-level maintenance handling by default. | Confirm that there is no required app-level maintenance switch. If required, replace it with minimal carpool configuration and an unavailable-state test, not website rich content. |
| Duplicate carpool APIs/screens | Preserve used contracts initially; remove only proven unused duplicates. | Inspect imports, rendered links, operational scripts, known external consumers, and available access logs. No-access-log evidence alone is insufficient. |
| User photos and `/assets` | Use a local favicon and remove website branding assets. Remove `/assets` forwarding only if no retained UI/report needs backend assets. | Trace both rendered images and GraphQL fields; schema fields do not automatically imply a UI requirement. Document any retained asset route and its purpose. |
| Footer wording | Minimal footer defined above, with no sponsor content. | Maintainer approves text, optional external link, and location of account controls. |

Record the decisions in the extraction PR. If a decision changes scope, update the corresponding tasks and acceptance tests before implementation.

#### Authentication deferral and provisioning boundary

Authentication is not an M0 or M1 deliverable. Do not select a protocol, create a mock issuer, or wire an external login callback as part of this extraction. The later authentication project must define the issuer, trust boundary, browser/session transport, identity mapping, authorization source, failure behavior, ownership, and cutover/rollback plan.

The extraction may include a temporary provisioning flow for isolated demo/staging data:

1. **Environment guard:** Provisioning must fail closed unless an explicit non-production environment flag and deployment-level isolation marker are present. Hiding a navigation link is insufficient.
2. **Operator boundary:** This is an operator tool, not public signup. Require the existing approved operator/admin boundary where available; do not invent a browser-trusted role check.
3. **Fields:** Validate first name, last name, email, phone, groups/role, driver eligibility, and status. Reject duplicate or invalid email addresses with an explicit error.
4. **Password handling:** Generate or accept a temporary password only through a protected request, write it through Directus-supported password handling, return it once to the operator, and never log, persist, export, or place it in a URL.
5. **Future schema:** Keep authentication-specific identity relationships provisional. The later authentication project owns final mapping, account lifecycle, password policy, and removal/replacement of this tool.

No production release may enable provisioning or claim authentication readiness.

### 3.4 Approved M0 operating decisions

**Recorded:** October 22, 2026, from the user's decisions. These establish how M0 may start; they do not mark any implementation task complete.

| ID / requirement | Explanation and options presented | Approved decision | Effect on execution / completion evidence |
|---|---|---|---|
| DEC-001 / Authentication timing (REQ-004) | Options: implement a mock/external flow now; retain local auth temporarily; defer authentication and keep the extraction boundary explicit. | **Defer authentication. Do not implement local auth or a mock external server in this extraction.** | M0/M1 do not select a protocol or wire login. The future auth project owns the contract and integration. |
| DEC-002 / Approval ownership (REQ-010) | Scope and authentication trust need accountable approvers. Options: user approves scope and identifies auth owner; user owns both; other named approvers. | **The user approves scope; identify the future authentication-server owner during M0.** | Record the owner and open contract questions as follow-up work. Authentication remains outside this extraction's completion gate. |
| DEC-007 / Temporary provisioning (REQ-004, REQ-005) | Options: no user preparation; public signup; isolated operator provisioning. | **Provide isolated demo/staging operator provisioning only.** | Create Directus records with the approved fields and temporary passwords. Production must fail closed, and the flow must not be described as authentication. |
| DEC-003 / Safe test backend (REQ-005, REQ-008, REQ-010) | Real workflow baselines need isolated data. Options: dedicated test Directus/database; an existing isolated non-production instance; mocks with real-backend work explicitly blocked. | **Plan a dedicated isolated Directus/database test environment.** | During M0, identify schema/version sources, synthetic fixtures, resources, lifecycle and access requirements. This decision authorizes planning, not shared-infrastructure changes or production data copying. Seek approval for provisioning/resources; real-backend tests stay unverified until the environment is available. |
| DEC-004 / Deployment topology (REQ-004, REQ-009) | Hostnames and proxy boundaries constrain auth transport and callbacks. Options: inventory during M0; use supplied established topology; defer deployment-dependent work. | **Inventory intended carpool/auth hostnames and proxy topology during M0.** | Document known deployment facts and distinguish intended/unconfirmed auth details. No DNS/proxy changes are authorized. Unresolved external-server topology remains part of the auth contract gate. |
| DEC-005 / Carpool preservation scope (REQ-005, REQ-007) | Similar-looking routes may support different workflows or external consumers. Options: preserve working flows and investigate duplicates; consolidate during extraction; specify a smaller feature set. | **Preserve working carpool workflows; investigate duplicates before removal.** | Characterize flows and callers first. No carpool feature reduction or duplicate consolidation is authorized merely by this plan; obtain scope approval if proposed removal changes supported behavior. |
| DEC-006 / Existing-defect policy (REQ-005, REQ-010) | A baseline distinguishes existing failures from extraction regressions. Options: record unrelated defects and fix blockers/regressions; fix all defects first; approve every disposition individually. | **Record unrelated defects; fix extraction blockers and new regressions.** | Record evidence and ownership for pre-existing defects. Fix tightly coupled blockers in the appropriate implementation milestone; M0 baseline discovery does not authorize unrelated repairs or a silently weakened test gate. |
| DEC-007 / Deployment and rollback baseline (REQ-009, REQ-010) | Rollback differs for a first deployment versus an existing service. Options: inventory a deployed app; establish an undeployed baseline; investigate unknown status. | **An app is already deployed; inventory its artifacts/configuration and rollback compatibility.** | Identify the running artifact, configuration and restoration method. Verify future external-auth compatibility rather than assuming the old local-login artifact is a valid post-cutover rollback. Production access/changes and staging rehearsal require separate authorization and an appropriate environment. |
| DEC-008 / Provisioning deployment boundary (REQ-004, REQ-009, REQ-010) | A user-provisioning tool can create sensitive records. Options: isolated synthetic-data demo/staging with operator/network restrictions; production use; no provisioning UI. | **Enable provisioning only in isolated demo/staging with synthetic data and restricted operator/network access. Production fails closed.** | Verify isolation, access restrictions, explicit temporary-tool labeling, no plaintext-password leakage, and removal/expiry ownership before deployment. Approval is of the planned scope, not authorization to change existing infrastructure immediately. |

#### Start M0 versus finish M0

- **Approved to start:** Repository/deployment inventory within authorized access; plan the dedicated test backend; inspect runtime compatibility; run safe baseline checks; define the provisioning guard and identify the future authentication owner.
- **Conditional work:** Browser/live-backend baselines require the approved isolated environment and synthetic data. Rehearse rollback only in an approved test/staging environment. If these are unavailable, record the specific result as unverified rather than calling the baseline complete.
- **Unblocked for development:** Provisioning UI/API implementation in M1 after the isolated backend and operator boundary are available. Authentication integration is not part of this extraction.
- **Required before M0 closes:** All M0 exit criteria below, including the user-approved authentication deferral, provisioning boundary, isolated-backend plan, and deployment rollback evidence.
- **Required before M1 starts:** M0 is complete, the isolated backend is usable, and the provisioning environment guard/operator boundary are approved.
- **Required before production:** Provisioning must be disabled and authentication remains a later-project gate. The future auth owner must separately approve the eventual identity contract, mapping, production configuration, and rollback compatibility.
- **Still to decide during M0:** Maintenance mode, footer wording/external link, asset consumers, duplicate-route disposition, actual deployment/runtime versions, and concrete environment resources. These are investigation-backed M0 outcomes, not new prerequisites for starting independent discovery.

### 3.5 Temporary provisioning boundary

- Provisioning is a **separate operator tool**, not a credential form, public signup, identity picker, or authentication flow.
- Require an explicit non-production environment flag plus deployment-level isolation. Production must fail closed even if a route is guessed directly.
- Require the approved operator/admin boundary and server-side authorization. Never trust a browser-provided role, driver flag, or hidden form field.
- Validate first name, last name, email, phone, groups/role, driver eligibility, and status. Handle duplicate email and Directus validation failures explicitly.
- Use Directus-supported password handling. Generate or accept a temporary password through the protected request, return it once, and never log, persist, export, or include it in a URL.
- Use synthetic data only, record an owner and expiry/review date, and keep provisioning configuration separate from production.
- The later authentication project owns identity mapping, session transport, account lifecycle, password policy, and removal or replacement of this tool. This plan does not claim authentication readiness.

## 4. Disposition inventory

An implementation deletion list must be dependency-checked, including JS imports, Svelte type imports, GraphQL selections, CSS URLs, HTML templates, scripts, generated docs, and deployment configuration.

### 4.1 Retain and adapt

- [Carpool routes](src/routes/carpool/), active carpool components (`CarpoolTrip`, signup/edit dialogs, vehicle editor, rider lists, add/move dialogs, opt-out list, user displays), and their live dependencies.
- [Event](src/lib/server/event.js), [trip](src/lib/server/trip.js), [ride](src/lib/server/ride.js), [rider](src/lib/server/rider.js), [vehicle](src/lib/server/vehicle.js), [spreadsheet](src/lib/server/spreadsheet.js), [user](src/lib/server/user.js), and [Directus client](src/lib/server/client.js) services.
- Carpool GraphQL modules: [event](src/lib/server/graphql/event.js), [trip](src/lib/server/graphql/trip.js), [ride](src/lib/server/graphql/ride.js), [rider](src/lib/server/graphql/rider.js), and [trip ride](src/lib/server/graphql/trip_ride.js).
- Currently imported validation models: [event](src/lib/server/models/event.model.js), [destination trip](src/lib/server/models/destination_trip.model.js), [return trip](src/lib/server/models/return_trip.model.js), [ride](src/lib/server/models/ride.model.js), and [trip-ride riders](src/lib/server/models/trip_ride_riders.model.js). Keep additional carpool relationship models only if used at runtime or by a retained, working tooling workflow.
- External identity/session verification required by the approved contract, carpool REST APIs, remote commands, and safe carpool-only operational scripts. Keep user lookup/contact/eligibility logic, not credential/account administration.
- Shared utility functions, schemas, icons, styles, and user fields with demonstrated carpool consumers. `User.listAll` is relevant to rider/attendee selection; do not remove it because it lists users.
- [Robots policy](static/robots.txt), currently disallowing indexing, unless an explicit product decision changes it.

### 4.2 Remove website surfaces

| Category | Paths |
|---|---|
| Website pages | [Generic CMS page](src/routes/[slug]/), [announcements](src/routes/announcement/), [blog](src/routes/blog/), [deprecated posts](src/routes/post/), [directory](src/routes/directory/) including coaches, [face gallery](src/routes/facebook/), [photos](src/routes/photos/). |
| Website APIs | [Announcements API](src/routes/api/announcements/), [navbar API](src/routes/api/navbar/), [site API](src/routes/api/site/). |
| General debug APIs | [Debug endpoints](src/routes/api/debug/); remove from the production app unless a specific carpool-only diagnostic requirement is approved. Do not leave general schema/data explorers available. |
| Local authentication/account pages | [Login](src/routes/login/), [logout](src/routes/logout/), [signup](src/routes/signup/), and [token login](src/routes/u/). Replace their consumers with the approved external flow before removal. |
| Local authentication/account APIs | [Login API](src/routes/api/login/), [signup API](src/routes/api/signup/), and [password-change API](src/routes/api/settings/change-password/). Remove local password verification/reset, registration/token issuance helpers, and auth-only secrets once unused. |
| Website components | [Navbar](src/lib/components/Navbar.svelte), [Masthead](src/lib/components/Masthead.svelte), [BlogBlock](src/lib/components/BlogBlock.svelte), [AnnouncementsBlock](src/lib/components/AnnouncementsBlock.svelte), [UpcomingEventsBlock](src/lib/components/UpcomingEventsBlock.svelte), [TwitterBlock](src/lib/components/TwitterBlock.svelte), [BottomRowBlock](src/lib/components/BottomRowBlock.svelte). |
| Website-only services | [Announcements](src/lib/server/announcements.js), [page](src/lib/server/page.js), [post](src/lib/server/post.js), [post GraphQL](src/lib/server/graphql/post.js), and [site configuration](src/lib/server/site.js), after removing all consumers including error handling. |
| Website-only model candidates | In [models](src/lib/server/models/): `announcement`, `design_docs`, `development`, `docs`, `global`, `languages`, `page`, `photo_album`, `post`, `post_files`, `post_files_1`, `todo`, `todo_depends_on`, and `todo_users` model files. Confirm no retained tooling dependency before deleting. |
| Website assets | Sponsor/donation/social/presentation artwork in [images](static/images/), [gallery CSS](static/css/gallery.css), and website-only CSS/scripts. Remove the background image after removing the CSS rules that reference it. |
| Historical website material | [Website development description](archive/New%20Web%20Site%20Development%20Description.md), [original package manifest](package-orig.json), [duplicate app template](src/app%20copy.html), and website-only scripts in [defunct scripts](bin/defunct/). Git history is the archive; do not merely move removed content elsewhere in the runtime repository. |

### 4.3 Review before pruning

- [Files service](src/lib/server/files.js): remove if no retained asset/provisioning/tooling consumer exists.
- [User service](src/lib/server/user.js): remove `listForDirectory`, `listForFacebook`, local login, registration, password/reset, login-token lookup/issuance helpers, and exclusively related types/fields after their consumers are removed. Preserve identity mapping, contact, admin, and driver eligibility actually needed by carpool. Retain or replace token verification only as required by the external contract; never retain local issuance as a fallback.
- [MainPane](src/lib/components/MainPane.svelte) and [MaintenancePane](src/lib/components/MaintenancePane.svelte): replace/integrate minimal wrappers as needed, then remove unused components.
- [Profile helpers](src/lib/profile.js), [stores](src/lib/stores.js), [debugging helpers](src/lib/debugging.js), [event schema](src/lib/schemata/event.js), and icons: retain only live consumers, including type-only references.
- [Generated JSDoc](doc/) contains website modules and old test/source pages. Delete obsolete generated output and regenerate only carpool documentation if this remains a supported workflow; otherwise remove generated output and its scripts. Do not leave website source snapshots in generated HTML.
- [Developer plans](dev-plan/) and [backend examples](docs/backend-server-module-examples.md): retain useful carpool material, correct stale routes/auth claims, and remove website-only/local-account-management examples. Review [login script](bin/loginUser.js) and other user scripts; remove local-auth callers or transfer them to the external server's operational ownership.
- [Package manifest](package.json) and [lockfile](pnpm-lock.yaml): remove packages only with usage/build evidence. Directus SDK, JWT, Joi, debug, dotenv, ExcelJS, SvelteKit/Svelte/Vite and required validation/test tooling are not website-only by name. Investigate Axios, YAML, URL-redirect plugin, icon packages, JSDoc tooling, and duplicate Tailwind declarations individually.

## 5. Milestones and executable task breakdown

Use small, reviewable commits/PRs. Every task runs its smallest relevant tests and records pass/fail/skip counts; any failure must be resolved or explicitly documented as a baseline defect. No milestone is complete with an unexplained failure.

### M0 / Plan 0.1 - Establish scope, baseline, and rollback

**Requirements:** REQ-004, REQ-005, REQ-007, REQ-009, REQ-010

**Start prerequisites:** Approved operating decisions in section 3.4; independent discovery may begin. No protocol decision is required to start read-only inventory.

**Completion blockers:** An approved isolated backend for real baseline verification; authorized deployment information and test rollback environment. Authentication design is explicitly deferred and is not an M0 completion blocker. The isolated provisioning guard and operator boundary must be specified before its implementation.

**Indicative effort:** 1-2 active developer days, excluding auth-server design/approval, environment provisioning, and access waiting time. This is not an elapsed-time commitment while completion gates are blocked.

- [ ] T001 [Plan:0.1] Apply sections 3.3-3.5: record authentication as deferred, identify the future authentication owner, define the isolated provisioning guard/operator boundary, and inventory retained/retired routes, methods, operational consumers and Directus collections from [routes](src/routes/), [server modules](src/lib/server/), and [scripts](bin/). Inventory intended hostnames/proxy topology and label authentication unknowns as later-project work.
- [ ] T002 [Plan:0.1] Plan the dedicated isolated Directus/database environment, including matching schema/version, synthetic fixtures, access, resources and cleanup; obtain provisioning approval before creating it. Once available, capture the current root, event list/detail, vehicle management, reports, and export using synthetic records. Record existing broken flows and unavailable tests without calling them extraction regressions or passing results.
- [ ] T003 [Plan:0.1] Verify Node/pnpm/runtime compatibility for [package scripts](package.json), [lockfile](pnpm-lock.yaml), [Dockerfile](Dockerfile), and deployment; run deterministic service tests, the current check command, and build in an isolated test environment. Record exact failures and counts.
- [ ] T004 [Plan:0.1] Inventory the confirmed existing deployment within authorized access: running artifact/configuration identifiers, runtime, proxy, deployment procedure and recovery method. Prepare a path-by-path deletion inventory. Rehearse reverting an approved test/staging deployment without backend data changes; assess external-auth rollback compatibility when its design is available. Do not change the running production service as part of baseline discovery.

**Exit criteria**

1. Operating decisions in section 3.4 are recorded; the user approves scope, authentication deferral, and isolated provisioning boundaries. The future authentication owner is identified or tracked as follow-up work. Each route is keep/adapt/retire/needs-investigation, with no unresolved disposition blocking the next milestone.
2. Baseline results include actual commands, exit codes, counts, relevant screenshots, and a named list of pre-existing defects. No assertion of a clean baseline without execution.
3. The dedicated non-production Directus/database environment is approved and available for real baseline tests. Synthetic records are available without enabling public signup or authentication. No test writes target production. A backend plan alone does not prove real-baseline success.
4. The already-deployed artifact/configuration are recoverable and test rollback evidence is recorded. Provisioning remains disabled in production; authentication rollback is owned by the later authentication project. No incompatible old artifact is silently accepted. Database schema/data removal is excluded.

#### M0 execution record

**Started:** October 22, 2026

**Status:** **In progress / blocked at exit gate.** Discovery and local baseline attempts are complete for the available repository and environment. No application extraction, auth removal, production deployment, Directus write, or production configuration change was performed.

**Authentication decision:** Authentication is deferred to a later project. No mock issuer, protocol, callback, local password form, or app session flow is approved for this extraction. Demo records may be created through the separately scoped isolated provisioning UI once its environment and operator guards are implemented.

**Inventory evidence completed:**

- Current branch: `docs/carpool-extraction-plan`; repository baseline commit: `97890aa`.
- Current worktree changes include this plan, the Compose development stack, runtime secret handling, package-script corrections, and README/Dockerfile updates; generated `.svelte-kit`/dependency installation output is ignored.
- Route inventory found carpool pages under `src/routes/carpool/`, authentication/account routes under `src/routes/login`, `logout`, `signup`, `u/[id]`, and corresponding APIs; website pages under generic slug, announcement, blog, post, directory, facebook, and photos routes; website APIs under announcements, navbar, site, and debug routes.
- Retained carpool server surface includes event, trip, ride, rider, vehicle, user, spreadsheet, Directus client, five carpool GraphQL modules, and the existing service test suites.
- Website-only candidates and deployment/static surfaces remain listed in sections 4 and 5 for dependency review; no deletion has been performed.
- The repository contains no tracked Playwright configuration, browser suite, CI workflow, constitution, or architecture artifact. Existing tests are Vitest service suites plus a live-backend event suite.
- Deployment inventory: the Dockerfile builds a Node 22 image and starts `node ./build/index.js` on port 4000; the Compose stack uses Directus/PostgreSQL and the same app port; the systemd templates run `/opt/ligerbots/frontend` behind nginx on `ligerbots.0mo.cc`, with `/assets` proxied to `admin.0mo.cc:8055`. The production systemd template currently uses `npm run preview` and `NODE_ENV=development`; this is recorded for later deployment alignment, not changed as part of M0.

**Commands attempted and results:**

| Command | Result | Evidence / disposition |
|---|---|---|
| `pnpm install` | PASS | Frozen lockfile resolution succeeded with pnpm `12.5.1`; no manifest/lockfile changes. |
| `pnpm exec vitest run src/lib/server/tests/event.test.js ...vehicle.test.js` | FAIL before tests | Svelte/Vite plugin startup throws `TypeError: Cannot convert undefined or null to object` in `vite-plugin-svelte` hot-update setup. No test counts are available. |
| `pnpm test` equivalent startup path | FAIL before tests | Same Vitest/Vite startup blocker; deterministic suite is not currently runnable. |
| `pnpm run check` | FAIL | The script now uses local `pnpm exec` tooling and the repository `jsconfig.json`; `svelte-check` reports 57 errors and 60 warnings across 32 files. Treat the complete output as the pre-extraction type-check baseline; do not claim a clean baseline. |
| `pnpm run build` / direct `pnpm exec vite build` | FAIL | The build reaches 356 transformed modules but fails because the legacy signup API imports missing static `REGISTRATION_KEY`/`ID_HASH_PEPPER` values. The application JWT helper now reads its secret at runtime. Existing accessibility/state-reference warnings remain. |
| `docker info` | UNAVAILABLE | Docker daemon was unavailable during M0; containerized Directus/database and browser infrastructure were not provisioned. |
| `node --version`, `pnpm --version` | PASS | Node `v26.9.0`, pnpm `12.5.1`; Dockerfile specifies Node 22 and compatibility remains to be reconciled. |

**M0 blockers and owners to resolve:**

1. **Tooling owner:** align Vite/Vitest/Svelte plugin versions or configuration so deterministic tests can start. The `pnpx`/`pnpm exec` script issue is resolved in [package.json](package.json).
2. **Application/auth owner:** decide how legacy local-auth code is quarantined or removed while authentication is deferred. Do not add a local-auth fallback or imply that the temporary provisioning tool authenticates users.
3. **Type-quality owner:** triage the 58 existing check errors and identify which are extraction blockers versus pre-existing defects. M0 does not authorize broad unrelated cleanup.
4. **Infrastructure owner:** approve and provision the isolated Directus/database environment and the network/operator controls required by the guarded provisioning tool. The Compose definition is present and schema-valid, but the Docker daemon was unavailable, so runtime health and connectivity remain unverified.
5. **Deployment owner:** provide authorized read-only access to the deployed artifact/configuration and an approved staging environment for rollback rehearsal. Local repository files alone do not prove the deployed rollback path.
6. **Future auth owner:** still unidentified; authentication remains a later-project dependency and is not represented as complete by this extraction.

**M0 disposition:** M0 is **not complete**. Repository inventory, deployment-file inventory, Compose schema validation, package-script repair, and local baseline attempts are complete. The exit gate remains blocked by the unavailable isolated backend, unavailable deployment evidence, Vitest startup failure, Svelte diagnostics, and the legacy signup build failure. Authentication is intentionally not a blocker because it is deferred. M1 may begin after the baseline blockers are dispositioned and the provisioning boundary is approved.

### M1 / Plan 1.1 - Establish provisioning boundary and regression protection

**Requirements:** REQ-004, REQ-005, REQ-008, REQ-010

**Dependencies:** M0 and an approved isolated backend. **Indicative effort:** 2-3 developer days for regression scaffolding and provisioning; authentication integration remains a separate future project.

- [ ] T005 [Plan:1.1] Preserve the five service suites in [server tests](src/lib/server/tests/); add deterministic route/loader and remote-command tests with mocked Directus responses and trusted/untrusted synthetic identity fixtures matching the approved contract.
- [ ] T006 [Plan:1.1] Convert [live event tests](src/lib/tests/event.test.js) from fixed production-like data assumptions to an explicitly selected integration suite with seeded fixtures and teardown; keep equivalent assertions.
- [ ] T007 [Plan:1.1] Add the proposed [Playwright configuration](playwright.config.ts), browser journey suites under [proposed end-to-end tests](tests/e2e/), and test scripts in [package.json](package.json). Keep Vitest and Playwright file discovery separate and provide one documented aggregate release command.
- [ ] T008 [Plan:1.1] Implement the isolated operator-only provisioning UI and server action/API in [user routes](src/routes/) and [user service](src/lib/server/user.js). Enforce a fail-closed non-production environment guard and approved operator boundary; validate first name, last name, email, phone, groups/role, driver eligibility, and status; create Directus records using supported password handling; return a temporary password once without logging or persisting it; handle duplicate/invalid input explicitly. Add tests proving production rejection and no plaintext-password leakage. Do not implement authentication or public signup.
- [ ] T009 [Plan:1.1] In [package.json](package.json), make `check` use the actual [jsconfig.json](jsconfig.json), or adopt an equivalent justified config. Resolve newly exposed extraction blockers without weakening strictness or excluding retained source.

**Exit criteria**

1. At least one automated baseline journey covers each retained workflow class in section 6.
2. Tests identify failures rather than accepting an empty list/error page as successful data.
3. Unit tests work without a live backend; real-backend tests require explicit non-production configuration.
4. Provisioning passes against isolated Directus with actual operator/HTTP round trips, rejects production configuration, and does not leak temporary passwords.
5. Synthetic users are created through the guarded provisioning flow without public signup or authentication. Local auth routes remain retired or disabled; the later authentication project owns onboarding and identity mapping.

### M2 / Plan 2.1 - Promote carpool to root and replace the shell

**Requirements:** REQ-001, REQ-002, REQ-003, REQ-004, REQ-005

**Dependencies:** M1. **Indicative effort:** 1-2 developer days.

- [ ] T010 [Plan:2.1] Move the event-list render/load behavior from [carpool entry](src/routes/carpool/) into [root page](src/routes/+page.svelte) and [root loader](src/routes/+page.server.js), adjusting generated type imports/relative imports and setting a carpool-specific title/description. Keep one event-list implementation.
- [ ] T011 [Plan:2.1] Replace [carpool entry loader](src/routes/carpool/+page.server.js) with the scoped `/carpool` compatibility redirect; remove the duplicate page implementation. Test query/trailing-slash handling and deep-link non-interference.
- [ ] T012 [Plan:2.1] Simplify [layout](src/routes/+layout.svelte) and [MainPane](src/lib/components/MainPane.svelte) into the no-navbar shell; use server-validated session data, adding [a layout loader](src/routes/+layout.server.js) only if needed. Keep current account actions reachable.
- [ ] T013 [Plan:2.1] Replace sponsor content in [Footer](src/lib/components/Footer.svelte) with the approved minimal footer; add keyboard, zoom, responsive, and short/long-page tests.
- [ ] T014 [Plan:2.1] Update event-list/Home/back/cancel/delete links throughout [carpool routes](src/routes/carpool/) and active components. Replace local login/logout/signup/token-entry links with approved external destinations and safe return handling; verify no UI depends on the local auth pages scheduled for deletion.

**Exit criteria**

1. Authenticated `GET /` returns the event list with no `/carpool` redirect; anonymous login returns to `/`.
2. `/carpool` redirects to `/`; event, vehicle, report, and export deep links still work.
3. No navbar/masthead is rendered or requested. No `/api/navbar`, `/api/site`, or website-block traffic is generated by carpool pages or external-auth integration states.
4. Footer and in-page controls provide all required actions without a global navigation menu.
5. Empty state and event-fetch failure are visibly different. If the old loader's catch-and-continue behavior obscures failure, correct it as part of moving the loader.

### M3 / Plan 3.1 - Remove website routes and runtime dependencies

**Requirements:** REQ-002, REQ-004, REQ-005, REQ-006, REQ-008

**Dependencies:** M2. **Indicative effort:** 1-2 developer days.

- [ ] T015 [Plan:3.1] Remove website-config lookup/type imports from [error page](src/routes/+error.svelte); render truthful, carpool-specific errors and a recovery link without claiming notifications were sent.
- [ ] T016 [Plan:3.1] Delete the website page/API/debug and local authentication/account routes listed in section 4.2 after M1 integration and consumer cutover pass; test retired URLs, generic CMS slugs, trailing-slash variants, and applicable methods against the built server.
- [ ] T017 [Plan:3.1] Delete website blocks, navbar/masthead, site/page/post/announcement services, and post GraphQL module after verifying all source/type/template consumers are gone.
- [ ] T018 [Plan:3.1] Prune website-only and local credential/account-management methods/types/query fields in [user service](src/lib/server/user.js); remove unused files service and schemas/models per the inventory. Preserve external-subject mapping, rider selectors, eligible drivers and contacts; remove independent login JWT signing, password hashes and obsolete provisioning-secret imports.
- [ ] T019 [Plan:3.1] Characterize retained legacy carpool REST APIs/screens alongside [remote commands](src/routes/carpool/ride.remote.js). Remove only approved duplicates, updating every caller/test in the same change; otherwise retain and document their carpool purpose.
- [ ] T020 [Plan:3.1] Run the app against isolated Directus credentials with website collection reads denied; exercise root, errors, external-auth identity mapping, event/trip/rider/vehicle flows, reports, and export. Keep underlying shared collections unchanged.

**Exit criteria**

1. Retired routes return `404` and never resolve through a generic CMS page loader.
2. Supported carpool workflows succeed without reads of website `global`, page/post/announcement/gallery or planning collections.
3. No imports, typedefs, generated references used at build time, or network calls point to deleted modules.
4. Required user/contact/driver data still reaches the authorized UI and spreadsheet.
5. Backend failures are surfaced with useful user feedback and server diagnostics; removal does not introduce swallowed errors or success-shaped fallbacks.

### M4 / Plan 4.1 - Extract minimal styling, assets, and tooling

**Requirements:** REQ-002, REQ-003, REQ-007, REQ-008, REQ-009

**Dependencies:** M3. **Indicative effort:** 2-3 developer days.

- [ ] T021 [Plan:4.1] Audit the global classes used by retained components, forms, dialogs, reports, and authentication screens. Extract needed styles from [website CSS](static/css/ligerbots.css) into a carpool stylesheet, updating [app template](src/app.html) or the shared layout to load it exactly once.
- [ ] T022 [Plan:4.1] Remove website background/header/sponsor/gallery rules and assets, duplicate HTML template, social/donation embeds, unused fonts/icons, and website JS. Keep Bootstrap CSS temporarily only if retained components need it; remove jQuery/Bootstrap JS only after proving no live behavior depends on them. Do not replace CSS utilities with a new UI framework.
- [ ] T023 [Plan:4.1] Use a local approved favicon. If no retained backend asset consumers exist, remove asset forwarding from [server hook](src/hooks.server.js) and both [development](system/dev/nginx.conf) and [production](system/prod/nginx.conf) proxies; otherwise keep and test the narrowly documented asset requirement. Preserve unrelated hook behavior unless shown unnecessary.
- [ ] T024 [Plan:4.1] Prune unused dependencies/scripts/configuration in [package.json](package.json), [Vite](vite.config.ts), [Svelte](svelte.config.js), and [Tailwind](tailwind.config.ts); regenerate [lockfile](pnpm-lock.yaml) with the chosen pnpm version. Preserve experimental remote-function/async compiler support while used.
- [ ] T025 [Plan:4.1] Remove website-only archive/defunct material and obsolete [generated docs](doc/); regenerate carpool-only JSDoc if retained. Fix or remove manifest scripts pointing to absent tooling, including model generation, based on the approved developer workflow.

**Exit criteria**

1. Retained forms, buttons, tables, dialogs, and printed/report pages remain legible and usable after every CSS/script removal.
2. Network capture contains no sponsor/social/blog/gallery requests or missing local assets.
3. Every retained static asset and non-framework dependency has a documented carpool/runtime/test/deployment purpose; no unused website files are merely relocated.
4. A clean frozen-lockfile install, deterministic tests, check, and production build succeed.
5. No website content remains in shipped static files, generated docs, or source snapshots. Required third-party licenses/attributions are preserved.

### M5 / Plan 5.1 - Align deployment, documentation, and CI

**Requirements:** REQ-007, REQ-009, REQ-010

**Dependencies:** M4. **Indicative effort:** 1-2 developer days.

- [ ] T026 [Plan:5.1] Update [README](README.md), [installation guide](system/INSTALLATION.md), retained [backend examples](docs/backend-server-module-examples.md), and [carpool use cases](dev-plan/) to match actual root/deep-link routing, the external-auth contract/ownership, identity mapping, commands, environment, and carpool-only scope.
- [ ] T027 [Plan:5.1] Update [package identity/scripts](package.json), [Dockerfile](Dockerfile), both [systemd configurations](system/), and proxy examples for the supported runtime and actual Node adapter startup. Use one consistent application port/origin model and a foreground production process.
- [ ] T028 [Plan:5.1] Remove embedded backend credentials from [Dockerfile](Dockerfile); inject runtime secrets through deployment configuration and arrange rotation of the exposed credential with its owner. Inventory required environment variables from retained code; provide a values-free example and do not copy secrets into images/docs/test evidence.
- [ ] T029 [Plan:5.1] Add a focused [CI workflow](.github/workflows/carpool.yml) for frozen install, deterministic tests, check, build, guarded provisioning tests and browser tests with isolated fixtures. Separate demo acceptance from production release gates; test provisioning rejection in production configuration and document authentication as a later-project gate.

**Exit criteria**

1. A developer can follow documentation from a clean checkout without website-content configuration.
2. A built Node-adapter artifact starts in a production-like environment; reverse-proxy login/cookies, root, deep links, static assets, errors, and export work.
3. No plaintext credentials are embedded in new images or tracked examples. Credential rotation is confirmed or is an explicit release blocker, not assumed complete from deleting a line.
4. CI does not hide missing integration credentials or browser dependencies as a fully passing release.
5. Developer scripts, container image names, and service descriptions no longer imply this replaces the public website. Existing operational service names may remain where renaming would create unnecessary deployment risk.

### M6 / Plan 6.1 - Acceptance, staging release, and rollback readiness

**Requirements:** REQ-001 through REQ-010

**Dependencies:** M5. **Indicative effort:** 1-2 developer days plus observation.

- [ ] T030 [Plan:6.1] Run the matrix in section 6 against the release build and isolated Directus schema; record demo/provisioning results separately from the deferred authentication work. Record commands, exit codes, counts, screenshots, browser errors and gaps.
- [ ] T031 [Plan:6.1] Review source, generated routes, asset inventory, package graph, docs, and network traffic against sections 3 and 4. Verify no required flow lost reachability when the navbar or duplicate screens were removed.
- [ ] T032 [Plan:6.1] Enable the provisioning tool temporarily only in isolated demo/staging with synthetic data, HTTPS and verified independent network/operator restrictions; set a named owner and expiry/review date. Run member/driver/admin/anonymous UAT as applicable, reject unauthorized ingress, verify password non-disclosure, and confirm production/public website/data are untouched.
- [ ] T033 [Plan:6.1] Rehearse artifact/config rollback and run demo smoke tests. Mark demo acceptance separately; do not enable provisioning or claim authentication readiness in production. The later authentication project must provide its own production acceptance and cutover approval.

**Exit criteria**

**Temporary demo/staging gate:** Applicable extraction tests and the section 3.5 isolation/guard requirements pass; evidence labels synthetic data and temporary provisioning. A temporary demo can be accepted while production provisioning and authentication remain disabled.

**Full M6 / extraction gate:** All extraction acceptance items in section 9 pass, provisioning is disabled in production configuration, evidence is attached, and the maintainer approves deployment. Authentication is not part of this gate and must not be implied by extraction acceptance.

### Sequencing and effort

Critical path: **M0 -> M1 -> M2 -> M3 -> M4 -> M5 -> M6**.

Indicative total: **9-16 developer days** for extraction and regression work, excluding external authentication-server implementation, protocol-dependent integration effort, unrelated baseline defects, unavailable test infrastructure, and release scheduling. T008 cannot be sized reliably until M0; re-estimate before committing to dates. Documentation drafting and fixture preparation can overlap only after decisions are settled; do not parallelize deletion and consumer changes in the same files.

## 6. Testing strategy

### Architecture and test assets

- **appType:** Mixed SvelteKit server-rendered pages, hydrated client interactions, REST handlers, and SvelteKit remote commands, backed by Directus GraphQL.
- **legacyTestAssets:** Discovered Vitest service suites and the older live event suite; no user-provided tests or tracked browser suite were found.
- **migrationDecision:** Reuse existing unit suites with minimal changes; turn the live event suite into a seeded isolated integration suite. Add browser coverage because unit tests do not verify rendering, cookies, navigation, or client commands.
- **primaryValidationStack:** Vitest unit/handler/contract tests; a production Node-adapter build with isolated real Directus and a matching database/schema; Playwright browser journeys and HTTP assertions; staging HTTPS/proxy checks.
- **Scaffold:** Shared synthetic Directus records, operator/provisioning fixtures, Directus client mocks, GraphQL response fixtures, and seed/teardown helpers. Add fixtures once, not separately in every suite. Each retained service must have a startup/import smoke test or equivalent coverage without manual setup.
- **External dependency strategy:** Mock Directus for deterministic unit/contract tests. For development/demo integration, use real isolated Directus/schema and the guarded provisioning flow. Authentication boundaries are not exercised by this extraction and must be covered by the later authentication project. Use local assets for deterministic tests and verify any retained third-party styles in deployment checks.
- **Test isolation:** Generate uniquely prefixed records per run. Seed events, both trip directions, vehicles/drivers, attendees, riders, and opt-outs. Clean relationships in reverse dependency order and delete only records created by the run. Use a dedicated backend/namespace and synthetic identities, never existing team data.

### Capability and fallback matrix

| Capability | Primary | Fallback on a documented failure | Gap / release handling |
|---|---|---|---|
| Real backend infrastructure | Version-matched Directus plus its database/schema in isolated containers. | Approved isolated non-production Directus service if Docker is unavailable. If neither is available, use local GraphQL contract mocks for development only. | Mocks cannot prove real schema, permissions, persistence, or backend behavior. Real-backend critical tests remain release blockers. |
| Authentication | Deferred to a later project; this extraction has no login or identity issuer. | Deterministic trusted-operator fixtures for unit tests and isolated provisioning tests. | Fixtures do not prove authentication. Authentication readiness is explicitly outside this extraction and requires a later security/integration project. |
| Browser automation | Playwright with installed Chromium against the built app; responsive checks and a second supported browser smoke test. | HTTP tests plus explicit manual browser UAT if browser installation is blocked. | HTTP alone does not prove hydration, layout, keyboard, or client commands; require recorded browser sign-off before release. |
| Node/pnpm | Supported compatible runtime and pinned package manager, verified during M0. | Run the same build/tests in a supported CI/container environment. | Without a working Node environment there is no local application validation; do not label this a pass. |
| Production proxy/HTTPS | Staging reverse proxy with real cookie/origin behavior. | Local HTTPS proxy matching production headers/config. | Direct HTTP checks alone do not prove secure cookie/proxy behavior; staging verification is still required before production. |

Evaluate infrastructure and browser capabilities independently. Docker being unavailable does not justify skipping browser tests. At implementation time, record actual prerequisite checks, browser-install failures if any, and the exact scope not verified. Do not install tools or contact production merely to write this plan.

### Required test matrix

| Test ID | Layer / journey | Assertions and acceptance criteria |
|---|---|---|
| TEST-01 | Loader + browser: root and demo boundary | Root renders the documented carpool/demo state without a local login redirect. Authentication is not asserted; future login integration is tracked separately. Event/admin state and deep links work without loops. |
| TEST-02 | HTTP + browser: compatibility/deep links | `/carpool` redirects to `/` without loops; query/trailing-slash cases pass; event, vehicle, attendee, rider-list and export URLs do not redirect to root accidentally. |
| TEST-03 | Browser: shell/footer | No site navigation/masthead/dropdowns/sponsor embeds; exactly one footer on normal/auth/handled-error pages; account and page-local controls are reachable by keyboard; responsive and zoom checks pass. |
| TEST-04 | HTTP + browser: provisioning boundary | Provisioning succeeds only for the approved isolated operator boundary, validates all required fields, creates a Directus user with supported password handling, handles duplicate email explicitly, returns a temporary password once, and rejects production configuration. Local credential/signup/password/token-login routes return `404` or the documented disabled response. Assert no plaintext password in logs, persistence, exports, URLs, or error responses. |
| TEST-05 | Browser + backend: member signup | View event, choose outbound/return rides or supported opt-out choices, confirm, reload/read back, change/remove selections, and verify attendee/rider state. Preserve currently supported seat/duplicate rules; record pre-existing gaps rather than pretending they are implemented. |
| TEST-06 | Browser + backend: driver | Eligible driver manages their supported vehicle/trip actions; persisted seats/assignments reload correctly; ineligible member/other-user actions are rejected according to the approved role/ownership baseline. |
| TEST-07 | Browser + API + backend: administrator | Create/edit/delete a synthetic event, manage destination/return trips and vehicles, add/move/remove a rider, and read back results. Non-admin requests are rejected server-side, not just hidden. |
| TEST-08 | Browser + binary contract: reports | Attendee/rider lists match fixture records and contacts; XLSX response has expected MIME/disposition, opens with ExcelJS, and contains expected event/trip/driver/rider values. Anonymous export fails. |
| TEST-09 | HTTP + browser: retired functionality | Website routes and APIs return `404`; representative CMS slug including `/current-sponsors` cannot load content; retired API methods cannot mutate/query website content. No request to navbar/site/announcement/debug endpoints. |
| TEST-10 | Unit + real backend: decoupling | Deny website collection reads while allowing retained carpool/user operations. Root, external-auth mapping, errors, admin, reports and export still work; recorded runtime queries contain no website-only collection or credential/password selections. |
| TEST-11 | Handler + browser: failures | Empty events are a valid empty state; backend failures are an error state. Missing event/vehicle IDs produce handled not-found responses. Deleted CMS APIs are not queried while rendering errors; footer/recovery links remain usable. |
| TEST-12 | Browser + source/build: assets/styles | No missing static resources, website background, social feeds or sponsor content. Dialogs, buttons, lists and forms still function after script/style removal; kept asset forwarding works or removed forwarding is consistently absent in Node/proxy. |
| TEST-13 | Build/deployment | Clean frozen install, deterministic test suite, check, production build/start, proxy origin/cookies, and release aggregate command pass. No generated website docs or embedded credentials are shipped. |
| TEST-14 | Operational: rollback | Revert staging to the prior artifact/config, verify login and representative carpool workflow, then redeploy the extraction artifact. No schema/data restore is required for this frontend extraction. |

### Commands and execution policy

Establish the actual baseline commands first. Existing commands and initial targeted validation:

```sh
pnpm exec vitest run src/lib/server/tests/event.test.js src/lib/server/tests/trip.test.js src/lib/server/tests/ride.test.js src/lib/server/tests/rider.test.js src/lib/server/tests/vehicle.test.js
pnpm run check
pnpm run build
```

The existing `check` script needs the configuration correction described in T009. Existing `pnpm test` also discovers the live event suite; do not run that command with production backend credentials.

During M1, define and document:

- `pnpm test`: deterministic Vitest service, route, and contract tests, including new tests.
- `pnpm run test:integration`: explicitly configured isolated Directus tests with seeding/cleanup.
- `pnpm run test:e2e`: Playwright against the built application.
- `pnpm run test:release`: deterministic tests, check, build, integration, and browser tests, failing if required release infrastructure is missing.

The production `test:release` gate must reject provisioning configuration and does not claim authentication readiness. Add a separately named `test:demo` aggregate for applicable extraction checks with isolated Directus and the guarded provisioning flow. Authentication integration and production identity verification belong to a later project. Keep the outcomes visible in CI and milestone evidence.

Use `pnpm exec` for installed tools and keep the lockfile authoritative. Start the production adapter directly with `node build/index.js` and the required environment in test orchestration rather than relying on the current backgrounding/log-redirection start script. Use an unoccupied test port and verify HTTP readiness before tests; stop only processes/containers owned by the test run.

For each task, run the smallest covering tests first. At milestone boundaries run the aggregate relevant suites; at M6 run all required tiers. Record command, exit code, pass/fail/skip counts, environment, fixture seed, and gaps. Nonzero exit code means failure. A skipped critical integration/browser test is unverified, not passing.

Final review must compare executed coverage to this strategy, verify all retained workflows and retired-route assertions, and inspect evidence for each capability independently. Any accepted pre-existing defect must be named with owner and rationale; no waiver may hide a newly introduced regression.

## 7. Data and deployment safeguards

1. Keep existing event/trip/ride/rider/user IDs and relationships. The root URL change needs no data migration.
2. Generated local model deletion is not permission to delete a Directus collection.
3. Narrow credentials used for the no-website-access integration test belong to a dedicated test role; do not change shared production roles for an experiment.
4. Inventory environment variables from retained imports, including backend URL/token, approved external-auth issuer/trust/verification configuration, and runtime host/port/origin. Remove local JWT signing/provisioning secrets once their consumers are deleted. A verification key or protocol client secret is retained only if the approved external contract requires it, not because local login previously used it.
5. Reconcile development proxy, production proxy, server hook, favicon, and build-time/runtime environment handling together.
6. Before publishing a replacement image, remove embedded credentials and coordinate credential rotation. Deleting a credential from the current file does not erase it from Git history or old images; handle history/image remediation separately with the owner.
7. Use retained normal application logs for smoke verification. Do not add a permanent diagnostic endpoint merely to support extraction.

## 8. Risks and mitigations

| Risk | Mitigation / owner |
|---|---|
| Deleting user/CMS code breaks carpool attendee selectors, auth, or exports. | Implementer traces consumers and tests real workflows before pruning; maintainer approves required user fields. |
| Navbar removal makes login/logout/vehicles/admin actions unreachable. | Move account actions to footer and operational actions into pages before deleting navbar; browser reachability tests. |
| Website CSS/Bootstrap removal causes subtle dialog/form regressions. | Preserve required styles first, remove in bounded batches, compare screenshots and keyboard behavior at defined widths. |
| Old docs claim nonexistent routes/features. | Treat executable sources as inventory authority; maintainer confirms supported behavior and documents unresolved baseline defects. |
| Authentication server is undesigned. | DEC-001 defers authentication. Record the future owner and contract questions; do not claim this extraction provides identity verification. |
| Provisioning accidentally gains real-data or production access. | DEC-008 restricts temporary deployment to synthetic isolated demo/staging behind independent operator/network controls. Test fail-closed production guards, password non-disclosure, ingress denial, and named deployment expiry/ownership. |
| Error handling or metadata retains website config access. | Test deliberate backend failures/404s with website permissions denied and inspect network/query activity. |
| Test suite requires live credentials or mutable fixture ID `1`. | Seed isolated records, separate test tiers, enforce non-production configuration and teardown. |
| Removal of `/assets` works locally but not behind nginx, or vice versa. | Test both paths and update hook/proxy together after asset-consumer review. |
| Framework/remote-command features are pruned as "unused". | Keep Svelte experimental settings while commands import them; exercise real hydrated mutations in browser tests. |
| Deployment documentation and runtime versions/ports disagree. | M0 compatibility verification and M5 clean-checkout/adapter/proxy validation. |
| A frontend rollback cannot undo user mutations during rollout. | No extraction data migration; rollback only artifact/config. Preserve legitimate data written through the app; never restore the database as a routine rollback. |

## 9. Release acceptance checklist

This is the **full extraction** checklist. Restricted synthetic-demo acceptance is separate, as defined in sections 3.5 and M6; it does not enable provisioning in production or mark authentication complete.

- [ ] `/` is the actual carpool landing page, with the approved login gate and correct successful return destination.
- [ ] `/carpool` compatibility works; every retained carpool deep link remains valid.
- [ ] No navbar, website masthead, sponsor/footer panels, social feeds, blog, announcements, galleries, directory, or generic CMS page is served.
- [ ] Footer appears on normal, access/error, and empty pages, with usable Home/external-auth links and no broken links; externally hosted login pages are not part of the app shell.
- [ ] Local login, logout, signup, password-management and token-login routes/APIs are gone; no app code verifies passwords, provisions accounts, or issues independent login JWTs.
- [ ] Approved external identity validation, mapping, safe return, expiry/revocation/logout behavior, outage handling, and API/remote-command authorization pass real integration tests.
- [ ] Provisioning is disabled by production configuration and deployment controls; no temporary password is present in logs, persisted output, exports, URLs, or shipped fixtures. Authentication is explicitly tracked as a separate project.
- [ ] Member, driver, and admin journeys pass; anonymous/invalid-role requests cannot perform protected actions.
- [ ] Attendance/rider reports and parsed XLSX contents match seeded records after reload/read-back.
- [ ] Website pages/APIs/debug endpoints are removed at the server, not hidden behind the UI.
- [ ] No retained runtime flow reads website-only configuration/content collections.
- [ ] Deleted modules/assets have no live imports, type references, CSS URLs, template links, or generated-doc remnants.
- [ ] Static assets and package/tooling inventory contain only justified carpool/developer/operational dependencies.
- [ ] Clean install, tests, check, build, actual production startup, HTTPS/proxy checks, and CI/release gates pass with recorded evidence.
- [ ] Documentation, environment examples, and metadata describe only the carpool service, deferred authentication ownership, and the isolated provisioning boundary.
- [ ] Deployment secrets are injected appropriately; exposed credential rotation is confirmed.
- [ ] Rollback is rehearsed; previous artifact/configuration is recoverable; public website and shared backend data remain untouched.
- [ ] Maintainer approves UAT and all scope decisions; no critical test is silently skipped or represented as passing.

### Rollout and rollback

1. Release the frontend without backend schema changes. Save prior artifact/configuration and the tested release identifier. Rehearse external-auth compatibility with the rollback target; do not assume an old local-JWT-only artifact accepts the new identity. If necessary, use an intermediate external-auth-compatible artifact as the rollback target and keep obsolete credential routes disabled at the proxy.
2. Smoke-test root/external-sign-in round trip, event details, one permitted mutation/read-back, vehicle access, report/export, retired routes, and footer through the actual public-facing proxy.
3. Roll back promptly if login breaks, protected data becomes accessible incorrectly, writes/reports fail, root loops, or a required workflow is unreachable.
4. Restore the previous frontend artifact and proxy/service configuration as a coordinated unit; verify the same smoke tests. Do not overwrite valid user data.
5. Observe error logs and representative workflow completion, record any rollback decision, and keep compatibility redirects until a separate approved change retires them.

## 10. Requirement mapping

| Requirement | Plan items | Task coverage | Planned implementation evidence |
|---|---|---|---|
| REQ-001 | 2.1, 6.1 | T010-T011, T014, T030-T033 | Root loader/page, scoped alias, TEST-01/02. |
| REQ-002 | 2.1, 3.1, 4.1, 6.1 | T012-T013, T016-T017, T021-T025, T030-T033 | Minimal layout/footer, deleted website surfaces, TEST-03/09/12. |
| REQ-003 | 2.1, 4.1, 6.1 | T012-T013, T021-T022, T030-T033 | Footer/shell/styles, TEST-03/11/12. |
| REQ-004 | 0.1, 1.1, 2.1, 3.1, 6.1 | T001-T002, T005-T009, T012-T014, T016, T018-T019, T030-T033 | External-auth contract/integration, footer links, retired local-auth routes, TEST-01/04. |
| REQ-005 | 0.1, 1.1, 2.1, 3.1, 6.1 | T001-T005, T007-T008, T010-T014, T018-T020, T030-T033 | Retained carpool services/routes/commands, TEST-05/06/07/08. |
| REQ-006 | 3.1, 6.1 | T015-T017, T030-T033 | Route manifest and HTTP retired-route assertions, TEST-09/11. |
| REQ-007 | 0.1, 4.1, 5.1, 6.1 | T001, T004, T021-T029, T030-T033 | Disposition inventory, package/asset/doc cleanup, TEST-12/13. |
| REQ-008 | 1.1, 3.1, 4.1, 6.1 | T005-T006, T015-T020, T023, T030-T033 | No-website-permission integration, error handler, TEST-10/11/12. |
| REQ-009 | 0.1, 4.1, 5.1, 6.1 | T003-T004, T023-T029, T030-T033 | README/install/deployment/CI changes, TEST-13. |
| REQ-010 | 0.1, 1.1, 5.1, 6.1 | T001-T009, T026-T033 | Baseline/PR evidence, aggregate gates, UAT and rollback, TEST-14. |

**Plan coverage:** 10 requirements, 7 milestones, 33 implementation tasks, and 14 test groups. Completion means verified behavior and a carpool-only repository/runtime, not merely fewer links on the home page.

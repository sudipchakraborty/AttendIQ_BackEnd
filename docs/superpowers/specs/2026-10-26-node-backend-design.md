# AttendIQ Node.js backend

Status: proposed for approval. The user selected the recommended full API replacement rather than a starter-only framework.

## Intent and scope

Build the backend in the existing AttendIQ_BackEnd repository, connect the existing React frontend, deploy the backend to the authorized Contabo server, and push the resulting repository changes. Preserve the frontend's current login, employee, salary, reports-defaults, user-management, and support behavior. Keep Admin, HR, and Viewer permissions unchanged.

## Approaches

The selected direction is a full Node.js replacement of the PHP API. A starter-only service was offered and would leave the frontend dependent on PHP; the user's approval followed the recommendation for the full replacement. Express with TypeScript is the proposed implementation choice: small explicit modules fit the current API. NestJS would add structure and dependencies without a demonstrated need. Keeping PHP behind a Node proxy would retain two runtimes and would not deliver the intended replacement.

## Architecture and contract

Use a supported Node.js LTS release, Express, TypeScript, SQLite, and environment-based configuration. Separate configuration, HTTP middleware, authentication/authorization, persistence, route handlers, and email delivery. Provide health/readiness endpoints, structured logs with credential redaction, graceful shutdown, migrations, and local development commands.

Preserve existing request and response shapes for /auth/session, /auth/setup, /auth/login, /auth/logout, /auth/password, /defaults, /employees, /employees/:id, /salaries, /salaries/:id, /users, /users/:id, and /support. Expose /api routes and optionally the legacy index.php?route= adapter during transition. Update the frontend API client and development commands for Node. Reports and payroll calculations remain in the frontend as today.

## Persistence and migration

Use transactional SQLite storage for employees, users, sessions, audit events, support tickets, settings/default attendance, and rate-limit state as needed. Retain record versions, revision counters, archive/restore, unique employee IDs and names, and last-active-admin protection. Preserve salary precision and existing exports where consumed.

Provide an explicit offline import command for existing PHP state and attendance defaults. Do not commit runtime data, employee records, password hashes, setup tokens, credentials, or database files. Back up any target database before import and refuse accidental replacement. Inspect existing private data only as necessary, reporting counts rather than contents. Support existing bcrypt hashes during import or document and verify a deliberate password reset path before cutover; never silently discard accounts. Do not overwrite an existing server installation or database without a backup and a scoped migration.

## Security and support

Use server-side sessions, login session rotation, secure HttpOnly cookies, CSRF protection, idle/absolute expiry, role checks on every protected endpoint, account-change session revocation, bounded JSON bodies, validation, and authentication/support throttling. Hash new passwords with an established password hashing implementation. Bootstrap the first administrator through a private installation token, never a default password or publicly accessible token endpoint.

Support email goes to the existing fixed recipient, with the authenticated user's validated reply address. Store ticket accepted/failed outcomes. Keep SMTP unconfigured until real credentials are supplied, as previously requested; missing SMTP must produce an honest failure and never a success claim.

## Deployment and frontend connectivity

First inspect the Contabo OS, existing services, listening ports, reverse proxy, domains/certificates, and available resources using the provided SSH authorization. Install only the required runtime/service components and deploy into a dedicated application directory under a non-root service user. Use systemd restart behavior, persistent storage outside releases, private environment files, and a reverse proxy with request limits. Preserve unrelated services and firewall rules.

Prefer a same-origin HTTPS /api reverse proxy from the current frontend host to Contabo, preserving cookie behavior. If that hosting cannot proxy, use an available HTTPS API hostname with an exact frontend origin allowlist and credentialed requests; account for browser cookie restrictions and verify in-browser login before claiming integration. Never embed a plain HTTP IP endpoint in an HTTPS frontend. A domain/DNS or hosting capability unavailable through existing configuration is a concrete deployment dependency to report and request once discovered. Do not claim public production completion from localhost health checks alone.

The user authorized deployment and Git push. Fetch/check both remotes and local changes before committing. Preserve the frontend's pre-existing dirty changes; commit only attributable integration changes unless the user's scope explicitly covers other work. Push backend implementation and frontend integration to their existing repositories without force pushes. Keep all server credentials out of files and Git history.

## Verification and completion

Verify API contract, setup/login/logout/password changes, CSRF, role denial, persistence across restart, stale writes, archive/restore, salary validation, session revocation, last-admin protection, and SMTP failure/local acceptance using isolated test data. Run frontend lint, typecheck, unit tests, production build, and the existing browser suite against Node. Verify remote service state and public health/readiness, then browser login/API access through the actual deployment path where available. Compare pushed commits to remote SHAs. Clearly report any unfulfilled external dependency. Beep after modification completion as requested.

## Builder choices and boundaries

Exact dependency versions, schema layout, directory naming, service port, migration tooling, and reverse proxy configuration are builder decisions informed by live inspection. Multi-tenant support, new payroll algorithms, device ingestion, and unrelated UI redesign are outside scope. Domain availability and current server contents are unknown until inspected; preserve existing behavior and data throughout cutover.

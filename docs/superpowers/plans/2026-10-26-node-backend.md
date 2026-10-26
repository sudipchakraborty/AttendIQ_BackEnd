# AttendIQ Node Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace the existing PHP API with a compatible Node backend, integrate React, deploy to Contabo, and push both repositories.

**Architecture:** An Express application with separate configuration, security, persistence, API, and support modules. SQLite transactions retain durable state, optimistic record versions, and session revocation. An inspected HTTPS reverse proxy supplies the production API path.

**Tech Stack:** Supported Node.js LTS, TypeScript, Express, SQLite, a bcrypt-compatible password library, Nodemailer, Node test runner, Playwright, systemd.

**Spec:** `docs/superpowers/specs/2026-10-26-node-backend-design.md` (approved by the user).

## Global Constraints

- Keep Admin, HR, and Viewer permissions unchanged.
- Do not commit runtime data, employee records, password hashes, setup tokens, credentials, or database files.
- Keep SMTP unconfigured until real credentials are supplied.
- Preserve unrelated services and firewall rules.
- Never embed a plain HTTP IP endpoint in an HTTPS frontend.
- Preserve the frontend's pre-existing dirty changes.
- Beep after modification completion as requested.

## Review Focus

- Concurrent initial administrator setup must create only one administrator.
- Imported PHP hashes must remain usable without exposing account data.
- Browser cookie restrictions must not produce a health-only deployment that cannot log in.
- Role/password/account changes must invalidate earlier sessions immediately.
- Interrupted migration or deployment must preserve existing data and unrelated services.

## Task 1: Durable service and migration

**Files:** Create `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `src/config.ts`, `src/store.ts`, `src/server.ts`, `scripts/import-php.ts`, `tests/store.test.ts`.

**Interfaces:** `loadConfig(env)` returns validated configuration; `openStore(path)` returns a SQLite store with transactional access and `close()`; `startServer(config)` starts the HTTP listener. Import accepts an explicit source file and destination database, refuses an existing destination, and creates a backup before any approved replacement.

- [ ] Write failing tests for state persistence across reopen, rollback on failure, duplicate-import rejection, and imported PHP bcrypt verification.
- [ ] Run tests and confirm failures identify the missing implementation.
- [ ] Implement configuration, schema migrations, private database storage, the offline importer, and health/readiness endpoints. Use fixture-only seed data in tests; import real data privately outside Git.
- [ ] Run store tests, TypeScript checks, and service startup/shutdown checks; confirm persisted data survives restart.
- [ ] Commit the tested service foundation.

## Task 2: Authentication and API compatibility

**Files:** Create `src/security.ts`, `src/auth.ts`, `src/api.ts`, `src/support.ts`, `tests/api.test.ts`; extend `src/server.ts`.

**Interfaces:** `createApp(config, store)` returns the HTTP application; `/api` routes and the legacy `/api/index.php?route=` adapter return the current PHP response shapes. Security exposes the existing permission map and public user fields, with persistent server-side sessions. Support sends only to the fixed existing recipient and records delivery acceptance/failure.

- [ ] Port the existing API behavioral assertions into isolated Node tests. Assert setup races, cookie/session rotation, CSRF rejection, bounded chunked request bodies, brute-force limits, all role denials, stale employee/salary/user updates, archive/restore, revision increments, invalid salaries, last-admin protection, session revocation, SMTP failure, and acceptance by a local SMTP test listener.
- [ ] Run the tests before implementation and observe the expected missing-route failures.
- [ ] Implement the endpoints and validation from the current `server/src/Api.php` contract, password hash compatibility, transactional writes, session expiry, audit records, rate limits, and support delivery.
- [ ] Run the full API suite and TypeScript checks; verify sensitive fields never appear in responses or logs.
- [ ] Commit the compatible API implementation.

## Task 3: Frontend integration

**Files:** Modify frontend `src/shared/api.ts`, `scripts/api-dev.mjs`, `scripts/e2e-server.mjs`, `package.json`, `vite.config.ts`, and deployment build configuration as required; update both READMEs and add frontend environment documentation.

**Interfaces:** The frontend accepts a configured API base URL, uses the same existing route/response types, and enables credentialed requests when required by the inspected production topology. Local proxy routes to Node; browser tests start Node with isolated data and a local SMTP listener.

- [ ] Add/adjust integration assertions for Node API requests and session/CSRF behavior. Establish expected failure against the current PHP-only startup path.
- [ ] Update local startup, production client configuration, test fixture setup, and build packaging to use the Node backend without bundling private data.
- [ ] Run frontend lint, typecheck, unit tests, build, and all existing Playwright tests against Node. Verify login, employees, salaries, roles, reports/defaults, and support through the browser suite.
- [ ] Review the frontend diff against its initial dirty state; stage only attributable integration hunks and commit them. Leave unrelated user work intact.

## Task 4: Deployment, review, and publication

**Files:** Create backend `deploy/attendiq-backend.service`, `deploy/nginx.conf.example`, `deploy/deploy.sh`, `.github/workflows/ci.yml`, and deployment/rollback instructions. Add topology-specific frontend settings only after inspection.

**Interfaces:** The deployment uses dedicated application/data directories, a non-root runtime user, a private environment file, systemd, and a scoped reverse proxy. Health/readiness responses identify the deployed service without leaking configuration.

- [ ] Inspect Contabo OS, services, listeners, reverse proxy, certificates, DNS configuration, and current installations read-only through SSH. Resolve the HTTPS API path from existing configuration; request a domain/DNS or hosting capability only if no working path is available.
- [ ] Add a deployment smoke check that fails before service installation; verify proxy syntax before reload and stop on failed health checks. Ensure rollback points to a previous release and never deletes persistent data.
- [ ] Back up affected configuration/data, install the tested backend in its dedicated location, configure its service and HTTPS routing, and restart only the affected service. Do not create a public default administrator.
- [ ] Verify systemd state, local and public health/readiness, persistence across service restart, and browser credential/session behavior on the actual production HTTPS path. Report separately any external dependency preventing live integration.
- [ ] Obtain the executing-plans final independent code review; fix important findings with reproducing tests, then rerun affected and full suites. Confirm no secrets or runtime data are staged.
- [ ] Fetch both Git remotes, check divergence, push the reviewed commits without force, and compare local/remote SHAs. Inspect any triggered deployment run before claiming publication.
- [ ] Record tested URLs, commit IDs, and remaining operational dependencies; issue the requested completion beep.

## Self-review

All approved design sections map to tasks above. Review-focus conditions map to store/API tests, production browser verification, and deployment backup/rollback checks. Existing private data is migrated explicitly rather than published as repository seed files. Dependency versions and deployment port remain builder decisions after runtime and server inspection.

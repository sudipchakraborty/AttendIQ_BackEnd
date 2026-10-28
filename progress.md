# Backend progress

## 2026-10-28 — commit and push preparation

- Reviewed pending changes and fetched origin; local main matched origin/main before committing.
- Prepared development-only authentication configuration, reusable temporary identity, session integration, regression test, and progress history for commit and push to origin/main as requested.
- Final checks: 6 tests passed, 1 Linux-only test skipped, TypeScript and Git whitespace checks passed.

## 2026-10-28 — frontend default theme update

- Frontend now defaults to Midnight Blue for first visits and unreadable/invalid browser preferences, preserving existing valid theme choices.
- No backend files or authentication behavior changed for this update. Frontend verification: 19 tests and TypeScript check passed.

## 2026-10-28 — temporary local login bypass

- Added explicit `ATTENDIQ_DEV_AUTH_BYPASS` configuration, disabled by default. Enabling it requires `NODE_ENV=development`; production/test startup rejects this configuration.
- Added reusable `src/development-auth.ts` with Doxygen comments and a parameter-controlled temporary Local Developer identity. Session middleware uses it for development API requests, while preserving CSRF checks. No account, password, or bypass identity is persisted.
- Session API reports `developmentBypass` and suppresses first-administrator setup while enabled. Existing login/session/role behavior remains active when disabled.
- Updated `.env.example`. Frontend local launcher enables the switch; standalone backend remains disabled by default. To restore frontend local login, set `$env:ATTENDIQ_DEV_AUTH_BYPASS='0'` and restart `npm run dev:all`.
- Added `tests/development-auth.test.ts`; confirmed it failed before implementation and passed afterward. Full backend suite: 6 passed, 1 Linux-only deployment test skipped; TypeScript check passed. Tests cover default protection, explicit bypass access, production rejection, and absence of persisted accounts.
- Running backend restarted on 127.0.0.1:8000 with the bypass enabled. Local Chrome verified workspace and employee access; normal authenticated login browser regression passed with bypass disabled.

## 2026-10-28 — development review

- Installed npm dependencies for local testing.
- Reviewed session cookies, CSRF, login validation, setup-token bootstrap, and existing Admin/HR/Viewer permissions.
- Missing/invalid email is rejected; passwords are verified against stored hashes. No authentication bypass added.
- `npm run dev` defaults to 127.0.0.1:3201; frontend `npm run dev:all` uses this repository on port 8000.
- Verification: 5 backend tests passed, 1 Linux-only deployment rollback test skipped on Windows; TypeScript check and build passed. Initial sandbox user-information errors were resolved by rerunning tests outside the sandbox.
- Frontend browser verification passed all 7 tests including a new regression that rejects missing, empty, and null login credentials without establishing a session.
- Local server is running on 127.0.0.1:8000 through the frontend launcher; /ready reports ready. Private local storage `.attendiq` contains 7 imported legacy sample employees and no accounts. The frontend opens first-administrator setup using `.attendiq/setup-token.txt`.
- Installed Node 24.13.0 is below the declared minimum 24.15.0 despite the successful checks; use a supported Node 24 version for ongoing development.

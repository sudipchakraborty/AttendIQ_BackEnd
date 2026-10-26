# AttendIQ backend

Node.js 24 LTS, Express, TypeScript, SQLite, server-side sessions, and optional SMTP. The React frontend lives in [AttendIQ](https://github.com/sudipchakraborty/AttendIQ).

## Local development

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Default listener: `http://127.0.0.1:3201`. Health: `/health`; database readiness: `/ready`. Use `npm test`, `npm run typecheck`, and `npm run build` to verify. Production starts with `npm start`. New installations have no accounts or employee data. Retrieve the private `ATTENDIQ_STORAGE/setup-token.txt` file locally to create the first Admin through the frontend. Never publish this token.

## API

The `/api/auth/*`, `/api/employees`, `/api/salaries`, `/api/users`, `/api/defaults`, and `/api/support` routes preserve the previous frontend contract. The compatibility endpoint `/api/index.php?route=/employees` works during transition; PHP is not running on Contabo. Call `/api/auth/session` first, retain the HttpOnly cookie, and send its returned `csrfToken` in `X-CSRF-Token` on every mutation. Record updates require the current `version`; conflicts return 409. Roles remain Admin, HR, Viewer. Account changes revoke older sessions; sessions expire after 30 minutes idle or 8 hours absolute.

Support targets `info@niyanti.com`. SMTP remains unconfigured until private environment values are supplied. A ticket reports failure if no mail server accepted it; acceptance does not establish inbox delivery.

## Data migration

Keep all state and attendance files private and outside Git. Stop writes to the old PHP backend before final export. To import existing PHP state with its employees, accounts, audit and tickets, export the attendance text separately and run:

```powershell
npm run import:php -- C:/private/state.json C:/private/attendance.txt C:/private/attendiq-new
```

The importer refuses an existing database and retains compatible PHP bcrypt hashes. Old PHP sessions and rate limits are intentionally not migrated; users sign in again. Unsupported password formats fail rather than silently discarding accounts. Preserve the original PHP data for rollback. SQLite WAL transactions keep the existing version/revision behavior; the authoritative state is a transactional JSON document in SQLite, with separate session/settings tables and schema version 1. Employee/salary exports can be generated from the authenticated API; there are no publicly readable salary files.

## Dedicated Contabo environment

AttendIQ uses its own user `attendiq`, runtime `/opt/attendiq/runtime`, releases `/opt/attendiq/releases`, active link `/opt/attendiq/current`, private configuration `/etc/attendiq/backend.env`, and persistent data `/var/lib/attendiq`. The backend listens only on `127.0.0.1:3201`. Its systemd service limits memory to 512 MiB and CPU to one core, with read-only system access and writes restricted to its data directory.

A separate Nginx instance, `attendiq-proxy.service`, listens on HTTPS port 9443 with its own config, PID, temp directories and logs. It uses the existing valid certificate for `socket.sukalyanai.com`. The shared Nginx instance on ports 80/443 and other application services are not reconfigured or restarted. Only a scoped new firewall rule for 9443 is required. A certificate-renewal hook reloads only the AttendIQ proxy after renewal.

Public endpoint: `https://socket.sukalyanai.com:9443`. The frontend's fixed same-origin PHP cURL gateway forwards to this endpoint, so browsers keep first-party secure cookies. Hostinger requires PHP 8.2+ and cURL. No API business logic or database is packaged with the frontend. Direct cross-origin clients require an exact allowlist and suitable browser cookie policy; use the gateway for this frontend.

Set `ATTENDIQ_GATEWAY_SECRET` to the same random 64-character hex value on Contabo and in the frontend GitHub Actions encrypted secret. The gateway signs its client's IP and current timestamp; Node accepts forwarded identity only after HMAC verification and freshness checks. Arbitrary public forwarding headers do not affect rate-limit identity. The frontend gateway's generated PHP secret file is excluded from Git and denied by its `.htaccess`. This avoids a shared login quota across all users of the Hostinger gateway.

Deploy the reviewed build into a new release directory, install production dependencies there with the dedicated Node runtime, and invoke `bash deploy/deploy.sh /opt/attendiq/releases/RELEASE`. The script creates a consistent SQLite backup, switches the active release, restarts only AttendIQ, checks readiness, and restores the prior application link on failure. Schema-changing releases must provide a tested data rollback separately; never copy a live SQLite database without its WAL. Service/proxy files are supplied under `deploy/`; first installation must create the dedicated user/directories and private environment file before enabling services.

Inspect with `systemctl status attendiq-backend attendiq-proxy`, `journalctl -u attendiq-backend`, and `curl --fail https://socket.sukalyanai.com:9443/ready`. Logs omit request bodies, credentials, and cookie values. Runtime files, credentials, and setup tokens are excluded from Git.

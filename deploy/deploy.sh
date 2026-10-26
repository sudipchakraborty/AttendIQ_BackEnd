#!/usr/bin/env bash
# Run as root with an already uploaded, tested release directory under releases/.
set -euo pipefail
release=$(realpath "${1:?Usage: deploy.sh /opt/attendiq/releases/RELEASE}")
case "$release" in /opt/attendiq/releases/*) ;; *) echo 'Invalid release path' >&2; exit 1;; esac
test -f "$release/dist/src/server.js"
test -f /etc/attendiq/backend.env
previous=$(readlink -f /opt/attendiq/current || true)
if systemctl is-active --quiet attendiq-backend; then
    # Online backup includes committed WAL records; a plain file copy would not.
    /opt/attendiq/runtime/bin/node --input-type=module -e '
      import { DatabaseSync, backup } from "node:sqlite";
      const db = new DatabaseSync("/var/lib/attendiq/attendiq.sqlite");
      await backup(db, "/var/lib/attendiq/backup-" + Date.now() + ".sqlite"); db.close();'
fi
ln -sfn "$release" /opt/attendiq/current
healthy=false
if systemctl restart attendiq-backend; then
    for attempt in $(seq 1 20); do
        if curl --fail --silent http://127.0.0.1:3201/ready >/dev/null; then healthy=true; break; fi
        sleep 1
    done
fi
if [ "$healthy" != true ]; then
    if [ -n "$previous" ] && [ -d "$previous" ]; then
        ln -sfn "$previous" /opt/attendiq/current
        systemctl restart attendiq-backend
    fi
    echo 'Deployment failed readiness; previous release restored where available.' >&2
    exit 1
fi
echo 'AttendIQ backend ready.'

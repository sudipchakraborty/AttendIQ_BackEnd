#!/usr/bin/env bash
set -euo pipefail
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/app/releases/old/dist/src" "$work/app/releases/new/dist/src" "$work/config" "$work/bin"
touch "$work/app/releases/new/dist/src/server.js" "$work/config/backend.env"
ln -s "$work/app/releases/old" "$work/app/current"
cat > "$work/bin/systemctl" <<'STUB'
#!/usr/bin/env bash
if [ "$1" = is-active ]; then exit 1; fi
if [ "$1" = restart ]; then
  echo restart >> "$FIXTURE/restarts"
  if [ "$(readlink "$FIXTURE/app/current")" = "$FIXTURE/app/releases/new" ]; then exit 1; fi
fi
STUB
printf '#!/bin/sh\nexit 1\n' > "$work/bin/curl"
chmod +x "$work/bin/"*
sed -e "s|/opt/attendiq|$work/app|g" -e "s|/etc/attendiq|$work/config|g" deploy/deploy.sh > "$work/deploy.sh"
export FIXTURE="$work"
if PATH="$work/bin:$PATH" bash "$work/deploy.sh" "$work/app/releases/new"; then echo 'Expected failed deployment' >&2; exit 1; fi
test "$(readlink "$work/app/current")" = "$work/app/releases/old"
test "$(wc -l < "$work/restarts" | tr -d ' ')" = 2
echo 'Immediate restart failure restored the prior release and restarted it.'

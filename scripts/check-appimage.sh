#!/usr/bin/env bash
# Does the packaged AppImage start on this Linux the way it would for a person, and bring its engine up? No phone
# needed. Also says whether Chromium's sandbox is on: the AppImage turns it off where user namespaces are blocked.
# Usage: scripts/check-appimage.sh <path to the .AppImage>   (needs xvfb-run)
set -euo pipefail

log=$(mktemp)
xvfb-run -a "$1" >"$log" 2>&1 &
launcher=$!
for _ in $(seq 60); do
  grep -q 'engine ready' "$log" && break
  kill -0 "$launcher" 2>/dev/null || break # it quit: no use waiting
  sleep 1
done
# The AppImage runs from a mounted folder. The app's own process is the one without --type= (its helpers have one).
args=$(pgrep -af '^/[^ ]*/\.mount_[^/ ]*/jiggle( |$)' | grep -v -- '--type=' || true)
pkill -f '/\.mount_[^/ ]*/jiggle' || true

cat "$log"
grep -q 'engine ready' "$log" || { echo "The AppImage didn't bring its engine up." >&2; exit 1; }
echo "Started as: ${args:-unknown}"
case "$args" in
  '') echo "Chromium sandbox: unknown (the app's process wasn't found)" ;;
  *--no-sandbox*) echo "Chromium sandbox: OFF" ;;
  *) echo "Chromium sandbox: on" ;;
esac
echo "The AppImage starts."

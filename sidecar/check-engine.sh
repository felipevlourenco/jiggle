#!/usr/bin/env bash
# Does a frozen engine start, load its libraries and speak UTF-8? No phone needed.
# Usage: sidecar/check-engine.sh <path to jiggle_engine>
set -euo pipefail

out=$(printf '%s\n' \
  '{"id":1,"method":"ping"}' \
  '{"id":2,"method":"list_devices"}' \
  '{"id":3,"method":"Música 🎵"}' | "$1")
echo "$out"
grep -qF '"id": 1, "result"' <<<"$out"
# Without Apple's device service (a bare Windows or Linux machine) this is an error, and still an answer.
grep -qF '"id": 2, ' <<<"$out"
# The engine answers in ASCII escapes: these are the letters it was sent ('.' stands for each backslash).
grep -q 'Unknown method: M.u00fasica .ud83c.udfb5' <<<"$out"
echo "The engine answers."

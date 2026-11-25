#!/usr/bin/env bash
# Freeze the engine with PyInstaller (--onedir) for this computer's system and architecture (PyInstaller can't
# build for another). Output: resources/sidecar/<arm64|x64>/jiggle_engine/jiggle_engine (.exe on Windows).
set -euo pipefail
cd "$(dirname "$0")"

case "$(uname -m)" in
  arm64 | aarch64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

# A venv keeps its programs in Scripts on Windows (run this in Git Bash there) and in bin elsewhere.
BIN=.venv/bin
[ -d .venv/Scripts ] && BIN=.venv/Scripts

OUT="../resources/sidecar/$ARCH"
rm -rf "$OUT" build
"$BIN/pyinstaller" jiggle_engine/__main__.py \
  --name jiggle_engine \
  --onedir --noconfirm --clean \
  --paths . \
  --distpath "$OUT" --workpath build/pyi --specpath build \
  --collect-submodules pymobiledevice3 \
  --collect-data pymobiledevice3

echo "Built $OUT/jiggle_engine"

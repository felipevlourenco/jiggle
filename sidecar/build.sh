#!/usr/bin/env bash
# Freeze the engine with PyInstaller (--onedir) for this Mac's architecture.
# Output: resources/sidecar/<arm64|x64>/jiggle_engine/jiggle_engine
set -euo pipefail
cd "$(dirname "$0")"

case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

OUT="../resources/sidecar/$ARCH"
rm -rf "$OUT" build
.venv/bin/pyinstaller jiggle_engine/__main__.py \
  --name jiggle_engine \
  --onedir --noconfirm --clean \
  --paths . \
  --distpath "$OUT" --workpath build/pyi --specpath build \
  --collect-submodules pymobiledevice3 \
  --collect-data pymobiledevice3

echo "Built $OUT/jiggle_engine/jiggle_engine"

#!/usr/bin/env bash
# Build, sign, notarize and publish a release from this Mac, for when GitHub Actions is off.
# It does what .github/workflows/release.yml does, then makes a DRAFT GitHub release, but for Apple silicon ONLY:
# the Intel engine can only be built on an Intel Mac (or under Rosetta). A release made here has nothing for
# Intel Macs to install or update to, so use the workflow whenever you can.
#
#   1. Bump "version" in package.json, merge that to main, and pull main.
#   2. Export the App Store Connect API key (the .p8 and its two IDs):
#        export APPLE_API_KEY=~/keys/AuthKey_XXXXXXXXXX.p8
#        export APPLE_API_KEY_ID=XXXXXXXXXX
#        export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
#      The "Developer ID Application" certificate must be in your login keychain.
#   3. bash scripts/release-local.sh            # leaves a draft: check the DMG, then publish it on GitHub
#      bash scripts/release-local.sh --publish  # publishes straight away (updates go live)
set -euo pipefail
cd "$(dirname "$0")/.."

publish=0
[ "${1:-}" = "--publish" ] && publish=1

die() { echo "release: $*" >&2; exit 1; }

version=$(node -p "require('./package.json').version")
tag="v$version"

# Preconditions: fail before the slow part.
[ "$(uname -m)" = "arm64" ] || die "build on an Apple silicon Mac (this script makes the arm64 build only)"
[ "$(git branch --show-current)" = "main" ] || die "switch to main"
[ -z "$(git status --porcelain)" ] || die "the working tree has changes; commit or stash them"
git fetch -q origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "main is not the same as origin/main; pull or push first"
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && die "tag $tag already exists; bump the version in package.json"
gh release view "$tag" >/dev/null 2>&1 && die "release $tag already exists"
for var in APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER; do
  [ -n "${!var:-}" ] || die "$var is not set (see the top of this script)"
done
[ -f "$APPLE_API_KEY" ] || die "APPLE_API_KEY is not a file: $APPLE_API_KEY"
security find-identity -v -p codesigning | grep -q "Developer ID Application" ||
  die "no \"Developer ID Application\" certificate in the keychain"
echo "Releasing $tag"
echo "release: Apple silicon only. Intel Macs can't install or update to this release; the workflow builds both." >&2

# The same checks the workflow runs.
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm exec vitest run
(cd sidecar && .venv/bin/python -m pytest)

# The frozen engine, then the app: signed with the keychain certificate and notarized by electron-builder
# (it reads APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER).
bash sidecar/build.sh
rm -rf dist
pnpm exec electron-vite build
pnpm exec electron-builder --mac --arm64 --publish never

# What the workflow verifies, plus the stapled ticket.
app=$(ls -d dist/mac*/Jiggle.app)
codesign --verify --deep --strict --verbose=2 "$app"
spctl -a -vv "$app" 2>&1 | tee /dev/stderr | grep -q "Notarized Developer ID" || die "Gatekeeper does not say Notarized Developer ID"
xcrun stapler validate "$app"

# Tag the commit that was built, then make the release.
git tag "$tag"
git push origin "$tag"
files=(dist/*.dmg dist/*.dmg.blockmap dist/*.zip dist/*.zip.blockmap dist/latest-mac.yml)
if [ "$publish" = 1 ]; then
  gh release create "$tag" "${files[@]}" --generate-notes --latest --verify-tag
else
  gh release create "$tag" "${files[@]}" --generate-notes --draft --verify-tag
  echo "Draft created. Open the DMG from dist/, then publish: gh release edit $tag --draft=false --latest"
fi

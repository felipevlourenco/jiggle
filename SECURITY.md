# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting instead:
**Security tab > Report a vulnerability** on this repository.

Include what you found, how to reproduce it, and the macOS and iOS versions involved. You can expect a first reply within a week.

## What is in scope

Jiggle talks to an iPhone or iPad over USB or Wi-Fi and rewrites its home screen layout. Reports about these are especially welcome:

- Anything that lets a layout, icon or other device data run code or escape the renderer sandbox.
- Writes to the device that skip validation or the backup that precedes every write.
- The auto-update path and the signed release builds.
- Data leaving the Mac. Today that is only the App Store category lookup, which sends app bundle IDs and the storefront country to Apple's public iTunes Lookup API.

## Supported versions

Only the latest release gets fixes.

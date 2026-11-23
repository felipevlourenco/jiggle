# Contributing

Thanks for helping with Jiggle. Bug reports, fixes and small features are welcome. For anything big, open an issue first so we can agree on the approach.

## Set up

Needs Node 24, [pnpm](https://pnpm.io) and [uv](https://docs.astral.sh/uv/).

```bash
pnpm install
cd sidecar && uv sync --python 3.12 --group dev && cd ..
JIGGLE_MOCK_DEVICE=iphone-widgets pnpm dev   # no phone needed
```

The README lists every command. Before opening a pull request, run what CI runs:

```bash
pnpm typecheck && pnpm lint && pnpm exec prettier --check . && pnpm test
(cd sidecar && .venv/bin/python -m pytest)
pnpm test:e2e
```

## Guidelines

- Keep pull requests small and focused, with a test when behaviour changes.
- Formatting is Prettier and linting is ESLint. `pnpm format` fixes style.
- All device access goes through the `DeviceBridge` interface, and the layout logic in `src/shared/layout` stays free of Electron and device code. See [plan.md](plan.md) for the design.
- No real device data in the repository. Test fixtures in `tests/fixtures` use a made-up "Sam's iPhone" and made-up apps. Do not commit a `backup.plist` or an icon cache from your own phone.
- Never test writes on a phone you care about without a backup. The app makes one first, but the mock devices are the safer default.

## How pull requests are handled

Fork the repository, branch from `main` and open a pull request against it. Describe what changed and how you tested it. The maintainer reviews every pull request and is the only one who merges; changes are squash-merged, so one pull request becomes one commit on `main`. A pull request that is quiet for a few weeks may be closed, and you are welcome to reopen it.

Pull requests from first-time contributors need a maintainer's approval before the automatic checks run, so please run the checks above yourself first.

## Security

Report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

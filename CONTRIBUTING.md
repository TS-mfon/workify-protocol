# Contributing to Workify

Workify is currently testnet-only and has no source license. Opening a contribution does not
grant reuse rights beyond review of the submitted patch.

## Required checks

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
forge test --root contracts/base -vv
pnpm test:genlayer
pnpm build
```

Contract changes must preserve immutable version directories. Never modify a deployed contract
in place; add the next version and a migration/compatibility note. Public interface changes must
update both `README.md` and `/docs` in the same pull request.

Never commit credentials, private evidence, wallet keys, MongoDB URIs, delegation material, or
attestor signatures. Use public, pinned third-party fixtures and include manually reviewed golden
outcomes for changes to verifier policies.

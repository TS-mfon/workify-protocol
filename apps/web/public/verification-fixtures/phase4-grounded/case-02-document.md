# Workify v1.4.0 — 2026-08-30

## Added
- Five immutable GenLayer verification policies.
- Public evidence hash validation.

## Changed
- Phase release gates now require five finalized results.
- Verification retries are capped at three attempts.

## Fixed
- Receipt classification no longer counts ACCEPTED as FINALIZED.

## Known limitations
- Private repositories and login-gated evidence are unsupported.
- 1Shot execution requires an externally provisioned ERC-7710 permission context.

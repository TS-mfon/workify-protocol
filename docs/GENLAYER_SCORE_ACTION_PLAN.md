# Workify Score Action Plan

This is the implementation backlog derived from the GenLayer Project Review Kit. Priorities are ordered by likely reviewer impact.

| Priority | Requested change | Affected area | Acceptance evidence |
| --- | --- | --- | --- |
| P0 | Replace null deployment manifests with final address, tx hash, receipt, source hash, runner hash, and network metadata. | `deployments/genlayer-bradbury/*.json`, deployment scripts | A reviewer can independently fetch every v7 source and receipt. |
| P0 | Preserve the Phase 1 waiver distinction and either complete four additional finalized cases or publish a clear waiver explanation. | `fixtures/live-results/summary.json`, `fixtures/live-results/phase1-user-waiver.json` | No page or README says Phase 1 passed; evidence count is internally consistent. |
| P0 | Prove the end-to-end relay path with a scoped ERC-7710 permission context and a redacted successful 1Shot receipt. | `packages/evidence-engine/src/oneshot.ts`, automation, Vercel env | Server can estimate, submit, poll, and classify a settlement call without exposing secrets or allowing arbitrary targets. |
| P0 | Add live onchain read/index endpoints and label fixture data as fixture data. | `packages/evidence-engine/src/*`, `apps/web/app/app/*` | Connected users see actual job/status/attempt/appeal data or an explicit unavailable state. |
| P1 | Add appeal statement and supplemental evidence persistence with canonical hash binding. | appeal API, MongoDB schema, Base metadata | Appeal evidence is versioned, bounded, and included in the appeal verification request. |
| P1 | Add adversarial contract tests for replay, wrong policy, wrong recipient, expired appeal, retry exhaustion, and forged attestation. | `contracts/base/test`, protocol tests | All attacks revert and no escrow value moves incorrectly. |
| P1 | Add browser E2E smoke coverage for the complete happy path and one failure path. | web test tooling, testnet scripts | A documented run produces transaction hashes and final statuses for each step. |
| P1 | Add evidence packet generator with checksums and a reviewer map. | `scripts/`, `docs/`, `fixtures/` | One command creates a reviewable manifest mapping criterion → URL/hash → tx receipt. |
| P2 | Add contract/API observability: structured event index, retry-safe leases, stale-job recovery, and operator alerts. | automation, MongoDB, GitHub Actions | Duplicate jobs do not double-settle; stale leases are recoverable. |
| P2 | Add policy-version compatibility checks and migration notes. | GenLayer v7, protocol types, docs | A job cannot be verified under a policy other than the locked policy hash. |
| P2 | Add protocol-grade security and threat-model documentation. | `SECURITY.md`, docs | Key custody, relay trust, prompt injection, web drift, privacy, and failure recovery are explicit. |
| P3 | Complete Deep Space UI with live ledger, technical diagrams, accessible status semantics, and reduced-motion support. | `apps/web/app`, `apps/web/components`, `globals.css` | The UI communicates real lifecycle state without relying on color alone. |

## 1Shot permission-context procedure

The permission context is a signed ERC-7710 delegation payload for a specific server wallet and target contract. It is **not** a generic JSON blob and must not be guessed or copied from chat.

1. Create or select the 1Shot server wallet that will pay Base gas.
2. Create a delegation/permission for the Workify Base escrow address on Base Sepolia.
3. Restrict the permission to only the required selectors: verdict import, settlement, expired-refund, and unfunded-appeal expiry. Restrict value, chain, target, and time window as tightly as the product flow permits.
4. Export/copy the signed permission context from the 1Shot dashboard, MCP flow, or SDK response used by the account. Preserve the exact JSON including delegation signature and caveats.
5. Validate it with the relayer estimate method before sending a transaction. The configured endpoint is `https://relayer.1shotapi.dev/relayers` and the wrapper uses `relayer_getCapabilities`, `relayer_estimate7710Transaction`, `relayer_send7710Transaction`, and `relayer_getStatus`.
6. Store the exact JSON as the server-only Vercel variable `ONESHOT_PERMISSION_CONTEXT_JSON`. Never prefix it with `NEXT_PUBLIC_`, commit it, log it, or place it in browser code.
7. If the account flow returns a separate delegation secret, store it as `ONESHOT_DELEGATION_SECRET` and rotate it independently. If the flow does not return one, leave it unset; do not invent a value.
8. Record only non-sensitive metadata in the review packet: target address, chain ID, permitted selectors, expiry, context hash, relayer task ID, and final receipt status.

The current repository deliberately does not include a context because none was provided. This is safer than shipping an unscoped or fabricated permission.


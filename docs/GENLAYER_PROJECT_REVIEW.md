# Workify GenLayer Project Review

**Review date:** August 31, 2026  
**Evidence reviewed:** repository source, deployed-address manifests, live-result fixtures, production route structure, and the GenLayer Project Review Kit (version 2026-07-08).

## Executive assessment

Workify has a credible, high-fit GenLayer use case: a disputed work delivery has a financial consequence, and the result is imported into an escrow contract with bounded payout logic. The repository contains five policy-specific v7 Intelligent Contracts, a Base escrow, a treasury, evidence canonicalization, receipt classification, attestation signing, retry/appeal state handling, and a production Vercel surface.

The strongest score risks are **evidence credibility and operational completeness**, not the visual layer. The Phase 1 gate is explicitly waived and has only one recorded finalized result; it must never be presented as passed. Deployment manifests currently contain placeholder/null address fields, and the browser flow does not yet prove an end-to-end final GenLayer receipt → attestation → 1Shot relay → Base settlement journey. These are review blockers or score-limiters until backed by direct evidence.

## Positive evidence

### GenLayer fit

- The outcome controls release, refund, split payout, and appeal settlement rather than merely producing advice.
- v7 policies are specialized for GitHub software, web applications, research/data, content/documents, and design/creative work.
- The verifier workflow is anchored to specifications, criteria, evidence manifests, and policy hashes.
- The contract uses validator-side work evaluation rather than accepting a worker-provided label as truth.
- `UNDETERMINED` is modeled as a bounded retry state and not silently treated as consensus.

### Contract engineering

- Base creation is fund-first: USDC is transferred before the job is persisted.
- Appeals have an explicit five-minute window and a fixed 1 GEN cost.
- Verification attempts are bounded at three, with a deterministic terminal fallback.
- Attestations bind job, verifier, attempt, hashes, payout, nonce, and appeal state.
- Settlement paths keep recipient selection inside the escrow contract.

### Engineering quality

- GenLayer contract history is preserved under `contracts/genlayer/v1` through `contracts/genlayer/v7`.
- Direct, package, Solidity, lint, typecheck, and production-build checks are represented in the project scripts.
- Vercel-only deployment and MongoDB-as-indexer are consistent with the no-VPS constraint.
- The production app has separate landing, docs, dashboard, jobs, delivery, verification, appeal, activity, and treasury routes.

## Evidence limitations and score risks

1. **Phase 1 is not passed.** `fixtures/live-results/summary.json` records one finalized result, a required count of five, and an explicit waiver. This is honest evidence, but it limits any claim that all release gates passed.
2. **Deployment manifests are not reviewer-grade evidence.** The `deployments/genlayer-bradbury/v*.json` files currently expose null address/transaction fields and `DEPLOYED_AWAITING_FINALITY`. Replace them with immutable, directly inspectable address, deployment transaction, receipt, network, runner version, source hash, and finality records.
3. **Synthetic fixture evidence is useful for reproducibility but not equivalent to independent external work.** Add a reviewer-facing evidence index explaining which cases are synthetic, which are live, and how each result maps to a deployed transaction.
4. **The browser is currently mostly a protocol console shell.** Dashboard, jobs, activity, and treasury screens need live read paths, explicit disconnected states, and a visible distinction between indexed/demo data and onchain data.
5. **The 1Shot permission context is not configured in this environment.** The configured relayer endpoint is reachable from an unrestricted network path and reports Base Sepolia support (`84532`); the earlier in-sandbox DNS failure was an execution-environment limitation, not an observed 1Shot outage. No permission context was supplied, so do not fabricate one. Complete a server-only, scoped ERC-7710 setup and publish only non-secret configuration and successful relay receipts.
6. **The Base↔GenLayer bridge is a trust boundary.** Keep the attestor key and relay credentials server-side, document key rotation and nonce storage, and add an adversarial test showing that a forged verdict cannot redirect funds.
7. **Appeal content needs durable audit evidence.** Persist the appeal statement and supplemental evidence hash, enforce size/type/URL limits, and show the exact frozen delivery version evaluated by the appeal.
8. **No browser E2E proof is visible.** Add a testnet smoke run covering wallet connection, fund-first creation, delivery lock, verification funding, finalized result, appeal timeout, and settlement where practical.

## Human reviewer checklist

- Inspect the deployed v7 source at each advertised address, not a Studio shell page.
- Confirm the deployed source uses a pinned GenVM runner and meaningful equivalence/validator logic.
- Confirm the frontend calls the deployed verifier/treasury/escrow methods and does not only render fixtures.
- Open each result transaction and verify `FINALIZED`, `AGREE`, `FINISHED_WITH_RETURN`, and a non-empty return/result.
- Confirm the five-minute appeal and three-attempt rules onchain.
- Confirm the 1Shot permission context is scoped to the Workify escrow address and settlement selectors.
- Confirm the evidence manifest is immutable by hash and that untrusted evidence cannot change verifier instructions.

## Recommended orientation

**Appears strong but evidence-limited.** The product concept and protocol architecture are materially GenLayer-native. The next score increase comes from replacing placeholder deployment records, proving the missing Phase 1 results or clearly preserving the waiver, wiring live reads and relay receipts, and supplying a compact reproducible testnet evidence packet.

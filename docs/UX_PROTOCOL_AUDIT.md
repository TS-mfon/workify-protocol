# Workify UX and Protocol Audit

**Audit date:** September 11, 2026  
**Scope:** Base Sepolia escrow, StudioNet direct verification, Vercel APIs, MongoDB indexing, and the public dApp.  
**Method:** New-user walkthrough, live production API inspection, state-machine review, transaction-path review, and contract integration review.

## Executive finding

The deployed explorer currently reports zero settled cases because the active Base escrow has no `JobSettled` events. The live ledger contains funded jobs in `DELIVERY_LOCKED`, but no finalized verdict import or Base settlement. The empty explorer is therefore an accurate representation of chain state, not a missing fixture problem.

The highest-risk usability issue is the apparent single-step job creation flow hiding two independent Base transactions: USDC approval and funded job creation. If approval succeeds and creation is rejected, the user can reasonably believe the job exists and may retry without knowing whether a transaction is still pending. Verification has a related terminology problem: GenLayer `FINALIZED` is network finality, not a successful adjudication; `NO_MAJORITY` and an empty return must never be presented as a usable verdict.

## Lifecycle map

```text
Connect wallet
  -> switch to Base Sepolia
  -> preflight USDC balance, allowance, deadline, worker
  -> approve exact reward (only if allowance is insufficient)
  -> createFundedJob
  -> worker submits public evidence
  -> worker locks evidence
  -> switch to selected GenLayer network
  -> user submits one direct verifier transaction
  -> poll transaction status and contract verdict independently
  -> PASS/PARTIAL/FAIL/UNVERIFIABLE result
  -> five-minute appeal window
  -> permissionless or automated Base settlement
  -> explorer publication after on-chain settlement
```

## Findings and optimal fixes

### Critical

1. **Ambiguous finality semantics.** `FINALIZED` can be rendered as success even when consensus is `NO_MAJORITY`, execution failed, or the verifier returned an empty value. **Fix:** model network status, consensus, execution, verdict availability, and Base settlement as separate fields. Only a non-empty verdict with acceptable consensus can enter the verdict card or settlement path.
2. **Duplicate transaction risk after uncertain wallet/RPC state.** A timeout or dropped receipt can leave the user without knowing whether a transaction was mined. **Fix:** persist transaction hashes by job/action, disable the action while pending, query receipt before allowing retry, and never resend automatically.
3. **Settlement trust boundary.** Settlement must derive worker, client, treasury, and amounts from the locked on-chain job, not client-provided values. **Fix:** retain EIP-712 domain binding, replay nonces, fixed recipients, idempotent state checks, and permissionless expiry/settlement paths.

### High

4. **Approval and creation are visually conflated.** Approval may succeed while creation fails. **Fix:** show two explicit stages, hashes, receipt states, and a “do not approve again” message; re-read allowance after approval.
5. **Network switching is easy to miss.** Base funding and GenLayer verification are different chains. **Fix:** display the target chain in the action label, switch immediately before every signature, verify the chain again afterward, and explain that the transaction is not sent when switching fails.
6. **Evidence is external and mutable.** A public URL can disappear, redirect, or return an HTML error page. **Fix:** lock canonical URL, content hash, MIME type, and revision metadata; reject login-gated or unstable sources before submission.
7. **Legacy deployments can be confused with active V11 deployments.** **Fix:** bind each job to verifier address, policy hash, network, and version; show these values at signing and in the explorer.
8. **Explorer metadata dependency hides on-chain truth.** A valid settled job can disappear when MongoDB specification/evidence metadata is unavailable. **Fix:** use an on-chain fallback card with hashes, addresses, lifecycle, and transaction links; label missing off-chain context instead of dropping the case.

### Medium

9. **Roles are unclear.** Client, worker, operator, attestor, verifier, and treasury are not explained at the moment they act. **Fix:** add role labels beside every action and a short “who signs this?” explanation.
10. **“Review & fund” is misleading.** Funding creates the job; review happens after delivery. **Fix:** rename the step “Confirm and fund job”.
11. **Fixed worker address is easy to overlook.** **Fix:** repeat it in the review summary and show a warning that it cannot be changed after funding.
12. **Deadline rules are easy to discover too late.** **Fix:** validate on blur and show the allowed range before the wallet prompt.
13. **Empty states lack next action context.** **Fix:** distinguish no jobs, no settled cases, pending review, and temporarily unavailable RPC; provide one safe next action for each.
14. **Gas and token balances are operational data, not raw values.** **Fix:** display ETH with a sensible precision, USDC with six-decimal formatting, and clear refill guidance.

## New-user confusion checklist

- A first-time user may not know that “funded” means USDC is already custodial in the escrow.
- The worker submits evidence, but the client starts the GenLayer review; the role split should be explicit.
- GenLayer review can take time after the wallet transaction is confirmed; leaving the page must be safe.
- `ACCEPTED`, `FINALIZED`, `AGREE`, and `PASS` describe different layers and should not share one green success style.
- An appeal challenges the adjudication and is not the same as retrying an undetermined review.
- Base settlement can remain pending even after GenLayer finality because the appeal window is separate.
- A job absent from the explorer may simply be unsettled; explorer publication is intentionally settlement-gated.
- A public evidence link is readable by validators and visitors; users need an explicit confidentiality warning.

## Protocol loopholes to monitor

- A stale index can make a job appear absent even though the chain is authoritative.
- A worker can submit a URL that later changes unless the evidence hash is checked against the locked manifest.
- An empty verifier result must not be imported as `PASS`, `FAIL`, or a zero-score verdict.
- Retry attempts must remain bounded at three and must not mutate the locked evidence unexpectedly.
- Appeal and retry state transitions must reject calls made after their deadlines.
- Automation endpoints must be authenticated, idempotent, and unable to choose payout recipients.
- RPC errors must never be interpreted as transaction rejection or permission to resend.
- Database reset procedures must back up records before deletion and must never be used as a substitute for chain reconciliation.

## Corrected happy path

1. Connect and identify the signing wallet.
2. Select a work type and write atomic acceptance criteria.
3. Enter a worker address and reward; the current demo cap is `1 USDC`.
4. Click **Confirm and fund job**.
5. The dApp checks chain, balance, allowance, deadline, and an on-chain simulation.
6. The dApp asks for approval only when needed, then shows the approval receipt.
7. The dApp re-reads allowance and requests `createFundedJob` exactly once.
8. On success, the user is routed to the job dashboard with the creation hash.
9. The worker locks evidence, and the user submits one direct GenLayer transaction on the selected network.
10. The dashboard polls without resubmitting, displays consensus/execution/verdict separately, and blocks duplicate actions.
11. A usable verdict opens the appeal timer; after the window, settlement releases the locked funds according to the on-chain payout.
12. The explorer shows the settled lifecycle and public verdict reasoning; pending and failed jobs remain visible in the private ledger, not in resolved cases.

## Acceptance criteria for the fixes

- No job creation action can submit two concurrent approval or creation transactions.
- Existing sufficient USDC allowance skips the approval signature.
- The UI rejects rewards above `1 USDC` for demo jobs before a wallet prompt.
- Every verification terminal state clearly distinguishes agreement, no-majority, execution error, and missing verdict.
- RPC errors expose a human-safe message and never trigger an automatic duplicate transaction.
- The explorer remains settlement-gated but does not silently discard valid on-chain cases solely because optional MongoDB context is missing.

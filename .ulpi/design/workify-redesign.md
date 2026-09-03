# Workify Product Redesign

## Primary Journeys
1. Visitor understands the settlement path, inspects real cases, then opens the app.
2. Client connects a wallet, creates a specification, approves USDC, and funds one atomic job.
3. Worker connects, submits public artifacts, reviews the manifest, and locks delivery.
4. Fee payer funds GEN, then server orchestration requests verification after fee finality.
5. Client or worker opens an appeal within five minutes and funds exactly 1 GEN.
6. Anyone settles after the appeal deadline; funds can only reach the locked recipients.
7. Explorer visitor opens a resolved case and reads public rationale, criterion scores, evidence, consensus, and settlement.

## State Model
- Wallet: disconnected, connecting, connected, rejected, unsupported chain.
- Records: loading, empty, available, partial index, RPC error.
- Transaction: idle, awaiting signature, submitted, confirming, finalized, reverted.
- Verification: fee missing, fee pending finality, request queued, validating, finalized, undetermined retry, terminal fallback.
- Appeal: unavailable, countdown active, intent opened, fee pending, verifying, finalized, expired.

## Components
- GlobalNav: five or fewer destinations, visible wallet, mobile horizontal overflow rather than hidden actions.
- SettlementLine: six semantic stages, current state highlighted, reduced-motion static fallback.
- LedgerRow: title, policy, status, amount, role, deadline, single row action.
- WalletButton: 44px minimum target, explicit connecting and rejection states, address truncation.
- TransactionPanel: one dominant action, exact fee/amount, network, expected next state, live status.
- ExplorerCase: public rationale first, criterion records second, settlement and identifiers in a narrow rail.

## Accessibility
- All controls have visible focus and 44px minimum targets.
- Status never relies on color alone.
- Transaction changes use text and `aria-live` where client components announce progress.
- Motion is disabled under `prefers-reduced-motion`.
- Tables collapse into labeled records below 720px.

## Pre-Flight
- Identity lock: passed; one token set, radius scale, icon family, and type family.
- Anti-slop: passed; no purple, gradient text, fake logos, fake stats, nested cards, or generic centered hero.
- State coverage: passed; wallet, record, transaction, verification, and appeal states specified.
- Accessibility: passed; AA colors, focus, reduced motion, semantic routes, and touch targets.
- Layout craft: passed; editorial hero, settlement line, ruled ledger, and two-column detail views.
- Cognitive load: passed; one primary action and five primary navigation destinations.
- Scores: distinctiveness 3, hierarchy 4, consistency 4, accessibility 4, state coverage 4, copy 4, restraint 4, motion 4. Total 31/32.

## Build Handoff
Target: Next.js App Router implementation in the existing Workify codebase. Implement exactly this specification with the locked tokens. Preserve current wallet, escrow, evidence, verification, and explorer behavior. Do not migrate frameworks or introduce mock protocol data.

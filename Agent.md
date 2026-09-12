# Workify Protocol — Agent Handoff Instructions

This file is the operating manual for the next coding agent continuing Workify. Read it before
changing code, contracts, configuration, deployment state, or production infrastructure.

## 1. Mission

Workify is an evidence-backed work-settlement protocol:

```text
Client creates and funds a job on Base Sepolia
  → assigned worker submits public evidence
  → worker locks the evidence manifest
  → direct GenLayer StudioNet V12 review is submitted
  → finalized verdict is attested/imported to Base
  → five-minute appeal window
  → PASS/PARTIAL pays worker, FAIL/UNVERIFIABLE refunds client
```

The core product claim is not “AI decides whether work is good.” The claim is:

> A predefined, evidence-backed specification is independently adjudicated and deterministically
> settled.

Keep every UI label, API response, contract method, README paragraph, and test aligned with that
claim.

## 2. Repository and release state

- Repository: `/home/sudodave/workify-protocol`
- Git remote: `https://github.com/TS-mfon/workify-protocol.git`
- Branch: `main`
- Latest handoff commit at the time this file was written: `c8fa421`
- Previous implementation commit: `394061f`
- Vercel project: `gen-daves-projects/workify-protocol`
- Vercel project metadata: `/home/sudodave/workify-protocol/.vercel/project.json`
- Production URL: `https://workify-protocol.vercel.app`
- Current date of this handoff: September 12, 2026

The repository intentionally contains historical V1–V3 Base and V1–V11 GenLayer sources. Do not
delete them merely because they are inactive. Historical code is needed for auditability and
reproducibility. The application must select only the active V4/V12 deployments.

## 3. Active onchain deployments

### Base Sepolia, chain ID 84532

| Component | Address | Notes |
| --- | --- | --- |
| WorkEscrowV4 | `0x4b7Fc39D747461115B351c64368987354f5f0457` | Active USDC escrow |
| BaseTreasuryV2 | `0xf5772D2A3B9493d94107a0328AF48D17144Ae843` | Active Base fee treasury |
| Canonical Base Sepolia USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | 6-decimal USDC |
| Owner / attestor | `0xEd9EDd8586b20524CafA4F568413C504C9B03172` | Deployment manifest authority |
| Automation operator | `0x4c26bC7bDA4E75A6Ac7F8e6EB9b7e8e9784d5835` | `requestVerification` operator |

- WorkEscrowV4 deployment block: `46704733`
- WorkEscrowV4 deployment transaction:
  `0xb1f59487ea793489fbbfab2a9a751531f3afb8777c85a081b5e7f1e161c7c6cf`
- BaseTreasuryV2 deployment transaction:
  `0x079738085bcf8f3c451da885a8899e395944bbf79646c9c5bab792324b321f6f`
- EIP-712 domain: name `Workify`, version `3`

Authoritative manifest: `deployments/base-sepolia/v4.json`.

### GenLayer StudioNet

- RPC/API endpoint: `https://studio.genlayer.com/api`
- Explorer: `https://explorer-studio.genlayer.com`
- Active verifier version: V12
- Verification fee: `0 GEN`
- Appeal fee: `0 GEN`
- Direct user wallet submission: enabled

| Policy | Address | Policy version |
| --- | --- | --- |
| GitHub Software | `0x0370eAD9bADd7Ea57129716e85E30c8aF61d0d15` | `github-software-v12.0` |
| Web Application | `0x62B486f95563D18d03a3f46Cb312297d3e1dAA69` | `web-application-v12.0` |
| Research/Data | `0x34E5C2Fa49aa22213cB044491e7DB9A7e9896D21` | `research-data-v12.0` |
| Content/Document | `0x12E3944187702cD4127B30451A0aA31d5408346E` | `content-document-v12.0` |
| Design/Creative | `0xb276C4F8ea32A170247Ea0B3C4C9686E41032f26` | `design-creative-v12.0` |

Authoritative manifests:

- `deployments/genlayer-studionet/v12-direct.json`
- `deployments/genlayer-studionet/v12.json`

## 4. Secret locations and safe handling

**Never put plaintext secret values in `Agent.md`, `Memory.md`, Git, issue comments, terminal
output, or user-facing responses.** The next agent should use variable names and file paths only.

### Local-only secret sources

- `/home/sudodave/.env.build`
  - Used for deployment/build-time values. Treat every value as sensitive.
  - Do not print it with `cat`, `env`, `set`, or `echo`.
  - Read only specific variable names when necessary, and redact output.
- `/home/sudodave/workify-protocol/.env.local`
  - Local application secrets and MongoDB/runtime configuration.
  - Never commit or paste its contents.
- `/home/sudodave/workify-protocol/.workify-secrets/base-automation-wallet.json`
  - Contains the Base automation/deployment wallet material.
  - Never commit, copy into Markdown, or print the private key.
  - Use it only through a controlled environment assignment or the existing deployment scripts.

### Secret variable names

The following names are expected to be server-side only:

- `BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY`
- `BASE_AUTOMATION_PRIVATE_KEY`
- `GENLAYER_OPERATOR_PRIVATE_KEY`
- `VERDICT_ATTESTOR_PRIVATE_KEY`
- `AUTOMATION_HMAC_SECRET`
- `MONGODB_URI`
- `MONGODB_DATABASE`
- `GITHUB_READ_TOKEN`
- `BASE_SEPOLIA_RPC_URL`
- `BASE_AUTOMATION_LOW_BALANCE_WEI`

`NEXT_PUBLIC_*` must never contain private keys, MongoDB credentials, HMAC secrets, permission
contexts, API secrets, or wallet secrets. Public contract addresses and chain IDs are safe to
expose, but still validate them against the deployment manifests.

### Known credential hygiene issue

An earlier development conversation exposed a MongoDB connection string. Treat that credential as
compromised and rotate it before any production data migration. Do not copy the old password into
new files or deployment variables.

## 5. Active environment configuration

`.env.example` is the template. Important active values are:

```text
NEXT_PUBLIC_WORK_ESCROW_ADDRESS=WorkEscrowV4 address
NEXT_PUBLIC_BASE_TREASURY_ADDRESS=BaseTreasuryV2 address
WORK_ESCROW_DEPLOYMENT_BLOCK=46704733
WORKIFY_EIP712_VERSION=3
WORKIFY_USE_ENV_NETWORK=true
WORKIFY_V12_POLICIES=github,web,research,document,design
STUDIO_NET_V12_*_VERIFIER_ADDRESS=V12 verifier addresses
STUDIO_NET_GEN_TREASURY_ADDRESS=zero address for zero-fee direct mode
```

Vercel Production was configured with the active V4/V12 values on September 12, 2026. Existing
old V11/V8 variables may still exist for historical compatibility; do not let them override active
V12 selection. If an old variable is removed, verify the active V12 server variables first.

## 6. Contract lifecycle rules

### Job states

The Base contract status enum is:

```text
NONE
AWAITING_DELIVERY
DELIVERY_LOCKED
VERIFYING
RETRY_WINDOW
APPEAL_WINDOW
APPEAL_FUNDING
APPEAL_VERIFYING
SETTLEABLE
SETTLED
REFUNDED
```

### Decision rules

- `PASS`: worker receives the adjudicated worker share less the 1% protocol fee.
- `PARTIAL`: worker receives `payoutBps` of the reward less the 1% protocol fee; client receives
  the remainder.
- `FAIL`: client receives the full reward.
- `UNVERIFIABLE`: client receives the full reward.
- Terminal `UNDETERMINED` fallback: 50/50 gross split after the maximum retry rule.

### Hard limits

- Demo job reward maximum: `1 USDC`.
- Maximum initial review attempts: `3`.
- Maximum appeal attempts: `3`.
- Appeal window: `5 minutes`.
- Retry window: `30 minutes`.
- Delivery deadline: contract minimum `15 minutes`, maximum `30 days`.

### Critical ordering

The review integration must ensure Base enters `VERIFYING` before a finalized GenLayer result is
imported. The current `packages/evidence-engine/src/automation.ts` contains the fix: for a direct
user GenLayer transaction, it submits the bounded Base `requestVerification` call before polling
and importing the GenLayer result. Do not move classification ahead of this transition.

If this ordering changes, the GenLayer transaction may finalize while Base remains
`DELIVERY_LOCKED`, causing attestation import to revert with `InvalidState`.

## 7. Important code areas

- `contracts/base/v4/WorkEscrowV4.sol`
  - Active escrow state machine, EIP-712 verification, payout, refund, retry, and appeal logic.
- `contracts/base/script/DeployV4.s.sol`
  - Base V4 deployment script.
- `contracts/base/test/WorkEscrowV4.t.sol`
  - V4 regression tests.
- `contracts/genlayer/v12/WorkVerifierV12.py`
  - Active GenLayer verifier and normalized result schema.
- `apps/web/lib/network.ts`
  - Public active Base/V12 deployment configuration.
- `packages/evidence-engine/src/genlayer-network.ts`
  - Server-side network/version selection and V12 verifier configuration.
- `packages/evidence-engine/src/automation.ts`
  - Receipt polling, Base state transitions, attestation creation, and settlement relay.
- `packages/evidence-engine/src/verification.ts`
  - Direct transaction validation and MongoDB intent registration.
- `packages/evidence-engine/src/attestation.ts`
  - EIP-712 V4-compatible attestation signing; requires `WORKIFY_EIP712_VERSION=3`.
- `apps/web/components/ContractActions.tsx`
  - Worker delivery, direct GenLayer review, appeal, and settlement UX.
- `apps/web/app/api/verification/queue/route.ts`
  - Prepares and registers review payloads.
- `apps/web/app/api/verification/progress/route.ts`
  - Returns no-store asynchronous review status and triggers best-effort automation.
- `apps/web/lib/explorer.ts`
  - Reads settled Base jobs, joins finalized GenLayer verdicts, and serves explorer records.
- `apps/web/app/api/explorer/cases/route.ts`
  - Public explorer API. Empty cases are valid; do not fabricate records.
- `README.md` and `apps/web/app/docs/page.tsx`
  - Protocol documentation; keep version labels synchronized.

## 8. User flow requirements

The UI must present one valid next action based on onchain state:

1. **Create job:** connect client wallet on Base Sepolia; approve USDC only if needed; call
   `createFundedJob` atomically; redirect to the job dashboard after confirmation.
2. **Submit delivery:** assigned worker connects on Base Sepolia; prepares a canonical evidence
   manifest; submits the evidence hash; locks delivery; redirect/refresh the dashboard.
3. **Start review:** client or authorized review wallet starts the direct StudioNet V12 transaction;
   never show an obsolete `0.1 GEN` fee; never allow duplicate clicks.
4. **Poll review:** distinguish `PENDING`, `ACCEPTED`, `FINALIZED`, `UNDETERMINED`, `CANCELED`,
   `FAILED`, and `CONFIRMED`. `ACCEPTED` is not finality.
5. **Show verdict:** display score, confidence, payout basis points, criterion decisions,
   rationale, evidence identifiers, consensus/execution metadata, and transaction links.
6. **Appeal:** only during the five-minute window; freeze settlement; preserve original evidence;
   cap attempts at three.
7. **Settle:** after the appeal window, automatically or permissionlessly settle. Refresh and
   display actual Base receipt data.
8. **Explorer:** only show records with a complete Base settlement and finalized GenLayer result.
   Clicking a case must open `/explorer/[jobId]` and display the actual verdict and rationale.

## 9. Error-handling requirements

Never show raw viem/RPC/HTML parse errors as the primary UI message. Map errors into actionable
states:

- Wallet rejection: “Signature rejected. No transaction was sent.”
- Wrong chain: switch automatically or clearly request the required network.
- Duplicate submission: “This review is already pending; refresh status instead of paying again.”
- Base rate limit: use configured fallback RPCs and show a retryable message.
- GenLayer RPC failure: preserve the transaction hash and poll later; never resend automatically.
- Base receipt reverted: stop the flow; do not send a follow-up transaction.
- Missing verdict after finality: show “finalized, verdict propagation pending,” not a fake verdict.
- Invalid/missing evidence: identify the evidence step that must be repaired.

Use session storage pending keys and in-memory busy guards to prevent wallet prompt races.

## 10. Commands and validation

Run from `/home/sudodave/workify-protocol`:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contracts
pnpm test:genlayer
pnpm build
```

Focused commands:

```bash
pnpm --filter @workify/evidence-engine test
forge test --root contracts/base
genvm-lint check contracts/genlayer/v12/WorkVerifierV12.py
```

Production smoke checks:

```bash
curl -sS 'https://workify-protocol.vercel.app/api/genlayer/health?network=studionet'
curl -sS 'https://workify-protocol.vercel.app/api/ledger'
curl -sS 'https://workify-protocol.vercel.app/api/explorer/cases'
```

Expected baseline when no real jobs are settled:

```json
{"jobs":[],"activity":[],"degraded":false}
{"cases":[],"degraded":false}
```

Do not interpret empty explorer data as an application error. It means no complete V4 settlement
has been recorded yet.

## 11. Deployment rules

Before deployment:

1. Confirm active addresses against the manifests.
2. Confirm `WORKIFY_EIP712_VERSION=3`.
3. Confirm no secret is in a `NEXT_PUBLIC_*` variable.
4. Run all tests and the production build.
5. Review `git status` and exclude fixtures, `.env*`, wallet files, Review Kit artifacts, and
   `apps/web/.gitignore` unless explicitly requested.

Base deployment uses `contracts/base/script/DeployV4.s.sol` and a private key from `.env.build` or
the local wallet file. Do not redeploy casually: changing the escrow address requires updating
the frontend, server environment, deployment manifest, explorer start block, attestation domain,
and Vercel production deployment.

GenLayer V12 deployment:

```bash
pnpm deploy:genlayer:v12
```

Vercel production deployment:

```bash
npx vercel --prod --yes
```

The expected result is an aliased production deployment at
`https://workify-protocol.vercel.app`.

After every requested fix, push allowed source changes to GitHub and redeploy Vercel unless the
user explicitly says not to.

## 12. Forbidden actions

- Do not read or print full secret files unnecessarily.
- Do not commit private keys, wallet JSON, `.env.local`, `.env.build`, MongoDB URIs, tokens, or
  HMAC secrets.
- Do not push GenLayer Project Review Kit artifacts.
- Do not add fake explorer cases or fixture results to production.
- Do not claim a live consensus gate passed without transaction evidence.
- Do not create real jobs unless valid funded signers and test funds are confirmed.
- Do not change a deployed contract address in code without a verified deployment manifest.
- Do not use 1Shot credentials for the active direct-wallet flow.
- Do not report a GenLayer `ACCEPTED` transaction as a finalized verdict.

## 13. Known outstanding work

1. Run real user-created jobs with funded wallets if live explorer records are required. The
   current explorer is intentionally empty because no complete V4 settlement exists yet.
2. Verify a full content/document case end to end: Base fund → worker delivery → StudioNet V12
   finality → attestation import → appeal window → Base settlement → explorer record.
3. Test a real `UNDETERMINED` retry and appeal path on StudioNet.
4. Rotate the previously exposed MongoDB credential before production data work.
5. Review and remove stale V8/V11 environment variables only after confirming V12 production
   variables are healthy.
6. Keep the active documentation and UI labels synchronized whenever a version changes.


# Workify Protocol — Detailed Session Memory

This is the chronological and technical memory of the current Workify build. It is written so a
new agent can continue without reconstructing the prior conversation.

## Session snapshot

- Date: September 12, 2026
- Working directory: `/home/sudodave/workify-protocol`
- Branch: `main`
- Latest pushed commit: `c8fa421 docs: align protocol manual with active releases`
- Previous pushed commit: `394061f feat: activate Workify V4 and GenLayer V12`
- GitHub: `https://github.com/TS-mfon/workify-protocol`
- Production: `https://workify-protocol.vercel.app`
- Latest successful Vercel deployment before this handoff:
  `dpl_9UDeqS491daebNtZuJvQxaBDQ7Kr`
- Latest successful production alias:
  `https://workify-protocol-apv20nkdl-gen-daves-projects.vercel.app`
- Production alias remains:
  `https://workify-protocol.vercel.app`

## User’s product decisions

The user repeatedly clarified these product requirements:

1. Workify is escrow plus evidence verification plus adjudication, not a generic AI checker.
2. Work contracts must be funded before the job exists.
3. Base Sepolia is the payment and escrow layer.
4. GenLayer evaluates the work against locked, evidence-backed criteria.
5. The active direct flow should not require the user to pay `0.1 GEN`.
6. StudioNet is the active GenLayer network because Bradbury had intermittent RPC/finality issues.
7. The user wallet signs the direct GenLayer review transaction.
8. Base settlement must use the escrow’s fixed worker/client/treasury recipients.
9. There must be duplicate-submission protection, retries, good error handling, and network
   switching.
10. Rewards for demo jobs are capped at exactly `1 USDC` maximum.
11. The explorer must show real settled cases only, and clicking a case must reveal the GenLayer
    verdict, rationale, scores, and settlement.
12. No fake or simulated explorer data should be presented as real.
13. Versioned contracts must be kept in the repository and documented.
14. GenLayer Review Kit artifacts must not be pushed to GitHub.
15. After fixes, changes should be pushed to GitHub and redeployed to Vercel.

## Why V4/V12 was created

### WorkEscrowV4

V4 was copied forward from the hardened V3 escrow and changed to:

- Use EIP-712 domain version `3`.
- Add `AppealResolved` provenance event.
- Keep SafeERC20 accounting and fee-on-transfer rejection.
- Preserve fixed recipients and bounded payout basis points.
- Preserve maximum three attempts and appeal states.
- Preserve replay-protected verdict/outcome attestation imports.
- Preserve permissionless settlement/expiry behavior.

The deployed V4 address is in `deployments/base-sepolia/v4.json` and must match
`apps/web/lib/network.ts` and Vercel configuration.

### WorkVerifierV12

V12 was copied from the previous verifier line and normalized output with:

- `verdict_available`
- `execution`
- `consensus_requirement`

The goal is to distinguish an accepted transaction from a finalized, executable, consensus-backed
verdict. The five active policies are deployed to immutable StudioNet addresses listed in
`deployments/genlayer-studionet/v12-direct.json`.

## Exact active addresses

### Base Sepolia

```text
chainId: 84532
USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
WorkEscrowV4: 0x4b7Fc39D747461115B351c64368987354f5f0457
BaseTreasuryV2: 0xf5772D2A3B9493d94107a0328AF48D17144Ae843
Owner/attestor: 0xEd9EDd8586b20524CafA4F568413C504C9B03172
Automation operator: 0x4c26bC7bDA4E75A6Ac7F8e6EB9b7e8e9784d5835
Deployment block: 46704733
EIP-712 version: 3
```

### StudioNet V12

```text
endpoint: https://studio.genlayer.com/api
explorer: https://explorer-studio.genlayer.com
GitHub: 0x0370eAD9bADd7Ea57129716e85E30c8aF61d0d15
Web: 0x62B486f95563D18d03a3f46Cb312297d3e1dAA69
Research: 0x34E5C2Fa49aa22213cB044491e7DB9A7e9896D21
Document: 0x12E3944187702cD4127B30451A0aA31d5408346E
Design: 0xb276C4F8ea32A170247Ea0B3C4C9686E41032f26
verification fee: 0 GEN
appeal fee: 0 GEN
```

## Deployment keys used

The private key values are intentionally not written here.

### Base deployment signer

- Source locations:
  - `/home/sudodave/.env.build`
  - `/home/sudodave/workify-protocol/.workify-secrets/base-automation-wallet.json`
- Relevant variable names:
  - `BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY`
  - `BASE_AUTOMATION_PRIVATE_KEY`
- Deployment/owner address recorded in the manifest:
  `0xEd9EDd8586b20524CafA4F568413C504C9B03172`
- Automation operator recorded in the manifest:
  `0x4c26bC7bDA4E75A6Ac7F8e6EB9b7e8e9784d5835`

Use the existing Foundry deployment script rather than manually copying keys into command
history:

```bash
cd /home/sudodave/workify-protocol/contracts/base
forge script script/DeployV4.s.sol:DeployV4 \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast
```

Before any new deployment, verify the private key’s derived address and gas balance without
printing the key. Do not redeploy if the active address already has the required bytecode unless a
new version is intentionally being cut.

### GenLayer deployment signer

- Source location: `/home/sudodave/.env.build`
- Variable name: `GENLAYER_OPERATOR_PRIVATE_KEY`
- Public operator address in the StudioNet manifest:
  `0xEd9EDd8586b20524CafA4F568413C504C9B03172`
- Deployment command:

```bash
cd /home/sudodave/workify-protocol
pnpm deploy:genlayer:v12
```

Never put the private key in a browser variable or `NEXT_PUBLIC_*` variable.

### Attestor key

- Source location: `/home/sudodave/.env.build` or Vercel Production secret store.
- Variable name: `VERDICT_ATTESTOR_PRIVATE_KEY`
- Public attestor address:
  `0xEd9EDd8586b20524CafA4F568413C504C9B03172`
- Used by `packages/evidence-engine/src/attestation.ts` to sign Base EIP-712 verdict/outcome
  attestations.

### Vercel Base automation key

- Vercel variable: `BASE_AUTOMATION_PRIVATE_KEY`
- Local reference: `/home/sudodave/workify-protocol/.workify-secrets/base-automation-wallet.json`
- Used only by server-side Base relay code.
- It must hold Base Sepolia ETH for gas.
- Its public health is exposed through `/api/health/base-signer` without revealing the key.

## Environment variables that matter

### Public/configuration

```text
NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL
NEXT_PUBLIC_BASE_SEPOLIA_CHAIN_ID
NEXT_PUBLIC_BASE_USDC_ADDRESS
NEXT_PUBLIC_WORK_ESCROW_ADDRESS
NEXT_PUBLIC_BASE_TREASURY_ADDRESS
WORK_ESCROW_DEPLOYMENT_BLOCK
WORKIFY_EIP712_VERSION
WORKIFY_USE_ENV_NETWORK
WORKIFY_V12_POLICIES
```

### Server-only

```text
BASE_SEPOLIA_RPC_URL
BASE_SEPOLIA_RPC_FALLBACK_URLS
BASE_AUTOMATION_PRIVATE_KEY
BASE_AUTOMATION_LOW_BALANCE_WEI
GENLAYER_OPERATOR_PRIVATE_KEY
VERDICT_ATTESTOR_PRIVATE_KEY
AUTOMATION_HMAC_SECRET
MONGODB_URI
MONGODB_DATABASE
GITHUB_READ_TOKEN
```

### StudioNet V12 server variables

```text
STUDIO_NET_GENLAYER_RPC_URL=https://studio.genlayer.com/api
STUDIO_NET_GEN_TREASURY_ADDRESS=0x0000000000000000000000000000000000000000
STUDIO_NET_V12_GITHUB_VERIFIER_ADDRESS
STUDIO_NET_V12_WEB_VERIFIER_ADDRESS
STUDIO_NET_V12_RESEARCH_VERIFIER_ADDRESS
STUDIO_NET_V12_DOCUMENT_VERIFIER_ADDRESS
STUDIO_NET_V12_DESIGN_VERIFIER_ADDRESS
```

Do not confuse old `STUDIO_NET_V11_*`, `NEXT_PUBLIC_STUDIO_NET_*`, or V8 variables with the active
V12 server variables. The V12 hardcoded deployment fallback exists in source for StudioNet, but
production should keep explicit Vercel configuration.

## Last validation results

The following checks passed after the V4/V12 migration:

- `forge test --root contracts/base`: 40 tests passed, including 4 V4 tests.
- `pnpm --filter @workify/evidence-engine test`: 15 tests passed.
- `pnpm typecheck`: passed for protocol types, evidence engine, and web app.
- `pnpm lint`: passed for all workspaces.
- `pnpm build`: passed for Next.js production build.
- `genvm-lint check contracts/genlayer/v12/WorkVerifierV12.py`: passed.
- Vercel production build: passed.
- `GET /api/genlayer/health?network=studionet`: HTTP 200, `ready: true`, V12, zero fee.
- `GET /api/ledger`: HTTP 200, V4 escrow address, `degraded: false`.
- `GET /api/explorer/cases`: HTTP 200, `{ "cases": [], "degraded": false }`.

The empty explorer result is expected because no complete V4 Base settlement has been created in
the active deployment. Never populate the explorer with fake cases to make it look active.

## Important bug fixed in the last session

### Direct GenLayer/Base ordering bug

The frontend submits a direct GenLayer transaction and registers it in MongoDB. Previously,
automation polled GenLayer finality before calling Base `requestVerification`. That allowed
GenLayer to finalize while WorkEscrow remained `DELIVERY_LOCKED`; subsequent verdict import could
revert with `InvalidState`.

The fix is in `packages/evidence-engine/src/automation.ts`:

1. Detect a direct-user intent with no `baseRequestTransactionHash`.
2. Submit the bounded Base `requestVerification(jobId, false)` relay action.
3. Persist the Base request transaction hash and lifecycle.
4. Only then validate and classify the GenLayer transaction.
5. Continue with attestation import or undetermined retry handling.

Preserve this ordering. If a later refactor changes the queue or poller, add an integration test
that proves Base is `VERIFYING` before `importFinalVerdict` is sent.

## Current untracked files intentionally excluded from GitHub

At handoff time these were intentionally left untracked:

- `apps/web/.gitignore`
- `fixtures/live-results/showcase-1.json`
- `fixtures/live-results/showcase-2.json`
- `fixtures/live-results/showcase-3.json`
- `fixtures/live-results/showcase-run.json`
- `fixtures/live-results/showcase-summary.json`

Do not stage them automatically. The showcase fixtures are not production evidence, and Review Kit
artifacts must never be pushed.

## How to continue safely

1. `cd /home/sudodave/workify-protocol`.
2. Read `Agent.md`, this file, `README.md`, and applicable `AGENTS.md` files.
3. Run `git status --short` and preserve intentionally untracked files.
4. Run the focused test suite before changing behavior.
5. For contract changes, update the versioned contract directory and add a new deployment manifest;
   do not overwrite V4 source or silently point the app at an unverified address.
6. For frontend changes, test wallet chain switching, duplicate clicks, rejected signatures,
   receipt reverts, refresh/resume behavior, and mobile layout.
7. For GenLayer changes, run `genvm-lint`, direct tests, and inspect finalized transaction output.
8. For production changes, update Vercel variables through the CLI without `--token` and without
   printing secret values.
9. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:contracts`, and `pnpm build`.
10. Commit only intended files, push `main`, deploy with `npx vercel --prod --yes`, and smoke-test
    the live API endpoints.

## Recommended next milestone

Perform one genuine end-to-end content/document job using a valid funded client and worker:

```text
1 USDC createFundedJob on Base Sepolia
→ worker submits a public document URL
→ worker locks evidence
→ client signs StudioNet V12 document review
→ automation imports finalized verdict
→ wait five-minute appeal window
→ settle Base escrow
→ verify /api/explorer/cases exposes the case
→ click explorer case and inspect rationale, criteria, and payout
```

Record the actual Base and GenLayer transaction hashes in an operational report, not as fabricated
fixtures. If the case fails, preserve the hashes and diagnose the exact state transition before
retrying.


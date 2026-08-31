# Workify Operator Onboarding

## Prerequisites
- Node.js 24 and pnpm 11
- Foundry, uv, GenLayer CLI, and genvm-linter
- Funded Base Sepolia and Bradbury operator wallets
- Vercel project and GitHub repository access

## First workflow
1. Run `pnpm install`.
2. Configure server-only environment variables.
3. Run `pnpm test:contracts` and `pnpm test:genlayer`.
4. Run `pnpm build`.
5. Deploy to Vercel and verify `/docs` returns HTTP 200.
6. Submit one public fixture and wait for FINALIZED / AGREE / FINISHED_WITH_RETURN.

## Success condition
Onboarding succeeds only when local checks pass, production is reachable, and the stored GenLayer verdict is non-empty.

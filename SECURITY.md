# Security Policy

Workify v1 is testnet software. Do not use it with assets of real economic value.

Report vulnerabilities privately to the repository owner. Do not open a public issue containing
an exploit, private key, delegation secret, database credential, or reproducible fund-loss path.

## Security boundaries

- Base contracts are authoritative for USDC custody and settlement.
- GenLayer contracts are authoritative for finalized work verdicts.
- The Vercel verdict attestor is a documented v1 trust assumption.
- MongoDB is non-authoritative for funds.
- The authenticated 1Shot Base Sepolia server wallet is constrained to five imported WorkEscrowV1 methods and onchain validation.
- Evidence is untrusted data and may contain prompt injection.

## Secret handling

Never commit `.env.local`, deployer keys, operator keys, GitHub tokens, MongoDB credentials,
attestor keys, HMAC secrets, or 1Shot API credentials. Rotate any secret disclosed
in logs, issues, chat transcripts, screenshots, or build output.

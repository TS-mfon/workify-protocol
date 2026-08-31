# Workify Rules in Plain Language

## Payment
A client job exists only after USDC moves into Base escrow. PASS pays the worker, FAIL or UNVERIFIABLE refunds the client, and PARTIAL follows the adjudicated payout percentage. A 1% protocol fee applies only to the worker-awarded share.

## Appeals
Either party has five minutes after verdict import to open an appeal. Funding costs exactly 1 GEN. Opening an appeal freezes settlement. Supplemental evidence is allowed, but the original delivery cannot be replaced.

## Evidence
Workers submit public HTTPS artifacts. Workify records canonical URLs, sizes, MIME types, and SHA-256 hashes. GenLayer retrieves the evidence independently. Private or login-gated sources cannot be treated as verified.

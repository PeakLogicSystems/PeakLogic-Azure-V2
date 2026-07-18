# Certificate bundles

**`rds-global-bundle.pem`** — inherited from the AWS-native fork point. No longer referenced by `db.ts` in this repo (Security Architecture §4.2's Azure rewrite). Left in place as historical reference, not deleted — harmless, unused.

**`azure-postgres-ca-bundle.pem`** — **required, not yet present.** `backend/shared/db.ts` fails loudly at runtime if this file is missing (a deliberate "no default, fail fast" choice, not a silent fallback to unvalidated TLS). Before running against a real Azure Database for PostgreSQL instance:

1. Download the current **DigiCert Global Root G2** and **Microsoft RSA Root Certificate Authority 2017** certificates from Microsoft's published PKI documentation (Security Architecture §4.2 cites both as of 2026-07-17 — re-verify against current Microsoft docs before relying on this, since Microsoft has run a CA rotation program for this service before).
2. Concatenate both into a single PEM file at this path.
3. Confirm the target Azure Database for PostgreSQL Flexible Server's TLS chain still matches before deploying.

Not fabricated here — Technical Debt Register's own discipline (don't fake what hasn't been verified) applies to certificate material specifically, not just narrative claims.

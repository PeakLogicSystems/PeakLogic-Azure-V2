// Water-Sector Security Hardening Strategy §5 Tier 2 item 3 — see
// ../main.psrule.bicepparam's header for why this file exists (PSRule
// analysis-only expansion input, never a real deployment parameter file).
// customers.bicep's only parameter (spaRedirectUris) already has a default
// — no explicit values needed, this file exists solely so PSRule discovers
// and expands this template at all (its own pathIgnore config only scans
// *.bicepparam files, not raw .bicep, per ps-rule.yaml).
using 'customers.bicep'

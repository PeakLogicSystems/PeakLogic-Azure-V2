// Water-Sector Security Hardening Strategy §5 Tier 2 item 3 — see
// ../main.psrule.bicepparam's header for why this file exists. Unlike
// customers/partners, staff.bicep has one genuinely required parameter
// (apiFunctionAppPrincipalId, a real manual cross-deployment hand-off, see
// staff.bicep's own param comment) — an all-zeros placeholder GUID is
// enough for PSRule's expansion, which only needs a syntactically valid
// value to resolve the template structure, not a real object id.
using 'staff.bicep'

param apiFunctionAppPrincipalId = '00000000-0000-0000-0000-000000000000'

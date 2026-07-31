# Entra app-registration automation

Enterprise Audit (2026-07-19) §6 P0 item 1's "Entra app-registration automation" gap. Three Bicep files, each targeting a genuinely separate Entra tenant via the [Microsoft Graph Bicep extension](https://learn.microsoft.com/en-us/graph/templates/bicep/overview-bicep-templates-for-graph) (GA since 2025-07-29):

| File | Tenant | Security Architecture reference |
|---|---|---|
| `customers.bicep` | PeakLogicCustomers (Entra External ID / CIAM) | §2.1, §2.3 |
| `partners.bicep` | PeakLogicPartners (Entra External ID / CIAM) | §2.4, §2.6 |
| `staff.bicep` | PeakLogic's own corporate Microsoft Entra ID (workforce) tenant | §2.5 |

**Read `customers.bicep`'s own header comment first** — it carries the shared reasoning (why these deploy separately from `infra-azure/main.bicep`, the verified client-secret limitation, the Microsoft Graph well-known service principal) that `partners.bicep`/`staff.bicep` cross-reference rather than repeat.

## Why these aren't part of `infra-azure/main.bicep`

Every other module in `infra-azure/` deploys as ARM resources into one resource group, in one Azure subscription's tenant. These three files create **Microsoft Graph directory objects** (applications, service principals, app-role grants) inside **three different Entra tenants** — two of which (PeakLogicCustomers, PeakLogicPartners) are deliberately separate from whichever tenant the Azure subscription itself lives in (Security Architecture §2.0's whole point — separate External ID tenants are the strongest isolation unit Entra offers). The Graph Bicep extension authenticates as whatever identity is running `az deployment`, in whatever tenant that identity is currently signed into — there is no single deployment operation that can span all of this.

## Prerequisites (manual, one-time, out-of-band — same category as `az group create` before `main.bicep` runs)

1. The PeakLogicCustomers and PeakLogicPartners Entra External ID (CIAM) tenants must already exist (Entra admin center, or `az` CIAM tenant-creation flow). Tenant *creation* is not scriptable the way an app registration *within* an existing tenant is.
2. PeakLogic's own corporate/workforce Entra ID tenant must exist (it almost certainly already does — company email/Microsoft 365).
3. Whoever runs each deployment below must hold consent-granting rights in that tenant (Global Administrator or Privileged Role Administrator) — each file's `appRoleAssignedTo` resource (granting `User.ReadWrite.All`) requires it.

## Deployment sequence

```bash
# 1. Customers tenant
az login --tenant <PeakLogicCustomers-tenant-id>
az deployment sub create --location <region> --template-file customers.bicep \
  --parameters spaRedirectUris='["https://app.peaklogicsolutions.com"]'

# 2. Partners tenant
az login --tenant <PeakLogicPartners-tenant-id>
az deployment sub create --location <region> --template-file partners.bicep \
  --parameters spaRedirectUris='["https://partners.peaklogicsolutions.com"]'

# 3. Staff tenant — run infra-azure/main.bicep FIRST (api.bicep's Function App
#    must exist before this file has a real principal to grant permissions to)
az login --tenant <PeakLogic-corporate-tenant-id>   # likely already the default context
az deployment sub create --location <region> --template-file staff.bicep \
  --parameters apiFunctionAppPrincipalId=<main.bicep's apiFunctionAppPrincipalId output>
```

## Manual step client secrets require (not automatable in Bicep — see `customers.bicep`'s header for why)

```bash
az ad app credential reset --id <customers mgmtAppId output> --years 2
az ad app credential reset --id <partners mgmtAppId output> --years 2
```
Store both resulting secret values in Key Vault immediately (matching `data.bicep`'s `postgres-admin-credential`/`iot.bicep`'s `iot-hub-ingest-connection` precedent) — never in a parameter file or shell history.

## Mapping outputs to `infra-azure/main.bicep`'s blank ENTRA_* parameters

`main.bicep` (and `api.bicep`, which it wires) has carried these as genuinely-blank, no-default parameters since `api.bicep` was written (2026-07-31) — see `api.bicep`'s own param comments. Once all three deployments above have run, supply these to the **next** `infra-azure` deploy:

| `main.bicep` parameter | Source |
|---|---|
| `entraCustomersAudience` | `customers.bicep`'s `apiAppIdentifierUri` output |
| `entraCustomersIssuer` | `https://<PeakLogicCustomers-tenant-subdomain>.ciamlogin.com/<tenant-id>/v2.0` — **derived from the tenant ID**, not a Bicep output; External ID's documented issuer URL shape (matches `backend/shared/auth.ts`'s own `EntraTenantConfig` comment) |
| `entraCustomersJwksUri` | `https://<...>.ciamlogin.com/<tenant-id>/discovery/v2.0/keys` — same derivation |
| `entraPartnersAudience`/`Issuer`/`JwksUri` | Same three, from `partners.bicep`'s outputs / the PeakLogicPartners tenant ID |
| `entraStaffAudience`/`Issuer`/`JwksUri` | `staff.bicep`'s `apiAppIdentifierUri` output; issuer/jwks use the ordinary Microsoft Entra ID shape (`https://login.microsoftonline.com/<tenant-id>/v2.0` and `.../discovery/v2.0/keys`), not the CIAM `ciamlogin.com` shape — this tenant is workforce Entra ID, not External ID |

**Also wired through `main.bicep`/`api.bicep` now** (closed same day, not left dangling after this README first flagged it): `entraCustomersTenantId`/`entraPartnersTenantId`, `entraCustomersApiSpObjectId`/`entraStaffApiSpObjectId`, the four `entra*Approle*` ids, and the two management-app client ids/secrets (`entraCustomersMgmtClientId`/`entraPartnersMgmtClientId`, plus `entraCustomersDeployed`/`entraPartnersDeployed` gating the Key-Vault-reference app settings for the secrets themselves — same shape as `iotHubDeployed`). Every value `backend/shared/identity.ts` reads that one of these three files actually produces now has a real param to receive it.

**Not produced by any of these files, still genuinely blank after running all three** — flagged, not silently left inconsistent:
- `entraCustomersTenantIdExtProp` / `entraPartnersChannelPartnerIdExtProp` — the custom-attribute + claims-mapping-policy mechanism (Security Architecture §2.4/§8: "not verified call-by-call") is a different Graph resource surface (`identityUserFlowAttributes`/`customAuthenticationExtensions`), not re-derived in this pass.
- `entraSelfServicePasswordUrl` / `entraSelfServiceSecurityInfoUrl` — `backend/shared/identity.ts`'s `entraSelfServiceUrl()` already has Microsoft's documented default hosted endpoints (`passwordreset.microsoftonline.com`, `mysignins.microsoft.com/security-info`) if these stay unset — leaving them blank is a safe, working default, not a gap.

## Real, disclosed gaps across all three files

1. MFA / Conditional Access enforcement is not configured anywhere here — a real, separate Graph resource surface (`conditionalAccessPolicies`), flagged in Security Architecture §2.2/§2.5 as a live-moving Microsoft platform area, not re-derived in this pass.
2. None of this has been validated against a real Entra tenant — no Azure subscription or Entra tenant exists to deploy against yet (same standing limitation as every file in `infra-azure/`).
3. The invite-flow API contracts (`API Specification` #11's own Azure amendment, Security Architecture §2.6's disclosed gap) that would actually call `backend/shared/identity.ts`'s `createEntraUser()` using the App Role ids these files mint are not built.

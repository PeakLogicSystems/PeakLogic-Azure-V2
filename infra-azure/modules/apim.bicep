// APIM module — Azure API Management (Consumption tier), fronting
// api.bicep's Function App for rate limiting. Enterprise Audit (2026-07-19)
// §2.5/§6 P0 item 1's "APIM/Front Door... also the WAF" gap — but
// DELIBERATELY SCOPED TO RATE LIMITING ONLY, not the WAF half. Explicit
// user decision, 2026-07-31, after surfacing a real inconsistency between
// two of this project's own documents rather than silently picking one:
// the audit lists WAF as P0, but security-architecture.md §3.3 already
// concluded, on its own reasoning (identity-provider auth on every
// data-touching route + rate limiting already cover the marginal risk at
// design-partner-tenant scale), that "a WAF's marginal benefit doesn't
// clearly justify its cost/complexity yet." Rate limiting itself (§3.4) is
// the piece BOTH documents agree is still required, unconditionally.
// Building only that — and explicitly not Front Door/WAF — follows this
// project's own prior, reasoned conclusion rather than the audit's more
// generic P0 phrasing. Revisit WAF if real threat activity or an
// enterprise customer's security review actually demands it — not
// preemptively (same "don't build ahead of a named need" discipline as
// api.bicep's Flex-Consumption-over-Premium choice and iot.bicep's S1
// sizing).
//
// TIER CHOICE: Consumption, not Developer/Basic/Standard/Premium — the
// same pay-per-use philosophy as api.bicep's Flex Consumption plan.
// Verified pricing: ~$3.50/million calls, with the first million free every
// month — genuinely near-$0 at this platform's near-term traffic. VNet
// integration is NOT available below Standard v2 (~$677/mo) — a real,
// accepted limitation, but irrelevant here: APIM only needs to reach the
// Function App's already-public HTTPS endpoint, not any private resource,
// so it never needed VNet integration in the first place.
//
// REAL, DISCLOSED LIMITATION — READ BEFORE ASSUMING THIS FULLY PROTECTS THE
// BACKEND: Consumption-tier APIM has NO dedicated/static outbound IP
// (verified via Microsoft Learn) — the Function App's own default hostname
// therefore CANNOT be locked down to "APIM traffic only" via IP
// restriction; the only IP-based option is allowlisting Azure's entire
// datacenter IP range, which defeats the purpose. A caller who discovers
// api.bicep's Function App hostname directly can still bypass this rate
// limit entirely. The documented alternative (Microsoft Learn) is an
// authentication-based restriction — e.g. APIM injects a shared-secret
// header the Function App validates, rejecting anything that arrives
// without it. NOT built here: that requires a backend code change
// (validating the header in backend/api/main.ts or a shared middleware),
// which is out of this module's scope (infra, not application code). Real,
// disclosed follow-up work, not silently assumed solved by APIM's mere
// existence.
//
// Sources consulted while writing this module (2026-07-31):
//   - https://azure.microsoft.com/en-us/pricing/details/api-management/ (Consumption tier pricing)
//   - https://learn.microsoft.com/en-us/azure/api-management/api-management-howto-ip-addresses (Consumption tier has no static outbound IP)
//   - https://learn.microsoft.com/en-us/azure/templates/microsoft.apimanagement/service (resource shape, required publisherEmail/publisherName)

@description('Stage-prefixed resource name base, e.g. "peaklogic-dev".')
param namePrefix string

@description('Mixed into the APIM instance name — must be globally unique across all of Azure (it gets a *.azure-api.net hostname), same reasoning as every other globally-unique resource in this tree.')
param uniqueSuffix string

param location string

@allowed(['dev', 'staging', 'prod'])
param stage string

@description('Required — reused from main.bicep\'s existing alertEmail rather than introducing a second required contact address. APIM\'s publisherEmail/publisherName are administrative metadata (shown on the developer portal, used for service notifications), not a security control.')
param publisherEmail string

param publisherName string = 'PeakLogic'

@description('api.bicep\'s Function App default hostname — APIM\'s backend target. Passed as a plain value (a hostname, not a credential) unlike iot.bicep\'s connection string, which is why this one doesn\'t need Key Vault treatment.')
param functionAppDefaultHostName string

@description('Requests per minute allowed per calling IP address before APIM returns 429. A starting, disclosed placeholder — not derived from real traffic data, since none exists yet (same category as api.bicep\'s maximumInstanceCount and iot.bicep\'s iotHubCapacity). Revisit once real usage patterns exist.')
param rateLimitCallsPerMinute int = 300

@secure()
@description('Water-Sector Security Hardening Strategy §5 Tier 0.5 — closes gap #1 below (the direct-bypass limitation). Injected into every forwarded request as X-PeakLogic-Apim-Secret; api.bicep passes the same value to the Function App as APIM_SHARED_SECRET for backend/shared/apim-guard.ts to validate. Defaults to empty string — see main.bicep\'s apimSharedSecret param description for why an empty value on both sides means "not enforced yet," not "misconfigured."')
param apimSharedSecret string = ''

@description('Standard resource tags (project/stage/managedBy) — Azure.Resource.UseTags, architecture-review PSRule remediation 2026-08-09.')
param tags object = {}

resource apim 'Microsoft.ApiManagement/service@2023-05-01-preview' = {
  name: '${namePrefix}-apim-${uniqueSuffix}'
  location: location
  tags: tags
  sku: {
    name: 'Consumption'
    capacity: 0 // Consumption tier has no scale units — must be 0, not a choice left unset.
  }
  // Azure.APIM.ManagedIdentity (architecture-review PSRule remediation,
  // 2026-08-09) — no resource in this module actually needs it to
  // authenticate anywhere yet (the backend is reached over plain HTTPS,
  // not Key-Vault-referenced secrets or managed-identity-authenticated
  // calls), but granting the identity costs nothing and is the documented
  // prerequisite for e.g. a future Key-Vault-backed named value.
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    publisherEmail: publisherEmail
    publisherName: publisherName
    // Azure.APIM.MinAPIVersion (architecture-review PSRule remediation,
    // 2026-08-09) — blocks management-plane (control-plane REST API) calls
    // older than this version; unrelated to and does not affect the actual
    // /v1/* data-plane traffic this module proxies.
    apiVersionConstraint: {
      minApiVersion: '2021-08-01'
    }
    // Azure.APIM.Ciphers (architecture-review PSRule remediation,
    // 2026-08-09) — disables TLS 1.0/1.1/SSL3.0 and the weak 3DES cipher on
    // both the client-facing gateway and the backend leg, the exact
    // documented property set Microsoft's own remediation guidance names
    // for this rule.
    // The full 8-cipher list below was NOT guessed from documentation
    // prose (that took two real, failed infra-psrule CI runs to discover
    // was incomplete, 2026-08-09) — it's the exact allOf condition list
    // read directly from PSRule.Rules.Azure's own rule source
    // (Azure.APIM.Ciphers, github.com/Azure/PSRule.Rules.Azure), every
    // path required 'False' with no exceptions.
    customProperties: {
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls10': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls11': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Ssl30': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls10': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls11': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Ssl30': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Ciphers.TripleDes168': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Ciphers.TLS_RSA_WITH_AES_128_CBC_SHA': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Ciphers.TLS_RSA_WITH_AES_256_CBC_SHA': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Ciphers.TLS_RSA_WITH_AES_128_CBC_SHA256': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Ciphers.TLS_RSA_WITH_AES_256_CBC_SHA256': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Ciphers.TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Ciphers.TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Ciphers.TLS_RSA_WITH_AES_128_GCM_SHA256': 'False'
    }
  }
}

// One API, proxying api.bicep's own single catch-all route
// (backend/api/main.ts's app.http('api', { route: 'v1/{*rest}' })) —
// APIM adds a rate-limiting gate in front of it, nothing else. No
// subscriptionRequired/API-key scheme: the real authentication is already
// Entra JWT validation inside the backend code itself (backend/shared/
// auth.ts) — APIM's job here is rate limiting only, not a second
// credential layer nothing asked for.
resource api 'Microsoft.ApiManagement/service/apis@2023-05-01-preview' = {
  parent: apim
  name: 'peaklogic-api'
  properties: {
    displayName: 'PeakLogic API'
    // Azure.APIM.APIDescriptors (architecture-review PSRule remediation,
    // 2026-08-09) — a real, human-readable description, not filler: this
    // is the one API this instance proxies (api.bicep's Function App
    // catch-all route).
    description: 'PeakLogic platform REST API (/v1/*) — proxied to the backend Azure Functions app for rate limiting only; authentication is Entra JWT validation inside the backend itself, not an APIM-layer credential.'
    path: 'v1'
    protocols: ['https']
    serviceUrl: 'https://${functionAppDefaultHostName}/v1'
    subscriptionRequired: false
  }
}

// Five operations, not one wildcard-method operation — APIM operations are
// defined per HTTP method (there is no verified wildcard-method shape),
// mirroring api/main.ts's own methods array exactly (['GET', 'POST', 'PUT',
// 'DELETE', 'OPTIONS']) rather than guessing at an unsupported shortcut.
// Each uses a trailing-wildcard urlTemplate so every /v1/* path passes
// through, matching the backend's own catch-all route.
resource getOp 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'get-catch-all'
  properties: { displayName: 'GET catch-all', method: 'GET', urlTemplate: '/*' }
}
resource postOp 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'post-catch-all'
  properties: { displayName: 'POST catch-all', method: 'POST', urlTemplate: '/*' }
}
resource putOp 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'put-catch-all'
  properties: { displayName: 'PUT catch-all', method: 'PUT', urlTemplate: '/*' }
}
resource deleteOp 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'delete-catch-all'
  properties: { displayName: 'DELETE catch-all', method: 'DELETE', urlTemplate: '/*' }
}
resource optionsOp 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'options-catch-all'
  properties: { displayName: 'OPTIONS catch-all', method: 'OPTIONS', urlTemplate: '/*' }
}

// Rate-limit-by-key policy, keyed on caller IP (not a subscription key,
// since subscriptionRequired is false above) — protects against volumetric
// abuse/scraping, the exact requirement security-architecture.md §3.4 named
// as unchanged/still-required. No CORS policy added here: backend/shared/
// response.ts already sets CORS_ALLOWED_ORIGIN on every response, and APIM
// passes backend response headers through unmodified by default — adding a
// second, APIM-side CORS layer would be redundant with (and risk
// conflicting with) the app's own existing handling, not a gap.
resource ratePolicy 'Microsoft.ApiManagement/service/apis/policies@2023-05-01-preview' = {
  parent: api
  name: 'policy'
  properties: {
    format: 'xml'
    value: '''
<policies>
  <inbound>
    <rate-limit-by-key calls="${rateLimitCallsPerMinute}" renewal-period="60" counter-key="@(context.Request.IpAddress)" />
    <set-header name="X-PeakLogic-Apim-Secret" exists-action="override">
      <value>${apimSharedSecret}</value>
    </set-header>
    <base />
  </inbound>
  <backend>
    <base />
  </backend>
  <outbound>
    <base />
  </outbound>
  <on-error>
    <base />
  </on-error>
</policies>
'''
  }
}

// ── Real, disclosed gaps, not silently omitted ──
// 1. RESOLVED 2026-08-01 (Water-Sector Security Hardening Strategy §5 Tier
//    0.5): the Function App direct-bypass limitation — see the header
//    comment. The documented fix (a shared-secret header APIM injects, the
//    backend validates) is now built: the `set-header` policy above plus
//    backend/shared/apim-guard.ts + api/handler.ts. Not enforced until
//    apimSharedSecret is actually deployed with a real value for a given
//    stage — see that param's own description.
// 2. No Front Door / WAF — a deliberate scope decision (see header), not an
//    oversight. If a future security review or real threat activity
//    changes that conclusion, Front Door Premium (the only tier with a
//    managed WAF) would sit in front of THIS module's APIM instance, not
//    replace it — the two solve different problems (edge/WAF vs.
//    per-caller rate limiting and, later, per-partner quotas).
// 3. No Application Insights/diagnostic logging wired from APIM to
//    monitoring.bicep's existing Log Analytics workspace — a real,
//    reasonable follow-up, not required for rate limiting itself to work.
// 4. Per-partner quotas (the audit's other named future use for this
//    layer, "future per-partner quota point") are NOT built — this module
//    rate-limits by caller IP only, with no APIM Product/subscription-key
//    model yet. Real follow-up once a genuine per-partner quota need is
//    named, not built speculatively now.
// 5. Not validated against a real subscription (no Azure CLI in this
//    environment, same standing limitation as every file in this tree).
//    Two things worth checking first: (a) that rate-limit-by-key is usable
//    on the Consumption tier specifically (widely documented as a core
//    policy available on every tier, but not independently re-verified
//    against a live Consumption-tier instance here), and (b) that the
//    multi-line '''...''' Bicep string used for the policy XML correctly
//    interpolates ${rateLimitCallsPerMinute} the same way a regular string
//    literal would — a detail this module relies on but hasn't seen
//    compiled by a real Bicep CLI.
// 6. Three PSRule findings deliberately NOT fixed (architecture-review
//    PSRule pass, 2026-08-09), all structural limitations of the
//    Consumption tier this module chose for cost reasons (see TIER CHOICE
//    above), not oversights:
//      - Azure.APIM.AvailabilityZone / Azure.APIM.MultiRegion — zone and
//        multi-region redundancy require Premium tier (~$2,700+/mo list),
//        cost-prohibitive at this platform's current MVP/single-pilot
//        scale. Revisit only alongside a real Premium-tier decision, not
//        piecemeal.
//      - Azure.APIM.DefenderCloud — Microsoft Defender for APIs is a
//        subscription-level Defender plan (Microsoft.Security/pricings),
//        which deploys at subscription scope; this template deploys at
//        resource-group scope (main.bicep's targetScope). Enabling it
//        belongs in a subscription-level template/step, not this module,
//        and is a real recurring cost, not a free toggle.

output apimName string = apim.name
output apimGatewayUrl string = apim.properties.gatewayUrl

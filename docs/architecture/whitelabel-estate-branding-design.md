# White-Label Estate Branding — Design

**Status:** 🟢 Approved v1.0 (2026-07-21)
**Delivers:** the third, previously-unscoped branding surface named while reviewing the pitch deck's "customers see your brand, not ours" claim — a channel partner's own end customers, distinct from (a) that partner's own staff (already designed, `channel-partner-portal/`) and (b) a direct PeakLogic customer (plain PeakLogic branding, unaffected by anything here).

---

## 0. The three audiences — only one had branding designed before this

| Who | Where they log in | Branding before this artifact |
|---|---|---|
| A channel partner's own staff (technicians/dispatchers) | `channel-partner-portal/` — separate app | Partner's brand, front and center; "Powered by PeakLogic" credit. Demo-only, no real backend. |
| A channel partner's own **customers** | Main tenant app (`frontend/`) | **Nothing** — plain PeakLogic branding, no mechanism existed at all. This artifact. |
| A direct PeakLogic customer | Main tenant app (`frontend/`) | Plain PeakLogic branding (correct, unaffected). |

## 1. The structural gap found while scoping this (not just a branding question)

Verified directly against `docs/data-model.sql` before designing anything: `tenants.channel_partner_id` was a single nullable FK — one tenant, at most one channel partner. There was no `sites.channel_partner_id`. A customer serviced by two different partners (e.g. WTR DR for pools, ACE Septic for wastewater, at different sites) could not be represented as **one** tenant — it would have required two disconnected tenant records, which is the opposite of "see the whole estate." Branding was never the hard part; the data model not being able to represent a mixed-partner customer was.

## 2. Resolved design (migration `1784048400000_channel-partner-groups.sql`, shipped)

**Two additive schema pieces:**

1. **`channel_partner_groups`** — the holding company (e.g. "Purple Standard"). Same trust posture as `channel_partners` itself: not tenant data, deliberately **not RLS-enabled**, access controlled at the application layer. `channel_partners.group_id` (nullable) links sibling partners to it.
2. **`sites.channel_partner_id`** — a nullable, **site-level override** of the tenant's own `channel_partner_id`. `NULL` (every pre-existing row) means "use the tenant's own attribution, unchanged" — fully backward compatible. Set, it lets one tenant's sites be serviced by different partners.

Once both exist, "seeing the whole estate" needs **no new cross-tenant/act-as machinery** — it's already one tenant, and the tenant app already renders every one of a tenant's sites in one view. The group's actual job is narrower than it sounds: it's the **branding fallback** for a mixed-portfolio tenant, not a data-access mechanism.

**A second, real bug found while tracing the RLS interaction through (not theorized — traced how the function actually executes):** `channel_partner_can_read_site()` has no `SECURITY DEFINER`, so it runs with the calling session's own privileges — its internal `JOIN tenants` is itself subject to `tenants`' own RLS. The pre-existing `tenants.channel_partner_read` policy only matched on the tenant's own `channel_partner_id`. For a mixed-attribution tenant, a partner session's join into `tenants` for a site attributed to them via the *site-level* override would have been silently blocked by the old tenant-level-only policy — the override would never actually resolve, despite looking correct in `channel_partner_can_read_site()`'s own body. Fixed in the same migration by widening that policy to also match via any of the tenant's sites' overrides.

`channel_partner_can_read_site()` itself now resolves a site's effective partner as `COALESCE(site override, tenant default)` — byte-identical to the old behavior for every site that doesn't set an override (i.e., every row today).

**Deliberate, explicit non-goal:** group membership does **not** widen channel-partner-side data access. A WTR DR staff session still cannot read an ACE Septic-attributed site just because both are Purple Standard siblings — `channel_partner_can_read_site()` still checks the specific effective partner, never the group. Groups are a customer-facing branding-fallback concept only.

## 3. Branding resolution (`backend/shared/branding.ts`, shipped, pure + tested)

```
resolveEstateBranding(sitePartners, groups) →
  { kind: 'none' }              // no attribution anywhere, or mixed partners with no shared group
  { kind: 'partner'; partner }  // every attributed site resolves to the same single partner
  { kind: 'group'; group }      // sites span multiple partners, all siblings under one group
```

Deliberately conservative: a partner mixed in with **no** group, or partners from **two different** groups, both fall through to `'none'` (plain PeakLogic) rather than guessing — showing an arbitrary partner's brand, or the wrong group's brand, is worse than the honest default. 8 unit tests cover every branch.

## 4. Theming timing: post-login only (user decision)

Theming resolves **after** authentication, from the authenticated user's tenant → site → effective-channel-partner (or group) chain — never from an unauthenticated, pre-auth domain-resolution step. This is meaningfully simpler than resolving branding from the requested domain before login: no public "resolve branding by domain" endpoint is needed, and the login screen itself can stay generic. Consequence: a partner's custom/branded domain (§5) is primarily a **reachability** feature (a URL the partner can put on their own site or hand to a customer), not something that needs to serve different pre-auth HTML per domain.

## 5. Hosting tiers + real cost basis (verified via live search, 2026-07-21 — not guessed)

- **PeakLogic-hosted branded subdomain** (`{partner}.peaklogicsolutions.com`) — available broadly, no DNS work for the partner.
- **True custom domain** (partner's own DNS, e.g. `portal.wtrdr.com`) — **reserved for the Enterprise pricing tier only** (the $2,500–6,000+/facility/mo tier from the pricing-strategy deck work).

**Cost basis:**
- Azure Static Web Apps Standard: **$9/app/month**, up to 5 custom domains per app, managed TLS certificates included free.
- Azure Front Door Standard: $35/month base; Premium: $330/month base, up to 100 free managed-cert custom domains + WAF.
- **Load-bearing connection:** the Enterprise Audit (`enterprise-audit-2026-07-19.md` §2.5, P0/P1) already calls for API Management or Front Door to add rate-limiting/WAF — a gap independent of this feature. If Front Door is picked for that reason, custom-domain hosting for white-label partners can ride on infrastructure needed anyway, at near-zero marginal cost.
- Industry comparables (white-label/reseller SaaS): custom-domain support is typically bundled into the top tier's price, not metered separately.

**Pricing recommendation:** bundle into the Enterprise tier by default; if ever broken out as its own line item, **$150–400/mo per partner** (not per facility) — pricing the professionalism/reachability value, not the ~$0–35/mo actual infra cost. Full detail: [[project_peaklogic_whitelabel_estate_design]] memory.

## 6. Scope: Purple Standard only, for now

Per explicit user direction: reserved as a value-add for Purple Standard specifically, not offered to every partner. No feature flag needed — `channel_partner_groups` simply has one row (created via the admin console once that's wired) or none yet; the mechanism is generic and correct in the schema, the offering is not generally marketed.

## 7. What shipped vs. what's still open

**Shipped 2026-07-21:** migration `1784048400000` (`channel_partner_groups`, `channel_partners.group_id`, `sites.channel_partner_id`, widened `tenants.channel_partner_read` policy, redefined `channel_partner_can_read_site()`); `backend/shared/branding.ts` (`resolveEstateBranding`) + 8 tests; `docs/data-model.sql` mirrored; types (`ChannelPartnerGroup`, `BrandingInfo`) added.

**Explicitly not built yet (next increment, not designed further here):**
- No API endpoint exposes estate branding to a frontend yet (mirrors how AI Analytics Tier 1 shipped with no read API either — same "ship the foundation, wire the surface next" pattern).
- No frontend theming exists anywhere in `frontend/` — applying partner colors/logo across the existing UI, with an accessibility/contrast pass, is a real, separate increment.
- No admin-console UI to create/edit `channel_partner_groups` rows or set `sites.channel_partner_id` — today these would be set by direct SQL/ops action, matching how `channel_partners` itself is provisioned today.
- The narrow edge case of a facility spanning **multiple, unrelated** (non-Purple-Standard) partners is explicitly out of scope — falls through to plain PeakLogic branding via `resolveEstateBranding`'s conservative default, not specially handled.

## 8. Artifact amendments

**Done 2026-07-21:** Database Schema (migration + `data-model.sql` mirror), Domain Model (new entities/columns).

**Still pending, when their trigger condition is met:** API Specification (an estate-branding read endpoint — needed before any frontend can consume this), Security / Multi-Tenant Architecture (formal write-up of the two RLS findings in §2 above — currently only documented in the migration/this doc), CLAUDE.md (a short pointer, mirroring the AI Analytics section's format, once the API/frontend surface exists to describe).

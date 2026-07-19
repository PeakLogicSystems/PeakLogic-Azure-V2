# Business Development & Strategy Guideline

**Status:** Living document · created 2026-07-18
**Purpose:** Park forward-looking positioning, monetization ideas, and go-to-market plans here so the **public website only states what the product can do today**. Anything on this page is *not yet* a shippable claim and must not appear on peaklogicsolutions.com as a current capability, result, or certification until it is real and provable.

---

## 0. The guardrail (why this doc exists)

A copy-edit pass on the marketing site (2026-07-18) removed every statement that couldn't be 100% backed by the product today. The rule going forward:

- **Capabilities the product actually does** (or is genuinely built to do at prototype/architecture level) — OK to state, in present tense, as *what it does*.
- **Results, metrics, certifications, customer counts, and partner names** — only once true and provable. No "83% risk reduced," "SOC 2 certified," "trusted by N companies," "6 trades live," or specific ROI/conversion figures until we have the evidence.
- **Future services and business models** — live here, not on the site (or only in a clearly-labeled "roadmap," future tense).

When something below becomes real and provable, move it onto the site and note the date it graduated.

---

## 1. Product roadmap (designed, not yet shippable)

These are architected in `docs/architecture/` but not delivered. Keep them off the site as current features.

| Item | Where it's designed | Graduates to the site when… |
|---|---|---|
| **AI anomaly detection** (learned baselines flag drift) | `ai-analytics-layer-design.md` | It runs on real data and we can show it working |
| **Predictive maintenance** (time-to-failure) | `ai-analytics-layer-design.md` | A real model predicts a real failure for a real asset |
| **Prescriptive work-order enrichment** (likely cause + action) | `ai-analytics-layer-design.md` | It attaches to a live CMMS work order |
| **Compliance & audit automation as a product** | audit trail exists; the *productized regulated offering* does not | We have a named compliance use case delivered |
| **Zero-touch provisioning at fleet scale** (DPS enrollment groups) | `device-onboarding…` + review roadmap | Deployed against a real IoT Hub |
| **Full device-ecosystem catalog** | ecosystem page is a placeholder | The catalog is real and filterable |

**Present-tense-OK today** (grounded in built/prototyped code): continuous device monitoring, configurable alert thresholds (Policy Engine — built), live dashboards / site map / drill-down (prototype), automated ticket creation from critical alerts pushed to an external system (CMMS connector step 1 — built), reports & KPIs (prototype), role-based multi-tenant access, per-tenant data isolation + append-only audit log (RLS + `audit_log_entries` — built), and branding a partner's workspace (designed).

---

## 2. Monetization strategy (future — not on the pricing page as current terms)

Sourced from the "how an IoT monitor makes money" thinking; these are business models to pursue, not current offers.

- **Outcome-based pricing** — a share of the downtime/energy/claims avoided. Requires measured baselines and a proof methodology before we can price or advertise it.
- **Insurance partnerships & premium reductions** — partner with commercial insurers who subsidize hardware or lower premiums for monitored policyholders. This is a partnership program to build; do not claim insurer relationships until signed.
- **Hardware subsidy / lease models** — CapEx vs OpEx options for devices; finalize before listing.
- **Compliance-as-a-subscription** — premium tier selling continuous, tamper-evident regulatory evidence (cold-chain, gas, water quality). Needs the compliance product (see §1) first.

Current, defensible pricing model on the site: simple **per-site subscription** tiers (Essentials / Professional / Enterprise), self-serve trial at Essentials, sales-assisted above. Numbers are placeholders the founder sets.

---

## 3. Go-to-market

- **Channel-partner (branded) program** — the core distribution motion: field-services companies run PeakLogic **branded as their own** and resell monitoring to their book of business. On the site this is described as "your brand and domain," never "white-label."
- **Beachhead verticals** — restaurants/QSR, water utilities & pumping, energy & facilities, aquatics/pools, cold storage/refrigeration, roofing/building envelope, municipal wastewater, property management.
- **Pilot partner (internal, confidential):** the platform is being proven against a first partner family of field-services brands. **Keep specific partner and customer names out of all public marketing** until there is a signed reference and permission to name them. The public site and demo use generic, illustrative organizations only.

---

## 4. Proof to earn before we can claim it

Track these; each unlocks a specific on-site claim:

- **SOC 2** → unlocks a security/compliance badge and "SOC 2" language. (Not started/complete — do not state "in progress" publicly unless an audit is genuinely engaged.)
- **Real conversion / ROI numbers** → unlocks the outcome metrics and the dispatch→service-call figure.
- **Named customer / partner references** → unlocks logos, quotes, and "trusted by."
- **Live deployment counts** ("N sites / trades live") → unlocks those stats.

---

## 5. Positioning guardrails (for future site edits)

- Say **what it does**, not what it achieved.
- No fabricated numbers. If a figure appears, it must trace to real data or be labeled clearly as illustrative *inside the product demo only*, never on marketing pages.
- No third-party names (insurers, customers, partners) without a signed agreement and permission.
- "Branded as your own," never "white-label," in customer-facing copy.
- Roadmap items, if shown at all, are future tense and clearly labeled — otherwise they live here.

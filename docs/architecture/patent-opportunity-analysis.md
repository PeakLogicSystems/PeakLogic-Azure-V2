# Patent Opportunity Analysis

**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Company:** PeakLogic
**Project codename:** Project Vantage
**Status:** Approved v1
**Depends on:** [Vision Document](vision-document.md) (approved v1), [Domain Model](domain-model.md) (approved v1), [Device & Command Security Architecture](device-command-security-architecture.md) (approved v1)
**Last updated:** 2026-07-11

---

## ⚠️ Not Legal Advice — Read Before Anything Else

**This document is not a patentability opinion, not a freedom-to-operate analysis, and not a substitute for a registered patent attorney or a professional, paid prior-art search.** It's an informed technical read of what's actually distinctive in this product, plus real (but informal) web research as a sanity check — the same standing caveat this project has already applied to HIPAA and SOC 2 (Compliance & Certification Roadmap §1.1/§3.1): grounded in real research, not a legal conclusion. **Do not file anything, make any patent claim publicly, or spend real money based on this document alone** — every candidate below needs a real attorney and a real search (USPTO, Google Patents, a paid search firm) before any of that.

---

> **⚡ Unified Platform (v2.0) amendment — 2026-07-25.** The unified platform sharpens the strongest candidate moat: the **closed detect → dispatch → outcome → learn loop** — an alarm auto-creates a CMMS work order, a technician resolves it, and the `service_visits.outcome` becomes a supervised training label for fleet-wide predictive maintenance. That loop is hard to copy for anyone without both the monitoring *and* the dispatch surface, which the unified platform (PeakLogicSystems + CMMS + PeakLogic Hubs + AI) uniquely combines. Not legal advice; no filing action recommended now (see the disclaimer above). Full plan: [`unified-platform-integration-plan.md`](unified-platform-integration-plan.md).

## 1. Introduction

### 1.1 Purpose & Scope

Identify what in this product is *technically* distinctive enough to be worth a real patentability conversation, versus what's standard engineering practice dressed up as a differentiator. In scope: a candidate-by-candidate read of the product's actual technical claims, informal prior-art sanity checks on the strongest 2, and a business-judgment recommendation on whether pursuing any of this is proportionate at this company's current stage. Out of scope: an actual patent application, a formal prior-art search, or any legal conclusion about novelty/non-obviousness/patent-eligible subject matter — all three are outside what this process is equipped to determine.

### 1.2 Methodology

Reviewed every approved architecture artifact (Vision, PRD, Domain Model, Device & Command Security Architecture) for anything presented as a genuine technical mechanism, not just a feature. Ran informal web searches (`WebSearch`) on the two strongest candidates as a real, if limited, sanity check — not a formal search, but not pure speculation either.

---

## 2. Candidate Analysis

### 2.1 Refrigeration monitoring via a product-temperature probe, not ambient air — the strongest candidate, real adjacent prior art found

**The mechanism:** a temperature probe placed *in the food/drink itself*, not measuring ambient air inside the unit — enabling two things at once: the unit can run warmer (energy savings) while the system still enforces the actual FDA cold-holding compliance limit (41°F/4.4°C) against the thing the limit is actually about. This is presented as one of the two anchor product pitches (Vision Document) and is genuinely the most technically specific claim in the product — not "we monitor temperature," but a specific measurement-point choice tied to a specific dual business outcome.

**Real adjacent prior art found, not assumed absent:** searched directly and found **USPTO patent 12532211**, "Asset management and IoT device for refrigerated appliances" — which claims *simulating* product temperature from return-air temperature (a calculated/inferred value) and alarming when that simulated value crosses a threshold. This is close to PeakLogic's space but **mechanistically different**: PeakLogic's approach is a direct physical measurement, not a simulation/inference from a different sensor. That distinction is real and could matter for novelty — but confirming whether it's *legally* sufficient to distinguish from this and whatever else a real search would surface is exactly the kind of determination this document cannot make.

**Assessment: worth a real attorney conversation specifically about this one, citing this reference directly** — not a green light to file, but the strongest candidate by a clear margin.

### 2.2 Leak detection + auto-shutoff — weak candidate, heavily crowded space

**Real prior art found, not assumed:** searched directly and found this is an actively contested, crowded patent space — existing USPTO patents (e.g., 7204270, 10816432), a 2025 patent from IoT Technologies LLC specifically claiming *predictive* leak detection ("a future leak is likely," compared against stored evaluation data), and multiple new 2025–2026 filings (Rhino Leak Defense Inc., Sage University, Swami Rama Himalayan University) actively narrowing this space further (per-fixture shutoff, etc.). Commercial products (Phyn, Flo by Moen) already ship patented pressure-wave-analysis detection with auto-shutoff.

**Assessment: not a strong candidate.** The product feature itself (Vision Document, PRD) is real and valuable to customers, but "leak sensor + cloud alert + eventual auto-shutoff" as a *patentable mechanism* is already extensively claimed by well-resourced competitors. The specific "fail-safe-locally, cloud is override-only" design principle (Device & Command Security Architecture, CLAUDE.md) is good engineering, but a general safety design principle isn't itself a novel, claimable invention — it's how safety-critical systems are generally expected to be built.

### 2.3 Device-adapter / `RULES_BY_CATEGORY` extensibility architecture — likely not patent-eligible subject matter

A plugin/strategy-pattern architecture for adding new sensing modalities (Domain Model §2.3, DA-1/DA-2) is a standard, well-known software engineering pattern. Since *Alice Corp v. CLS Bank* (2014), U.S. courts have been consistently skeptical of patents on abstract architectural patterns implemented on generic computing infrastructure, absent a specific, non-obvious technical improvement beyond "organize the code this way." **Assessment: not a candidate worth pursuing** — real, valuable engineering, not patentable subject matter as currently understood.

### 2.4 MCP server exposing IoT data to AI agents — premature, not itself inventive today

Using the Model Context Protocol to expose read-only tenant data to AI/agent consumers (API Specification §4.4, SRS §3.7) is a protocol-integration choice, not a novel mechanism — MCP is an open standard, and exposing existing REST data through it doesn't create new patentable subject matter. **Possible future angle, not today:** if the deferred actuation/command architecture (Device & Command Security Architecture §4, explicitly not built yet) eventually produces a genuinely novel safety-constrained mechanism for an AI agent to safely issue physical-world commands (e.g., a specific technical approach to bounding what an LLM-driven agent can authorize for actuation), *that* could be worth revisiting — but nothing described in any approved artifact today rises to that level.

### 2.5 Channel-partner attribution model — not patentable subject matter

A reseller/attribution tracking model (Domain Model, CH-1/CH-2) is a business process, not a technical invention. Business-method patent eligibility has been narrow since *Alice* for anything this generic (attribute a customer to a partner, resolve a supplier name at read time). **Assessment: not a candidate.**

---

## 3. Business Judgment: Is Pursuing Any of This Proportionate Right Now?

**Recommendation: not a full utility patent right now, for anyone, absent a specific external reason to move (an investor requiring IP protection, a specific competitive threat).** Checked directly, not estimated from memory: real utility patent prosecution runs roughly **$9,000–$16,000 in attorney fees alone** for preparation and filing, before USPTO fees or the cost of responding to office actions over a multi-year prosecution — disproportionate for a team still validating the product thesis with a small number of design-partner tenants (PRD §8), the same proportionality judgment this project has applied to nearly everything else (WAF, SOC 2 Type II timing, multi-account AWS isolation).

**Cheaper options that preserve the option to move later, if §2.1's candidate specifically warrants it:**

- **Do nothing now, revisit if the refrigeration vertical becomes a larger, funded priority** — costs nothing, loses only the filing-date priority a competitor might claim first. Given §2.1's own research found an adjacent-but-different existing patent already active in this space, the "someone else claims it first" risk is real, not hypothetical, but the direct-probe mechanism itself doesn't yet appear separately claimed.
- **A provisional patent application** — roughly $2,000–$6,000 in attorney fees plus a small USPTO filing fee ($65–$260 depending on entity size), establishes a priority date, gives 12 months of "patent pending" status to decide whether to pursue the full utility application. The proportionate middle ground if the refrigeration vertical's competitive urgency justifies locking in a filing date without committing to full prosecution costs yet.
- **Defensive publication** — cheapest option; publishing the specific mechanism publicly prevents anyone else from patenting it, at the cost of giving up any offensive patent rights PeakLogic itself might have claimed. Worth considering only if the business conclusion is "we don't want to spend on this, but we also don't want a competitor to lock us out."

---

## 4. Recommendation & Next Steps

1. **No action required immediately.** Nothing in this document is time-sensitive enough to require an urgent decision.
2. **If pursuing anything:** a single real conversation with a patent attorney about §2.1 specifically (the refrigeration product-probe mechanism), citing USPTO 12532211 directly, is the one action worth taking before the others — everything else in §2 is a weak-to-nonexistent candidate.
3. **Revisit this document** if the refrigeration vertical moves from "confirmed beachhead, active sales opportunity" (Domain Model, PRD) to a larger, funded priority, or if a competitor's product/patent activity in this specific space changes the urgency calculus.

---

## 5. Traceability

| Section | Traces to |
|---|---|
| §2.1 Refrigeration candidate | Vision Document, PRD (two anchor product pitches) |
| §2.2 Leak detection candidate | Vision Document, PRD; Device & Command Security Architecture (fail-safe-locally principle) |
| §2.3 Device-adapter candidate | Domain Model §2.3 (DA-1/DA-2) |
| §2.4 MCP candidate | API Specification §4.4, SRS §3.7, Device & Command Security Architecture §4 |
| §2.5 Channel-partner candidate | Domain Model, CH-1/CH-2 |

---

## 6. Open Questions

1. **§2.1's direct-probe-vs-simulated-temperature distinction from USPTO 12532211 has not been evaluated by anyone with legal authority to do so** — the single most important open question in this document, and the reason for its headline disclaimer.
2. **No formal, paid prior-art search has been run on any candidate** — this document's web research is a real sanity check, not a substitute for one.
3. **No decision has been made on whether to pursue a provisional filing, defensive publication, or neither** — §3's options are presented, not chosen; this is a business decision for the user, not one this document makes on their behalf.

---

## 7. Review Log

Reviewed 2026-07-11. One real inaccuracy found and corrected via verification, not left as an estimate.

1. **§3's provisional patent attorney-fee estimate was too low.** First draft said "$1,000–$3,000"; checked directly via web research and found the real range is $2,000–$6,000 in attorney fees, plus a separate $65–$260 USPTO filing fee depending on entity size. Corrected. The utility-patent figure ($10,000–$20,000+) was re-verified against the same research and found reasonably accurate (attorney fees alone typically $9,000–$16,000, with the "+" appropriately accounting for USPTO fees and office-action costs over a multi-year prosecution not included in that base figure) — tightened slightly for precision rather than left as a round estimate.
2. **Re-verified, held up:** the "two anchor product pitches" framing (§2.1, §2.2) against the actual Vision Document text (line 19) — confirmed both the leak-sensor and refrigeration-probe language exist there nearly verbatim, not just in session memory. USPTO patent 12532211 and the leak-detection prior-art findings (§2.1, §2.2) were re-checked against the original search results and accurately represented, not overstated.

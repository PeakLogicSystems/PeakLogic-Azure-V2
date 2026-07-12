# Architecture Artifacts

Documents are produced in dependency order — each one builds on decisions locked in by the ones before it. Later documents may force revisions to earlier ones (a doc's own governing rule, mirrored from the IronQuill project); check this table for live status before assuming anything is final.

**Note on existing code:** PeakLogicSystems already has a working v1.0.0 (infra, backend, frontend, mock-data pages) built before this architecture-first discipline was adopted (2026-07-04). That code is **reference, not authoritative** — as each artifact below is produced, the existing implementation gets formally reconciled against it (revised or rewritten where gaps surface), the same way IronQuill's Domain Model forced an SRS revision. Nothing here means throwing away validated work (e.g. the tenant-isolation RLS pattern, the CDK stack structure).

| # | Artifact | Status |
|---|----------|--------|
| 1 | [Vision Document](vision-document.md) | ✅ Approved v1 |
| 2 | [Product Requirements Document (PRD)](prd.md) | 🟡 Draft v1.6 (Internal Administration Console, Settings & Preferences, Site→Asset→Device Drill-Down — real backend/infra/frontend shipped on `dev`; base doc remains Approved v1.5 until v1.6 formally approved) |
| 3 | [Software Requirements Specification (SRS)](srs.md) | 🟡 Draft v1.6 (mirrors PRD v1.6; base doc remains Approved v1.5 until v1.6 formally approved) |
| 4 | [Domain Model](domain-model.md) | 🟡 Draft v1.2 (new §2.8 Internal Administration — `PeakLogicStaffUser`/`AccountAssignment`; base doc remains Approved v1.1 until v1.2 formally approved) |
| 5 | [Compliance & Certification Roadmap](compliance-certification-roadmap.md) | ✅ Approved v1 |
| 6 | [User Personas](user-personas.md) | ✅ Approved v1.2 (new §2.7 Channel Partner Portal Dispatcher; §2.2 corrected — pool-service companies are Channel Partners, not Tenants) |
| 7 | [User Stories](user-stories.md) | ✅ Approved v1 |
| 8 | [UX Wireframes](ux-wireframes.md) | ✅ Approved v1.3 (new §2.11–2.15 Channel Partner Portal screens — login, territory editor, technician management, daily dispatch route) |
| 9 | [Information Architecture](information-architecture.md) | ✅ Approved v1 |
| 10 | [Database Schema](database-schema.md) | 🟡 Draft v1.2 (new §4.5 Internal Administration Console Schema — `peaklogic_staff_users`/`account_assignments`, real migration shipped and typechecked; base doc remains Approved v1.1 until v1.2 formally approved) |
| 11 | [API Specification](api-specification.md) | 🟡 Draft v1.2 (new §4.7/§4.8 Admin Console + Settings endpoints — 20 new endpoints, real and shipped; base doc remains Approved v1.1 until v1.2 formally approved) |
| 12 | [Device & Command Security Architecture](device-command-security-architecture.md) | ✅ Approved v1 (implementation gated — see doc §5) |
| 13 | [Security Architecture](security-architecture.md) | 🟡 Draft v1.2 (new §2.5 Internal Administration Console Authentication — third Cognito pool `StaffPool`, `withStaffActingOnTenant()` shipped and typechecked; base doc remains Approved v1.1 until v1.2 formally approved) |
| 14 | [Multi-Tenant Architecture](multi-tenant-architecture.md) | 🟡 Draft v1.2 (new §2.6 — admin console audited as a third cross-tenant pattern, zero new operational-table policies; base doc remains Approved v1.1 until v1.2 formally approved) |
| 15 | [Deployment Architecture](deployment-architecture.md) | ✅ Approved v1 (env separation + rollback procedure shipped — commits `1ef0fdf`, `ad6203a`) |
| 16 | [Infrastructure as Code](infrastructure-as-code.md) | ✅ Approved v1 (cdk-nag adopted, all 21 findings resolved, RDS rotation shipped) |
| 17 | [CI/CD Pipeline](cicd-pipeline.md) | 🟡 Draft v0.1 (pipeline designed + implemented from scratch — commits `c818f31` + workflows) |
| 18 | [Test Strategy](test-strategy.md) | ✅ Approved v1 (Vitest stood up, 21 real tests written + verified — commit `f6da207`) |
| 19 | [Threat Model](threat-model.md) | ✅ Approved v1 (2 real findings, both fixed — commits `11d6dba`, `ea394ad`) |
| 20 | [SOC 2 Control Mapping & Evidence Plan](soc2-control-mapping.md) | ✅ Approved v1 (CC4 monitoring gap fixed, IR plan/vendor mgmt/change mgmt formalized) |
| 21 | [Patent Opportunity Analysis](patent-opportunity-analysis.md) | ✅ Approved v1 (not legal advice — see doc header; no filing action recommended now) |
| 22 | [MVP Roadmap](mvp-roadmap.md) | ✅ Approved v1.0 (Blocker #1: no AWS deploy yet; Blocker #2 resolved; §4a — channel-partner-portal amendment sequence fully closed, implementation now a sequenced §5 item) |
| 23 | [Enterprise Roadmap](enterprise-roadmap.md) | ✅ Approved v1.0 (12 initiatives synthesized from all prior artifacts, sequenced by trigger condition not calendar date) |
| 24 | [Technical Debt Register](technical-debt-register.md) | ✅ Approved v1.1 (42 items across 5 categories, none rated above Medium — TD-41/TD-42 added for the admin console's untested staff-session functions and missing frontend) |
| 25 | [Windows Endpoint Application ("The Brains")](windows-endpoint-application.md) | 🟡 Draft v1.1 (on-site Windows kiosk/gateway spec + hub fleet management/patch governance/VPN; not yet reviewed or implemented, see doc §14) |
| 26 | [iOS Application](ios-application.md) | 🟡 Draft v1.0 (new — iPhone/iPad client spec; two real gaps disclosed — no streaming/push backend exists yet, role vocabulary needs a product decision — see doc §12) |

**Note on the six 🟡 Draft v1.2/v1.6 rows above (#2–4, #10–11, #13–14):** these amendments were drafted *and their real backend/infra/frontend code shipped and verified* (typecheck, `cdk synth`, full test suite) on the `dev` branch in the same session — but the formal Draft→Approved status bump on the documents themselves was never circled back to. This is a real process gap, not a fiction: the code is real and working; the paperwork marking these six docs "Approved" is the one remaining step. Flagged here rather than silently left inconsistent.

Adapted from the IronQuill project's artifact list — items specific to IronQuill's immutable ledger (Ledger Architecture, Blockchain Migration Strategy, EPA/NJ Regulatory Requirements Matrix) are replaced here with items specific to PeakVantage's actual scope: SOC 2 readiness, and the device/command security model needed for the future actuation roadmap (see `CLAUDE.md` → "Future: Command & Control Architecture").

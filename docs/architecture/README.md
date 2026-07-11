# Architecture Artifacts

Documents are produced in dependency order — each one builds on decisions locked in by the ones before it. Later documents may force revisions to earlier ones (a doc's own governing rule, mirrored from the IronQuill project); check this table for live status before assuming anything is final.

**Note on existing code:** PeakLogicSystems already has a working v1.0.0 (infra, backend, frontend, mock-data pages) built before this architecture-first discipline was adopted (2026-07-04). That code is **reference, not authoritative** — as each artifact below is produced, the existing implementation gets formally reconciled against it (revised or rewritten where gaps surface), the same way IronQuill's Domain Model forced an SRS revision. Nothing here means throwing away validated work (e.g. the tenant-isolation RLS pattern, the CDK stack structure).

| # | Artifact | Status |
|---|----------|--------|
| 1 | [Vision Document](vision-document.md) | ✅ Approved v1 |
| 2 | [Product Requirements Document (PRD)](prd.md) | ✅ Approved v1.4 |
| 3 | [Software Requirements Specification (SRS)](srs.md) | ✅ Approved v1.4 |
| 4 | [Domain Model](domain-model.md) | ✅ Approved v1 |
| 5 | [Compliance & Certification Roadmap](compliance-certification-roadmap.md) | ✅ Approved v1 |
| 6 | [User Personas](user-personas.md) | ✅ Approved v1.1 |
| 7 | [User Stories](user-stories.md) | ✅ Approved v1 |
| 8 | [UX Wireframes](ux-wireframes.md) | ✅ Approved v1.2 |
| 9 | [Information Architecture](information-architecture.md) | ✅ Approved v1 |
| 10 | [Database Schema](database-schema.md) | ✅ Approved v1 |
| 11 | [API Specification](api-specification.md) | ✅ Approved v1 (2 open items carried forward — see doc §5/§7) |
| 12 | [Device & Command Security Architecture](device-command-security-architecture.md) | ✅ Approved v1 (implementation gated — see doc §5) |
| 13 | [Security Architecture](security-architecture.md) | ✅ Approved v1 (3 code-reconciliation fixes shipped — commit `3428f80`) |
| 14 | [Multi-Tenant Architecture](multi-tenant-architecture.md) | ✅ Approved v1 (all findings fixed — commits `cf581ee`, `e2479a6`) |
| 15 | [Deployment Architecture](deployment-architecture.md) | ✅ Approved v1 (env separation + rollback procedure shipped — commits `1ef0fdf`, `ad6203a`) |
| 16 | [Infrastructure as Code](infrastructure-as-code.md) | ✅ Approved v1 (cdk-nag adopted, all 21 findings resolved, RDS rotation shipped) |
| 17 | [CI/CD Pipeline](cicd-pipeline.md) | 🟡 Draft v0.1 (pipeline designed + implemented from scratch — commits `c818f31` + workflows) |
| 18 | [Test Strategy](test-strategy.md) | ✅ Approved v1 (Vitest stood up, 21 real tests written + verified — commit `f6da207`) |
| 19 | [Threat Model](threat-model.md) | ✅ Approved v1 (2 real findings, both fixed — commits `11d6dba`, `ea394ad`) |
| 20 | SOC 2 Control Mapping & Evidence Plan | 🔲 Not started |
| 21 | Patent Opportunity Analysis | 🔲 Not started |
| 22 | MVP Roadmap | 🔲 Not started |
| 23 | Enterprise Roadmap | 🔲 Not started |
| 24 | Technical Debt Register | 🔲 Not started |

Adapted from the IronQuill project's artifact list — items specific to IronQuill's immutable ledger (Ledger Architecture, Blockchain Migration Strategy, EPA/NJ Regulatory Requirements Matrix) are replaced here with items specific to PeakVantage's actual scope: SOC 2 readiness, and the device/command security model needed for the future actuation roadmap (see `CLAUDE.md` → "Future: Command & Control Architecture").

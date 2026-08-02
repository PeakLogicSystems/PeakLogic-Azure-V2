# Agent Operations Team — Design

**Artifact #38** · Draft v0.1 · 2026-08-01
**Status:** Design. Two agents are fully built, ten are partially built from existing subsystems, four are specified only.

---

## 1. Understanding of the environment

PeakLogic is a lightweight, cloud-native operational layer for operators of distributed
equipment — wastewater and septic, campus and assisted-living facilities, QSR sites, pools,
HVAC and refrigeration — plus the essential-service contractors who maintain them. It sits
*between* "no monitoring at all" and a full traditional SCADA installation, and can feed data
upward into an enterprise SCADA/BMS where one already exists.

Five properties of this environment constrain every agent decision below.

**1.1 Nothing is deployed.** No Azure subscription exists. Every `infra-azure/` module is
compile-validated only, and no migration has run against a real database. Agents that read
production telemetry therefore cannot be *tested* end-to-end yet, only built and unit-tested.
This is the same posture as every other subsystem here and is disclosed rather than papered over.

**1.2 The platform is multi-tenant, and isolation is the whole product.** Tenant separation is
enforced by PostgreSQL row-level security keyed on a per-transaction session variable. On
2026-08-01 it emerged that the mechanism had **never once executed successfully** in the
project's entire history — `SET LOCAL app.current_tenant_id = $1` is not valid PostgreSQL, and
every unit test mocked the client, so nothing noticed until integration tests ran for the first
time. That single fact justifies an entire agent (§3, `WARDEN-TEN`) whose only job is to prove
isolation continuously rather than assume it.

**1.3 Actuation is a hard gate, not a roadmap item.** No code path publishes a device command.
Nothing in this platform can start a pump, close a valve, or change a setpoint. Requirements
CC-3.1/CC-4.1 make this a gate rather than a not-yet.

**1.4 Cost discipline is a stated hard rule.** A cost kill switch already exists for both clouds
because of real concern about surprise bills. The instruction that *agents must never increase
cloud charges* is treated below as a design constraint with the same weight as a security
requirement.

**1.5 Much of the requested capability already exists.** Baseline/anomaly scoring, device- and
hub-silence sweeps, poison-message capture, telemetry deduplication, connection-behaviour
anomaly detection, the APIM guard, device-identity revocation, hub agent-integrity checks, PM
work-order generation, compliance report drafting, audit logging, CI with dependency auditing
and PSRule — all built and tested. The agent team is largely a matter of **naming, scheduling,
and connecting** what exists, not building from zero.

---

## 2. Three conflicts in the brief, and how they are resolved

These are stated up front because each one changes the answer materially.

### 2.1 The requested tooling contradicts the zero-cost rule

The brief names Kafka, Prometheus, Grafana, Wazuh/OSSEC, a SIEM, PagerDuty, SonarQube, Power BI
and Tableau. Every one of these needs either a paid licence or a VM/managed service to run on.
A minimal self-hosted set of them is roughly **$220–400/month**, against a platform whose budget
alert is currently set to **$5/month**.

They are also largely redundant here:

| Requested | Already present | Verdict |
|---|---|---|
| Kafka / MQTT bus | Azure IoT Hub + Event Hub; Postgres | Redundant — see §4 |
| Prometheus + Grafana | Log Analytics + App Insights + workbooks | Redundant |
| Wazuh / OSSEC / SIEM | Log Analytics (KQL) + existing audit log | Redundant at this scale |
| SonarQube | CI: typecheck, tests, `npm audit`, PSRule | Redundant |
| PagerDuty | Azure Action Groups (email/SMS/webhook) | Redundant |
| Power BI / Tableau | Existing report generator + Control Center | Redundant |

**Resolution: build every agent on infrastructure that already exists.** Timer-triggered
functions on the existing consumption plan, the Log Analytics workspace already collecting
telemetry, and Postgres as the bus of record. This is not a downgrade — a $300/month
observability stack watching an undeployed platform would be pure waste.

**The cost arithmetic**, since the rule deserves a number rather than an assurance. At full
cadence with all sixteen agents active:

| Cadence | Agents | Executions/month |
|---|---|---|
| Every 5 min | 1 | 8,640 |
| Every 15 min | 2 | 5,760 |
| Hourly | 2 | 1,440 |
| Every 6 h | 1 | 120 |
| Daily | 4 | 120 |
| Weekly | 1 | 4 |
| Event/push-driven | 5 | ~2,000 |
| **Total** | **16** | **≈ 18,100** |

Azure Functions' free grant is **1,000,000 executions and 400,000 GB-seconds per month**. The
full team consumes roughly **1.8%** of it. Log Analytics ingestion is likewise within its 5 GB
free monthly tier at this fleet size. The marginal cost is **$0.00**, and `ABACUS-FIN` (§3.7)
exists specifically to keep that claim true rather than merely asserted.

**One disclosed exception.** `KEEPER-DR`'s restore drill genuinely costs money — it creates a
scratch Postgres server, restores into it, measures, and destroys it. Roughly **$2–4 per drill**.
It is the only agent that can spend anything. **Approved 2026-08-01 at a monthly cadence**, so
the team's true marginal cost is **~$3/month**, not $0.00 — stated that way everywhere rather
than rounded down, because a cost rule that quietly excludes its own exception stops being
enforceable. `ABACUS-FIN` alerts if actual spend drifts above it.

### 2.2 Two proposed agent duties violate the platform's own safety model

The brief asks the Security agent to *apply automated patches where safe*, and the Incident
Response agent to *restart services or reroute workloads where safe*. Both contradict the
brief's own rule — *no autonomous control changes without deterministic rules and safety gates* —
and both contradict CC-3.1/CC-4.1.

They are also the wrong instinct for this domain specifically. An automated patch or service
restart during a wastewater discharge event can turn a monitoring gap into a **reportable
compliance violation**. Worse, unexplained drift and unexpected process behaviour are precisely
the signals of an intrusion in progress; an agent that "helpfully" reconciles them destroys
evidence and can complete an attacker's persistence for them.

**Resolution: agents advise, humans act.** Ceilings enforced in code:

| Capability | Permitted | Rationale |
|---|---|---|
| Read telemetry, logs, metrics, config | ✅ | Core function |
| Raise alerts, open tickets, write findings | ✅ | Advisory output |
| Open a pull request with a proposed fix | ✅ | Human reviews and merges |
| Isolate one compromised **device identity** | ✅ | Narrowest containment; reversible; already built |
| Apply a patch to running infrastructure | ❌ | Bypasses CI and change control |
| Restart a service or reroute workloads | ❌ | Masks the fault and destroys evidence |
| Change equipment state or a setpoint | ❌ | CC-3.1/CC-4.1 hard gate |
| Reconcile configuration drift automatically | ❌ | Drift may be an intrusion |

This ceiling is the assistive-AI principle the brief asks to be aligned with, and — per §7 —
it is also a commercial asset, not a limitation.

### 2.3 The reporting schedule is internally contradictory

The brief asks for a *weekly* health report, delivered *"once a week by 6:00 AM on the first
Monday of each month"* — which describes a monthly cadence. It then asks that frequency be
increasable to daily.

**Resolution: implemented as a single configurable cron expression**, defaulting to
**weekly, Monday 06:00 in the operator's local timezone**, which is the reading most consistent
with "weekly health status report" and with the request to scale *up* to daily later. Changing
to daily, monthly, or the literal first-Monday reading is a one-line config change (§5.4) with
no redesign.

**Confirmed 2026-08-01: weekly, Monday 06:00.** No longer an assumption.

---

## 3. The agent team

Sixteen agents in four divisions. Each has a **role name** (what it is) and a **callsign** (how
it is addressed on the bus and the command line).

Two structural rules make the team coherent:

- **`MARSHAL-IR` is the only agent that contacts a human.** Everything else publishes to the
  internal bus. This is what prevents fifteen agents noticing one outage from becoming fifteen
  messages at 3am.
- **`QUILL-RPT` is the only agent that composes the scheduled report.** No other agent has a
  delivery schedule of its own.

Build state is tracked honestly: **Operating** (built and tested), **Partial** (some checks
exist), **Specified** (designed, no code).

### Engineering division — protects the codebase

| # | Role | Callsign | Build | Cadence |
|---|---|---|---|---|
| 3.1 | Code Quality Inspector | `SENTRY-CQ` | Operating | Every push/PR |
| 3.2 | Release Engineer | `FORGE-CD` | Operating | On merge; manual for prod |
| 3.3 | Supply Chain Auditor | `LEDGER-SC` | Partial | Daily 04:00 |
| 3.4 | Documentation Registrar | `SCRIBE-DOC` | Specified | On merge; weekly sweep |

**3.1 `SENTRY-CQ`** — typecheck, unit + integration tests, `npm audit`, PSRule Azure checks.
Blocks merges. *Maps to brief agent #1.* Already running: `ci.yml`, 12 jobs.

**3.2 `FORGE-CD`** — builds and deploys; auto to dev, human-triggered for staging/prod; enforces
the release checklist including both guides. *Maps to brief agent #2, plus the change-management
gap.* Blocked on a real subscription.

**3.3 `LEDGER-SC`** — SBOM inventory plus a continuous advisory watch, so a package that was
clean at install time and turns vulnerable later is still caught. Opens a PR; never upgrades
unattended. *Gap — `npm audit` in CI is point-in-time only.*

**3.4 `SCRIBE-DOC`** — cross-checks both guides against the screens that actually exist, flags
capabilities described as available while still gated, hunts retired terminology. *Gap.* This
agent exists because the User Guide described an application that **was not the product** for
months, internally consistent and archived the whole time.

### Operations division — keeps the platform running

| # | Role | Callsign | Build | Cadence |
|---|---|---|---|---|
| 3.5 | Systems Health Monitor | `PULSE-OPS` | Partial | Every 5 min |
| 3.6 | Continuity & Recovery Warden | `KEEPER-DR` | Specified | Daily verify; monthly drill |
| 3.7 | Cost Guardian | `ABACUS-FIN` | Partial | Every 6 h |
| 3.8 | Configuration Steward | `MASON-CFG` | Partial | Hourly |

**3.5 `PULSE-OPS`** — infrastructure liveness: API error rates, DB CPU/connections, function
failures, ingest throughput, heartbeats. Read-only. *Maps to brief agent #3, narrowed to "is it
running" — data trustworthiness belongs to `ASSAY-DQ`.*

**3.6 `KEEPER-DR`** — verifies backups exist **and restore**, with measured recovery time and
data loss. *Gap (TD-21: never drilled).* An untested backup is not a backup; this is the
difference between a recoverable ransomware event and a terminal one.

**3.7 `ABACUS-FIN`** — spend vs budget, new billable resource detection, kill-switch arming.
*Gap, and the one that makes the never-increase-charges rule enforceable.* Note it watches **the
other agents** too.

**3.8 `MASON-CFG`** — deployed-vs-declared drift, cloud and hub. Reports; never reconciles.
*Consolidates the brief's implied config management.*

### Data & Equipment division — protects data and predicts failure

| # | Role | Callsign | Build | Cadence |
|---|---|---|---|---|
| 3.9 | Data Integrity Analyst | `ASSAY-DQ` | Partial | Every 15 min |
| 3.10 | Predictive Maintenance Analyst | `AUGUR-PDM` | Partial | Hourly + daily |
| 3.11 | Reporting Officer | `QUILL-RPT` | Partial | Weekly · configurable |
| 3.12 | Compliance Evidence Officer | `NOTARY-CMP` | Partial | Daily 05:00 |

**3.9 `ASSAY-DQ`** — physically-impossible readings, gaps, duplicates, **stuck sensors**,
calibration drift. Never interpolates: a gap is reported as a gap. *Maps to brief agent #5.*

**3.10 `AUGUR-PDM`** — per-device baselines and degradation trends; generates PM work orders.
Capped at `warning` — it may not auto-dispatch a technician, because it has no measured accuracy
yet and therefore may not spend the customer's money. *Maps to brief agent #6.*

**3.11 `QUILL-RPT`** — sole composer of the scheduled report (§5). *Maps to brief agent #8.*

**3.12 `NOTARY-CMP`** — regulatory deadlines, audit-trail continuity, SOC 2 evidence collection.
Never files with a regulator; the operator remains filer of record. *Gap — distinct from
`QUILL-RPT`, which reports on operations rather than assembling defensible evidence.*

### Security division — protects the platform and its tenants

| # | Role | Callsign | Build | Cadence |
|---|---|---|---|---|
| 3.13 | Threat Detection Officer | `AEGIS-SEC` | Partial | Every 15 min |
| 3.14 | **Tenant Isolation Prover** | `WARDEN-TEN` | Specified | Every push + hourly |
| 3.15 | Identity & Secrets Custodian | `CIPHER-IAM` | Specified | Daily 03:00 |
| 3.16 | Incident Commander | `MARSHAL-IR` | Partial | Event-driven |

**3.13 `AEGIS-SEC`** — auth anomalies, credential stuffing, API abuse, device connection-cadence
shifts, gateway bypass. May isolate one compromised device identity; may not patch or change
firewall rules. *Maps to brief agent #4, minus auto-patching (§2.2).*

**3.14 `WARDEN-TEN`** — **the highest-priority gap in this entire design.** Enumerates every
tenant-scoped table, asserts RLS is `ENABLED` *and* `FORCED`, verifies no application role holds
`BYPASSRLS`, and runs live cross-tenant probes that must return zero rows. Any finding is
critical by definition — there is no warning tier for a tenant boundary.

This agent exists because of §1.2. The isolation mechanism was broken for the project's entire
history and **nothing detected it** — not code review, not unit tests, not typechecking. A
continuous prover is the only control that would have. For a platform whose core promise is that
one utility cannot see another's data, this is the difference between believing isolation works
and knowing it.

**3.15 `CIPHER-IAM`** — certificate and secret expiry, service principals, access review,
orphaned accounts. Warns early; never rotates unattended, because a botched rotation is itself an
outage. *Gap (TD-9: certificate rotation has no owner).* Device certificates expiring
un-monitored would take **the entire fleet dark simultaneously** — a fleet-wide outage from a
calendar date, not an attack.

**3.16 `MARSHAL-IR`** — correlation, deduplication into incidents, severity arbitration,
notification, escalation. The single voice (§6). *Maps to brief agent #7, minus service restart
and workload rerouting (§2.2).*

### 3.17 Gap summary

Eight capability gaps were found in the brief's eight-agent list. Ranked by consequence:

| Gap | Agent | Why it matters here |
|---|---|---|
| **Tenant isolation verification** | `WARDEN-TEN` | The core product promise had a latent total failure nothing detected |
| **Backup restore verification** | `KEEPER-DR` | Untested backups; recovery objectives never drilled |
| **Secret & certificate lifecycle** | `CIPHER-IAM` | Fleet-wide outage from an expiry date |
| **Cost governance** | `ABACUS-FIN` | Makes the stated zero-cost rule enforceable |
| **Compliance evidence** | `NOTARY-CMP` | Audit readiness ≠ operational reporting |
| **Configuration drift** | `MASON-CFG` | Drift is both an ops signal and an intrusion signal |
| **Supply chain over time** | `LEDGER-SC` | Point-in-time audit misses newly-disclosed CVEs |
| **Documentation currency** | `SCRIBE-DOC` | A real, months-long failure already occurred |

Four overlaps in the original list were resolved rather than duplicated:

- **#3 vs #5** both watched sensor data → split: `PULSE-OPS` owns *is it running*, `ASSAY-DQ`
  owns *is the data trustworthy*.
- **#5 vs #6** both did anomaly detection → split: `ASSAY-DQ` scores *data validity*,
  `AUGUR-PDM` scores *equipment degradation*. A stuck sensor is a data fault, not a failing pump.
- **#4 vs #7** both alerted → `AEGIS-SEC` detects, `MARSHAL-IR` is the only notifier.
- **#1 vs #2** overlapped on CI → `SENTRY-CQ` is a *gate inside* `FORGE-CD`'s pipeline, not a
  parallel actor.

---

## 4. Coordination

### 4.1 The bus: Postgres now, Event Grid when it is needed

The brief specifies Kafka or MQTT. **Neither is warranted yet**, and Kafka in particular would
be the single largest line item on the Azure bill for a platform with no deployed environment.

The bus is a `agent_events` table plus a `LISTEN/NOTIFY` channel for immediate wakeups. This is
not a compromise — at this scale it is *better*, because it gives durability, replay, queryable
history and transactional consistency with the data agents are reasoning about, for zero
marginal cost.

**The topic contract below is the real interface.** It is defined so that swapping the transport
to Event Grid or Service Bus later is a publisher/subscriber config change, not an agent rewrite.
Migrate when a second consumer needs sub-second fan-out, or when event volume exceeds roughly
100k/day — neither is true today.

### 4.2 Topic contract

All seven topics from the brief are retained.

| Topic | Publishers | Subscribers |
|---|---|---|
| `health.status` | SENTRY, FORGE, LEDGER, SCRIBE, PULSE, KEEPER, ABACUS, MASON, CIPHER | QUILL, MARSHAL |
| `security.alert` | AEGIS, **WARDEN**, CIPHER, LEDGER, MASON, ABACUS, NOTARY | MARSHAL, QUILL |
| `performance.anomaly` | PULSE, AUGUR | MARSHAL, AEGIS, QUILL |
| `data.integrity.issue` | ASSAY | MARSHAL, AUGUR, NOTARY, QUILL |
| `maintenance.recommendation` | AUGUR, ASSAY | MARSHAL, QUILL |
| `incident.response` | **MARSHAL only** | QUILL, SCRIBE, FORGE, KEEPER |
| `reporting.summary` | QUILL, NOTARY | — (terminal) |

Every event carries a common envelope: `event_id`, `agent`, `topic`, `severity`, `tenant_id`
(nullable for platform-scoped), `subject`, `summary`, `evidence` (JSONB), `occurred_at`,
`correlation_id`. **`tenant_id` is on the envelope deliberately** — agent findings are themselves
tenant-scoped data and are subject to the same RLS as everything else. An agent must not become a
cross-tenant information leak.

### 4.3 Enable / disable

Agent state lives in an `agents` table (`active` / `oncall` / `off`) read at the top of each run.
The Control Center's **Agents** menu writes to it. Three consequences worth stating:

- Disabling an agent is **logged to the audit trail** — a disabled security agent is itself a
  security event.
- `WARDEN-TEN` and `MARSHAL-IR` warn on disable; without them the team has no isolation proof and
  no voice.
- Adding an agent is a registry row plus a handler module — the roster is data, not code.

---

## 5. Weekly health report pipeline

### 5.1 Contributors

All fifteen non-reporting agents publish into the window. `QUILL-RPT` composes.

### 5.2 Aggregation

1. **Collect** all `agent_events` in the window.
2. **Deduplicate** by `correlation_id` — one incident, not fifteen findings.
3. **Resolve status**: anything opened *and closed* within the window is reported as resolved,
   with time-to-resolution, not as an open issue.
4. **Rank** by severity, then by tenant impact.
5. **Compute** uptime, ingest coverage, alert volume, funnel conversion.
6. **State coverage gaps explicitly.** A silent agent produces *"no data"*, never a green tick.
   This is the same honesty rule the compliance reports already follow, and it matters more here:
   a report that renders an agent's silence as health is worse than no report.

### 5.3 Sections

Exactly the brief's six, plus two:

1. Executive summary — one paragraph, plain language
2. System uptime and availability
3. Critical incidents this period
4. Security events
5. Data integrity issues
6. Performance anomalies
7. Maintenance recommendations
8. *Added:* Cost and budget position
9. *Added:* Compliance and regulatory deadlines

### 5.4 Schedule and delivery

```jsonc
{
  "schedule": "0 6 * * 1",          // Mon 06:00 — default
  // "0 6 * * *"   daily
  // "0 6 1-7 * 1" first Monday monthly (the literal reading of the brief)
  "timezone": "America/New_York",   // ASSUMPTION — confirm
  "window": "7d",                   // follows schedule unless pinned
  "deliver": ["email", "dashboard"],
  "recipients": ["blovas@msn.com"]
}
```

Weekly → daily is a cron change. Nothing about aggregation, storage or delivery is
frequency-coupled, which is the design property the brief asked for.

---

## 6. Critical threat alert pipeline

### 6.1 Who may raise `critical`

Only five agents, deliberately:

| Agent | Critical condition |
|---|---|
| `WARDEN-TEN` | **Any** finding — no warning tier exists for a tenant boundary |
| `AEGIS-SEC` | Confirmed intrusion, credential compromise, gateway bypass |
| `ASSAY-DQ` | Corruption affecting compliance-reportable data |
| `PULSE-OPS` | Platform-wide outage or total ingest loss |
| `NOTARY-CMP` | Imminent regulatory breach or broken audit trail |

`AUGUR-PDM` is capped at `warning` — no production accuracy record. `MARSHAL-IR` arbitrates and
may *downgrade* on correlation but never upgrades on its own.

### 6.2 Critical vs warning

**Critical** — all three must hold:
1. Confirmed, not suspected (evidence attached, not a single-sample threshold)
2. Consequence is a tenant data exposure, a safety risk, a compliance breach, or total loss of
   visibility
3. Human action is needed **now** — waiting for the weekly report would make it worse

**Warning** — real, needs attention, survives until the report.

The middle case is deliberate: a *suspected* tenant leak is critical (condition 2 dominates),
while a *confirmed* single failing pump is a warning (condition 3 fails — it becomes a work
order). Getting this wrong in either direction is how alerting dies: too loose and it is ignored,
too tight and the one that mattered was suppressed.

### 6.3 Emergency action plan template

Every critical notification carries all six of the brief's required elements:

```
🔴 CRITICAL — {title}
Incident {id} · {timestamp} · raised by {agent} ({role})

WHAT HAPPENED
{plain-language description, no jargon}

IMPACTED SYSTEMS
Tenants: {names or "platform-wide"}
Sites/devices: {count and identifiers}
Data at risk: {scope}
Compliance exposure: {none | permit/framework and deadline}

IMMEDIATE ACTIONS  ← human-executed; no agent performs these
1. {most urgent, with the exact command or console path}
2. {containment}
3. {preserve evidence — do this BEFORE remediation}

ESCALATION
Now:    {you} — SMS + email + Teams
+15min: unacknowledged → repeat all channels
+30min: unacknowledged → secondary contact
+60min: unacknowledged → external IR retainer
Regulatory: CIRCIA 72h for covered incidents; state notification varies

EVIDENCE
Logs: {deep link} · Dashboard: {deep link}
Audit trail: {query} · Related: {correlation_id}
```

"Preserve evidence before remediation" is ordered third-but-first on purpose: the instinct under
pressure is to fix, and fixing frequently destroys what an investigation and a regulatory filing
both need.

### 6.4 Escalation and channels

SMS + email + Microsoft Teams simultaneously for critical. Teams rather than Slack — this is an
Entra/Azure-native platform and Teams needs no additional vendor. **Escalation is time-based on
acknowledgement, not on resolution** — an operator working the problem must never be re-paged.

**Two failure modes are designed for explicitly:**

- **Alert storms.** `MARSHAL-IR` correlates by `correlation_id` and time window before notifying.
  A site losing connectivity is one incident, not forty device-silence alerts.
- **The notifier failing silently.** `MARSHAL-IR` emits a heartbeat; `PULSE-OPS` watches it and
  falls back to an Azure Monitor Action Group directly. An alerting system whose own failure is
  undetectable is worse than none, because it manufactures false confidence.

---

## 7. Alignment and assumptions

### 7.1 Architecture alignment

✅ Cloud-native, serverless, consumption-billed · ✅ multi-tenant with RLS-scoped findings ·
✅ edge + cloud (hub agents covered by `MASON-CFG`/`AEGIS-SEC`) · ✅ Azure-native throughout,
no AWS · ✅ reuses existing subsystems rather than parallel infrastructure.

### 7.2 Safety and compliance alignment

✅ No autonomous control changes — §2.2 ceiling · ✅ every action audit-logged, including agent
enable/disable · ✅ operator remains filer of record · ✅ AI findings capped at `warning` ·
✅ CIRCIA 72-hour reporting in the escalation path.

### 7.3 Assistive-AI alignment

Every agent output is a **recommendation with a human decision in front of it**. The one
exception — isolating a single compromised device identity — is narrow, reversible, fully
audited, and already built. No agent may act on physical equipment.

### 7.4 Commercial note

The §2.2 ceiling is worth stating as a product position, not just a constraint. After the 2026
water-sector intrusions, "our monitoring platform cannot be used to actuate your equipment, by
design" is a **procurement advantage** with utility security reviewers, not a missing feature.
The agent team is the operational proof of the security-built-in posture already drafted in
artifact #37 — it demonstrates the discipline rather than asserting it. Developing that into
sales collateral remains a separate go/no-go decision.

### 7.5 Assumptions requiring confirmation

| # | Assumption | Risk if wrong |
|---|---|---|
| 1 | ~~Report cadence~~ — **CONFIRMED weekly Mon 06:00** (2026-08-01) | Resolved |
| 2 | Timezone is US Eastern | Reports arrive at the wrong hour |
| 3 | `blovas@msn.com` is the destination; **SMS number not yet provided** | Critical alerts cannot reach you by SMS |
| 4 | Teams is the messaging channel (Azure-native) | Rework if Slack is preferred |
| 5 | Postgres bus is acceptable over Kafka (§4.1) | Rework if a hard Kafka requirement exists |
| 6 | ~~`KEEPER-DR` spend~~ — **APPROVED, monthly drills** (2026-08-01) | Resolved |
| 7 | External IR retainer at +60min — **none currently exists** | Escalation dead-ends |
| 8 | Agents may open PRs but never merge | Changes velocity expectations |

### 7.6 Human validation required

1. **Severity thresholds are engineering estimates.** No production telemetry exists to tune
   against. Expect a false-positive shakedown period.
2. **No agent has run against real infrastructure.** Nothing is deployed.
3. **`WARDEN-TEN` must be built and verified before any real customer data lands.** It is the
   control that would have caught the isolation defect.
4. **The escalation chain needs real contacts** — SMS number, secondary contact, IR retainer.
5. **Regulatory triggers need legal review.** CIRCIA applicability and state notification
   thresholds vary by jurisdiction and utility class.

---

## 8. Build sequence

Ordered by consequence, not convenience.

| Phase | Agents | Rationale |
|---|---|---|
| **0 — now** | `WARDEN-TEN` | The gap with a demonstrated total failure. Runs in CI; needs no deployment. |
| **1** | `MARSHAL-IR`, `QUILL-RPT` | Without the voice and the report, other agents' findings reach no one. Cadence confirmed: weekly Mon 06:00. |
| **2** | `ABACUS-FIN`, `CIPHER-IAM` | Makes the cost rule enforceable; closes the fleet-dark expiry risk. |
| **3** | `PULSE-OPS`, `ASSAY-DQ`, `AEGIS-SEC` | Complete existing partial implementations. |
| **4** | `KEEPER-DR`, `MASON-CFG`, `NOTARY-CMP` | Need a deployed environment to be meaningful. |
| **5** | `LEDGER-SC`, `SCRIBE-DOC`, `AUGUR-PDM` | Valuable, not urgent. `AUGUR-PDM` needs real telemetry history. |

**Phase 0 is buildable today** and needs no Azure subscription — it runs against the CI Postgres
service container that already exists in `ci.yml`.

---

## 9. Appendix — agent build prompts

Modular and reusable. `{{PLACEHOLDERS}}` are the only values that change between agents.

### 9.1 Common preamble

```
You are building the {{ROLE_NAME}} ({{CALLSIGN}}) agent for the PeakLogic platform.

CONSTRAINTS — non-negotiable:
  1. Never increase Azure spend. Timer-triggered function on the existing
     consumption plan. No new billable resource. No Kafka, Prometheus,
     Grafana, or SIEM.
  2. Advisory only. You may read, analyse, publish findings, and open pull
     requests. You may NOT patch, restart, reroute, reconcile, or actuate.
  3. Findings are tenant-scoped data. Publish through withTenant(); never
     let a finding cross a tenant boundary.
  4. Never fabricate. Missing data is reported as a gap, never interpolated,
     never rendered as healthy.
  5. Follow the repo pattern: pure logic + handler + .main.ts Timer trigger,
     unit-tested with no Azure dependency.

STRUCTURE:
  backend/agents/{{slug}}.ts          — pure, testable logic
  backend/agents/{{slug}}-handler.ts  — tenant fan-out, bus publication
  backend/agents/{{slug}}.main.ts     — Timer trigger, schedule {{CRON}}
  backend/agents/{{slug}}.test.ts     — unit tests, no live dependency

BUS: publish to {{PUBLISHES}}; subscribe to {{SUBSCRIBES}}.
     Envelope: event_id, agent, topic, severity, tenant_id, subject,
     summary, evidence, occurred_at, correlation_id.

SEVERITY CEILING: {{MAX_SEVERITY}}.
```

### 9.2 Per-agent parameters

| Callsign | Slug | Cron | Max severity | Publishes |
|---|---|---|---|---|
| `SENTRY-CQ` | `code-quality` | *(CI)* | `warning` | `health.status` |
| `FORGE-CD` | `release` | *(CI)* | `warning` | `health.status`, `incident.response` |
| `LEDGER-SC` | `supply-chain` | `0 0 4 * * *` | `critical` | `security.alert`, `health.status` |
| `SCRIBE-DOC` | `doc-registrar` | `0 0 5 * * 1` | `warning` | `health.status` |
| `PULSE-OPS` | `sys-health` | `0 */5 * * * *` | `critical` | `performance.anomaly`, `health.status` |
| `KEEPER-DR` | `continuity` | `0 0 2 * * *` verify · `0 0 3 1 * *` drill | `critical` | `health.status`, `incident.response` |
| `ABACUS-FIN` | `cost-guardian` | `0 0 */6 * * *` | `critical` | `security.alert`, `health.status` |
| `MASON-CFG` | `config-steward` | `0 0 * * * *` | `warning` | `security.alert`, `health.status` |
| `ASSAY-DQ` | `data-integrity` | `0 */15 * * * *` | `critical` | `data.integrity.issue`, `maintenance.recommendation` |
| `AUGUR-PDM` | `predictive` | `0 0 * * * *` | **`warning`** | `maintenance.recommendation`, `performance.anomaly` |
| `QUILL-RPT` | `reporting` | `0 0 6 * * 1` | `info` | `reporting.summary` |
| `NOTARY-CMP` | `compliance` | `0 0 5 * * *` | `critical` | `reporting.summary`, `security.alert` |
| `AEGIS-SEC` | `threat-detect` | `0 */15 * * * *` | `critical` | `security.alert` |
| `WARDEN-TEN` | `tenant-prover` | `0 0 * * * *` | **`critical` always** | `security.alert` |
| `CIPHER-IAM` | `identity-custodian` | `0 0 3 * * *` | `critical` | `security.alert`, `health.status` |
| `MARSHAL-IR` | `incident-cmd` | *(event)* | `critical` | `incident.response` |

### 9.3 Worked example — `WARDEN-TEN` (build this first)

```
[COMMON PREAMBLE with ROLE_NAME="Tenant Isolation Prover", CALLSIGN="WARDEN-TEN",
 slug="tenant-prover", CRON="0 0 * * * *", MAX_SEVERITY="critical (always)",
 PUBLISHES="security.alert", SUBSCRIBES="none"]

SCOPE — prove continuously that no tenant can read another tenant's data.

CHECKS, each must pass:
  1. Every tenant-scoped table has RLS ENABLED and FORCED.
       -> pg_class.relrowsecurity AND relforcerowsecurity
  2. Every such table has at least one policy referencing the tenant setting.
  3. No application-used role holds BYPASSRLS or is a superuser.
  4. LIVE PROBE: open a transaction as tenant A, query every tenant-scoped
     table, assert zero rows belonging to tenant B. Repeat A<->B.
  5. Session variable actually applies — set_config() took effect and reverts
     at transaction end.
       -> This check exists because `SET LOCAL x = $1` silently never worked
          for this project's entire history. Assert the mechanism, not just
          the policy text.

FAILURE HANDLING:
  - ANY failed check is critical. There is no warning tier for a tenant
    boundary. Do not add one.
  - In CI: fail the build. In production: raise critical immediately.
  - Report the failing table and check; NEVER include leaked row contents in
    the finding — the alert must not become a second exposure.

RUN:
  npm run agent -- WARDEN-TEN --once --fail-on-any
  npm run agent -- WARDEN-TEN --prove-table telemetry

BUILD AGAINST the existing CI Postgres service in ci.yml. This agent needs no
Azure subscription and can ship today.
```

### 9.4 Worked example — `MARSHAL-IR` (the only notifier)

```
[COMMON PREAMBLE with ROLE_NAME="Incident Commander", CALLSIGN="MARSHAL-IR",
 slug="incident-cmd", CRON="event-driven", MAX_SEVERITY="critical",
 PUBLISHES="incident.response", SUBSCRIBES="all topics except reporting.summary"]

SCOPE — the only agent that contacts a human. Correlate, decide severity,
notify once, escalate on silence.

PIPELINE:
  1. CORRELATE — group by correlation_id and a 5-minute window. A site losing
     connectivity is ONE incident, not forty device-silence alerts.
  2. ARBITRATE — apply the §6.2 three-part critical test. You may DOWNGRADE on
     correlation; you may never upgrade an agent's own ceiling.
  3. COMPOSE — the §6.3 template, all six elements, no field left blank.
     Order "preserve evidence" BEFORE remediation steps.
  4. NOTIFY — critical: SMS + email + Teams simultaneously.
                warning: queue for the next scheduled report.
  5. ESCALATE — on ACKNOWLEDGEMENT, not resolution. Never re-page an operator
     who is already working the problem.
       +15m -> repeat all channels
       +30m -> secondary contact
       +60m -> external IR retainer

SELF-MONITORING: emit a heartbeat PULSE-OPS can watch, with a direct Azure
Monitor Action Group fallback. An alerting system whose own failure is
undetectable manufactures false confidence.

MAY NOT: restart services, reroute workloads, apply patches, or change
equipment state. Recommend them in the action plan for a human to execute.
```

---

## 10. Open items

- [x] ~~Confirm report cadence~~ — **weekly Mon 06:00**, confirmed 2026-08-01. Timezone still assumed US Eastern.
- [ ] Provide SMS number and secondary escalation contact
- [ ] Confirm Teams over Slack
- [x] ~~`KEEPER-DR` spend~~ — **approved, monthly drills (~$3/mo)**, confirmed 2026-08-01
- [ ] **Build `WARDEN-TEN`** — phase 0, needs no subscription
- [ ] Legal review of CIRCIA/state regulatory triggers
- [ ] Go/no-go on §7.4 sales collateral

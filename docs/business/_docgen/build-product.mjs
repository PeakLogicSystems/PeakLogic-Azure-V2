import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cover, toc, docShell } from './style.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..');

const body = `
${cover({
  kicker: 'Product overview',
  title: 'An intelligence layer for essential field services',
  sub: 'What PeakLogic is, what it does, and — stated separately — what is built, what is designed, and what is roadmapped.',
  meta: [
    { k: 'Document', v: 'Artifact #40 · v1.0' },
    { k: 'Prepared', v: '2 August 2026' },
    { k: 'Platform', v: 'Azure-native · multi-tenant' },
    { k: 'Status', v: 'Pre-deployment' },
  ],
})}

${toc([
  { t: 'What PeakLogic is', d: 'The gap between an autodialer and SCADA' },
  { t: 'The four-step chain', d: 'Monitor, predict, dispatch, prove' },
  { t: 'Platform architecture', d: 'Five layers and four surfaces' },
  { t: 'Tenant isolation', d: 'Why a refusal beats an approximation' },
  { t: 'Product packs', d: 'Packaged by what the site actually is' },
  { t: 'Capability by build state', d: 'Built, designed, roadmapped' },
  { t: 'Deployment', d: 'Azure-native, outbound-only' },
  { t: 'What PeakLogic will not do', d: 'Boundaries held on purpose' },
])}

<main>

<section>
  <h2>What PeakLogic is</h2>
  <p class="lede">PeakLogic connects the equipment a business already operates and services — pumps, treatment units, chemistry, refrigeration — to monitoring, alerts, automation, and dispatch. Issues surface early, and the right work lands in the right system.</p>
  <p>It sits between two bad options. <b>Autodialers</b> are cheap and call once the water is already too high. <b>Traditional SCADA</b> produces excellent data and is priced and scoped as a capital project. Most distributed assets — lift stations, aerobic treatment units, package plants, commercial pools, walk-in refrigeration, light commercial mechanical rooms — fall into the gap and are monitored by nobody.</p>
  <p>Where a plant already runs SCADA, PeakLogic complements it: instrumenting the long tail that platform cannot economically reach, and feeding normalised data upward into it. It does not replace safety-rated control logic.</p>
</section>

<section>
  <h2>The four-step chain</h2>
  <p class="dek">Most competitors stop after the first step, which is why an alarm reaches a phone and nothing else happens.</p>
  <div class="cards c4">
    <div class="card"><span class="card__k">01 · Monitor</span><h4>Connect what exists</h4><p>Mixed-vendor equipment on one platform, over cellular or the site's own network.</p></div>
    <div class="card"><span class="card__k">02 · Predict</span><h4>Read the warning</h4><p>Per-asset baselines catch degradation — rising draw, longer cycles, drifting chemistry — before the failure it becomes.</p></div>
    <div class="card"><span class="card__k">03 · Dispatch</span><h4>Land the work</h4><p>An alarm becomes a work order in the servicing partner's own system, routed to whoever is accountable.</p></div>
    <div class="card"><span class="card__k">04 · Prove</span><h4>Keep the evidence</h4><p>The record a regulator, an insurer, or a disputing customer asks for, compiled as it happens.</p></div>
  </div>
</section>

<section>
  <h2>Platform architecture</h2>
  <p class="dek">Five named layers. The two on the outside — equipment and the people who service it — are the only ones a customer thinks about.</p>
  <figure>
    <div class="stack">
      <div class="stack__flow">Equipment · pumps, blowers, chemistry, refrigeration</div>
      <div class="stack__row">
        <div class="stack__l">Edge</div>
        <div class="stack__r"><div class="stack__n">PeakLogic <em>Hub</em></div>
          <div class="stack__d">On-site gateway. Acquires from PLCs and RTUs, normalises to engineering units, serves PeakView360 over the LAN, and stores and forwards when the link drops.</div></div>
      </div>
      <div class="stack__flow">↑ outbound MQTT / TLS · per-device certificates · no inbound rule</div>
      <div class="stack__row">
        <div class="stack__l">Cloud</div>
        <div class="stack__r"><div class="stack__n">PeakLogic<em>Systems</em></div>
          <div class="stack__d">Multi-tenant SaaS. Ingest and deduplication, threshold and anomaly evaluation, compliance reporting, and work-order dispatch into the partner's own CMMS.</div></div>
      </div>
      <div class="stack__row">
        <div class="stack__l">Operations</div>
        <div class="stack__r"><div class="stack__n">Agent team</div>
          <div class="stack__d">Sixteen background agents across engineering, operations, data, and security. Every one proposes; an operator authorises; the action is audited to that operator, never to the agent.</div></div>
      </div>
      <div class="stack__row">
        <div class="stack__l">Operator HMI</div>
        <div class="stack__r"><div class="stack__n">PeakView<em>360</em></div>
          <div class="stack__d">Live per-site view — Facility View, Historian, Equipment, and a docked alarm panel. Runs against the cloud, or against the Hub on the local network when the site is offline.</div></div>
      </div>
      <div class="stack__row">
        <div class="stack__l">Help</div>
        <div class="stack__r"><div class="stack__n">Peak<em>Assist</em></div>
          <div class="stack__d">Contextual guidance on every screen and an explanation attached to every alarm type, shipped as a versioned bundle so it works on a Hub with no connectivity.</div></div>
      </div>
      <div class="stack__flow">Surfaces · Customer Portal · Partner Portal · Control Center</div>
    </div>
    <figcaption class="cap">Data moves upward only. No layer in this diagram issues a command downward to equipment — see §6.</figcaption>
  </figure>

  <h3>Front-end surfaces</h3>
  <p>Three portals and one operator app — not one application with role-based menus.</p>
  <div class="cards c2">
    <div class="card"><h4>Customer Portal</h4><p>Equipment owners. Their sites, their alerts, their compliance reports. Read-only: the customer watches, the partner services.</p></div>
    <div class="card"><h4>Partner Portal</h4><p>A service company's whole book of business. White-labelled per partner, with branding configured centrally.</p></div>
    <div class="card"><h4>Control Center</h4><p>PeakLogic staff only. Fleet overview by fan-out, audited act-as, device twins, firmware channels, branding, and the agent team.</p></div>
    <div class="card"><h4>PeakView360</h4><p>Launched from inside a portal for a given site. Not a separate login.</p></div>
  </div>
</section>

<section>
  <h2>Tenant isolation</h2>
  <p>Every tenant-scoped query runs inside a transaction that sets <code>app.current_tenant_id</code>, activating PostgreSQL row-level security. Partner and staff contexts have their own equivalents.</p>
  <div class="pull"><p>A site the platform holds no data for is <em>refused</em>, not approximated. The operator view renders nothing rather than falling back to another customer's facility — because a monitoring product that displays the nearest available plant is worse than one that displays none.</p></div>
</section>

<section>
  <h2>Product packs</h2>
  <p class="dek">Packaged by what the site is, because a lift station and a hotel pool need different thresholds, different reports, and different words.</p>
  <table class="tbl">
    <thead><tr><th>Pack</th><th>Contents</th></tr></thead>
    <tbody>
      <tr><td><b>Lift Station</b></td><td>Control panel upgrade, pump alternation and level logic, fleet view, critical work orders</td></tr>
      <tr><td><b>ATU Compliance</b></td><td>Panel or gateway, treatment monitoring, service reminders, compliance reports</td></tr>
      <tr><td><b>Integrated Site</b></td><td>Every lift station and treatment unit on one property, one dashboard</td></tr>
      <tr><td><b>WWTP Lite</b></td><td>Aeration, lift station, and disinfection monitoring for package plants</td></tr>
      <tr><td><b>Pool</b></td><td>Chemistry, ORP, salt cell, filter pressure, pump speed, turnover</td></tr>
      <tr><td><b>Cold Chain</b></td><td>Walk-in and rack temperature, compressor short-cycling, door events</td></tr>
      <tr><td><b>Living Campus</b></td><td>Assisted living and healthcare: HVAC comfort, kitchen cold, generator exercise, DHW, leak detection</td></tr>
    </tbody>
  </table>
</section>

<section>
  <h2>Capability by build state</h2>
  <p class="dek">Stated separately, because the credibility of the first list depends on not quietly merging it with the third.</p>

  <h3><span class="tag tag--pos">Built and tested</span></h3>
  <ul>
    <li><b>Telemetry ingest</b> with at-least-once deduplication, poison-message capture, and range sanitising. A bad PLC read never becomes a fabricated reading.</li>
    <li><b>Threshold alerting</b> — per-category rule sets plus a config-driven Policy Engine with platform, tenant, site, and asset overrides. The compiled rules remain the permanent fail-safe: a safety monitor must never fail into silence.</li>
    <li><b>Anomaly detection (Tier 1)</b> — per-device EWMA baselines and sigma scoring, capped at warning severity because it has no measured precision yet and so cannot dispatch a technician.</li>
    <li><b>Device- and Hub-silence detection</b> — absence is a signal. Every threshold rule needs a value to test, so a dead sensor would otherwise be indistinguishable from a healthy one.</li>
    <li><b>Connection-behaviour anomaly</b> — reporting cadence scored the same way a telemetry value is. An unusually short interval reads as flooding or replay; a long one is an early warning before full silence.</li>
    <li><b>Hub agent integrity</b> — a reported agent version PeakLogic never published raises a tamper alert.</li>
    <li><b>CMMS work-order lifecycle</b> — the dispatch funnel tracked on timestamps rather than a status enum, producing a real conversion metric and a service-visit record.</li>
    <li><b>Compliance report generation</b> — DMR drafts with coverage-gap honesty: a parameter with no readings is reported as a gap, never interpolated. The operator remains filer of record.</li>
    <li><b>PeakAssist</b> — authored content with governance tests that fail the build if a screen has no guide or an alarm type has no explanation.</li>
    <li><b>Telemetry normalisation</b> — raw values to engineering units, with unmapped and rejected states that are never silently dropped.</li>
    <li><b>Facility View</b> — projected isometric scene per site, with orthographic views and locate-by-sensor-type.</li>
  </ul>

  <h3><span class="tag tag--warn">Designed, not built</span></h3>
  <ul>
    <li>Predictive maintenance Tier 2 (failure-mode prediction) and prescriptive Tier 3 (LLM enrichment)</li>
    <li>Four of the sixteen agents, including the tenant-isolation prover — the highest-priority gap in the platform</li>
    <li>Compliance evidence packs, restore drills, secrets and certificate lifecycle</li>
  </ul>

  <h3><span class="tag tag--acc">Roadmapped</span></h3>
  <p><b>Actuation.</b> No code path issues a device command today and no permission grants one. Control is planned, because operators will want remote reset, setpoint change, and shutoff. The authorisation model, safety interlocks, and audit trail are being designed <em>before</em> any command path exists, and safety-critical trips will stay local to the equipment rather than depending on a cloud round trip.</p>
  <p>Also roadmapped: Facility Builder authoring, site photography as a live-view backdrop. Cross-tenant benchmarking is explicitly <b>not</b> built and carries real legal caveats.</p>
</section>

<section>
  <h2>Deployment</h2>
  <p>Azure-native throughout: IoT Hub with DPS, Azure Functions on Flex Consumption, API Management, PostgreSQL Flexible Server with PostGIS, Microsoft Entra External ID across three isolated tenants, Key Vault, and Application Insights — all defined in Bicep.</p>
  <p>Devices connect <b>outbound</b> over MQTT/TLS with per-device certificates. No inbound firewall rule, port forward, or dedicated VLAN is ever required on a customer network — which matters, because most target customers will not grant them.</p>
  <div class="pull"><p>No environment has been deployed. Infrastructure is compile-validated, and CI runs typecheck, unit tests, integration tests against real PostgreSQL, dependency audit, and best-practice checks on every push. Everything above describes code that exists and is tested — not code that is running in production.</p></div>
</section>

<section>
  <h2>What PeakLogic will not do</h2>
  <ul>
    <li>Replace a permitted, safety-rated PLC without an equipment-maker partner</li>
    <li>Submit filings to a regulator, or assume regulatory responsibility</li>
    <li>Replace a licensed inspector</li>
    <li>Build a city-wide hydraulic model</li>
    <li>Train models across tenants, or benchmark one customer against another</li>
  </ul>
</section>

<p class="foot">PeakLogic · Product Description · Artifact #40 v1.0 · Prepared 2 August 2026. Build states are accurate as of this date and are maintained in the repository alongside the code they describe. Confidential.</p>
</main>`;

writeFileSync(join(out, 'peaklogic-product-description.html'), docShell('PeakLogic — Product Description', body));
console.log('product description built');

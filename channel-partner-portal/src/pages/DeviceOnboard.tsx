import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle, CheckCircle2, Cpu, Layers, Loader2, PackageCheck, RadioTower, RotateCcw, Router } from 'lucide-react';
import { usePartner } from '@/PartnerContext';
import { siteById } from '@/data/types';
import {
  HUB_MODELS,
  REGISTRATION_CHANNEL,
  SERIAL_SHAPE,
  channelVersion,
  nextHubId,
  type HubModel,
} from '@/data/hubs';

// Onboarding wizard for BOTH kinds of hardware a partner installs.
//
// TWO DIFFERENT NUMBERS, and conflating them was the original bug:
//
//   Serial number   printed on the hardware by whoever manufactured it. The
//                   installer reads it off a label. We never invent it and we
//                   never constrain its format beyond "looks like a serial".
//
//   Device ID       assigned BY PeakLogicSystems, unique, and sequential within
//                   that customer's own series. The installer never types it and
//                   never chooses it — it is issued on claim and displayed back.
//
// Earlier the form demanded a serial matching one customer's ID convention,
// which rejected other partners' real serials outright.
//
// Rewritten 2026-08-02 after two real problems:
//
//   1. It only ever provisioned sensors, but a site also needs a PeakLogic Hub
//      — and the Hub is what turns on the live Facility View. There was no way
//      to register one, and nothing on screen said which kind of thing you were
//      registering.
//
//   2. It demanded serials matching `PLG-XXXX`. WTR DR's own devices are
//      `WTR-2001`. An installer typing a real serial off their own equipment
//      was told it "doesn't look right". The form was enforcing one customer's
//      numbering on every partner.
//
// So: pick what you are installing first, then the form matches it. Validation
// is permissive by design — it checks the serial is plausibly a serial and that
// it is not already in service, and otherwise trusts what is printed on the
// label. Rejecting a valid serial costs a truck roll; accepting an odd-looking
// one costs nothing, because the claim is verified server-side anyway.
//
// HUB IDs ARE NOT CUSTOMER-SCOPED. They come from one platform-wide sequence
// (PLH-00042) that never reissues a number, including after a decommission —
// the full reasoning is in data/hubs.ts, and it is the reason this screen no
// longer derives an ID from the customer's name. Sensors keep the customer
// series, because a sensor belongs to that customer's equipment and stays with
// it; a Hub is PeakLogic's own hardware passing through.
//
// A serial already provisioned into stock by staff is ADOPTED here, keeping the
// ID it was issued at provisioning. The alternative — minting a second ID for
// hardware the platform already counted — would put the same physical box in
// the asset register twice.
//
// PREVIEW MODE. No API client exists yet. The flow, validation and failure
// states are real. When the backend is wired, the calls are:
//
//   Hub     POST /v1/hubs             { serial, model, siteId }
//   Device  POST /v1/devices          { serial }          -> claims it
//           PUT  /v1/devices/{id}     { siteId, assetId } -> assigns it

type Kind = 'hub' | 'device';
type Step = 'kind' | 'serial' | 'assign' | 'done';

function customerPrefix(source: string): string {
  return source.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'PLG';
}

/** The next ID in this CUSTOMER's sensor series — sensors only. */
function nextSensorId(source: string, existing: string[]): string {
  const used = existing
    .map((id) => {
      const m = id.match(/(\d+)\s*$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const next = (used.length ? Math.max(...used) : 1000) + 1;
  return `${customerPrefix(source)}-${next}`;
}

const KIND_META: Record<Kind, { label: string; sub: string; icon: typeof Cpu; example: string; where: string }> = {
  hub: {
    label: 'PeakLogic Hub',
    sub: 'The on-site gateway. It serves the live Facility View over the local network and forwards data to the cloud. A site can carry several — one per acquisition point.',
    icon: Router,
    example: '4K8M20719334',
    where: 'Printed beneath the barcode on the label on the underside of the Hub.',
  },
  device: {
    label: 'Sensor or device',
    sub: 'A single instrument — pump, chemistry probe, level, pressure, temperature. Reports through the site’s Hub.',
    icon: Cpu,
    example: 'B31P4T2207645',
    where: 'Printed beneath the barcode on the label on the back of the sensor.',
  },
};

export function DeviceOnboard() {
  const navigate = useNavigate();
  const { siteId: siteIdParam } = useParams();
  const { partner, addDevice, hubs, addHub } = usePartner();
  const t = partner.terms;

  const [kind, setKind] = useState<Kind | null>(null);
  const [step, setStep] = useState<Step>('kind');
  const [serial, setSerial] = useState('');
  const [model, setModel] = useState<HubModel>('hub-200');
  const [label, setLabel] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');

  const [siteId, setSiteId] = useState(siteIdParam ?? '');
  const [assetId, setAssetId] = useState('');

  const site = siteId ? siteById(partner, siteId) : undefined;

  // In preview the assets available at a site are its existing devices — enough
  // to exercise the real selection flow without a second fixture that would
  // drift from the portal's own data.
  const assets = useMemo(() => (site ? site.devices : []), [site]);

  const claimed = serial.trim().toUpperCase();

  /** The stock unit this serial belongs to, if staff already provisioned it. */
  const stockUnit = useMemo(
    () => hubs.find((h) => h.state === 'available' && h.serial.toUpperCase() === claimed),
    [hubs, claimed],
  );

  // Allocated once the serial is accepted.
  //
  // Hubs draw from the PLATFORM sequence — next available across the whole
  // fleet, every partner and every customer — while sensors draw from the
  // customer's own series. Two different registers, because they are two
  // different kinds of property.
  const assignedId = useMemo(() => {
    if (kind === 'hub') return stockUnit ? stockUnit.id : nextHubId(hubs);
    const customer = site?.customer ?? partner.name;
    return nextSensorId(customer, partner.sites.flatMap((sx) => sx.devices.map((d) => d.id)));
  }, [kind, stockUnit, hubs, site, partner]);

  // A Hub in stock already knows what it is — the model is a fact about the
  // hardware, not a choice the installer gets to make about a unit that shipped.
  const effectiveModel: HubModel = stockUnit ? stockUnit.model : model;

  const handleClaim = async () => {
    if (!claimed || !kind) return;
    setClaiming(true);
    setClaimError('');
    await new Promise((r) => setTimeout(r, 500));

    // Compare serials with serials. The previous check compared the entered
    // serial against assigned Device IDs, which are a different namespace
    // entirely — it could not detect a genuine duplicate.
    const deviceInService = partner.sites.some((s) =>
      s.devices.some((d) => (d.serial ?? '').toUpperCase() === claimed),
    );
    // A Hub already deployed somewhere. Stock units are excluded — those are
    // exactly the ones this flow is meant to claim.
    const hubInService = hubs.some((h) => h.serial.toUpperCase() === claimed && h.state !== 'available');
    const inService = kind === 'hub' ? hubInService : deviceInService;

    if (!SERIAL_SHAPE.test(claimed)) {
      setClaimError(
        'That does not look like a serial number. Enter it exactly as printed on the label — letters and numbers, usually with a dash.',
      );
    } else if (inService) {
      setClaimError(
        `${claimed} is already claimed and in service. If that is wrong, contact PeakLogic support — do not re-provision hardware that is live at another ${t.siteSingular.toLowerCase()}.`,
      );
    } else {
      setStep('assign');
    }
    setClaiming(false);
  };

  // Register it. This is the step that was missing: the wizard validated a
  // serial and issued an ID, then discarded both, so nothing the installer did
  // appeared anywhere afterwards.
  const register = () => {
    if (!siteId || !kind) return;
    if (kind === 'hub') {
      addHub({
        serial: claimed,
        model: effectiveModel,
        siteId,
        customer: site?.customer ?? partner.name,
        label: label.trim() || undefined,
      });
    } else {
      addDevice(siteId, {
        id: assignedId,
        serial: claimed,
        name: assets.find((a) => a.id === assetId)?.name ?? 'New sensor',
        type: 'Sensor',
        status: 'online',
        reading: '—',
        controllable: false,
      });
    }
    setStep('done');
  };

  const reset = () => {
    setKind(null);
    setStep('kind');
    setSerial('');
    setLabel('');
    setModel('hub-200');
    setSiteId(siteIdParam ?? '');
    setAssetId('');
    setClaimError('');
  };

  const backTo = siteIdParam ? `/sites/${siteIdParam}` : '/';
  const meta = kind ? KIND_META[kind] : null;

  const card = 'rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900';
  const field =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-partner-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white';
  const primaryBtn =
    'inline-flex items-center justify-center gap-2 rounded-lg bg-partner-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
  const secondaryBtn =
    'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200';

  const STEPS: { key: Step; label: string }[] = [
    { key: 'kind', label: 'What' },
    { key: 'serial', label: 'Serial' },
    { key: 'assign', label: 'Where' },
  ];
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="mx-auto max-w-xl p-6">
      <Link
        to={backTo}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft size={14} /> Back to {siteIdParam ? t.siteSingular.toLowerCase() : 'home'}
      </Link>

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Install hardware</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Register a Hub or a sensor and put it where it belongs.
        </p>
      </div>

      <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Preview data — this walks the real flow but does not register hardware yet.
      </div>

      {step !== 'done' && (
        <div className="mb-7 flex items-center">
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div key={s.key} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div
                    className={[
                      'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                      done ? 'bg-emerald-500 text-white' : '',
                      active ? 'bg-partner-primary text-white' : '',
                      !done && !active ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500' : '',
                    ].join(' ')}
                  >
                    {done ? <CheckCircle2 size={14} /> : i + 1}
                  </div>
                  <span className={`text-sm font-medium ${active ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && <div className={`mx-4 h-px w-12 ${done ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 1. What are you installing? ── */}
      {step === 'kind' && (
        <div className="flex flex-col gap-3">
          {(Object.keys(KIND_META) as Kind[]).map((k) => {
            const m = KIND_META[k];
            const Icon = m.icon;
            const hubsHere = k === 'hub' && site ? hubs.filter((h) => h.siteId === site.id && h.state !== 'decommissioned').length : 0;
            return (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  setStep('serial');
                }}
                className={`${card} flex items-start gap-4 text-left transition-colors hover:border-partner-primary`}
              >
                <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-partner-primary/10">
                  <Icon size={21} className="text-partner-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white">{m.label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{m.sub}</p>
                  {hubsHere > 0 && (
                    <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      {hubsHere === 1 ? '1 Hub is' : `${hubsHere} Hubs are`} already registered at this{' '}
                      {t.siteSingular.toLowerCase()}. Adding another is normal — one per acquisition point.
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── 2. Serial ── */}
      {step === 'serial' && meta && (
        <div className={card}>
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-partner-primary/10">
              <meta.icon size={20} className="text-partner-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Serial number</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{meta.where}</p>
            </div>
          </div>

          {claimError && (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              {claimError}
            </div>
          )}

          <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-partner-primary dark:border-slate-700">
            <span className="grid place-items-center border-r border-slate-300 bg-slate-50 px-3 font-mono text-xs font-bold tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              S/N
            </span>
            <input
              autoFocus
              value={serial}
              onChange={(e) => setSerial(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleClaim()}
              placeholder={meta.example}
              aria-label={`${meta.label} serial number`}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="w-full bg-white px-3 py-2 font-mono text-sm tracking-wider text-slate-900 outline-none dark:bg-slate-950 dark:text-white"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Typically 10–16 letters and numbers, printed beneath the barcode — for example{' '}
            <span className="font-mono">{meta.example}</span>. Dashes are optional.
          </p>
          {/* Model matters because the release channel is per model — see
              data/hubs.ts. Hidden entirely once the serial matches stock: the
              unit already shipped as a specific model, and offering a choice
              there invites someone to record the wrong one. */}
          {kind === 'hub' && !stockUnit && (
            <>
              <label className="mb-1.5 mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value as HubModel)} className={field}>
                {(Object.keys(HUB_MODELS) as HubModel[]).map((m) => (
                  <option key={m} value={m}>
                    {HUB_MODELS[m].name} — {HUB_MODELS[m].protocols}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-400">{HUB_MODELS[model].sub}</p>
            </>
          )}

          {kind === 'hub' && stockUnit && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              <PackageCheck size={15} className="mt-0.5 flex-none" />
              <span>
                Recognised — PeakLogic provisioned this {HUB_MODELS[stockUnit.model].name} as{' '}
                <span className="font-mono font-bold">{stockUnit.id}</span>. It keeps that ID; registering it here just
                puts it on site.
              </span>
            </p>
          )}

          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            You do not name the hardware. PeakLogic assigns its ID automatically once the serial is accepted —{' '}
            {kind === 'hub'
              ? 'the next available Hub in the platform sequence.'
              : `next in ${site ? site.customer : 'this customer'}'s device series.`}
          </p>

          <div className="mt-6 flex gap-2">
            <button onClick={handleClaim} disabled={!serial.trim() || claiming} className={`${primaryBtn} flex-1`}>
              {claiming ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Checking…
                </>
              ) : (
                `Claim ${kind === 'hub' ? 'Hub' : 'device'}`
              )}
            </button>
            <button onClick={() => setStep('kind')} className={secondaryBtn}>
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── 3. Where ── */}
      {step === 'assign' && meta && (
        <div className={card}>
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 dark:bg-emerald-950">
              <CheckCircle2 size={20} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">
                <span className="font-mono">{claimed}</span> claimed
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Now choose where it is installed.</p>
            </div>
          </div>

          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">{t.siteSingular}</label>
          <select
            value={siteId}
            onChange={(e) => {
              setSiteId(e.target.value);
              setAssetId('');
            }}
            className={field}
          >
            <option value="">Select a {t.siteSingular.toLowerCase()}…</option>
            {partner.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.customer}
              </option>
            ))}
          </select>

          {/* A Hub belongs to the site, not to a piece of equipment — so this
              step only asks about equipment for a sensor. */}
          {kind === 'device' && (
            <>
              <label className="mb-1.5 mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Equipment <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <select value={assetId} onChange={(e) => setAssetId(e.target.value)} disabled={!siteId} className={`${field} disabled:opacity-50`}>
                <option value="">{siteId ? 'Not attached to specific equipment' : `Select a ${t.siteSingular.toLowerCase()} first`}</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.type}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-400">
                You can attach it to equipment later — the device is claimed either way.
              </p>
            </>
          )}

          {/* Several Hubs at one site is normal — a plant's headworks and its
              chem building are different acquisition points. The label is what
              an operator picks between in the Facility View, so it is worth
              asking for at install rather than leaving three units called
              "PeakLogic Hub". */}
          {kind === 'hub' && (
            <>
              <label className="mb-1.5 mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Where on site <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Headworks, chem building, pump room…"
                className={field}
              />
              <p className="mt-1.5 text-xs text-slate-400">
                What operators call this spot. It labels the Hub in the Facility View switcher.
              </p>
            </>
          )}

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {kind === 'hub' ? 'Hub ID' : 'Device ID'} — assigned by PeakLogic
            </p>
            <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-white">{assignedId}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {kind === 'hub'
                ? stockUnit
                  ? 'Already issued when PeakLogic provisioned this unit into stock. A Hub keeps one ID for its whole service life, across every site it is ever installed at.'
                  : 'The next available Hub in the platform sequence. Hub IDs are PeakLogic-issued and never reused — not even after a decommission.'
                : `Next in ${site ? site.customer : 'this customer'}'s device series. Nothing to type: the serial stays with the hardware, this is how the platform refers to it.`}
            </p>
          </div>

          {kind === 'hub' && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <RadioTower size={12} /> Release channel — assigned on registration
              </p>
              <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-white">
                Stable · {channelVersion(effectiveModel, REGISTRATION_CHANNEL)}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                Every Hub subscribes to the stable channel for its own model — {HUB_MODELS[effectiveModel].name} — and
                converges to that bundle on its first sync. Beta and preview are deliberate, per-unit decisions made in
                Control Center, never a default.
              </p>
            </div>
          )}

          {kind === 'hub' && siteId && (
            <p className="mt-4 rounded-lg bg-partner-primary/5 px-3 py-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Once this Hub reports in, the live Facility View turns on for this {t.siteSingular.toLowerCase()} — for you and
              for your customer.
            </p>
          )}

          <div className="mt-6 flex gap-2">
            <button onClick={register} disabled={!siteId} className={`${primaryBtn} flex-1`}>
              Finish
            </button>
            <button onClick={() => setStep('serial')} className={secondaryBtn}>
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {step === 'done' && meta && (
        <div className={`${card} text-center`}>
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 dark:bg-emerald-950">
            <CheckCircle2 size={28} className="text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {kind === 'hub' ? 'Hub registered' : 'Device provisioned'}
          </h2>
          <p className="mx-auto mt-3 inline-block rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm font-bold text-slate-900 dark:bg-slate-800 dark:text-white">
            {assignedId}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-xs text-slate-400 dark:text-slate-500">
            Serial <span className="font-mono text-slate-600 dark:text-slate-300">{claimed}</span> &rarr; Device ID{' '}
            <span className="font-mono text-slate-600 dark:text-slate-300">{assignedId}</span>
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            It is claimed
            {site ? (
              <>
                {' '}
                and assigned to <strong>{site.name}</strong>
              </>
            ) : null}
            {assetId ? (
              <>
                {' '}
                on <strong>{assets.find((a) => a.id === assetId)?.name}</strong>
              </>
            ) : null}
            . It will show as online once it reports in.
          </p>

          <div className="mt-6 flex justify-center gap-2">
            <button onClick={reset} className={secondaryBtn}>
              <RotateCcw size={15} /> Install another
            </button>
            <button onClick={() => navigate(siteId ? `/sites/${siteId}` : '/')} className={primaryBtn}>
              <Layers size={15} /> {site ? `Go to ${site.name}` : 'Back to home'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

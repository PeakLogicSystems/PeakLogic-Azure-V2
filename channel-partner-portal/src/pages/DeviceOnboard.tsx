import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle, CheckCircle2, Cpu, Layers, Loader2, RotateCcw, Router } from 'lucide-react';
import { usePartner } from '@/PartnerContext';
import { siteById } from '@/data/types';

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
// PREVIEW MODE. No API client exists yet. The flow, validation and failure
// states are real. When the backend is wired, the calls are:
//
//   Hub     POST /v1/hubs             { serial, siteId }
//   Device  POST /v1/devices          { serial }          -> claims it
//           PUT  /v1/devices/{id}     { siteId, assetId } -> assigns it

type Kind = 'hub' | 'device';
type Step = 'kind' | 'serial' | 'assign' | 'done';

// What manufacturers actually print: a run of 6–24 letters and digits, with
// dashes optional and meaningless. Deliberately loose — see the note above
// about whose numbering this is. Rejecting a valid serial costs a truck roll.
const SERIAL_SHAPE = /^[A-Z0-9][A-Z0-9-]{4,22}[A-Z0-9]$/i;

// The next ID in this customer's series.
//
// HUBS AND SENSORS ARE NUMBERED SEPARATELY. A Hub serves a whole site; a sensor
// serves one piece of equipment; and a site can carry several Hubs. Issuing both
// from one counter made an ID meaningless — you could not tell what class of
// hardware you were looking at. Hubs take an -H01 suffix per site, sensors take
// the running numeric series for the customer.
//
// The customer prefix keeps everything at one account reading as one family. In
// production these are issued server-side: a client cannot be trusted to
// allocate a unique id, and two installers claiming at once would collide.
function customerPrefix(source: string): string {
  return source.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'PLG';
}

function nextSensorId(source: string, existing: string[]): string {
  const used = existing
    .filter((id) => !/-H\d+$/i.test(id)) // Hub ids never advance the sensor series
    .map((id) => {
      const m = id.match(/(\d+)\s*$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const next = (used.length ? Math.max(...used) : 1000) + 1;
  return `${customerPrefix(source)}-${next}`;
}

/** Hubs are numbered per SITE, because that is the thing a Hub belongs to. */
function nextHubId(source: string, siteHubIds: string[]): string {
  const used = siteHubIds
    .map((id) => {
      const m = id.match(/-H(\d+)$/i);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${customerPrefix(source)}-H${String(next).padStart(2, '0')}`;
}

const KIND_META: Record<Kind, { label: string; sub: string; icon: typeof Cpu; example: string; where: string }> = {
  hub: {
    label: 'PeakLogic Hub',
    sub: 'The on-site gateway. One per site — it serves the live Facility View over the local network and forwards data to the cloud.',
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
  const { partner, addDevice } = usePartner();
  const t = partner.terms;

  const [kind, setKind] = useState<Kind | null>(null);
  const [step, setStep] = useState<Step>('kind');
  const [serial, setSerial] = useState('');
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

  // Allocated once the serial is accepted, from the CUSTOMER's series — a
  // partner servicing several customers issues into each one separately.
  const assignedId = useMemo(() => {
    const customer = site?.customer ?? partner.name;
    if (kind === 'hub') {
      // Per site: a second Hub at Sunset Ridge is SUN-H02, not the next number
      // in a sequence shared with every sensor the customer owns.
      const hubsHere = (site?.devices ?? []).filter((d) => d.type === 'Hub').map((d) => d.id);
      return nextHubId(customer, hubsHere);
    }
    return nextSensorId(customer, partner.sites.flatMap((sx) => sx.devices.map((d) => d.id)));
  }, [kind, site, partner]);

  const handleClaim = async () => {
    if (!claimed || !kind) return;
    setClaiming(true);
    setClaimError('');
    await new Promise((r) => setTimeout(r, 500));

    // Compare serials with serials. The previous check compared the entered
    // serial against assigned Device IDs, which are a different namespace
    // entirely — it could not detect a genuine duplicate.
    const inService = partner.sites.some((s) =>
      s.devices.some((d) => (d.serial ?? '').toUpperCase() === claimed),
    );

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
    addDevice(siteId, {
      id: assignedId,
      serial: claimed,
      name: kind === 'hub' ? 'PeakLogic Hub' : assets.find((a) => a.id === assetId)?.name ?? 'New sensor',
      type: kind === 'hub' ? 'Hub' : 'Sensor',
      status: 'online',
      reading: kind === 'hub' ? 'online' : '—',
      controllable: false,
    });
    setStep('done');
  };

  const reset = () => {
    setKind(null);
    setStep('kind');
    setSerial('');
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
            const hubExists = k === 'hub' && site?.peakview;
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
                  {hubExists && (
                    <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-500">
                      This {t.siteSingular.toLowerCase()} already has a Hub. Only add another if you are replacing it.
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
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            You do not name the device. PeakLogic assigns its ID automatically, next in this customer&rsquo;s series, once
            the serial is accepted.
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

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {kind === 'hub' ? 'Hub ID' : 'Device ID'} — assigned by PeakLogic
            </p>
            <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-white">{assignedId}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Issued automatically —{' '}
              {kind === 'hub'
                ? `the next Hub at this ${t.siteSingular.toLowerCase()}`
                : `next in ${site ? site.customer : 'this customer'}'s device series`}
              . Nothing to type: the serial stays with the hardware, this is how the platform refers to it.
            </p>
          </div>

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

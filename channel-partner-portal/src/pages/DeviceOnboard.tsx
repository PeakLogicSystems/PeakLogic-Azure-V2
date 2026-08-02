import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle, CheckCircle2, Cpu, Layers, Loader2, RotateCcw } from 'lucide-react';
import { usePartner } from '@/PartnerContext';
import { siteById } from '@/data/types';

// Device onboarding wizard — ported from the retired frontend/ app (2026-08-01),
// where it was the one screen wired to the real API. It lives here now because
// installing and commissioning equipment is the SERVICE PARTNER's job, not the
// equipment owner's: the partner is the one holding the sensor and reading the
// serial off its label. It replaces the placeholder toast that previously sat
// behind "Provision device" on the site page.
//
// PREVIEW MODE. The partner portal has no API client (nothing here is wired to
// a backend yet), so this runs against the portal's own preview data. The flow,
// validation and failure states are the real ones, deliberately preserved.
// When the backend is wired, the calls this must make — unchanged from the
// original implementation — are:
//
//   step 1   POST /v1/devices            { serial }         -> claims the device
//   step 2   GET  /v1/assets?siteId=...                     -> assets at the site
//            PUT  /v1/devices/{deviceId} { assetId }        -> assigns it
//
// Claiming is deliberately a separate step from assigning: a device is claimed
// by serial the moment it is in hand, and assigning it to a specific piece of
// equipment can be skipped and done later. Losing that split would force an
// installer to know the asset before they can register the hardware.

type WizardStep = 1 | 2 | 'success';

const SERIAL_FORMAT = /^PLG-[A-Z0-9]{4,}$/;

function Stepper({ current }: { current: 1 | 2 }) {
  const steps = ['Enter serial', 'Assign location'];
  return (
    <div className="mb-8 flex items-center">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2;
        const done = n < current;
        const active = n === current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                  done ? 'bg-emerald-500 text-white' : '',
                  active ? 'bg-partner-primary text-white' : '',
                  !done && !active ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500' : '',
                ].join(' ')}
              >
                {done ? <CheckCircle2 size={14} /> : n}
              </div>
              <span
                className={`text-sm font-medium ${
                  active ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-4 h-px w-16 ${done ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
      {message}
    </div>
  );
}

export function DeviceOnboard() {
  const navigate = useNavigate();
  const { siteId: siteIdParam } = useParams();
  const { partner } = usePartner();
  const t = partner.terms;

  const [step, setStep] = useState<WizardStep>(1);
  const [serial, setSerial] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');

  const [siteId, setSiteId] = useState(siteIdParam ?? '');
  const [assetId, setAssetId] = useState('');

  // In preview mode the "assets" available at a site are its existing devices —
  // enough to exercise the real selection flow without inventing a second
  // fixture that would drift from the portal's own data.
  const assets = useMemo(() => {
    const s = siteId ? siteById(partner, siteId) : undefined;
    return s ? s.devices : [];
  }, [partner, siteId]);

  const claimedSerial = serial.trim().toUpperCase();

  const handleClaim = async () => {
    const normalized = claimedSerial;
    if (!normalized) return;
    setClaiming(true);
    setClaimError('');

    // Simulates the POST /v1/devices round trip, including its real failure
    // modes: unknown serial, and a serial already claimed by someone else.
    await new Promise((r) => setTimeout(r, 550));

    const alreadyClaimed = partner.sites.some((s) => s.devices.some((d) => d.id === normalized));
    if (!SERIAL_FORMAT.test(normalized)) {
      setClaimError('That serial doesn’t look right. It should read PLG- followed by at least four characters, exactly as printed on the label.');
    } else if (alreadyClaimed) {
      setClaimError(`${normalized} is already claimed and in service. If you believe this is wrong, contact PeakLogic support — don’t re-provision a device that is live.`);
    } else {
      setStep(2);
    }
    setClaiming(false);
  };

  const finish = () => setStep('success');

  const reset = () => {
    setStep(1);
    setSerial('');
    setSiteId(siteIdParam ?? '');
    setAssetId('');
    setClaimError('');
  };

  const siteName = siteId ? siteById(partner, siteId)?.name ?? null : null;
  const assetName = assets.find((a) => a.id === assetId)?.name ?? null;
  const backTo = siteIdParam ? `/sites/${siteIdParam}` : '/';

  const card =
    'rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900';
  const field =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-partner-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white';
  const primaryBtn =
    'inline-flex items-center justify-center gap-2 rounded-lg bg-partner-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
  const secondaryBtn =
    'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200';

  return (
    <div className="mx-auto max-w-xl p-6">
      <Link
        to={backTo}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft size={14} /> Back to {siteIdParam ? t.siteSingular.toLowerCase() : 'home'}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Provision a device</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Claim a PeakLogic sensor by its serial, then put it where it belongs.
        </p>
      </div>

      <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Preview data — this walks the real flow but does not register hardware yet.
      </div>

      {step !== 'success' && <Stepper current={step as 1 | 2} />}

      {step === 1 && (
        <div className={card}>
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-partner-primary/10">
              <Cpu size={20} className="text-partner-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Enter the device serial</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Printed on the label on the back of the sensor.</p>
            </div>
          </div>

          {claimError && <ErrorBanner message={claimError} />}

          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Serial number</label>
          <input
            autoFocus
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleClaim()}
            placeholder="PLG-1042"
            className={`${field} font-mono`}
          />
          <p className="mt-1.5 text-xs text-slate-400">Format: PLG-XXXX (case-insensitive)</p>

          <button onClick={handleClaim} disabled={!serial.trim() || claiming} className={`${primaryBtn} mt-6 w-full`}>
            {claiming ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Verifying…
              </>
            ) : (
              'Claim device'
            )}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className={card}>
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950">
              <CheckCircle2 size={20} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">
                <span className="font-mono">{claimedSerial}</span> claimed
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Now choose where it is installed.</p>
            </div>
          </div>

          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">{t.siteSingular}</label>
          <select value={siteId} onChange={(e) => { setSiteId(e.target.value); setAssetId(''); }} className={field}>
            <option value="">Select a {t.siteSingular.toLowerCase()}…</option>
            {partner.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.customer}
              </option>
            ))}
          </select>

          <label className="mb-1.5 mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Equipment <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)} disabled={!siteId} className={`${field} disabled:opacity-50`}>
            <option value="">
              {siteId ? 'Not attached to specific equipment' : `Select a ${t.siteSingular.toLowerCase()} first`}
            </option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.type}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-400">
            You can skip this and attach the device to equipment later — the device is already claimed either way.
          </p>

          <div className="mt-6 flex gap-2">
            <button onClick={finish} disabled={!siteId} className={`${primaryBtn} flex-1`}>
              Finish
            </button>
            <button onClick={finish} className={secondaryBtn}>
              Skip for now
            </button>
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className={`${card} text-center`}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
            <CheckCircle2 size={28} className="text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Device provisioned</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            <span className="font-mono text-slate-700 dark:text-slate-200">{claimedSerial}</span> is claimed
            {siteName ? <> and assigned to <strong>{siteName}</strong></> : null}
            {assetName ? <> on <strong>{assetName}</strong></> : null}. It will appear as online once it reports its
            first reading.
          </p>

          <div className="mt-6 flex justify-center gap-2">
            <button onClick={reset} className={secondaryBtn}>
              <RotateCcw size={15} /> Provision another
            </button>
            <button onClick={() => navigate(siteId ? `/sites/${siteId}` : '/')} className={primaryBtn}>
              <Layers size={15} /> {siteName ? `Go to ${siteName}` : 'Back to home'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

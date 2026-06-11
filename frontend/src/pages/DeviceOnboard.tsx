import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CheckCircle2, Cpu,
  Loader2, AlertCircle, RotateCcw, Layers,
} from 'lucide-react';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────

interface ClaimedDevice {
  id: string;
  serial: string;
  thing_name: string;
  status: string;
  asset_id: string | null;
}
interface Site  { id: string; name: string; type: string; }
interface Asset { id: string; name: string; category: string; }

type WizardStep = 1 | 2 | 'success';

// ── Stepper ───────────────────────────────────────────────────────────────

function Stepper({ current }: { current: 1 | 2 }) {
  const steps = ['Enter serial', 'Assign location'];
  return (
    <div className="flex items-center mb-10">
      {steps.map((label, i) => {
        const n    = i + 1 as 1 | 2;
        const done = n < current;
        const active = n === current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={[
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                done   ? 'bg-brand-green text-white'  : '',
                active ? 'bg-brand-purple text-white' : '',
                !done && !active ? 'bg-gray-100 text-gray-400' : '',
              ].join(' ')}>
                {done ? <CheckCircle2 size={14} /> : n}
              </div>
              <span className={`text-sm font-medium ${active ? 'text-gray-900' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-4 flex-1 h-px w-16 ${done ? 'bg-brand-green' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5 text-sm text-red-700">
      <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
      {message}
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────

export function DeviceOnboard() {
  const navigate = useNavigate();

  // wizard state
  const [step,   setStep]   = useState<WizardStep>(1);
  const [serial, setSerial] = useState('');
  const [device, setDevice] = useState<ClaimedDevice | null>(null);

  // step-1 async
  const [claiming,    setClaiming]    = useState(false);
  const [claimError,  setClaimError]  = useState('');

  // step-2 data
  const [sites,          setSites]          = useState<Site[]>([]);
  const [assets,         setAssets]         = useState<Asset[]>([]);
  const [siteId,         setSiteId]         = useState('');
  const [assetId,        setAssetId]        = useState('');
  const [loadingSites,   setLoadingSites]   = useState(false);
  const [loadingAssets,  setLoadingAssets]  = useState(false);
  const [assigning,      setAssigning]      = useState(false);
  const [assignError,    setAssignError]    = useState('');

  // Fetch sites when entering step 2
  useEffect(() => {
    if (step !== 2) return;
    setLoadingSites(true);
    api.get<Site[]>('/sites')
      .then(setSites)
      .catch(() => setSites([]))
      .finally(() => setLoadingSites(false));
  }, [step]);

  // Fetch assets when a site is selected
  useEffect(() => {
    if (!siteId) { setAssets([]); setAssetId(''); return; }
    setLoadingAssets(true);
    setAssetId('');
    api.get<Asset[]>(`/assets?siteId=${siteId}`)
      .then(setAssets)
      .catch(() => setAssets([]))
      .finally(() => setLoadingAssets(false));
  }, [siteId]);

  // ── Step 1: Claim device ─────────────────────────────────────────────

  const handleClaim = async () => {
    const normalized = serial.trim().toUpperCase();
    if (!normalized) return;
    setClaiming(true);
    setClaimError('');
    try {
      const d = await api.post<ClaimedDevice>('/devices', { serial: normalized });
      setDevice(d);
      setStep(2);
    } catch (err) {
      setClaimError(
        err instanceof Error ? err.message : 'Device not found or already claimed.',
      );
    } finally {
      setClaiming(false);
    }
  };

  // ── Step 2: Assign to site + asset (optional) ────────────────────────

  const handleAssign = async (skip: boolean) => {
    if (!device) return;
    if (skip || !assetId) {
      setStep('success');
      return;
    }
    setAssigning(true);
    setAssignError('');
    try {
      await api.put(`/devices/${device.id}`, { assetId });
      setStep('success');
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Failed to assign device.');
    } finally {
      setAssigning(false);
    }
  };

  // ── Reset for "onboard another" ──────────────────────────────────────

  const reset = () => {
    setStep(1); setSerial(''); setDevice(null);
    setSiteId(''); setAssetId(''); setClaimError(''); setAssignError('');
  };

  // ── Derived labels for success screen ───────────────────────────────

  const siteName  = sites.find(s => s.id === siteId)?.name  ?? null;
  const assetName = assets.find(a => a.id === assetId)?.name ?? null;

  // ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-xl mx-auto">
      {/* Header */}
      <Link
        to="/devices"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft size={14} /> Back to devices
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Onboard a device</h1>
        <p className="text-sm text-gray-500 mt-1">
          Connect a PeakLogic sensor to your account in two steps.
        </p>
      </div>

      {/* Stepper — hidden on success */}
      {step !== 'success' && <Stepper current={step as 1 | 2} />}

      {/* ── Step 1 ────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand-purple-soft flex items-center justify-center">
              <Cpu size={20} className="text-brand-purple" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Enter the device serial</h2>
              <p className="text-xs text-gray-500">Found on the label on the back of your sensor</p>
            </div>
          </div>

          {claimError && <ErrorBanner message={claimError} />}

          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Serial number
          </label>
          <input
            type="text"
            value={serial}
            onChange={e => { setSerial(e.target.value.toUpperCase()); setClaimError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleClaim()}
            placeholder="PLG-0000"
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-mono
                       focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent
                       placeholder:text-gray-300"
            autoFocus
            disabled={claiming}
          />
          <p className="text-xs text-gray-400 mt-2">Format: PLG-XXXX (case-insensitive)</p>

          <div className="mt-8 flex justify-end">
            <button
              onClick={handleClaim}
              disabled={!serial.trim() || claiming}
              className="flex items-center gap-2 bg-brand-purple text-white text-sm font-medium
                         px-5 py-2.5 rounded-lg hover:bg-brand-purple/90 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {claiming ? (
                <><Loader2 size={15} className="animate-spin" /> Verifying…</>
              ) : (
                <>Next <ArrowRight size={15} /></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2 ────────────────────────────────────────────────── */}
      {step === 2 && device && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {/* Claimed badge */}
          <div className="flex items-center gap-2 bg-brand-green-soft border border-green-200 rounded-lg px-3 py-2 mb-6">
            <CheckCircle2 size={14} className="text-brand-green" />
            <span className="text-xs font-medium text-green-700">
              Device <span className="font-mono">{device.serial}</span> verified and claimed
            </span>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand-purple-soft flex items-center justify-center">
              <Layers size={20} className="text-brand-purple" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Assign to a location</h2>
              <p className="text-xs text-gray-500">You can change this at any time</p>
            </div>
          </div>

          {assignError && <ErrorBanner message={assignError} />}

          {/* Site selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Site
            </label>
            {loadingSites ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                <Loader2 size={14} className="animate-spin" /> Loading sites…
              </div>
            ) : (
              <select
                value={siteId}
                onChange={e => setSiteId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent
                           bg-white"
                disabled={assigning}
              >
                <option value="">— Select a site —</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Asset selector — only shows when site is selected */}
          {siteId && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Asset <span className="font-normal text-gray-400">(optional)</span>
              </label>
              {loadingAssets ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 size={14} className="animate-spin" /> Loading assets…
                </div>
              ) : assets.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No assets at this site yet.</p>
              ) : (
                <select
                  value={assetId}
                  onChange={e => setAssetId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent
                             bg-white"
                  disabled={assigning}
                >
                  <option value="">— Select an asset —</option>
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(1)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5 transition-colors"
              disabled={assigning}
            >
              <ArrowLeft size={14} /> Back
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleAssign(true)}
                className="text-sm text-gray-500 hover:text-brand-purple transition-colors"
                disabled={assigning}
              >
                Skip for now
              </button>
              <button
                onClick={() => handleAssign(false)}
                disabled={assigning}
                className="flex items-center gap-2 bg-brand-purple text-white text-sm font-medium
                           px-5 py-2.5 rounded-lg hover:bg-brand-purple/90 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {assigning ? (
                  <><Loader2 size={15} className="animate-spin" /> Saving…</>
                ) : (
                  <>Finish <CheckCircle2 size={15} /></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success ───────────────────────────────────────────────── */}
      {step === 'success' && device && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-brand-green-soft flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-brand-green" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Device activated!</h2>
          <p className="text-sm text-gray-500 mb-8">
            Your sensor is now registered and ready to send data.
          </p>

          {/* Device summary */}
          <div className="bg-gray-50 rounded-xl border border-gray-100 text-left divide-y divide-gray-100 mb-8">
            {[
              { label: 'Serial',   value: device.serial,                  mono: true  },
              { label: 'Thing',    value: device.thing_name,              mono: true  },
              { label: 'Status',   value: device.status,                  mono: false },
              { label: 'Site',     value: siteName  ?? '—  (not assigned)', mono: false },
              { label: 'Asset',    value: assetName ?? '—  (not assigned)', mono: false },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-gray-500 font-medium">{label}</span>
                <span className={`text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={reset}
              className="flex items-center justify-center gap-2 border border-gray-200 text-gray-700
                         text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RotateCcw size={14} /> Onboard another
            </button>
            <button
              onClick={() => navigate('/devices')}
              className="flex items-center justify-center gap-2 bg-brand-purple text-white
                         text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-brand-purple/90 transition-colors"
            >
              View all devices <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

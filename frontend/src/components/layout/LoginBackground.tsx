// Renders the PeakLogic logo above the Amplify Authenticator form
export function LoginBackground() {
  return (
    <div className="flex flex-col items-center pt-10 pb-4">
      <div className="flex items-center gap-2 mb-2">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
          <path d="M4 28 L12 10 L18 20 L23 12 L28 28 Z" fill="#7C3AED" />
          <path d="M18 20 L23 12 L28 28 Z" fill="#22C55E" opacity="0.8" />
        </svg>
        <span className="text-2xl font-bold tracking-tight">
          <span className="text-gray-900">Peak</span>
          <span className="text-brand-purple">Logic</span>
        </span>
      </div>
      <p className="text-sm text-gray-500">IoT Asset &amp; Energy Management</p>
    </div>
  );
}

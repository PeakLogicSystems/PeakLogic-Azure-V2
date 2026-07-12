// Renders the PeakLogic logo above the Amplify Authenticator form
export function LoginBackground() {
  return (
    <div className="flex flex-col items-center pt-10 pb-4">
      {/* items-end bottom-justifies the wordmark against the icon's
          base. viewBox cropped tight to the mountain path's own
          bounds (same reasoning as Sidebar.tsx) so there's no
          invisible canvas below the visible base throwing off the
          alignment. */}
      <div className="flex items-end gap-2 mb-2">
        <svg width="32" height="24" viewBox="4 10 24 18" fill="none" aria-hidden>
          <path d="M4 28 L12 10 L18 20 L23 12 L28 28 Z" fill="#7C3AED" />
          <path d="M18 20 L23 12 L28 28 Z" fill="#22C55E" opacity="0.8" />
        </svg>
        {/* leading-none — see Sidebar.tsx for why this matters as much
            as items-end itself for getting the baseline flush. */}
        <span className="text-2xl font-bold tracking-tight leading-none">
          <span className="text-gray-900">Peak</span>
          <span className="text-brand-purple">Logic</span>
        </span>
      </div>
      <p className="text-sm text-gray-500">IoT Asset &amp; Energy Management</p>
    </div>
  );
}

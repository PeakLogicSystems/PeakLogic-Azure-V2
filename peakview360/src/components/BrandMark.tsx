// The PeakView360 wordmark + peak mark. Reuses the PeakLogic brand palette
// (brand.purple / brand.green) so it reads as the same product family. "Peak"
// stays white on the fixed-dark top bar (matching the marketing/kiosk
// convention); "View360" carries the purple accent.
export function BrandMark() {
  return (
    <div className="flex items-center gap-2 select-none">
      {/* The real PeakLogic mark (marketing/favicon.svg): purple mountain + green peak. */}
      <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M4 28 L12 10 L18 20 L23 12 L28 28 Z" fill="#7C3AED" />
        <path d="M18 20 L23 12 L28 28 Z" fill="#22C55E" opacity="0.85" />
      </svg>
      <span className="text-[15px] font-extrabold tracking-tight">
        <span className="text-white">Peak</span>
        <span className="text-brand-purple-mid">View360</span>
      </span>
    </div>
  );
}

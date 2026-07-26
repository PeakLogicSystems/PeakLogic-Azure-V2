// The PeakView360 wordmark + peak mark. Reuses the PeakLogic brand palette
// (brand.purple / brand.green) so it reads as the same product family. "Peak"
// stays white on the fixed-dark top bar (matching the marketing/kiosk
// convention); "View360" carries the purple accent.
export function BrandMark() {
  return (
    <div className="flex items-center gap-2 select-none">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M2 21 L9 7 L13 15 L16 10 L22 21 Z" fill="#22C55E" />
        <path d="M9 7 L13 15 L11.2 15 L9 10.4 Z" fill="#7C3AED" />
      </svg>
      <span className="text-[15px] font-extrabold tracking-tight">
        <span className="text-white">Peak</span>
        <span className="text-brand-purple-mid">View360</span>
      </span>
    </div>
  );
}

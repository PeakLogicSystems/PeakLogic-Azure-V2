// The PeakView360 wordmark + peak mark. Reuses the PeakLogic brand palette
// (brand.purple / brand.green) so it reads as the same product family. "Peak"
// stays white on the fixed-dark top bar (matching the marketing/kiosk
// convention); "View360" carries the purple accent. The mark's viewBox is
// cropped to its content (x:4–28, y:10–28) and the lockup is items-end +
// leading-none so the wordmark bottom-aligns to the mark.
export function BrandMark() {
  return (
    <div className="flex items-baseline gap-2 select-none">
      {/* The real PeakLogic mark (marketing/favicon.svg), cropped to content. */}
      <svg width="20" height="15" viewBox="4 10 24 18" fill="none" aria-hidden="true">
        <path d="M4 28 L12 10 L18 20 L23 12 L28 28 Z" fill="#7C3AED" />
        <path d="M18 20 L23 12 L28 28 Z" fill="#22C55E" opacity="0.85" />
      </svg>
      <span className="text-[15px] font-extrabold leading-none tracking-tight">
        <span className="text-white">Peak</span>
        <span className="text-brand-purple-mid">View360</span>
      </span>
    </div>
  );
}

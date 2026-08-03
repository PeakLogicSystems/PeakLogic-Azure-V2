import { useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// Full-screen photo viewer.
//
// Deliberately a real modal rather than a bigger thumbnail: a technician
// checking a serial plate or a customer looking at a leak needs the whole
// screen, and needs to move through the set without closing and reopening.
//
// Keyboard is wired because this is the one place in the portal where a
// pointer is the slow way to do it: Escape closes, arrows step, and focus is
// trapped on the dialog so a screen reader does not wander into the page
// behind it.

export interface LightboxPhoto {
  id: string;
  dataUrl: string;
  addedAt: string;
}

export function PhotoLightbox({
  photos,
  index,
  onClose,
  onIndex,
  caption,
}: {
  photos: LightboxPhoto[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
  caption?: string;
}) {
  const count = photos.length;
  // Wrapping rather than clamping: at the last photo the next arrow should go
  // somewhere, and a set of site photos has no meaningful start or end.
  const step = useCallback((d: number) => onIndex((index + d + count) % count), [index, count, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    // The page behind must not scroll while the viewer is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, step]);

  if (!count || !photos[index]) return null;
  const photo = photos[index];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Site photo ${index + 1} of ${count}`}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-slate-300">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            {index + 1} of {count}
          </p>
          <p className="truncate text-xs text-slate-400">
            {new Date(photo.addedAt).toLocaleDateString()}
            {caption ? ` · ${caption}` : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close photo viewer"
          className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <X size={19} />
        </button>
      </div>

      {/* Stop propagation so clicking the image itself does not dismiss. */}
      <div className="flex min-h-0 flex-1 items-center gap-2 px-2 pb-2" onClick={(e) => e.stopPropagation()}>
        {count > 1 && (
          <button
            onClick={() => step(-1)}
            aria-label="Previous photo"
            className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <img
          src={photo.dataUrl}
          alt={`Site photo ${index + 1} of ${count}`}
          className="mx-auto max-h-full min-h-0 flex-1 object-contain"
        />
        {count > 1 && (
          <button
            onClick={() => step(1)}
            aria-label="Next photo"
            className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-4" onClick={(e) => e.stopPropagation()}>
          {photos.map((p, i) => (
            <button
              key={p.id}
              onClick={() => onIndex(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index}
              className={`h-14 w-20 flex-none overflow-hidden rounded border-2 transition-opacity ${
                i === index ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-80'
              }`}
            >
              <img src={p.dataUrl} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Whichever of white or ink is actually legible on this background.
 *
 * White on a light brand fails badly — amber at 1.9:1 was unreadable — so the
 * text colour is computed from relative luminance rather than assumed.
 */
export function inkOn(hex: string): string {
  const v = (hex || '').replace('#', '');
  if (v.length !== 6) return '#ffffff';
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return lum > 0.42 ? '#0F172A' : '#ffffff';
}

/** A header derived from a mark colour, when none has been configured yet. */
export function derivedHeader(hex: string): string {
  const v = (hex || '#7c3aed').replace('#', '');
  if (v.length !== 6) return '#1e1b4b';
  const rgb = [0, 2, 4].map((i) => Math.round(parseInt(v.slice(i, i + 2), 16) * 0.42));
  return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
}

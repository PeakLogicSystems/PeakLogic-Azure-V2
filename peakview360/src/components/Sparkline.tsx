// A tiny dependency-free SVG sparkline — used in the equipment dashboard so that
// screen stays light (recharts is reserved for the Historian's full trends). The
// most recent point is emphasized with a dot.
export function Sparkline({
  data,
  color = '#7C3AED',
  width = 104,
  height = 30,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * width;
  const y = (v: number) => height - ((v - min) / range) * (height - 4) - 2;
  const points = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const lastY = y(data[data.length - 1]);

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={lastY} r={2.5} fill={color} />
    </svg>
  );
}

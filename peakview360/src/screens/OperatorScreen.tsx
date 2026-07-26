import { CircleHelp } from 'lucide-react';
import { ProcessTile } from '../components/ProcessTile';
import { usePeakViewData } from '../store';

// The real-time operator screen (surface #1, PV-1): the screen's tiles rendered
// live from the current process values. The screen declares a help_context_key,
// so a one-click PeakAssist link is always present (PA-7, enforced).
export function OperatorScreen() {
  const { screen, values } = usePeakViewData();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">{screen.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Real-time operator view · live from the on-site Hub</p>
        </div>
        <a
          href={`#/help/${screen.helpContextKey}`}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-brand-purple-mid hover:text-brand-purple-mid dark:border-slate-700 dark:text-slate-300"
          title="Open the PeakAssist guide for this screen"
        >
          <CircleHelp size={15} /> Screen help
        </a>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {screen.tiles.map((tile) => (
          <ProcessTile key={tile.id} tile={tile} pv={values[tile.metric]} />
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        PeakView360 visualizes and supervises — it never issues safety-rated control. Setpoints and interlocks remain in
        the plant's certified control system.
      </p>
    </div>
  );
}

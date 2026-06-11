import { Boxes, Plus } from 'lucide-react';

const MOCK_ASSETS = [
  { id: '1', name: 'Primary Pump P1',    category: 'pump',        site: 'Riverside Pump Station', make: 'Grundfos', model: 'CM10-A',  status: 'healthy'  },
  { id: '2', name: 'Backup Pump P2',     category: 'pump',        site: 'Riverside Pump Station', make: 'Grundfos', model: 'CM10-A',  status: 'warning'  },
  { id: '3', name: 'Fryer Unit 1',       category: 'hvac',        site: 'QSR — Downtown Branch',  make: 'Henny',    model: 'OFE',     status: 'healthy'  },
  { id: '4', name: 'Fryer Unit 2',       category: 'hvac',        site: 'QSR — Downtown Branch',  make: 'Henny',    model: 'OFE',     status: 'critical' },
  { id: '5', name: 'Pool Circulation',   category: 'pool_system', site: 'Lakewood Pool Complex',  make: 'Pentair',  model: 'SuperFlo', status: 'healthy' },
];

const STATUS_BADGE: Record<string, string> = {
  healthy:  'bg-brand-green-soft text-green-700',
  warning:  'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
  offline:  'bg-gray-100 text-gray-500',
  unknown:  'bg-gray-100 text-gray-400',
};

const STATUS_DOT: Record<string, string> = {
  healthy:  'bg-brand-green',
  warning:  'bg-amber-400',
  critical: 'bg-red-500',
  offline:  'bg-gray-400',
  unknown:  'bg-gray-300',
};

export function Assets() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Assets</h1>
          <p className="text-sm text-gray-500 mt-1">{MOCK_ASSETS.length} assets registered</p>
        </div>
        <button className="flex items-center gap-2 bg-brand-purple text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-purple/90 transition-colors">
          <Plus size={15} /> Add asset
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {MOCK_ASSETS.map(asset => (
          <div key={asset.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[asset.status]}`} />
                <span className="text-xs text-gray-500 capitalize">{asset.category.replace('_', ' ')}</span>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[asset.status]}`}>
                {asset.status}
              </span>
            </div>
            <p className="font-semibold text-gray-900 mb-1">{asset.name}</p>
            <p className="text-xs text-gray-500 mb-3">{asset.site}</p>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><Boxes size={12} /> {asset.make}</span>
              <span>{asset.model}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

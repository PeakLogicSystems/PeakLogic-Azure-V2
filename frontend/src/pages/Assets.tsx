import { useNavigate } from 'react-router-dom';
import { Boxes, Plus } from 'lucide-react';
import { MOCK_ASSETS, MOCK_SITES, STATUS_BADGE, STATUS_DOT, assetDevices } from '@/lib/mockEstate';

export function Assets() {
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Assets</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{MOCK_ASSETS.length} assets registered</p>
        </div>
        <button className="flex items-center gap-2 bg-brand-purple text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-purple/90 transition-colors">
          <Plus size={15} /> Add asset
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {MOCK_ASSETS.map(asset => {
          const site = MOCK_SITES.find(s => s.id === asset.siteId);
          const deviceCount = assetDevices(asset.id).length;
          return (
            <div
              key={asset.id}
              onClick={() => navigate(`/assets/${asset.id}`)}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[asset.status]}`} />
                  <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{asset.category.replace('_', ' ')}</span>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[asset.status]}`}>
                  {asset.status}
                </span>
              </div>
              <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{asset.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{site?.name ?? '—'}</p>
              <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                <span className="flex items-center gap-1"><Boxes size={12} /> {asset.make}</span>
                <span>{asset.model}</span>
                <span className="ml-auto text-gray-400 dark:text-gray-500">{deviceCount} device{deviceCount === 1 ? '' : 's'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

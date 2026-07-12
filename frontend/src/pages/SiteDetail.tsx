import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Boxes, Cpu } from 'lucide-react';
import { MOCK_SITES, TYPE_LABEL, STATUS_BADGE, STATUS_DOT, siteAssets, assetDevices } from '@/lib/mockEstate';

// NAV-1/NAV-2 (SRS §3.15) — the top of the drill-down: a site's own status
// plus every asset installed there, each linking on into AssetDetail.
export function SiteDetail() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const site = MOCK_SITES.find(s => s.id === siteId);

  if (!site) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <p className="text-sm text-gray-500 dark:text-gray-400">Site not found.</p>
        <Link to="/sites" className="text-sm text-brand-purple hover:underline">Back to Sites</Link>
      </div>
    );
  }

  const assets = siteAssets(site.id);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/sites')}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
      >
        <ArrowLeft size={14} /> All sites
      </button>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <MapPin size={18} className="text-brand-purple" />
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{site.name}</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{TYPE_LABEL[site.type]} · {site.location}</p>
        </div>
        <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${STATUS_BADGE[site.status]}`}>
          {site.status}
        </span>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Boxes size={15} /> Assets at this site ({assets.length})
        </h2>
        {assets.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No assets registered at this site yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {assets.map(asset => {
              const devices = assetDevices(asset.id);
              return (
                <Link
                  key={asset.id}
                  to={`/assets/${asset.id}`}
                  className="block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-shadow"
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
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{asset.make} {asset.model}</p>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <Cpu size={12} /> {devices.length} device{devices.length === 1 ? '' : 's'} monitoring this asset
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

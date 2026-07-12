import { useNavigate } from 'react-router-dom';
import { MapPin, Plus } from 'lucide-react';
import { MOCK_SITES, TYPE_LABEL, STATUS_BADGE, siteAssets, siteDeviceCount } from '@/lib/mockEstate';

export function Sites() {
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Sites</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{MOCK_SITES.length} sites across all verticals</p>
        </div>
        <button className="flex items-center gap-2 bg-brand-purple text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-purple/90 transition-colors">
          <Plus size={15} /> Add site
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
            <tr>
              {['Name', 'Type', 'Location', 'Assets', 'Devices', 'Status'].map(h => (
                <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {MOCK_SITES.map(site => (
              <tr
                key={site.id}
                onClick={() => navigate(`/sites/${site.id}`)}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors"
              >
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <MapPin size={14} className="text-brand-purple flex-shrink-0" />
                  {site.name}
                </td>
                <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{TYPE_LABEL[site.type]}</td>
                <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{site.location}</td>
                <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{siteAssets(site.id).length}</td>
                <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{siteDeviceCount(site.id)}</td>
                <td className="px-6 py-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_BADGE[site.status]}`}>
                    {site.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

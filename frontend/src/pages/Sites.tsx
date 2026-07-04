import { MapPin, Plus } from 'lucide-react';

const MOCK_SITES = [
  { id: '1', name: 'Riverside Pump Station',  type: 'pumping_station', devices: 3, status: 'healthy',  location: 'Houston, TX' },
  { id: '2', name: 'QSR — Downtown Branch',   type: 'qsr',             devices: 2, status: 'warning',  location: 'Austin, TX'  },
  { id: '3', name: 'Lakewood Pool Complex',   type: 'pool',            devices: 4, status: 'healthy',  location: 'Dallas, TX'  },
  { id: '4', name: 'Northside Pump Station',  type: 'pumping_station', devices: 2, status: 'critical', location: 'Houston, TX' },
  { id: '5', name: 'QSR — Airport Rd',        type: 'qsr',             devices: 1, status: 'healthy',  location: 'Dallas, TX'  },
  { id: '6', name: 'Sunrise Nursing Home',    type: 'nursing_home',    devices: 5, status: 'warning',  location: 'San Antonio, TX' },
  { id: '7', name: 'Maple Street Diner',      type: 'restaurant',      devices: 3, status: 'healthy',  location: 'Austin, TX'  },
];

const TYPE_LABEL: Record<string, string> = {
  pumping_station: 'Pumping Station',
  qsr:             'Quick Service Restaurant',
  pool:            'Pool',
  nursing_home:    'Nursing Home',
  restaurant:      'Restaurant',
};

const STATUS_BADGE: Record<string, string> = {
  healthy:  'bg-brand-green-soft text-green-700',
  warning:  'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

export function Sites() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sites</h1>
          <p className="text-sm text-gray-500 mt-1">{MOCK_SITES.length} sites across all verticals</p>
        </div>
        <button className="flex items-center gap-2 bg-brand-purple text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-purple/90 transition-colors">
          <Plus size={15} /> Add site
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Name', 'Type', 'Location', 'Devices', 'Status'].map(h => (
                <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {MOCK_SITES.map(site => (
              <tr key={site.id} className="hover:bg-gray-50 cursor-pointer transition-colors">
                <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-2">
                  <MapPin size={14} className="text-brand-purple flex-shrink-0" />
                  {site.name}
                </td>
                <td className="px-6 py-4 text-gray-600">{TYPE_LABEL[site.type]}</td>
                <td className="px-6 py-4 text-gray-600">{site.location}</td>
                <td className="px-6 py-4 text-gray-600">{site.devices}</td>
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

import React, { useState, useEffect } from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';

interface CrystalBallProps {
  regionCode?: string;
}

export const AgileCrystalBall: React.FC<CrystalBallProps> = ({ regionCode = 'F' }) => {
  const [rates, setRates] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const fetchCrystalBall = async () => {
      try {
        setLoading(true);
        setError(null);

        const endpoint = `https://xrtpcohdyfyjmrxwhtjd.supabase.co/functions/v1/crystal-ball?region=${regionCode}`;
        const response = await fetch(endpoint);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `HTTP error ${response.status}`);
        }

        if (isMounted) {
          const targetDate = data.date;
          setDate(targetDate);
          
          const rawRates = data.rates || data.results || [];
          
          // Filter strictly for the target date and exclude export rates (keep import only)
          const filtered = rawRates.filter((slot: any) => {
            const timeStr = slot.valid_from || slot.time || slot.from || '';
            const isExport = slot.is_export || slot.direction === 'export' || String(slot.tariff_type || '').toLowerCase().includes('export');
            const matchesDate = targetDate ? timeStr.includes(targetDate) : true;
            return matchesDate && !isExport;
          });

          // Limit precisely to 48 half-hourly import slots for the day
          setRates(filtered.length > 0 ? filtered.slice(0, 48) : rawRates.slice(0, 48));
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load predictions');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchCrystalBall();
    return () => {
      isMounted = false;
    };
  }, [regionCode]);

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-300">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-3"></div>
        <p>Loading import rate predictions...</p>
      </div>
    );
  }

  if (error || rates.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/60 text-red-200">
        <h3 className="font-semibold text-lg mb-1">Auction Rates Pending or Unavailable</h3>
        <p className="text-sm opacity-90">Day-ahead wholesale auction prices publish around 10:00 AM UK time.</p>
        {error && <p className="text-xs mt-2 text-red-400">Error: {error}</p>}
      </div>
    );
  }

  // Format data for Recharts (Import Only)
  const chartData = rates.map((slot, index) => {
    const timeString = slot.valid_from || slot.time || slot.from;
    const timeLabel = timeString 
      ? new Date(timeString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      : `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}`;

    return {
      time: timeLabel,
      rate: Number(slot.value_inc_vat || slot.rate || 0),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-emerald-950/30 border border-emerald-800/50 p-4 rounded-lg">
        <div>
          <span className="text-emerald-400 font-semibold text-lg">Tomorrow's Import Predictions ({date})</span>
          <p className="text-xs text-gray-300 mt-1">Sourced directly from agile-rates.uk ({rates.length} import slots)</p>
        </div>
      </div>

      {/* Import Price Trend Chart */}
      <div className="bg-gray-900/80 border border-gray-800 p-4 rounded-xl shadow-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-4">Import Rate Trend (p/kWh inc. VAT)</h4>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="importGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#9ca3af" 
                fontSize={11} 
                interval={3} 
                tickLine={false} 
              />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={11} 
                tickLine={false} 
                unit="p" 
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '0.5rem', color: '#fff' }}
                formatter={(value: any) => [`${Number(value).toFixed(2)}p`, 'Import Rate']}
              />
              <Area 
                type="monotone" 
                dataKey="rate" 
                stroke="#10b981" 
                strokeWidth={2} 
                fillOpacity={1} 
                fill="url(#importGradient)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* 48-Slot Breakdown Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {rates.map((slot, index) => {
          const timeString = slot.valid_from || slot.time || slot.from;
          const formattedTime = timeString 
            ? new Date(timeString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
            : `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'} - ${String(Math.floor((index + 1) / 2)).padStart(2, '0')}:${(index + 1) % 2 === 0 ? '00' : '30'}`;

          return (
            <div key={index} className="bg-gray-800/60 border border-gray-700/50 p-3 rounded text-sm">
              <div className="text-xs text-gray-400 font-medium">
                {formattedTime}
              </div>
              <div className="text-lg font-bold text-emerald-400 mt-1">
                {Number(slot.value_inc_vat || slot.rate || 0).toFixed(2)}p
              </div>
              <div className="text-xs text-gray-500">inc. VAT</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AgileCrystalBall;

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
  const [isPending, setIsPending] = useState<boolean>(false);

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
          setDate(data.date || '');
          
          if (data.status === 'pending' || data.available === false) {
            setIsPending(true);
            setRates([]);
          } else {
            setIsPending(false);
            const rawRates = data.rates || data.results || [];
            
            // Filter strictly for import rates and target date using London time
            const filtered = rawRates.filter((slot: any) => {
              const timeStr = slot.valid_from || slot.time || slot.from || '';
              const isExport = slot.is_export || slot.direction === 'export' || String(slot.tariff_type || '').toLowerCase().includes('export');
              
              if (!timeStr) return false;

              const slotDate = new Date(timeStr).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
              const matchesDate = data.date ? slotDate === data.date : true;

              return matchesDate && !isExport;
            });

            setRates(filtered.length > 0 ? filtered.slice(0, 48) : rawRates.slice(0, 48));
          }
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
      <div className="py-20 text-center text-gray-400 space-y-3">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400"></div>
        <p className="text-sm">Analyzing wholesale market forecasts...</p>
      </div>
    );
  }

  // Clean, sleek waiting state before 10:00 AM or when rates are pending
  if (isPending || error || rates.length === 0) {
    return (
      <div className="py-24 px-4 text-center bg-gray-900/40 border border-gray-800/80 rounded-2xl shadow-xl flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-gray-800/80 border border-gray-700/60 flex items-center justify-center text-emerald-400 shadow-inner">
          <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-white">Tomorrow's metrics are published around 10:00.</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">Wholesale auction results for tomorrow's energy rates will appear here automatically once released.</p>
        </div>
        {error && <p className="text-xs text-red-400 mt-2">Notice: {error}</p>}
      </div>
    );
  }

  // Chart data formatting
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

  // Categorize into custom time windows
  const categorized = {
    morning: [] as any[],
    afternoon: [] as any[],
    peak: [] as any[],
    night: [] as any[],
  };

  rates.forEach((slot, index) => {
    const timeString = slot.valid_from || slot.time || slot.from;
    const hour = timeString ? new Date(timeString).getHours() : Math.floor(index / 2);
    const slotObj = { ...slot, originalIndex: index };

    if (hour >= 0 && hour < 12) categorized.morning.push(slotObj);
    else if (hour >= 12 && hour < 16) categorized.afternoon.push(slotObj);
    else if (hour >= 16 && hour < 19) categorized.peak.push(slotObj);
    else categorized.night.push(slotObj);
  });

  const getRateTier = (val: number) => {
    if (val < 15) return { label: 'Bargain', color: 'bg-emerald-400', textColor: 'text-emerald-400' };
    if (val > 35) return { label: 'Premium', color: 'bg-rose-500', textColor: 'text-rose-400' };
    return { label: 'Standard', color: 'bg-amber-400', textColor: 'text-amber-400' };
  };

  const renderSection = (title: string, subtitle: string, items: any[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-gray-800 pb-2">
          <h3 className="text-xs font-bold tracking-wider text-gray-400 uppercase">{title}</h3>
          <span className="text-[11px] text-gray-500 font-medium">{subtitle}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {items.map((slot) => {
            const val = Number(slot.value_inc_vat || slot.rate || 0);
            const tier = getRateTier(val);
            const timeString = slot.valid_from || slot.time || slot.from;
            const formattedTime = timeString 
              ? new Date(timeString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
              : `${String(Math.floor(slot.originalIndex / 2)).padStart(2, '0')}:${slot.originalIndex % 2 === 0 ? '00' : '30'}`;

            return (
              <div key={slot.originalIndex} className="bg-gray-900/70 hover:bg-gray-900 border border-gray-800/80 hover:border-gray-700 p-3 rounded-xl flex flex-col justify-between transition-all shadow-sm group">
                <div>
                  <div className="text-xs text-gray-400 font-medium">{formattedTime}</div>
                  <div className="text-lg font-bold text-white mt-1 group-hover:text-emerald-300 transition-colors">
                    {val.toFixed(2)}<span className="text-xs font-normal text-gray-400">p</span>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="w-full bg-gray-800/80 h-1 rounded-full overflow-hidden">
                    <div className={`${tier.color} h-full rounded-full`} style={{ width: '100%' }}></div>
                  </div>
                  <div className={`text-[10px] font-semibold tracking-wide ${tier.textColor}`}>
                    {tier.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex items-center justify-between bg-gradient-to-r from-emerald-950/40 to-gray-900/60 border border-emerald-800/40 p-4 rounded-xl shadow-lg">
        <div>
          <span className="text-emerald-400 font-bold text-base">Tomorrow's Crystal Ball ({date})</span>
          <p className="text-xs text-gray-300 mt-0.5">Wholesale market intelligence & price trend prediction</p>
        </div>
        <div className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full font-medium">
          Live Feed
        </div>
      </div>

      {/* Trend Area Chart */}
      <div className="bg-gray-900/70 border border-gray-800/80 p-5 rounded-2xl shadow-xl backdrop-blur-sm">
        <h4 className="text-xs font-bold tracking-wider text-gray-400 uppercase mb-4">Price Trend Overview (p/kWh inc. VAT)</h4>
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="crystalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.45}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="time" stroke="#6b7280" fontSize={10} interval={3} tickLine={false} />
              <YAxis stroke="#6b7280" fontSize={10} tickLine={false} unit="p" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.75rem', color: '#fff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                formatter={(value: any) => [`${Number(value).toFixed(2)}p`, 'Forecast Rate']}
              />
              <Area type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#crystalGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grouped Time Windows */}
      <div className="space-y-6">
        {renderSection("MORNING", "00:00 – 12:00", categorized.morning)}
        {renderSection("AFTERNOON", "12:00 – 16:00", categorized.afternoon)}
        {renderSection("PEAK WINDOW", "16:00 – 19:00", categorized.peak)}
        {renderSection("NIGHT", "19:00 – 24:00", categorized.night)}
      </div>
    </div>
  );
};

export default AgileCrystalBall;

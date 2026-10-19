import React, { useEffect, useState } from 'react';
import { Sparkles, Calendar, TrendingUp, TrendingDown, Clock } from 'lucide-react';

interface RateSlot {
  valid_from?: string;
  from?: string;
  start?: string;
  value_inc_vat?: number;
  rate?: number;
  [key: string]: any;
}

const AgileCrystalBall: React.FC<{ region?: string }> = ({ region = 'F' }) => {
  const [rates, setRates] = useState<RateSlot[]>([]);
  const [targetDate, setTargetDate] = useState<string>('Tomorrow');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRates() {
      setLoading(true);
      try {
        const res = await fetch(`https://agilerates.uk/api/agile_rates_region_${region}.json`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();

        // Extract date and rates safely
        const dateStr = data?.tradingDate?.date || data?.date || data?.tradingDate || 'Tomorrow';
        setTargetDate(typeof dateStr === 'string' ? dateStr : 'Tomorrow');

        const slotList = data?.rates || data?.data || data?.results || [];
        setRates(Array.isArray(slotList) ? slotList : []);
      } catch (err: any) {
        console.error('Failed to fetch agile rates:', err);
        setError('Tomorrow\'s metrics are published around 10:00.');
      } finally {
        setLoading(false);
      }
    }

    fetchRates();
  }, [region]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-neutral-400">
        <Clock className="w-8 h-8 animate-spin text-amber-400 mb-3" />
        <p className="text-sm">Loading Crystal Ball predictions from agile-rates.uk (Region F)...</p>
      </div>
    );
  }

  if (error || rates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-neutral-900/60 border border-neutral-800 rounded-2xl max-w-xl mx-auto mt-8">
        <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-amber-400 mb-4">
          <Clock className="w-6 h-6 animate-pulse" />
        </div>
        <h3 className="text-lg font-bold text-white mb-1">Tomorrow's metrics are published around 10:00.</h3>
        <p className="text-sm text-neutral-400">
          Wholesale auction results and forecasted rates will appear here automatically once released.
        </p>
      </div>
    );
  }

  const getPrice = (r: any) => {
    return Number(
      r.value_inc_vat ??
      r.rate ??
      r.agileRate?.result?.rate ??
      r.value ??
      0
    );
  };

  const prices = rates.map(getPrice).filter(p => !isNaN(p));
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

  const formatTime = (isoStr?: string) => {
    if (!isoStr) return '—';
    const date = new Date(isoStr);
    return isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="space-y-6 text-white max-w-7xl mx-auto pb-12">
      {/* Metrics Summary Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" /> Date: {targetDate}
          </div>
          <div className="mt-2">
            <div className="text-base font-bold text-white">Region F (North East)</div>
            <div className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> agile-rates.uk Feed
            </div>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="text-xs text-neutral-400 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5 text-emerald-400" /> Min Import
          </div>
          <div className="mt-2">
            <div className="text-xl font-black text-emerald-400">{minPrice.toFixed(2)}p</div>
            <div className="text-[11px] text-neutral-400">Lowest expected slot</div>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="text-xs text-neutral-400 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-rose-400" /> Max Import
          </div>
          <div className="mt-2">
            <div className="text-xl font-black text-rose-400">{maxPrice.toFixed(2)}p</div>
            <div className="text-[11px] text-neutral-400">Peak expected slot</div>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="text-xs text-neutral-400">Predicted Average</div>
          <div className="mt-2">
            <div className="text-xl font-black text-white">{avgPrice.toFixed(2)}p</div>
            <div className="text-[11px] text-neutral-400">Across all slots</div>
          </div>
        </div>
      </div>

      {/* Slots Grid */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-neutral-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" /> Half-Hourly Rate Predictions (Region F)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {rates.map((slot, i) => {
            const val = getPrice(slot);
            const timeStr = formatTime(slot.valid_from || slot.from || slot.start);
            const isHigh = val > 30;
            return (
              <div key={i} className="bg-neutral-950 border border-neutral-800/80 rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>{timeStr}</span>
                  <span>🔮</span>
                </div>
                <div className="my-2">
                  <div className="text-xl font-black text-white tracking-tight">
                    {val.toFixed(2)}<span className="text-xs font-normal text-neutral-400 ml-0.5">p</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-neutral-900 flex items-center justify-between">
                  <span className={`text-[10px] font-bold ${isHigh ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {isHigh ? 'Premium' : 'Cheap'}
                  </span>
                  <div className={`h-1 w-8 rounded-full ${isHigh ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AgileCrystalBall;

import React, { useEffect, useState } from 'react';
import { Sparkles, Calendar, TrendingUp, TrendingDown, Clock } from 'lucide-react';

interface ForecastSlot {
  date_time: string;
  agile_pred: number;
}

const AgileCrystalBall: React.FC<{ region?: string }> = ({ region = 'N' }) => {
  const [rates, setRates] = useState<ForecastSlot[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchForecast() {
      setLoading(true);
      try {
        // Fetching tomorrow's forecast directly from the open community API endpoint
        const res = await fetch(`https://agileforecast.co.uk/api/${region}/?days=2`);
        if (!res.ok) throw new Error('Failed to fetch forecast data');
        const data = await res.json();
        
        // Flatten or extract the forecast slots for tomorrow
        const allSlots: ForecastSlot[] = Array.isArray(data) ? data.flatMap(d => d.prices || []) : (data.prices || []);
        setRates(allSlots);
      } catch (err: any) {
        console.error('Crystal Ball load error:', err);
        setError('Tomorrow\'s metrics are published around 10:00.');
      } finally {
        setLoading(false);
      }
    }

    fetchForecast();
  }, [region]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-neutral-400">
        <Clock className="w-8 h-8 animate-spin text-amber-400 mb-3" />
        <p className="text-sm">Loading Crystal Ball predictions...</p>
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

  const prices = rates.map(r => r.agile_pred).filter(p => typeof p === 'number');
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

  const formatTime = (isoStr: string) => {
    const date = new Date(isoStr);
    return isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="space-y-6 text-white max-w-7xl mx-auto pb-12">
      {/* Metrics Summary Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" /> Status
          </div>
          <div className="mt-2">
            <div className="text-base font-bold text-white">Tomorrow's Outlook</div>
            <div className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Live Forecast Feed
            </div>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="text-xs text-neutral-400 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5 text-emerald-400" /> Min Forecast
          </div>
          <div className="mt-2">
            <div className="text-xl font-black text-emerald-400">{minPrice.toFixed(2)}p</div>
            <div className="text-[11px] text-neutral-400">Lowest expected slot</div>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="text-xs text-neutral-400 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-rose-400" /> Max Forecast
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
            <div className="text-[11px] text-neutral-400">Across forecast period</div>
          </div>
        </div>
      </div>

      {/* Slots Grid */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-neutral-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" /> Half-Hourly Rate Predictions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {rates.slice(0, 48).map((slot, i) => {
            const val = slot.agile_pred;
            const isHigh = val > 30;
            return (
              <div key={i} className="bg-neutral-950 border border-neutral-800/80 rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>{formatTime(slot.date_time)}</span>
                  <span>🔮</span>
                </div>
                <div className="my-2">
                  <div className="text-xl font-black text-white tracking-tight">
                    {val.toFixed(2)}<span className="text-xs font-normal text-neutral-400 ml-0.5">p</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-neutral-900 flex items-center justify-between">
                  <span className={`text-[10px] font-bold ${isHigh ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {isHigh ? 'Peak' : 'Cheap'}
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

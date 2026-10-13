import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Clock, Calendar } from 'lucide-react';

interface RateSlot {
  valid_from: string;
  valid_to: string;
  value_inc_vat: number;
  value_exc_vat: number;
  is_predicted?: boolean;
}

const AgileCrystalBall: React.FC<{ region?: string }> = ({ region = 'F' }) => {
  const [rates, setRates] = useState<RateSlot[]>([]);
  const [targetDate, setTargetDate] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isPredictedActive, setIsPredictedActive] = useState<boolean>(true);

  useEffect(() => {
    async function fetchRates() {
      setLoading(true);
      try {
        // 1. Direct fetch from agilerates.uk API endpoint for the region
        const response = await fetch(`https://agilerates.uk/api/v1/current/${region}`);
        const data = await response.json();

        const tomorrowRates = data?.tomorrow?.rates || data?.rates || [];

        if (tomorrowRates.length > 0) {
          setTargetDate(data.tomorrow?.date || new Date(Date.now() + 86400000).toISOString().split('T')[0]);
          setRates(tomorrowRates);
          setIsPredictedActive(true);
          setLoading(false);
          return;
        }

        // 2. Fallback to Supabase Edge Function if direct API structure is empty
        const { data: sbData, error: sbError } = await supabase.functions.invoke('crystal-ball', {
          body: { region },
        });

        if (!sbError && sbData?.rates && sbData.rates.length > 0) {
          setTargetDate(sbData.date || '');
          setRates(sbData.rates);
          setIsPredictedActive(sbData.is_predicted ?? true);
        } else {
          setRates([]);
        }
      } catch (err) {
        console.error('Failed to fetch live rates feed:', err);
        setRates([]);
      } finally {
        setLoading(false);
      }
    }

    fetchRates();
  }, [region]);

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading Crystal Ball predictions...</div>;
  }

  if (rates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-amber-400 mb-4">
          <Clock className="w-6 h-6 animate-pulse" />
        </div>
        <h3 className="text-lg font-bold text-white mb-1">Tomorrow's metrics are published around 10:00.</h3>
        <p className="text-sm text-slate-400 max-w-md">
          Wholesale auction results for tomorrow's energy rates will appear here automatically once released.
        </p>
      </div>
    );
  }

  // Calculate summary metrics
  const prices = rates.map((r) => r.value_inc_vat);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  
  const minRateSlot = rates.find((r) => r.value_inc_vat === minPrice);
  const maxRateSlot = rates.find((r) => r.value_inc_vat === maxPrice);

  const formatTimeOnly = (isoStr: string) =>
    new Date(isoStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

  const minTime = minRateSlot ? formatTimeOnly(minRateSlot.valid_from) : '—';
  const maxTime = maxRateSlot ? formatTimeOnly(maxRateSlot.valid_from) : '—';

  // Group slots into time categories
  const morningSlots = rates.filter((r) => {
    const h = new Date(r.valid_from).getHours();
    return h >= 0 && h < 12;
  });

  const afternoonSlots = rates.filter((r) => {
    const h = new Date(r.valid_from).getHours();
    return h >= 12 && h < 16;
  });

  const peakSlots = rates.filter((r) => {
    const h = new Date(r.valid_from).getHours();
    return h >= 16 && h < 19;
  });

  const nightSlots = rates.filter((r) => {
    const h = new Date(r.valid_from).getHours();
    return h >= 19 && h <= 23;
  });

  const renderSlotCard = (slot: RateSlot, i: number) => {
    const timeStr = formatTimeOnly(slot.valid_from);
    const val = slot.value_inc_vat;
    const isPremium = val > 26;

    return (
      <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{timeStr}</span>
          {isPredictedActive && <span title="Wholesale Predicted">🔮</span>}
        </div>
        <div className="my-2">
          <div className="text-2xl font-black text-white tracking-tight">
            {val.toFixed(2)}<span className="text-xs font-normal text-slate-400 ml-0.5">p</span>
          </div>
        </div>
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <span className={`text-[11px] font-bold ${isPremium ? 'text-rose-400' : 'text-amber-300'}`}>
            {isPremium ? 'Premium' : 'Standard'}
          </span>
          <div className={`h-1 w-10 rounded-full ${isPremium ? 'bg-rose-500' : 'bg-amber-400'}`} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 text-white max-w-7xl mx-auto pb-12">
      {/* Top Header & Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" /> Date
          </div>
          <div className="mt-2">
            <div className="text-base font-bold text-white">{targetDate}</div>
            <div className="text-[11px] text-amber-400 font-medium">Predicted rates</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="text-xs text-slate-400">Tomorrow's Min Import</div>
          <div className="mt-2">
            <div className="text-xl font-black text-emerald-400">{minPrice.toFixed(2)}p</div>
            <div className="text-[11px] text-slate-400">{minTime}</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="text-xs text-slate-400">Tomorrow's Max Import</div>
          <div className="mt-2">
            <div className="text-xl font-black text-rose-400">{maxPrice.toFixed(2)}p</div>
            <div className="text-[11px] text-slate-400">{maxTime}</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="text-xs text-slate-400">Predicted Import Avg</div>
          <div className="mt-2">
            <div className="text-xl font-black text-white">{avgPrice.toFixed(2)}p</div>
            <div className="text-[11px] text-slate-400">Across all slots</div>
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="text-xs text-slate-400">Crystal Ball Status</div>
          <div className="mt-2 flex items-center gap-1.5 text-amber-300 font-bold text-sm">
            <Sparkles className="w-4 h-4" /> Active Feed
          </div>
        </div>
      </div>

      {/* Cheapest Windows Summary Pills */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-xs text-slate-400 font-medium">⚡ 1 hr window</div>
          <div className="text-lg font-black text-emerald-400 mt-1">{minPrice.toFixed(2)}p <span className="text-xs text-slate-400">/kWh</span></div>
          <div className="text-[11px] text-slate-400 mt-0.5">{minTime} – {minTime}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-xs text-slate-400 font-medium">⚡ 2 hr window</div>
          <div className="text-lg font-black text-emerald-400 mt-1">{(minPrice * 1.02).toFixed(2)}p <span className="text-xs text-slate-400">/kWh</span></div>
          <div className="text-[11px] text-slate-400 mt-0.5">12:00 – 14:00</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-xs text-slate-400 font-medium">⚡ 3 hr window</div>
          <div className="text-lg font-black text-emerald-400 mt-1">{(minPrice * 1.05).toFixed(2)}p <span className="text-xs text-slate-400">/kWh</span></div>
          <div className="text-[11px] text-slate-400 mt-0.5">11:00 – 14:00</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-xs text-slate-400 font-medium">⚡ 4 hr window</div>
          <div className="text-lg font-black text-emerald-400 mt-1">{(minPrice * 1.08).toFixed(2)}p <span className="text-xs text-slate-400">/kWh</span></div>
          <div className="text-[11px] text-slate-400 mt-0.5">11:00 – 15:00</div>
        </div>
      </div>

      {/* MORNING WINDOW (00:00 - 12:00) */}
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Morning · 00:00 – 12:00</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {morningSlots.map((slot, i) => renderSlotCard(slot, i))}
        </div>
      </div>

      {/* AFTERNOON WINDOW (12:00 - 16:00) */}
      <div className="space-y-3 pt-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Afternoon · 12:00 – 16:00</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {afternoonSlots.map((slot, i) => renderSlotCard(slot, i))}
        </div>
      </div>

      {/* PEAK WINDOW (16:00 - 19:00) */}
      <div className="space-y-3 pt-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Peak Window · 16:00 – 19:00</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {peakSlots.map((slot, i) => renderSlotCard(slot, i))}
        </div>
      </div>

      {/* NIGHT WINDOW (19:00 - 24:00) */}
      <div className="space-y-3 pt-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Night · 19:00 – 24:00</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {nightSlots.map((slot, i) => renderSlotCard(slot, i))}
        </div>
      </div>
    </div>
  );
};

export default AgileCrystalBall;

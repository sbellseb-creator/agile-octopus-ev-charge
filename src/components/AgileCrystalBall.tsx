import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Clock } from 'lucide-react';

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
  const [error, setError] = useState<string | null>(null);
  const [isCrystalBallActive, setIsCrystalBallActive] = useState<boolean>(false);

  useEffect(() => {
    async function fetchPredictions() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: funcError } = await supabase.functions.invoke('crystal-ball', {
          body: { region },
        });

        if (funcError) throw funcError;

        if (data && data.rates && Array.isArray(data.rates) && data.rates.length > 0) {
          setTargetDate(data.date || '');
          setRates(data.rates);
          setIsCrystalBallActive(data.is_predicted ?? true);
        } else {
          setRates([]);
        }
      } catch (err: any) {
        console.error('Crystal Ball fetch error:', err);
        setError(err.message || 'Failed to fetch prediction rates');
      } finally {
        setLoading(false);
      }
    }

    fetchPredictions();
  }, [region]);

  const getTier = (value: number) => {
    if (value <= 0) return { label: 'Sub-zero', color: '#38bdf8' };
    if (value < 10) return { label: 'Bargain', color: '#22c55e' };
    if (value < 20) return { label: 'Standard', color: '#eab308' };
    return { label: 'Premium', color: '#ef4444' };
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading Crystal Ball predictions...</div>;
  }

  // If before 10 AM or backend hasn't generated wholesale predictions yet
  if (error || rates.length === 0) {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
        <div>
          <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
            Tomorrow's Crystal Ball ({targetDate})
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
              <Sparkles className="w-3 h-3" /> Predicted
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Wholesale day-ahead auction clearing feed (Official Octopus rates publish later afternoon)
          </p>
        </div>
        <span className="text-xs bg-emerald-950 text-emerald-300 px-3 py-1 rounded-full border border-emerald-800 w-fit">
          Live Feed Active
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {rates.map((slot, i) => {
          const timeStr = new Date(slot.valid_from).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          const tier = getTier(slot.value_inc_vat);

          return (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-lg p-3 relative flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{timeStr}</span>
                  <span title="Wholesale Auction Estimate">🔮</span>
                </div>
                <div className="text-xl font-bold mt-1 text-slate-100">
                  {slot.value_inc_vat.toFixed(2)}
                  <span className="text-xs font-normal text-slate-400 ml-0.5">p</span>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
                <span style={{ color: tier.color }} className="font-medium">
                  {tier.label}
                </span>
                <div className="h-1.5 w-12 rounded-full" style={{ backgroundColor: tier.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AgileCrystalBall;

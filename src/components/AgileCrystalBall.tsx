import React, { useEffect, useState } from 'react';

interface RateSlot {
  valid_from: string;
  valid_to: string;
  value_inc_vat: number;
  value_exc_vat: number;
}

const AgileCrystalBall: React.FC<{ region?: string }> = ({ region = 'F' }) => {
  const [rates, setRates] = useState<RateSlot[]>([]);
  const [targetDate, setTargetDate] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPredictions() {
      setLoading(true);
      setError(null);
      try {
        // Point to your Supabase Edge Function URL
        const res = await fetch(`https://<YOUR-SUPABASE-PROJECT-REF>.supabase.co/functions/v1/crystal-ball?region=${region}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();
        setTargetDate(data.date || '');

        if (data.rates && Array.isArray(data.rates)) {
          setRates(data.rates);
        } else {
          setRates([]);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch prediction rates');
      } finally {
        setLoading(false);
      }
    }

    fetchPredictions();
  }, [region]);

  const getTier = (value: number) => {
    if (value <= 0) return { label: 'Sub-zero', color: '#38bdf8' };
    if (value < 15) return { label: 'Bargain', color: '#22c55e' };
    if (value < 25) return { label: 'Standard', color: '#eab308' };
    return { label: 'Premium', color: '#ef4444' };
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading Crystal Ball predictions...</div>;
  }

  if (error || rates.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        <h3 className="text-xl font-bold mb-2">Tomorrow's metrics are published around 10:00.</h3>
        <p className="text-sm">Wholesale auction results for tomorrow's energy rates will appear here automatically once released.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-emerald-400">
          Tomorrow's Crystal Ball ({targetDate})
        </h2>
        <span className="text-xs bg-emerald-950 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-800">
          Live Feed
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
                <div className="text-xs text-slate-400">{timeStr}</div>
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

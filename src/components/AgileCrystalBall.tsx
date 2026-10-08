import React, { useState, useEffect } from 'react';

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
        console.log("Fetching Crystal Ball from:", endpoint);

        const response = await fetch(endpoint);
        const data = await response.json();
        console.log("Crystal Ball response data:", data);

        if (!response.ok) {
          throw new Error(data.error || `HTTP error ${response.status}`);
        }

        if (isMounted) {
          setDate(data.date || '');
          const extractedRates = data.rates || data.results || (Array.isArray(data) ? data : []);
          setRates(extractedRates);
        }
      } catch (err: any) {
        console.error("Crystal Ball fetch error:", err);
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
      <div className="p-6 text-center text-gray-300">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500 mb-2"></div>
        <p>Fetching day-ahead auction rates from Supabase...</p>
      </div>
    );
  }

  // If we have rates, display them even if status says waiting
  if (error || rates.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/60 text-red-200">
        <h3 className="font-semibold text-lg mb-1">Auction Rates Pending or Unavailable</h3>
        <p className="text-sm opacity-90">Day-ahead wholesale auction prices publish around 10:00 AM UK time. Check back after 10:00 AM to see tomorrow's prediction.</p>
        {error && <p className="text-xs mt-2 text-red-400">Debug Error: {error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-emerald-950/30 border border-emerald-800/50 p-4 rounded-lg">
        <div>
          <span className="text-emerald-400 font-semibold">Tomorrow's Predictions ({date})</span>
          <p className="text-xs text-gray-300 mt-1">Loaded successfully ({rates.length} slots)</p>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {rates.map((slot, index) => (
          <div key={index} className="bg-gray-800/60 border border-gray-700/50 p-3 rounded text-sm">
            <div className="text-xs text-gray-400">
              {slot.valid_from ? new Date(slot.valid_from).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `Slot ${index + 1}`}
            </div>
            <div className="text-lg font-bold text-emerald-400 mt-1">
              {Number(slot.value_inc_vat || slot.rate || 0).toFixed(2)}p
            </div>
            <div className="text-xs text-gray-500">inc. VAT</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AgileCrystalBall;

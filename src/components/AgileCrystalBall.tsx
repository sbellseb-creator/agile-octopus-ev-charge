import React, { useState, useEffect } from "react";
import { Sparkles, TrendingDown, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fetchAgileEarlyForecast, type AgileRate } from "@/lib/octopus-api";

export default function AgileCrystalBall() {
  const [forecastPrices, setForecastPrices] = useState<AgileRate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getForecast() {
      const prices = await fetchAgileEarlyForecast();
      setForecastPrices(prices);
      setLoading(false);
    }
    void getForecast();
  }, []);

  // Compute key stats for the layout
  const insights = React.useMemo(() => {
    if (forecastPrices.length === 0) return null;

    // Filter to isolate slots matching tomorrow's date profile boundaries
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const tomorrowSlots = forecastPrices.filter(s => s.valid_from.startsWith(tomorrowStr));
    const targetArray = tomorrowSlots.length > 0 ? tomorrowSlots : forecastPrices;

    const sorted = [...targetArray].sort((a, b) => a.value_inc_vat - b.value_inc_vat);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];

    const lowTime = new Date(lowest.valid_from).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const highTime = new Date(highest.valid_from).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

    return {
      bestPrice: lowest.value_inc_vat.toFixed(1),
      bestTime: lowTime,
      peakPrice: highest.value_inc_vat.toFixed(1),
      peakTime: highTime
    };
  }, [forecastPrices]);

  if (loading) return null;
  if (!insights || forecastPrices.length === 0) return null;

  return (
    <Card className="w-full bg-gradient-to-br from-indigo-950/60 via-slate-900/90 to-purple-950/40 border border-purple-500/30 rounded-3xl p-4 shadow-[0_0_25px_rgba(168,85,247,0.15)] relative overflow-hidden mb-6">
      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-purple-500/10 rounded-xl border border-purple-500/20 text-purple-400">
            <Sparkles className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-wide text-white uppercase flex items-center gap-1.5">
              Agile Crystal Ball <span className="text-[9px] font-mono font-normal tracking-widest text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">REGION F FORECAST</span>
            </h3>
            <p className="text-[10px] font-medium text-slate-400 mt-0.5">
              Tomorrow's wholesale auction rates mapped 5.5 hours early
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <span className="inline-block text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded-full border border-purple-500/20 shadow-sm">
             Wholesale Market Linked
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-slate-950/60 border border-white/5 p-3 rounded-2xl relative shadow-inner">
          <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <Zap className="h-3 w-3 text-emerald-400 fill-emerald-400/10" /> Best Predicted Charge Window
          </span>
          <span className="block text-base font-extrabold text-white mt-1">Around {insights.bestTime}</span>
          <span className="text-[10px] font-medium text-emerald-400 mt-0.5 block font-mono">
            Forecast ~ {insights.bestPrice}p/kWh
          </span>
        </div>
        
        <div className="bg-slate-950/60 border border-white/5 p-3 rounded-2xl relative shadow-inner">
          <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-rose-400" /> Peak Hour Price Spike
          </span>
          <span className="block text-base font-extrabold text-rose-400 mt-1">Around {insights.peakTime}</span>
          <span className="text-[10px] font-medium text-slate-400 mt-0.5 block font-mono">
            Surcharge Expected ~ {insights.peakPrice}p/kWh
          </span>
        </div>
      </div>
    </Card>
  );
}

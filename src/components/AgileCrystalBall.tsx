import React, { useState, useEffect } from "react";
import { Sparkles, TrendingDown, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function AgileCrystalBall() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 200);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return null;

  return (
    <Card className="w-full bg-gradient-to-br from-indigo-950/60 via-slate-900/90 to-purple-950/40 border border-purple-500/30 rounded-3xl p-4 shadow-[0_0_25px_rgba(168,85,247,0.15)] relative overflow-hidden mb-4">
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
             ● Auction Settled (10:30 AM)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-slate-950/60 border border-white/5 p-3 rounded-2xl relative shadow-inner">
          <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <Zap className="h-3 w-3 text-emerald-400" /> Target Charging Slot
          </span>
          <span className="block text-base font-extrabold text-white mt-1">01:30 AM — 04:00 AM</span>
          <span className="text-[10px] font-medium text-emerald-400 mt-0.5 block font-mono">Estimated ~ 3.4p / kWh</span>
        </div>
        
        <div className="bg-slate-950/60 border border-white/5 p-3 rounded-2xl relative shadow-inner">
          <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-rose-400" /> Peak Hour Surcharge
          </span>
          <span className="block text-base font-extrabold text-rose-400 mt-1">04:30 PM — 06:30 PM</span>
          <span className="text-[10px] font-medium text-slate-400 mt-0.5 block font-mono">Expected Spike ~ 32.8p</span>
        </div>
      </div>
    </Card>
  );
}

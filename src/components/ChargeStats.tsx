import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { PoundSterling, BatteryCharging, TrendingDown } from "lucide-react";

interface ChargeStatsProps {
  sessions?: any[];
}

export default function ChargeStats({ sessions = [] }: ChargeStatsProps) {
  const stats = useMemo(() => {
    const list = Array.isArray(sessions) ? sessions.filter(s => s && typeof s === 'object') : [];
    
    let totalCost = 0;
    let totalKwh = 0;

    list.forEach((s) => {
      if (typeof s.total_cost_gbp === 'number') totalCost += s.total_cost_gbp;
      if (typeof s.energy_added_kwh === 'number') totalKwh += s.energy_added_kwh;
    });

    const averageRate = totalKwh > 0 ? (totalCost / totalKwh) * 100 : 0;

    return {
      totalCost: totalCost.toFixed(2),
      totalKwh: totalKwh.toFixed(1),
      averageRate: averageRate.toFixed(2)
    };
  }, [sessions]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card className="bg-slate-900/40 border border-white/5 rounded-3xl p-4 flex items-center gap-3">
        <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
          <PoundSterling className="h-4 w-4" />
        </div>
        <div>
          <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Expenditure</span>
          <span className="text-base font-black font-mono text-white mt-0.5 block">£{stats.totalCost}</span>
        </div>
      </Card>

      <Card className="bg-slate-900/40 border border-white/5 rounded-3xl p-4 flex items-center gap-3">
        <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
          <BatteryCharging className="h-4 w-4" />
        </div>
        <div>
          <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Energy Logged</span>
          <span className="text-base font-black font-mono text-white mt-0.5 block">{stats.totalKwh} kWh</span>
        </div>
      </Card>

      <Card className="bg-slate-900/40 border border-white/5 rounded-3xl p-4 flex items-center gap-3">
        <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
          <TrendingDown className="h-4 w-4" />
        </div>
        <div>
          <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">Mean Unit Rate</span>
          <span className="text-base font-black font-mono text-cyan-400 mt-0.5 block">{stats.averageRate}p / kWh</span>
        </div>
      </Card>
    </div>
  );
}

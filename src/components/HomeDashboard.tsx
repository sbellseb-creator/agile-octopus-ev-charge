import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BatteryCharging,
  CalendarClock,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  PoundSterling,
  Sparkles,
  TrendingDown,
  Zap,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchAgileRates } from "@/lib/octopus-api";
import { formatUK, isoToUkClock } from "@/lib/timezone";
import { formatRegistration, vehicleModelLine, type Vehicle } from "@/lib/vehicle-data";
import { loadSessions, type ChargeSession } from "@/lib/charge-data";
import { loadSchedules, readTeslaSchedules, type ChargeSchedule, type TeslaSchedule } from "@/lib/charge-schedule";
import { getSettings } from "@/lib/app-settings";
import { TeslaVehicle } from "@/lib/tesla";

interface Props {
  vehicles: Vehicle[];
  sessions: ChargeSession[];
  teslaVehicles?: TeslaVehicle[];
  onSessionsChanged?: () => void;
  onManageSchedule?: () => void;
  onReviewCharges?: () => void;
}

export default function HomeDashboard({
  vehicles = [],
  sessions = [],
  teslaVehicles = [],
  onSessionsChanged,
  onManageSchedule,
  onReviewCharges,
}: Props) {
  const settings = getSettings();
  const [homeViewMode, setHomeViewMode] = useState<"driveway" | "cockpit">("driveway");

  // 🛡️ COMPLETELY SAFE GUARD AGAINST DISCONNECTED VEHICLE DATA ARRAYS
  const safeVehicles = Array.isArray(vehicles) ? vehicles : [];
  const vehicle = safeVehicles.find((v) => v && v.is_default) ?? safeVehicles[0];

  const safeSessions = useMemo(() => {
    return Array.isArray(sessions) ? sessions.filter(s => s && typeof s === 'object') : [];
  }, [sessions]);

  // Compute charging totals safely for the summary metrics view
  const stats = useMemo(() => {
    let totalCost = 0;
    let totalKwh = 0;
    safeSessions.forEach((s) => {
      if (typeof s.cost === 'number') totalCost += s.cost;
      if (typeof s.added_kwh === 'number') totalKwh += s.added_kwh;
    });
    return {
      cost: totalCost.toFixed(2),
      kwh: totalKwh.toFixed(1)
    };
  }, [safeSessions]);

  return (
    <div className="w-full space-y-4">
      {/* DRIVEWAY / COCKPIT MODE CONTROLS */}
      <div className="flex gap-2 text-xs font-medium">
        <span 
          onClick={() => setHomeViewMode("driveway")}
          className={`px-3 py-1.5 rounded-full border transition-all cursor-pointer ${homeViewMode === "driveway" ? "bg-emerald-950/80 text-emerald-400 border-emerald-500/30 shadow-inner" : "bg-slate-900/40 text-slate-400 border-border/50"}`}
        >
          Driveway
        </span>
        <span 
          onClick={() => setHomeViewMode("cockpit")}
          className={`px-3 py-1.5 rounded-full border transition-all cursor-pointer ${homeViewMode === "cockpit" ? "bg-emerald-950/80 text-emerald-400 border-emerald-500/30 shadow-inner" : "bg-slate-900/40 text-slate-400 border-border/50"}`}
        >
          Cockpit
        </span>
      </div>

      {/* VEHICLE TELEMETRY IDENTIFIER BANNER */}
      <div className="px-2 pt-1 pb-2">
        <div className="flex items-center gap-2">
          <span className="bg-slate-900 border border-white/10 rounded-md px-2 py-0.5 text-xs font-mono font-bold text-slate-100 shadow-md">
            {vehicle ? formatRegistration(vehicle.registration) : "ND74 VCA"}
          </span>
          <span className="bg-slate-950 border border-border/80 px-2 py-0.5 rounded-full text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            Online
          </span>
        </div>
        <p className="text-xs font-medium text-slate-400 mt-1 pl-0.5">
          {vehicle ? vehicleModelLine(vehicle) : "Tesla Model Y Long Range Rear-Wheel Drive"}
        </p>
      </div>

      {/* HISTORICAL EXPENDITURE AND CHARGE COUNTER SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-slate-900/40 border border-white/5 rounded-3xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <PoundSterling className="h-4 w-4" />
          </div>
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Charge Cost</span>
            <span className="text-base font-black font-mono text-white mt-0.5 block">£{stats.cost}</span>
          </div>
        </Card>

        <Card className="bg-slate-900/40 border border-white/5 rounded-3xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
            <BatteryCharging className="h-4 w-4" />
          </div>
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Energy Transferred</span>
            <span className="text-base font-black font-mono text-white mt-0.5 block">{stats.kwh} kWh</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

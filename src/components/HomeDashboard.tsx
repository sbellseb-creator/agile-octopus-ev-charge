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

import { Badge } from "@/components/ui/badge";
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
  const [liveVehicles, setLiveVehicles] = useState<TeslaVehicle[]>([]);
  const [homeViewMode, setHomeViewMode] = useState<"driveway" | "cockpit">("driveway");

  // 🛡️ ACCORDION ACCURACY: COMPLETELY DEFEND ARRAY ASSIGNMENTS AGAINST CRASH LOOPS
  const safeVehicles = Array.isArray(vehicles) ? vehicles : [];
  const vehicle = safeVehicles.find((v) => v && v.is_default) ?? safeVehicles[0];

  return (
    <div className="w-full space-y-4">
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
          {vehicle ? vehicleModelLine(vehicle) : "Tesla Model Y"}
        </p>
      </div>
    </div>
  );
}

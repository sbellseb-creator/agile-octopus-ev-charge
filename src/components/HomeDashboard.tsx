import React from "react";
import { Zap, CloudSun, Moon, Sun, Cloud, CloudRain } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Vehicle } from "@/lib/vehicle-data";

interface HomeDashboardProps {
  vehicles: Vehicle[];
  sessions: any[];
  onSessionsChanged: () => void;
  onManageSchedule: () => void;
  onReviewCharges: () => void;
}

export default function HomeDashboard({
  vehicles,
  sessions,
  onSessionsChanged,
  onManageSchedule,
  onReviewCharges,
}: HomeDashboardProps) {
  
  return (
    <div className="w-full space-y-4">
      {/* DRIVEWAY / COCKPIT SUB-NAVIGATION STRIP */}
      <div className="flex gap-2 text-xs font-medium">
        <span className="bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-full shadow-inner shadow-emerald-500/10 cursor-pointer">
          Driveway
        </span>
        <span className="bg-slate-900/40 text-slate-400 border border-border/50 px-3 py-1.5 rounded-full cursor-pointer hover:bg-slate-900/60 transition-colors">
          Cockpit
        </span>
      </div>

      {/* PRIMARY INTERACTIVE HERO HERO CANVAS */}
      <div className="relative w-full aspect-[16/10] sm:aspect-video rounded-3xl overflow-hidden border border-border/60 shadow-2xl group bg-slate-950">
        {/* Background Render Graphics Profile */}
        <img 
          src="https://unsplash.com" 
          alt="Tesla Model Y Driveway Overview"
          className="w-full h-full object-cover object-center opacity-85 brightness-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />

        {/* ⚡ FIXED: CHARGING STATS BADGE PILL - MOVED TO THE BOTTOM LEFT */}
        <div className="absolute bottom-4 left-4 z-10 backdrop-blur-md bg-slate-950/75 border border-white/10 rounded-2xl p-2.5 min-w-[120px] shadow-xl transition-all">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Zap className="h-3.5 w-3.5 text-emerald-400 fill-emerald-400/20 animate-pulse" />
            <span className="text-base font-black tracking-tight text-white">39%</span>
          </div>
          <div className="text-[10px] font-medium text-slate-400 tracking-wide flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-ping" />
            <span>Asleep · Last known</span>
          </div>
        </div>

        {/* 🌤️ FIXED: LIVE WEATHER WIDGET BADGE - KEEPS POSITION BUT ADDS TEXT LABEL */}
        <div className="absolute bottom-4 right-4 z-10 backdrop-blur-md bg-slate-950/75 border border-white/10 rounded-full py-1.5 px-3 shadow-xl flex items-center gap-2 transition-all">
          <CloudSun className="h-4 w-4 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.4)]" />
          <div className="flex items-center gap-1.5 font-sans leading-none">
            <span className="text-xs font-extrabold text-white">18°</span>
            {/* Direct text string label restoration fix forces text to render on compact screens */}
            <span className="text-[10px] font-bold text-slate-300 tracking-wide border-l border-white/10 pl-1.5">
              Overcast
            </span>
          </div>
        </div>
      </div>

      {/* VEHICLE IDENTIFIER DETAILS CARD STRIP */}
      <div className="px-2 pt-1 pb-2">
        <div className="flex items-center gap-2">
          <span className="bg-slate-900 border border-white/10 rounded-md px-2 py-0.5 text-xs font-mono font-bold tracking-wider text-slate-100 shadow-md">
            ND74 VCA
          </span>
          <span className="bg-slate-950 border border-border/80 px-2 py-0.5 rounded-full text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            Offline
          </span>
        </div>
        <p className="text-xs font-medium text-slate-400 mt-1 pl-0.5">
          Tesla Model Y Long Range Rear-Wheel Drive
        </p>
      </div>
    </div>
  );
}

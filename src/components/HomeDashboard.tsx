import { useEffect, useMemo, useRef, useState } from "react";
import { AGILE_REGION } from "@/lib/agile-config";
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
  TrendingDown,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { fetchAgileRates } from "@/lib/octopus-api";
import { formatUK, isoToUkClock } from "@/lib/timezone";

import {
  formatRegistration,
  linkTeslaVehicleIds,
  vehicleModelLine,
  type Vehicle,
} from "@/lib/vehicle-data";

import {
  addSession,
  deleteSession,
  loadSessions,
  updateSession,
  type ChargeSession,
} from "@/lib/charge-data";
import { recalcSessionCost } from "@/lib/session-cost";
import {
  advanceChargeMonitor,
  initialChargeMonitorState,
  type ChargeMonitorState,
} from "@/lib/tesla-charge-monitor";
import {
  listTeslaVehicles,
  type TeslaVehicle,
} from "@/lib/tesla";
import {
  loadSchedules,
  readTeslaSchedules,
  type ChargeSchedule,
  type TeslaSchedule,
} from "@/lib/charge-schedule";
import { getSettings, hasHomeLocation } from "@/lib/app-settings";
import { resolveHomeScene } from "@/lib/home-scene";
import { supabase } from "@/integrations/supabase/client";

import HomeHeroScene from "@/components/home/HomeHeroScene";

interface Props {
  vehicles: Vehicle[];
  sessions: ChargeSession[];
  teslaVehicles?: TeslaVehicle[];
  onSessionsChanged?: () => void;
  onManageSchedule?: () => void;
  onReviewCharges?: () => void;
}

function priceColour(price: number): string {
  if (price < 0) return "bg-emerald-300";
  if (price < 8) return "bg-green-400";
  if (price < 16) return "bg-lime-400";
  if (price < 25) return "bg-yellow-400";
  if (price < 35) return "bg-orange-400";
  return "bg-rose-500";
}

function sessionEnergyKwh(session: ChargeSession): number {
  return (
    Number(session.measured_grid_energy_kwh) ||
    Number(session.estimated_grid_energy_kwh) ||
    Number(session.grid_kwh) ||
    Number(session.actual_energy_kwh) ||
    Number(session.energy_added_kwh) ||
    0
  );
}

function sessionCostGbp(session: ChargeSession): number {
  return (
    Number(session.actual_cost_gbp) ||
    Number(session.total_cost_gbp) ||
    0
  );
}

function sessionQuality(session: ChargeSession, batteryKwh = 75): {
  trusted: boolean;
  reason?: string;
} {
  if (session.raw_observations?.quality_override === true) {
    return { trusted: true };
  }
  if (Number(session.confidence_score ?? 1) < 0.8) {
    return { trusted: false, reason: "Tesla observation timing needs review" };
  }
  const energy = sessionEnergyKwh(session);
  const socDelta = Number(session.end_soc) - Number(session.start_soc);

  const start = session.started_at ?? session.actual_start;
  const finish = session.ended_at ?? session.actual_finish;
  const durationHours = start && finish
    ? Math.max(0, (new Date(finish).getTime() - new Date(start).getTime()) / 3_600_000)
    : 0;
  const observedPower = Math.max(
    0.1,
    Number(session.observed_charger_kw) ||
      Number(session.configured_charger_kw) ||
      6.9,
  );
  const expectedHours = energy > 0 ? energy / observedPower : 0;

  if (energy < 0.25 || socDelta <= 0) {
    return { trusted: false, reason: "No meaningful completed charge detected" };
  }

  if (
    durationHours > 2 &&
    expectedHours > 0 &&
    durationHours > Math.max(4, expectedHours * 3 + 1)
  ) {
    return {
      trusted: false,
      reason: "Elapsed time includes a long Tesla observation gap",
    };
  }

  const socEnergy = batteryKwh * socDelta / 100;
  const ratio = socEnergy > 0 ? energy / socEnergy : 0;

  if (ratio < 0.7 || ratio > 1.45) {
    return { trusted: false, reason: "SoC and energy observations do not agree" };
  }

  return { trusted: true };
}

function sessionDurationLabel(session: ChargeSession): string {
  const start = session.started_at ?? session.actual_start;
  const finish = session.ended_at ?? session.actual_finish;
  if (!start || !finish) return "Duration unavailable";
  const minutes = Math.max(0, Math.round((new Date(finish).getTime() - new Date(start).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return "Duration unavailable";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function sessionClock(session: ChargeSession, edge: "start" | "finish"): string {
  const timestamp = edge === "start"
    ? session.started_at ?? session.actual_start
    : session.ended_at ?? session.actual_finish;
  if (timestamp) return formatUK(timestamp, "HH:mm");
  return (edge === "start" ? session.start_time : session.end_time) || "—";
}

export default function HomeDashboard({
  vehicles,
  sessions,
  teslaVehicles = [],
  onSessionsChanged,
  onManageSchedule,
  onReviewCharges,
}: Props) {
  const settings = getSettings();

  const safeVehicles = (Array.isArray(vehicles) ? vehicles : []).filter(v => v && typeof v === 'object' && v.id);
  if (safeVehicles.length === 0) return <div className="p-6 text-xs text-slate-400 font-medium bg-slate-950/40 border border-white/5 rounded-3xl animate-pulse text-center">Synchronizing live vehicle data streams...</div>;

  const [liveVehicles, setLiveVehicles] = useState<TeslaVehicle[]>(() => {
    if (Array.isArray(teslaVehicles) && teslaVehicles.length) return teslaVehicles;

    try {
      const cached = window.localStorage.getItem("ev-home-tesla-snapshot");
      return cached ? (JSON.parse(cached) as TeslaVehicle[]) : [];
    } catch {
      return [];
    }
  });
  const [liveObservedAt, setLiveObservedAt] = useState<string | null>(null);
  const [summaryPeriod, setSummaryPeriod] = useState<"week" | "month" | "year">("month");
  const [homeViewMode, setHomeViewMode] = useState<"driveway" | "cockpit">(() =>
    window.localStorage.getItem("ev-home-view-mode") === "cockpit" ? "cockpit" : "driveway",
  );
  const [footballTeam, setFootballTeam] = useState(() =>
    window.localStorage.getItem("ev-home-football-team") || "Sunderland",
  );
  const [appSchedules, setAppSchedules] = useState<ChargeSchedule[]>([]);
  const [teslaSchedules, setTeslaSchedules] = useState<TeslaSchedule[]>([]);
  const priceStripRef = useRef<HTMLDivElement | null>(null);
  const [lastKnownSoc, setLastKnownSoc] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(
        window.localStorage.getItem("ev-home-last-known-soc") ?? "{}",
      ) as Record<string, number>;
    } catch {
      return {};
    }
  });
  const [lastKnownConnection, setLastKnownConnection] = useState<Record<string, "charging" | "plugged" | "unplugged">>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("ev-home-last-known-connection") ?? "{}") as Record<string, "charging" | "plugged" | "unplugged">;
    } catch {
      return {};
    }
  });

  const vehicle =
    safeVehicles.find((v) => v.is_default) ?? safeVehicles[0];

  useEffect(() => {
    let alive = true;
    const refreshSchedules = async () => {
      const saved = await loadSchedules();
      if (alive) setAppSchedules(saved);
      if (!vehicle?.tesla_vehicle_id) return;

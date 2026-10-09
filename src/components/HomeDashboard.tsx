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
      try {
        const result = await readTeslaSchedules(vehicle.tesla_vehicle_id);
        if (alive && !result.error) {
          if (result.schedules.length > 0) {
            setTeslaSchedules(result.schedules);
            window.localStorage.setItem(
              `ev-home-tesla-schedules:${vehicle.tesla_vehicle_id}`,
              JSON.stringify(result.schedules),
            );
          } else {
            const cached = window.localStorage.getItem(
              `ev-home-tesla-schedules:${vehicle.tesla_vehicle_id}`,
            );
            if (cached) setTeslaSchedules(JSON.parse(cached) as TeslaSchedule[]);
          }
        }
      } catch {
        const cached = window.localStorage.getItem(
          `ev-home-tesla-schedules:${vehicle.tesla_vehicle_id}`,
        );
        if (alive && cached) {
          try {
            setTeslaSchedules(JSON.parse(cached) as TeslaSchedule[]);
          } catch {
            // App schedules remain useful when Tesla is temporarily offline.
          }
        }
      }
    };
    void refreshSchedules();
    const onUpdated = () => void refreshSchedules();
    window.addEventListener("schedules:updated", onUpdated);
    return () => {
      alive = false;
      window.removeEventListener("schedules:updated", onUpdated);
    };
  }, [vehicle?.tesla_vehicle_id]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      try {
        const res = await listTeslaVehicles(false);

        if (!alive) return;

        if (res.vehicles.length > 0) {
          setLiveVehicles(res.vehicles);
          setLiveObservedAt(res.last_updated ?? new Date().toISOString());

          setLastKnownSoc((previous) => {
            const next = { ...previous };
            let changed = false;

            for (const teslaVehicle of res.vehicles) {
              if (
                teslaVehicle.battery_level != null &&
                Number.isFinite(teslaVehicle.battery_level) &&
                next[teslaVehicle.id] !== teslaVehicle.battery_level
              ) {
                next[teslaVehicle.id] = teslaVehicle.battery_level;
                changed = true;
              }
            }

            if (changed) {
              try {
                window.localStorage.setItem(
                  "ev-home-last-known-soc",
                  JSON.stringify(next),
                );
              } catch {
                // Keep snapshot
              }
            }

            return changed ? next : previous;
          });

          setLastKnownConnection((previous) => {
            const next = { ...previous };
            let changed = false;
            for (const teslaVehicle of res.vehicles) {
              if (teslaVehicle.state?.toLowerCase() !== "online") continue;
              const charge = teslaVehicle.charging_state?.toLowerCase() ?? "";
              const connection = charge === "charging" || charge === "starting"
                ? "charging"
                : ["stopped", "nopower", "complete"].includes(charge)
                  ? "plugged"
                  : "unplugged";
              if (next[teslaVehicle.id] !== connection) {
                next[teslaVehicle.id] = connection;
                changed = true;
              }
            }
            if (changed) {
              try {
                window.localStorage.setItem("ev-home-last-known-connection", JSON.stringify(next));
              } catch {
                // Keep status
              }
            }
            return changed ? next : previous;
          });

          try {
            window.localStorage.setItem(
              "ev-home-tesla-snapshot",
              JSON.stringify(res.vehicles),
            );
          } catch {
            // localStorage unavailable
          }

          const changed = await linkTeslaVehicleIds(
            vehicles,
            res.vehicles,
          );

          if (changed) {
            window.dispatchEvent(
              new Event("vehicles:updated"),
            );
          }
        }

        const current =
          res.vehicles.find(
            (t) => t.id === vehicle?.tesla_vehicle_id,
          ) ??
          (res.vehicles.length === 1
            ? res.vehicles[0]
            : undefined);

        const state =
          current?.state?.toLowerCase() ?? "";

        const chargeState =
          current?.charging_state?.toLowerCase() ?? "";

        const active =
          state === "online" ||
          chargeState === "charging" ||
          chargeState === "starting";

        timer = setTimeout(
          refresh,
          active ? 30_000 : 3 * 60_000,
        );
      } catch {
        if (alive) {
          timer = setTimeout(
            refresh,
            3 * 60_000,
          );
        }
      }
    };

    refresh();

    const handleVisible = () => {
      if (document.visibilityState !== "visible") return;

      if (timer) clearTimeout(timer);
      refresh();
    };

    document.addEventListener(
      "visibilitychange",
      handleVisible,
    );

    return () => {
      alive = false;

      if (timer) clearTimeout(timer);

      document.removeEventListener(
        "visibilitychange",
        handleVisible,
      );
    };
  }, [vehicles.length, vehicle?.tesla_vehicle_id]);

  const live = useMemo(() => {
    if (!vehicle) return undefined;

    return (
      liveVehicles.find(
        (t) => t.id === vehicle.tesla_vehicle_id,
      ) ??
      (liveVehicles.length === 1 &&
      vehicle.source === "tesla"
        ? liveVehicles[0]
        : undefined)
    );
  }, [liveVehicles, vehicle]);

  const displayedBatteryLevel =
    live?.battery_level ??
    (live?.id ? lastKnownSoc[live.id] : null) ??
    null;

  const batteryIsLastKnown =
    displayedBatteryLevel != null &&
    (live?.battery_level == null || live?.state?.toLowerCase() !== "online");

  useEffect(() => {
    if (!vehicle || !live || !liveObservedAt) return;

    const monitorKey = `tesla-charge-monitor:${live.id}`;
    let previous: ChargeMonitorState;

    try {
      const stored = window.localStorage.getItem(monitorKey);
      previous = stored
        ? (JSON.parse(stored) as ChargeMonitorState)
        : initialChargeMonitorState();
    } catch {
      previous = initialChargeMonitorState();
    }

    const result = advanceChargeMonitor(previous, {
      observedAt: liveObservedAt,
      chargingState: live.charging_state,
      batteryLevel: live.battery_level,
      chargerPowerKw: live.charger_power_kw,
      chargeEnergyAddedKwh:
        live.charge_energy_added_kwh ?? live.charge_energy_added,
    });

    try {
      window.localStorage.setItem(monitorKey, JSON.stringify(result.state));
    } catch {
      // Monitoring still works
    }

    if (!result.closedSession?.actualStart || !result.closedSession.actualFinish) {
      return;
    }

    const closed = result.closedSession;
    const startSoc = closed.startSoc ?? live.battery_level ?? 0;
    const endSoc = closed.endSoc ?? live.battery_level ?? startSoc;
    const teslaEnergy =
      closed.actualEnergyKwh != null && closed.actualEnergyKwh > 0
        ? closed.actualEnergyKwh
        : null;
    const socEnergy =
      vehicle.battery_kwh != null && endSoc > startSoc
        ? (vehicle.battery_kwh * (endSoc - startSoc)) / 100
        : 0;
    const energyRatio = socEnergy > 0 && teslaEnergy != null
      ? teslaEnergy / socEnergy
      : 1;
    const teslaEnergyConsistent =
      teslaEnergy != null && energyRatio >= 0.7 && energyRatio <= 1.45;
    const batteryEnergy = teslaEnergyConsistent ? teslaEnergy! : socEnergy;
    const startGapMinutes = closed.startObservationGapMinutes;
    const finishGapMinutes = closed.finishObservationGapMinutes;
    const timingObservedClosely =
      startGapMinutes !== undefined && startGapMinutes <= 5 &&
      finishGapMinutes !== undefined && finishGapMinutes <= 5;
    const estimatedGridEnergy = batteryEnergy > 0
      ? batteryEnergy / 0.9
      : 0;

    if (endSoc <= startSoc || batteryEnergy < 0.25) {
      return;
    }
    const region = settings.region || AGILE_REGION;

    const draft: Omit<ChargeSession, "id"> = {
      session_date: formatUK(closed.actualStart, "yyyy-MM-dd"),
      source: "tesla",
      status: "completed",
      plugged_in_at: closed.pluggedInAt,
      started_at: closed.actualStart,
      ended_at: closed.actualFinish,
      actual_start: closed.actualStart,
      actual_finish: closed.actualFinish,
      start_time: formatUK(closed.actualStart, "HH:mm"),
      end_time: formatUK(closed.actualFinish, "HH:mm"),
      vehicle_id: vehicle.id,
      vehicle_name: vehicle.name,
      vehicle_registration: vehicle.registration || undefined,
      charge_mode: "realtime",
      start_soc: startSoc,
      end_soc: endSoc,
      battery_energy_kwh: batteryEnergy,
      measured_grid_energy_kwh: undefined,
      estimated_grid_energy_kwh: estimatedGridEnergy,
      energy_source: teslaEnergyConsistent ? "tesla" : "soc_estimate",
      energy_added_kwh: batteryEnergy,
      grid_kwh: estimatedGridEnergy,
      total_cost_gbp: 0,
      avg_pence_per_kwh: 0,
      num_slots: 0,
      tariff_code: "Octopus Agile",
      region,
      slot_prices: [],
      notes: "Automatically captured from Tesla charging telemetry.",
      configured_charger_kw: settings.charger_kw,
      observed_charger_kw: closed.observedChargerKw,
      actual_energy_kwh: batteryEnergy,
      confidence_score:
        teslaEnergyConsistent && timingObservedClosely ? 0.95 :
          teslaEnergyConsistent ? 0.72 : 0.55,
      raw_observations: {
        tesla_charge_energy_baseline_kwh: closed.energyBaselineKwh ?? null,
        tesla_charge_energy_latest_kwh: closed.energyLatestKwh ?? null,
        tesla_charge_energy_delta_kwh: teslaEnergy,
        soc_estimated_battery_kwh: socEnergy,
        energy_consistent: teslaEnergyConsistent,
        energy_fallback: teslaEnergyConsistent ? "tesla" : "soc_delta",
        first_charging_observed_at: closed.firstChargingObservedAt ?? null,
        last_charging_observed_at: closed.lastChargingObservedAt ?? null,
        start_observation_gap_minutes: startGapMinutes ?? null,
        finish_observation_gap_minutes: finishGapMinutes ?? null,
        observation_count: closed.observationCount ?? 0,
        timing_observed_closely: timingObservedClosely,
      },
    };

    const isDuplicate = () => {
      const startMs = new Date(closed.actualStart!).getTime();
      const finishMs = new Date(closed.actualFinish!).getTime();
      return loadSessions().some((existing) => {
        if (existing.source !== "tesla" || existing.vehicle_id !== vehicle.id) return false;
        const existingStart = new Date(existing.actual_start ?? existing.started_at ?? "").getTime();
        const existingFinish = new Date(existing.actual_finish ?? existing.ended_at ?? "").getTime();
        if (!Number.isFinite(existingStart) || !Number.isFinite(existingFinish)) return false;
        const overlap = Math.max(0, Math.min(finishMs, existingFinish) - Math.max(startMs, existingStart));
        const shortest = Math.max(1, Math.min(finishMs - startMs, existingFinish - existingStart));
        return overlap / shortest >= 0.8 ||
          (Math.abs(existingStart - startMs) <= 5 * 60_000 && Math.abs(existingFinish - finishMs) <= 5 * 60_000);
      });
    };

    void recalcSessionCost({ ...draft, id: "automatic-draft" }, {})
      .then((cost) => {
        if (isDuplicate()) return;
        addSession({
          ...draft,
          measured_grid_energy_kwh: undefined,
          estimated_grid_energy_kwh:
            cost?.estimated_grid_energy_kwh ?? estimatedGridEnergy,
          grid_kwh:
            cost?.estimated_grid_energy_kwh ?? estimatedGridEnergy,
          total_cost_gbp: cost?.total_cost_gbp ?? 0,
          actual_cost_gbp: cost?.total_cost_gbp ?? 0,
          avg_pence_per_kwh: cost?.avg_pence_per_kwh ?? 0,
          num_slots: cost?.num_slots ?? 0,
          slot_prices: cost?.slot_prices ?? [],
        });
        onSessionsChanged?.();
      })
      .catch((error) => {
        console.warn("Automatic Tesla session costing failed", error);
        if (isDuplicate()) return;
        addSession(draft);
        onSessionsChanged?.();
      });
  }, [liveObservedAt, live, vehicle?.id]);

  const { data: homeWeather } = useQuery({
    queryKey: [
      "home-current-weather",
      settings.home_latitude,
      settings.home_longitude,
    ],
    enabled: hasHomeLocation(settings),
    staleTime: 15 * 60_000,
    queryFn: async () => {
      const lat = settings.home_latitude;
      const lng = settings.home_longitude;

      if (lat == null || lng == null) return null;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const url =
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weather-forecast` +
        `?lat=${encodeURIComponent(lat)}` +
        `&lng=${encodeURIComponent(lng)}`;

      const response = await fetch(url, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
      });

      if (!response.ok) return null;

      const data = await response.json();

      const hourly = data.hourly ?? {};
      const times = hourly.time ?? [];
      const codes = hourly.weather_code ?? [];
      const temps = hourly.temperature_2m ?? [];
      const cloudCover = hourly.cloud_cover ?? [];

      const daily = data.daily ?? {};
      const dailyTimes = daily.time ?? [];
      const sunrises = daily.sunrise ?? [];
      const sunsets = daily.sunset ?? [];

      const now = Date.now();

      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      times.forEach((time: string, index: number) => {
        const ms = new Date(time).getTime();
        const distance = Math.abs(ms - now);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });

      const todayLondon = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      const todayIndex = dailyTimes.findIndex(
        (day: string) => day === todayLondon,
      );

      return {
        weatherCode: Number(codes[bestIndex] ?? 3),
        temperatureC:
          temps[bestIndex] == null
            ? undefined
            : Number(temps[bestIndex]),
        cloudCover:
          cloudCover[bestIndex] == null
            ? undefined
            : Number(cloudCover[bestIndex]),
        sunrise:
          todayIndex >= 0
            ? sunrises[todayIndex]
            : undefined,
        sunset:
          todayIndex >= 0
            ? sunsets[todayIndex]
            : undefined,
        source:
          data.source === "live"
            ? ("live" as const)
            : ("estimated" as const),
      };
    },
  });

  const { data: rates = [] } = useQuery({
    queryKey: ["agile-home", settings.region],
    queryFn: () =>
      fetchAgileRates(
        undefined,
        undefined,
        undefined,
        settings.region,
      ),
    staleTime: 15 * 60_000,
  });

  const now = Date.now();

  const current = rates.find(
    (r) =>
      new Date(r.valid_from).getTime() <= now &&
      new Date(r.valid_to).getTime() > now,
  );

  const future = useMemo(
    () =>
      rates
        .filter(
          (r) => new Date(r.valid_from).getTime() > now,
        )
        .sort((a, b) =>
          a.valid_from.localeCompare(b.valid_from),
        ),
    [rates, now],
  );

  const ribbon = useMemo(
    () => (current ? [current, ...future] : future),
    [current, future],
  );

  const targetSoc = live?.charge_limit_soc ?? 100;
  const batteryCapacityKwh = vehicle?.battery_kwh ?? 75;
  
  const planningPowerKw = 
    live?.charger_power_kw != null && live.charger_power_kw > settings.charger_kw
      ? live.charger_power_kw
      : Math.min(
          live?.charger_power_kw ?? settings.charger_kw,
          settings.charger_kw,
        );

  const planningEfficiency = 0.9;
  const requiredBatteryKwh =
    displayedBatteryLevel != null
      ? Math.max(
          0,
          batteryCapacityKwh *
            (targetSoc - displayedBatteryLevel) /
            100,
        )
      : null;
  const neededHours =
    requiredBatteryKwh != null && planningPowerKw > 0
      ? Math.max(
          0.5,
          Math.ceil(
            (requiredBatteryKwh /
              (planningPowerKw * planningEfficiency)) *
              2,
          ) / 2,
        )
      : 3;
  const selectedHours = neededHours;

  const bestWindow = useMemo(() => {
    const slotCount = Math.max(1, Math.ceil(selectedHours * 2));

    if (ribbon.length < slotCount) return null;

    let best = {
      start: 0,
      avg: Number.POSITIVE_INFINITY,
    };

    for (
      let i = 0;
      i + slotCount <= ribbon.length;
      i++
    ) {
      const chunk = ribbon.slice(i, i + slotCount);

      const continuous = chunk.every((rate, index) =>
        index === 0 ||
        chunk[index - 1]!.valid_to === rate!.valid_from,
      );

      if (!continuous) continue;

      const avg =
        chunk.reduce(
          (sum, rate) => sum + rate!.value_inc_vat,
          0,
        ) / slotCount;

      if (avg < best.avg) {
        best = { start: i, avg };
      }
    }

    if (!Number.isFinite(best.avg)) return null;

    const chunk = ribbon.slice(
      best.start,
      best.start + slotCount,
    );

    const gridEnergyKwh =
      planningPowerKw * slotCount * 0.5;
    const batteryEnergyKwh =
      gridEnergyKwh * planningEfficiency;
    const estimatedCostGbp = chunk.reduce(
      (total, rate) =>
        total +
        (planningPowerKw * 0.5 * rate!.value_inc_vat) /
          100,
      0,
    );
    const resultingSoc =
      displayedBatteryLevel == null
        ? null
        : Math.min(
            targetSoc,
            displayedBatteryLevel +
              (batteryEnergyKwh / batteryCapacityKwh) * 100,
          );

    return {
      from: chunk[0]!.valid_from,
      to: chunk[slotCount - 1]!.valid_to,
      avg: best.avg,
      estimatedCostGbp,
      resultingSoc,
      hours: slotCount / 2,
    };
  }, [
    ribbon,
    selectedHours,
    planningPowerKw,
    displayedBatteryLevel,
    targetSoc,
    batteryCapacityKwh,
  ]);

  const cheapestSlot = useMemo(() => {
    if (!ribbon.length) return null;
    return ribbon.reduce((best, rate) =>
      rate.value_inc_vat < best.value_inc_vat ? rate : best,
    );
  }, [ribbon]);

  const summary = useMemo(() => {
    const today = new Date();
    const todayKey = formatUK(today, "yyyy-MM-dd");
    let firstKey: string;

    if (summaryPeriod === "week") {
      const monday = new Date(today);
      const day = Number(formatUK(today, "i"));
      monday.setDate(monday.getDate() - (day - 1));
      firstKey = formatUK(monday, "yyyy-MM-dd");
    } else if (summaryPeriod === "year") {
      firstKey = `${formatUK(today, "yyyy")}-01-01`;
    } else {
      firstKey = `${formatUK(today, "yyyy-MM")}-01`;
    }

    const rows = sessions.filter((session) => {
      const date = session.session_date ?? "";
      return date >= firstKey && date <= todayKey &&
        sessionQuality(session, vehicle?.battery_kwh ?? 75).trusted;
    });

    return {
      kwh: rows.reduce(
        (total, session) =>
          total + sessionEnergyKwh(session),
        0,
      ),
      cost: rows.reduce(
        (total, session) =>
          total + sessionCostGbp(session),
        0,
      ),
      count: rows.length,
    };
  }, [sessions, summaryPeriod, vehicle?.battery_kwh]);

  const recentCharges = useMemo(() => {
    return sessions
      .filter((session) => {
        if (!vehicle) return true;
        if (vehicles.length === 1) return true;
        const sessionRegistration = formatRegistration(session.vehicle_registration ?? "");
        const vehicleRegistration = formatRegistration(vehicle.registration ?? "");
        return session.vehicle_id === vehicle.id ||
          Boolean(sessionRegistration && sessionRegistration === vehicleRegistration) ||
          Boolean(session.vehicle_name && session.vehicle_name === vehicle.name);
      })
      .filter((session) =>
        session.status == null ||
        session.status === "completed" ||
        session.status === "manual",
      )
      .sort((a, b) => {
        const aTime =
          a.actual_finish ??
          a.ended_at ??
          `${a.session_date}T${a.end_time ?? "23:59"}:00`;
        const bTime =
          b.actual_finish ??
          b.ended_at ??
          `${b.session_date}T${b.end_time ?? "23:59"}:00`;

        return bTime.localeCompare(aTime);
      })
      .slice(0, 5);
  }, [sessions, vehicle, vehicles.length]);

  const trustedRecentCharges = recentCharges.filter((session) =>
    sessionQuality(session, vehicle?.battery_kwh ?? 75).trusted,
  );
  const lastCharge = trustedRecentCharges[0] ?? null;

  const lastChargeLabel = useMemo(() => {
    if (!lastCharge) return "Awaiting first completed Tesla charge";

    const todayKey = formatUK(new Date(), "yyyy-MM-dd");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = formatUK(yesterday, "yyyy-MM-dd");
    const day =
      lastCharge.session_date === todayKey
        ? "Today"
        : lastCharge.session_date === yesterdayKey
          ? "Yesterday"
          : formatUK(`${lastCharge.session_date}T12:00:00Z`, "dd MMM");
    const energy = sessionEnergyKwh(lastCharge);
    const cost = sessionCostGbp(lastCharge);
    const finishTime = isoToUkClock(
      lastCharge.actual_finish ?? lastCharge.ended_at ?? lastCharge.end_time,
    );

    const dayLabel = finishTime ? `${day} ${finishTime}` : day;

    return `${dayLabel} · ${energy.toFixed(1)} kWh · £${cost.toFixed(2)}`;
  }, [lastCharge]);

  const vehicleState =
    live?.state?.toLowerCase() ?? "";

  const chargingState =
    live?.charging_state?.toLowerCase() ?? "";

  const isCharging =
    chargingState === "charging" ||
    chargingState === "starting" ||
    vehicleState === "online";

  const isPluggedIn =
    isCharging ||
    chargingState === "stopped" ||
    chargingState === "nopower" ||
    chargingState === "complete" ||
    live?.charge_port_latch_state?.toLowerCase() === "engaged" ||
    lastKnownConnection[vehicle?.id ?? ""] === "charging" ||
    lastKnownConnection[vehicle?.id ?? ""] === "plugged";

  const resolvedScene = resolveHomeScene({
    weatherCode: homeWeather?.weatherCode,
    temperatureC: homeWeather?.temperatureC,
    cloudCover: homeWeather?.cloudCover,
    sunrise: homeWeather?.sunrise,
    sunset: homeWeather?.sunset,
    charging: isCharging,
    pluggedIn: isPluggedIn,
  });

  const agilePriceNow = current?.value_inc_vat ?? null;
  const cheapestWindowLabel = bestWindow
    ? `${isoToUkClock(bestWindow.from)} – ${isoToUkClock(bestWindow.to)} · ${bestWindow.avg.toFixed(1)}p avg`
    : cheapestSlot
      ? `Best single slot at ${isoToUkClock(cheapestSlot.valid_from)} (${cheapestSlot.value_inc_vat.toFixed(1)}p)`
      : null;

  const activeSchedule = appSchedules.find((s) => s.enabled) ?? null;
  const teslaSchedule = teslaSchedules[0] ?? null;
  const scheduleLabel = activeSchedule
    ? `${activeSchedule.start_time} – ${activeSchedule.end_time}`
    : teslaSchedule && teslaSchedule.enabled
      ? `Tesla: ${teslaSchedule.start_hour.toString().padStart(2, "0")}:${teslaSchedule.start_minute.toString().padStart(2, "0")}`
      : null;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 border border-white/10 px-4 py-2.5 rounded-2xl backdrop-blur-md">
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => {
              setHomeViewMode("driveway");
              window.localStorage.setItem("ev-home-view-mode", "driveway");
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${homeViewMode === "driveway" ? "bg-emerald-500 text-slate-950 shadow" : "text-slate-300 hover:text-white"}`}
          >
            Driveway
          </button>
          <button
            onClick={() => {
              setHomeViewMode("cockpit");
              window.localStorage.setItem("ev-home-view-mode", "cockpit");
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${homeViewMode === "cockpit" ? "bg-emerald-500 text-slate-950 shadow" : "text-slate-300 hover:text-white"}`}
          >
            Cockpit
          </button>
        </div>
      </div>

      <HomeHeroScene
        scene={resolvedScene}
        charging={isCharging}
        pluggedIn={isPluggedIn}
        batteryLevel={displayedBatteryLevel}
        batteryIsLastKnown={batteryIsLastKnown}
        batteryCapacityKwh={batteryCapacityKwh}
        chargeLimit={targetSoc}
        chargerPowerKw={
          live?.charger_power_kw != null && live.charger_power_kw > settings.charger_kw
            ? live.charger_power_kw
            : Math.min(
                live?.charger_power_kw ?? settings.charger_kw,
                settings.charger_kw,
              )
        }
        chargerAmps={live?.charger_actual_current}
        chargerAmpsLive={live?.charger_actual_current != null}
        timeToFullChargeHours={live?.time_to_full_charge}
        state={live?.state}
        viewMode={homeViewMode}
        agilePricePence={agilePriceNow}
        cheapestWindowLabel={cheapestWindowLabel}
        scheduleLabel={scheduleLabel}
        footballTeam={footballTeam}
      />

      {/* Wait for Cheaper Power Card */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Wait for cheaper power</p>
            <h3 className="text-xl font-black text-white mt-0.5">
              {bestWindow ? `${bestWindow.avg.toFixed(2)}p/kWh later` : "Agile rates loading..."}
            </h3>
          </div>
        </div>

        {ribbon.length > 0 && (
          <div className="mt-4">
            <div ref={priceStripRef} className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {ribbon.map((rate) => {
                const isCurrent = new Date(rate.valid_from).getTime() <= now && new Date(rate.valid_to).getTime() > now;
                const colourClass = priceColour(rate.value_inc_vat);
                return (
                  <div
                    key={rate.valid_from}
                    className={`relative min-w-[72px] flex-shrink-0 rounded-2xl border overflow-hidden pt-2.5 pb-3 px-2 text-center transition-all ${
                      isCurrent
                        ? "border-emerald-400/50 bg-slate-950/80"
                        : "border-white/10 bg-slate-950/60"
                    }`}
                  >
                    <p className="text-[10px] font-bold text-slate-400">
                      {isCurrent ? "Now" : isoToUkClock(rate.valid_from)}
                    </p>
                    <p className="mt-1 text-xs font-black text-white">
                      {rate.value_inc_vat.toFixed(1)}p
                    </p>
                    {/* Bottom color fill band matching second attachment */}
                    <div className={`absolute bottom-0 left-0 right-0 h-2 ${colourClass}`} />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-semibold px-1">
              <span>Swipe prices →</span>
              <span>Cheapest window {bestWindow ? `${isoToUkClock(bestWindow.from)} – ${bestWindow.avg.toFixed(2)}p/kWh` : "—"}</span>
            </div>
          </div>
        )}
      </div>

      {/* Summary Section */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-wider uppercase text-slate-300">Charging Summary</h3>
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-white/10">
            {(["week", "month", "year"] as const).map((period) => (
              <button
                key={period}
                onClick={() => setSummaryPeriod(period)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition-all ${summaryPeriod === period ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
              >
                {period}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Energy</p>
            <p className="mt-1 text-xl font-black text-white">{summary.kwh.toFixed(1)} <span className="text-xs text-slate-400">kWh</span></p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Cost</p>
            <p className="mt-1 text-xl font-black text-emerald-400">£{summary.cost.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sessions</p>
            <p className="mt-1 text-xl font-black text-white">{summary.count}</p>
          </div>
        </div>
      </div>

      {/* Recent Charges List */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-wider uppercase text-slate-300">Recent Charges</h3>
          <button
            onClick={onReviewCharges}
            className="text-xs font-bold text-emerald-400 hover:underline"
          >
            View all
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {recentCharges.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center">{lastChargeLabel}</p>
          ) : (
            recentCharges.map((session) => {
              const energy = sessionEnergyKwh(session);
              const cost = sessionCostGbp(session);
              const isTrusted = sessionQuality(session, vehicle?.battery_kwh ?? 75).trusted;
              return (
                <div key={session.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-white">
                          {session.session_date} · {sessionClock(session, "start")} - {sessionClock(session, "finish")}
                        </p>
                        {!isTrusted && (
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                            Needs review
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {sessionDurationLabel(session)} · {session.vehicle_name || "Vehicle"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-emerald-400">{energy.toFixed(1)} kWh</p>
                      <p className="text-[10px] font-bold text-slate-300">£{cost.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <button
                      onClick={() => onReviewCharges?.()}
                      className="rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800 transition-all"
                    >
                      Review / amend
                    </button>
                    {!isTrusted && (
                      <button
                        onClick={() => {
                          session.raw_observations = { ...(session.raw_observations || {}), quality_override: true };
                          updateSession(session);
                          onSessionsChanged?.();
                        }}
                        className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/20 transition-all"
                      >
                        Accept estimate
                      </button>
                    )}
                    <button
                      onClick={() => {
                        deleteSession(session.id);
                        onSessionsChanged?.();
                      }}
                      className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] font-bold text-rose-400 hover:bg-rose-500/20 transition-all"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

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
import { formatUK } from "@/lib/timezone";

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

  // A stale browser observation must never turn plugged-in waiting time into
  // charging time.  Allow a generous margin for pauses and missed polls, but
  // quarantine records whose elapsed duration is impossible for their energy.
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

  // Grid energy can reasonably be above battery energy due to losses. Large
  // differences mean the monitor combined observations from different parts
  // of a charge and the cost must not contaminate trusted totals.
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

  const [liveVehicles, setLiveVehicles] = useState<TeslaVehicle[]>(() => {
    if (teslaVehicles.length) return teslaVehicles;

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
  const [showRecentCharges, setShowRecentCharges] = useState(true);
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
    vehicles.find((v) => v.is_default) ?? vehicles[0];

  // Reading schedules is explicitly wake-free. It is safe to show an existing
  // Tesla schedule on Home even while the vehicle is asleep.
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

  // Home refreshes Tesla telemetry without waking the vehicle.
  // Online vehicles refresh more frequently; asleep/offline vehicles back off.
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
                // Keep the in-memory snapshot when storage is unavailable.
              }
            }

            return changed ? next : previous;
          });

          setLastKnownConnection((previous) => {
            const next = { ...previous };
            let changed = false;
            for (const teslaVehicle of res.vehicles) {
              // Only an online response is authoritative enough to replace the
              // previous plug state. An asleep response commonly omits it.
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
                // Keep the in-memory status when storage is unavailable.
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
            // localStorage unavailable.
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const rememberedMonitorPhase = useMemo(() => {
    if (!live?.id) return null;
    try {
      const stored = window.localStorage.getItem(`tesla-charge-monitor:${live.id}`);
      return stored ? (JSON.parse(stored) as ChargeMonitorState).phase : null;
    } catch {
      return null;
    }
  }, [live?.id, liveObservedAt]);

  // Turn Tesla state transitions into a saved, costed charge session.
  // The monitor state is persisted so a refresh or device rotation does not
  // lose an active charge that is already being observed.
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
      // Monitoring still works for this page view when storage is unavailable.
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

    // Plugged-in waiting, stale partial observations and contradictory data
    // are not charges. Never allow them into spend/energy totals.
    if (endSoc <= startSoc || batteryEnergy < 0.25) {
      console.warn("Ignored incomplete Tesla charge observation", closed);
      return;
    }
    const region = settings.region || "F";

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

    // Each telemetry timestamp is processed once; callback identity is not a
    // reason to reprocess a Tesla observation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveObservedAt, live, vehicle?.id]);

  const { data: homeWeather } = useQuery({
    queryKey: [
      "home-current-weather",
      settings.home_latitude,
      settings.home_longitude,
    ],
    // Home weather is useful in every appearance mode.
    // Forced themes change the artwork, not the real home conditions.
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
  const planningPowerKw = Math.min(
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
  // The useful recommendation is the time this vehicle actually needs to
  // reach its target. Arbitrary 1/2/3/4-hour windows made the Home screen
  // busier without answering that question.
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
        // Older/manual records can pre-date the current local vehicle UUID.
        // With one configured vehicle they still belong in its Home history;
        // otherwise match UUID, registration, or vehicle name.
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

    return `${day} · ${energy.toFixed(1)} kWh · £${cost.toFixed(2)}`;
  }, [lastCharge]);

  const vehicleState =
    live?.state?.toLowerCase() ?? "";

  const chargingState =
    live?.charging_state?.toLowerCase() ?? "";

  // A cached battery percentage is useful, but cached charging state
  // must never make an asleep/offline Tesla appear live.
  const vehicleIsLive =
    vehicleState === "online";

  const isCharging =
    vehicleIsLive &&
    (
      chargingState === "charging" ||
      chargingState === "starting"
    );

  const pluggedWaiting =
    vehicleIsLive &&
    !isCharging &&
    ["stopped", "nopower", "complete"].includes(
      chargingState,
    );

  const rememberedConnection = live?.id
    ? lastKnownConnection[live.id]
    : undefined;
  const lastKnownPluggedWaiting =
    !vehicleIsLive &&
    (rememberedConnection === "plugged" ||
      rememberedMonitorPhase === "plugged_waiting" ||
      rememberedMonitorPhase === "paused");

  const isPluggedIn =
    (vehicleIsLive && (isCharging || pluggedWaiting)) ||
    lastKnownPluggedWaiting;

  const heroState =
    vehicleState === "offline" || vehicleState === "asleep"
      ? lastKnownPluggedWaiting
        ? "Plugged in · Waiting · Last known"
        : "Asleep"
      : vehicleIsLive
        ? pluggedWaiting
          ? "Plugged in"
          : live?.state
        : "Last known status";

  const scene = resolveHomeScene({
    preference: settings.home_theme ?? "automatic",
    weatherCode: homeWeather?.weatherCode,
    temperatureC: homeWeather?.temperatureC,
    cloudCover: homeWeather?.cloudCover,
    sunrise: homeWeather?.sunrise,
    sunset: homeWeather?.sunset,
    source: homeWeather?.source,
  });


  const recommendation = (() => {
    if (isCharging) {
      return {
        label: "CHARGING NOW",
        title: `${live?.battery_level ?? "—"}% → ${
          live?.charge_limit_soc ?? "—"
        }%`,
        detail: current
          ? `Current Agile rate ${current.value_inc_vat.toFixed(
              2,
            )}p/kWh`
          : "Monitoring your live charge",
        tone: "text-emerald-300",
      };
    }

    if (pluggedWaiting) {
      return {
        label: "PLUGGED IN · WAITING",
        title: bestWindow
          ? `Cheaper power from ${formatUK(
              bestWindow.from,
              "HH:mm",
            )}`
          : "Waiting to charge",
        detail: bestWindow
          ? `${bestWindow.avg.toFixed(
            2,
          )}p/kWh average in the best ${bestWindow.hours}-hour window`
          : "We’ll keep plug-in time separate from actual charging time.",
        tone: "text-cyan-300",
      };
    }

    if (current && current.value_inc_vat < 0) {
      return {
        label: "GREAT TIME TO CHARGE",
        title: `${current.value_inc_vat.toFixed(
          2,
        )}p/kWh right now`,
        detail:
          "Electricity is negative-priced — you are effectively being paid to use energy.",
        tone: "text-emerald-300",
      };
    }

    if (
      current &&
      bestWindow &&
      current.value_inc_vat > bestWindow.avg + 2
    ) {
      return {
        label: "WAIT FOR CHEAPER POWER",
        title: `${bestWindow.avg.toFixed(
          2,
        )}p/kWh later`,
        detail: `${formatUK(
          bestWindow.from,
          "HH:mm",
        )}–${formatUK(bestWindow.to, "HH:mm")} is currently the best ${bestWindow.hours}-hour window.`,
        tone: "text-violet-300",
      };
    }

    return {
      label: "CHARGE INTELLIGENCE",
      title: current
        ? `${current.value_inc_vat.toFixed(
            2,
          )}p/kWh now`
        : "Loading Agile prices",
      detail: bestWindow
        ? `Best upcoming ${bestWindow.hours}-hour average ${bestWindow.avg.toFixed(
            2,
          )}p/kWh.`
        : "Waiting for enough price data.",
      tone: "text-primary",
    };
  })();

  const averageSummaryPrice =
    summary.kwh > 0
      ? (summary.cost / summary.kwh) * 100
      : 0;

  const recentPriceTrend = trustedRecentCharges
    .slice()
    .reverse()
    .map((session) => Number(session.avg_pence_per_kwh) || 0)
    .filter((price) => price > 0);
  const trendMin = recentPriceTrend.length ? Math.min(...recentPriceTrend) : 0;
  const trendMax = recentPriceTrend.length ? Math.max(...recentPriceTrend) : 1;
  const trendRange = Math.max(1, trendMax - trendMin);
  const trendPoints = recentPriceTrend
    .map((price, index) => {
      const x = recentPriceTrend.length === 1 ? 50 : (index / (recentPriceTrend.length - 1)) * 100;
      const y = 26 - ((price - trendMin) / trendRange) * 22;
      return `${x},${y}`;
    })
    .join(" ");
  const priceTrendDirection =
    recentPriceTrend.length > 1
      ? recentPriceTrend[recentPriceTrend.length - 1]! - recentPriceTrend[recentPriceTrend.length - 2]!
      : 0;

  const ribbonPrices = ribbon.map(
    (rate) => rate!.value_inc_vat,
  );
  const ribbonMinPrice =
    ribbonPrices.length > 0 ? Math.min(...ribbonPrices) : 0;
  const ribbonMaxPrice =
    ribbonPrices.length > 0 ? Math.max(...ribbonPrices) : 1;
  const ribbonPriceRange = Math.max(
    1,
    ribbonMaxPrice - ribbonMinPrice,
  );

  const scrollPrices = (direction: -1 | 1) => {
    priceStripRef.current?.scrollBy({
      left: direction * Math.max(240, priceStripRef.current.clientWidth * 0.75),
      behavior: "smooth",
    });
  };

  const enabledTeslaSchedule = teslaSchedules.find(
    (schedule) => schedule.enabled !== false && schedule.start_enabled !== false,
  );
  const activeAppSchedule = appSchedules.find(
    (schedule) => schedule.status !== "removed" && schedule.status !== "failed",
  );
  const scheduleStart = enabledTeslaSchedule?.start_time ?? activeAppSchedule?.start_minutes;
  const scheduleEnd = enabledTeslaSchedule?.end_time ?? activeAppSchedule?.end_minutes;
  const clockFromMinutes = (minutes?: number | null) => {
    if (minutes == null) return null;
    const normalised = ((minutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(normalised / 60)).padStart(2, "0")}:${String(normalised % 60).padStart(2, "0")}`;
  };
  const scheduleLabel = scheduleStart != null
    ? `${clockFromMinutes(scheduleStart)}${scheduleEnd != null ? `–${clockFromMinutes(scheduleEnd)}` : ""}`
    : null;

  const setViewMode = (mode: "driveway" | "cockpit") => {
    setHomeViewMode(mode);
    window.localStorage.setItem("ev-home-view-mode", mode);
  };

  const setTeam = (team: string) => {
    setFootballTeam(team);
    window.localStorage.setItem("ev-home-football-team", team);
  };

  const cockpitCheapestWindow = bestWindow
    ? `Best ${bestWindow.hours}h block ${formatUK(bestWindow.from, "HH:mm")}–${formatUK(bestWindow.to, "HH:mm")} · ${bestWindow.avg.toFixed(1)}p/kWh`
    : null;

  const acceptEstimatedSession = (session: ChargeSession) => {
    updateSession(session.id, {
      raw_observations: {
        ...(session.raw_observations ?? {}),
        quality_override: true,
        quality_override_at: new Date().toISOString(),
        quality_override_source: "user",
      },
      notes: `${session.notes ? `${session.notes} ` : ""}User reviewed and accepted this session as an estimate.`,
    });
    onSessionsChanged?.();
  };

  const removeReviewedSession = (session: ChargeSession) => {
    if (!window.confirm("Delete this charge observation? This cannot be undone.")) return;
    deleteSession(session.id);
    onSessionsChanged?.();
  };

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="relative">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/70 p-1.5 shadow-lg backdrop-blur-xl">
          <div className="flex rounded-lg bg-black/25 p-0.5">
            {(["driveway", "cockpit"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-md px-3 py-1.5 text-[10px] font-bold capitalize transition-colors sm:text-xs ${homeViewMode === mode ? "bg-emerald-400/15 text-emerald-200 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {mode}
              </button>
            ))}
          </div>

          {homeViewMode === "cockpit" && (
            <label className="flex items-center gap-2 px-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground sm:text-[10px]">
              Team badge
              <select
                value={footballTeam}
                onChange={(event) => setTeam(event.target.value)}
                className="rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-[10px] font-bold normal-case tracking-normal text-foreground outline-none focus:border-emerald-300/40 sm:text-xs"
              >
                <option>Sunderland</option>
                <option>Arsenal</option>
                <option>Chelsea</option>
                <option>Liverpool</option>
                <option>Manchester City</option>
                <option>Manchester United</option>
                <option>Newcastle United</option>
                <option>Tottenham Hotspur</option>
                <option>Apple</option>
                <option>Lemon</option>
                <option>Paw</option>
                <option>None</option>
              </select>
            </label>
          )}
        </div>

        {/* Vehicle scene */}
        <section className="overflow-hidden rounded-[24px] border border-white/10 bg-card shadow-2xl md:col-span-2 sm:rounded-[30px]">
          <HomeHeroScene
            scene={scene}
            charging={isCharging}
            pluggedIn={isPluggedIn}
            batteryLevel={displayedBatteryLevel}
            batteryIsLastKnown={batteryIsLastKnown}
            chargeLimit={live?.charge_limit_soc}
            chargerPowerKw={Math.min(
              live?.charger_power_kw ?? settings.charger_kw,
              settings.charger_kw,
            )}
            chargerAmps={
              live?.charger_actual_current ??
              live?.charge_amps ??
              settings.charger_amps
            }
            chargerAmpsLive={
              live?.charger_actual_current != null ||
              live?.charge_amps != null
            }
            timeToFullChargeHours={live?.time_to_full_charge}
            state={heroState}
            viewMode={homeViewMode}
            agilePricePence={current?.value_inc_vat}
            cheapestWindowLabel={cockpitCheapestWindow}
            scheduleLabel={scheduleLabel}
            footballTeam={footballTeam}
          />

          <div className="flex min-h-[58px] flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-slate-950/90 px-3 py-2.5 backdrop-blur-xl md:min-h-[66px] md:px-4 md:py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-primary" />

                <p className="font-mono text-base font-black uppercase tracking-wider">
                  {formatRegistration(
                    vehicle?.registration ?? "",
                  ) ||
                    vehicle?.name ||
                    "No vehicle"}
                </p>

                {live?.state && (
                  <Badge
                    variant="outline"
                    className="text-[10px] capitalize"
                  >
                    {live.state}
                  </Badge>
                )}
              </div>

              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {vehicle
                  ? vehicleModelLine(vehicle)
                  : "Add a vehicle to get started"}
              </p>
            </div>

            {live?.charge_limit_soc !== null &&
              live?.charge_limit_soc !== undefined && (
                <div className="hidden text-right md:block">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Charge limit
                  </p>
                  <p className="text-lg font-black text-primary">
                    {live.charge_limit_soc}%
                  </p>
                </div>
              )}
          </div>
        </section>

        {/* Charge intelligence */}
        <section className="relative z-40 mt-2 overflow-hidden rounded-xl border border-emerald-300/20 bg-gradient-to-r from-slate-950/94 via-slate-900/92 to-emerald-950/40 p-2 shadow-[0_14px_35px_rgba(0,0,0,.45)] backdrop-blur-xl md:flex md:items-stretch md:gap-3 md:p-2.5 xl:absolute xl:bottom-[70px] xl:left-4 xl:right-4 xl:mt-0 xl:h-[108px]">
        {isCharging ? (
          <div className="flex items-center justify-between gap-3 px-0.5 md:w-[220px] md:flex-col md:items-start md:justify-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">
              Charge intelligence
            </p>
            <span className="text-[9px] font-semibold text-emerald-200">
              {neededHours}h needed
            </span>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3 md:w-[220px] md:shrink-0 md:self-center">
            <div>
              <p
                className={`text-[11px] font-bold uppercase tracking-[0.18em] ${recommendation.tone}`}
              >
                {recommendation.label}
              </p>

              <h2 className="mt-0.5 text-base font-black tracking-tight sm:text-lg">
                {recommendation.title}
              </h2>

              <p className="mt-0.5 hidden text-[9px] leading-relaxed text-muted-foreground xl:block">{recommendation.detail}</p>
            </div>

            <div className="rounded-xl bg-primary/10 p-2">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
          </div>
        )}

        {(scheduleLabel || bestWindow) && (
          <button
            type="button"
            onClick={onManageSchedule}
            disabled={!onManageSchedule}
            className="mt-1.5 w-full rounded-lg border border-emerald-300/20 bg-emerald-400/5 px-2 py-1 text-left transition-colors enabled:hover:bg-emerald-400/10 md:mt-0 md:w-[235px] md:shrink-0 md:self-center xl:w-[270px]"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black text-emerald-200">
                {scheduleLabel
                  ? `Tesla schedule · ${scheduleLabel}`
                  : `Best ${bestWindow!.hours}h continuous block · ${formatUK(bestWindow!.from, "HH:mm")}–${formatUK(bestWindow!.to, "HH:mm")}`}
              </p>
              {bestWindow && <p className="shrink-0 text-[10px] font-black text-foreground">£{bestWindow.estimatedCostGbp.toFixed(2)}</p>}
            </div>
            <p className="mt-0.5 text-[8px] text-muted-foreground">
              {scheduleLabel ? "Review, change or cancel in Planner" : `${bestWindow!.avg.toFixed(1)}p/kWh average for the complete charge`}
              {!scheduleLabel && cheapestSlot
                ? ` · lowest slot ${formatUK(cheapestSlot.valid_from, "HH:mm")} at ${cheapestSlot.value_inc_vat.toFixed(1)}p`
                : ""}
              {!scheduleLabel && bestWindow?.resultingSoc != null
                ? ` · reaches ≈${Math.round(bestWindow.resultingSoc)}%`
                : ""}
            </p>
          </button>
        )}

        {/* Compact half-hour price strip */}
        {ribbon.length > 0 && (
          <div className="mt-2 min-w-0 md:mt-0 md:flex-1 md:self-center">
            <div className="flex items-stretch gap-1.5">
              <button
                type="button"
                onClick={() => scrollPrices(-1)}
                className="hidden w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/25 text-muted-foreground transition-colors hover:border-emerald-300/30 hover:text-emerald-200 md:flex"
                aria-label="Earlier Agile prices"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            <div
              ref={priceStripRef}
              onWheel={(event) => {
                if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                  event.preventDefault();
                  event.currentTarget.scrollLeft += event.deltaY;
                }
              }}
              className="touch-pan-x min-w-0 flex-1 overflow-x-auto overscroll-x-contain rounded-lg border border-white/10 bg-black/25 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="grid grid-flow-col auto-cols-[22%] sm:auto-cols-[16%] lg:auto-cols-[13%]">
                {ribbon.map((rate, index) => {
                  const inCheapestWindow = Boolean(
                    bestWindow &&
                    rate!.valid_from >= bestWindow.from &&
                    rate!.valid_from < bestWindow.to,
                  );
                  const isPricePlunge = rate!.value_inc_vat < 0;
                  const barHeight =
                    7 +
                    ((rate!.value_inc_vat - ribbonMinPrice) /
                      ribbonPriceRange) *
                      22;

                  return (
                  <div
                    key={`${rate!.valid_from}-${index}`}
                    title={`${formatUK(
                      rate!.valid_from,
                      "HH:mm",
                    )} · ${rate!.value_inc_vat.toFixed(
                      2,
                    )}p/kWh`}
                    className={`relative min-w-0 overflow-hidden border-l border-white/10 px-0.5 py-1.5 text-center first:border-l-0 ${
                      isPricePlunge
                        ? "animate-pulse bg-emerald-300/35 shadow-[inset_0_0_18px_rgba(52,211,153,.55)]"
                        : inCheapestWindow
                          ? "animate-pulse bg-emerald-400/10"
                          : ""
                    }`}
                  >
                    <div
                      className={`absolute inset-x-1 bottom-0 rounded-t opacity-35 ${priceColour(
                        rate!.value_inc_vat,
                      )}`}
                      style={{ height: `${barHeight}px` }}
                    />
                    <p className="relative z-10 truncate text-[7px] text-muted-foreground sm:text-[8px]">
                      {index === 0
                        ? "Now"
                        : formatUK(rate!.valid_from, "HH:mm")}
                    </p>
                    <p className="relative z-10 font-mono text-[9px] font-black text-foreground sm:text-[10px]">
                      {rate!.value_inc_vat.toFixed(1)}p
                    </p>
                    <div
                      className={`absolute inset-x-1 bottom-0 ${
                        isPricePlunge ? "h-1" : "h-0.5"
                      } ${priceColour(
                        rate!.value_inc_vat,
                      )}`}
                    />
                  </div>
                  );
                })}
              </div>
            </div>
              <button
                type="button"
                onClick={() => scrollPrices(1)}
                className="hidden w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/25 text-muted-foreground transition-colors hover:border-emerald-300/30 hover:text-emerald-200 md:flex"
                aria-label="Later Agile prices"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-1 flex items-center justify-between gap-2 text-[8px] text-muted-foreground">
              <span className="md:hidden">Swipe prices →</span>
              <span className="hidden md:inline">Use arrows or mouse wheel for every published slot</span>
              {bestWindow && (
                <span className="ml-auto text-right">
                  Cheapest window{" "}
                  {formatUK(
                    bestWindow.from,
                    "HH:mm",
                  )}{" "}
                  · {bestWindow.avg.toFixed(1)}p/kWh
                </span>
              )}
            </div>
          </div>
        )}
        </section>

      </div>

      {/* Charge totals */}
      <section className="rounded-[26px] border border-border bg-card px-4 py-2.5 shadow-lg md:py-3">
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              This {summaryPeriod}
            </p>
            <button
              type="button"
              onClick={() => setShowRecentCharges((open) => !open)}
              className="mt-1 flex min-w-0 items-center gap-1.5 text-left text-[9px] text-muted-foreground transition-colors hover:text-foreground"
              aria-expanded={showRecentCharges}
            >
              <Zap className="h-3 w-3 shrink-0 text-emerald-300" />
              <span className="shrink-0 font-semibold text-foreground/80">
                Last charge
              </span>
              <span className="truncate">{lastChargeLabel}</span>
              {recentCharges.length > 1 && (
                showRecentCharges
                  ? <ChevronUp className="h-3 w-3 shrink-0" />
                  : <ChevronDown className="h-3 w-3 shrink-0" />
              )}
            </button>
          </div>
          <div className="flex items-center gap-3" aria-label="Charge totals period">
            {(["week", "month", "year"] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setSummaryPeriod(period)}
                className={`border-b pb-0.5 text-[10px] font-bold capitalize transition-colors ${
                  summaryPeriod === period
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {period}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <CalendarClock className="mx-auto mb-1 h-4 w-4 text-primary" />
            <p className="text-lg font-black">
              {summary.count}
            </p>
            <p className="text-[9px] text-muted-foreground">
              Charges
            </p>
          </div>

          <div>
            <BatteryCharging className="mx-auto mb-1 h-4 w-4 text-emerald-300" />
            <p className="text-lg font-black">
              {summary.kwh.toFixed(1)}
            </p>
            <p className="text-[9px] text-muted-foreground">
              kWh
            </p>
          </div>

          <div>
            <PoundSterling className="mx-auto mb-1 h-4 w-4 text-violet-300" />
            <p className="text-lg font-black">
              £{summary.cost.toFixed(2)}
            </p>
            <p className="text-[9px] text-muted-foreground">
              Spend
            </p>
          </div>

          <div>
            <TrendingDown className="mx-auto mb-1 h-4 w-4 text-amber-300" />
            <p className="text-lg font-black">
              {summary.kwh > 0
                ? `${averageSummaryPrice.toFixed(1)}p`
                : "—"}
            </p>
            <p className="text-[9px] text-muted-foreground">
              Average
            </p>
            {recentPriceTrend.length > 1 && (
              <div className="mx-auto mt-1 w-16" title="Average price trend across recent charges">
                <svg viewBox="0 0 100 30" className="h-5 w-full" aria-label="Recent average price trend">
                  <polyline
                    points={trendPoints}
                    fill="none"
                    stroke={priceTrendDirection <= 0 ? "rgb(52 211 153)" : "rgb(251 191 36)"}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className={`text-[8px] font-semibold ${priceTrendDirection <= 0 ? "text-emerald-300" : "text-amber-300"}`}>
                  {priceTrendDirection < 0 ? "Trending down" : priceTrendDirection > 0 ? "Trending up" : "Steady"}
                </p>
              </div>
            )}
          </div>
        </div>

        {showRecentCharges && recentCharges.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/15">
            {recentCharges.map((session, index) => {
              const energy = sessionEnergyKwh(session);
              const cost = sessionCostGbp(session);
              const quality = sessionQuality(session, vehicle?.battery_kwh ?? 75);

              return (
                <div
                  key={session.id}
                  className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-white/10 px-3 py-2 text-[10px] first:border-t-0 ${quality.trusted ? "" : "bg-amber-400/5"}`}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-semibold text-foreground/90">
                      {index === 0 ? "Latest" : `Charge ${index + 1}`} · {formatUK(`${session.session_date}T12:00:00Z`, "dd MMM")}
                      {!quality.trusted && (
                        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-1.5 py-0.5 text-[8px] font-bold text-amber-200">
                          Needs review · excluded from totals
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[9px] text-muted-foreground">
                      {sessionClock(session, "start")}–{sessionClock(session, "finish")}
                      {" · "}{sessionDurationLabel(session)}
                      {" · "}{session.start_soc > 0 ? `${session.start_soc}%` : "Start —"}
                      {" → "}{session.end_soc > 0 ? `${session.end_soc}%` : "End —"}
                    </p>
                    <p className="truncate text-[8px] text-muted-foreground/80">
                      {quality.trusted
                        ? `${session.avg_pence_per_kwh.toFixed(1)}p/kWh average · ${session.energy_source ?? session.source ?? "recorded"} data`
                        : quality.reason}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={onReviewCharges}
                          disabled={!onReviewCharges}
                          className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[8px] font-bold text-foreground enabled:hover:bg-white/10"
                        >
                          Review / amend
                        </button>
                        {!quality.trusted && <button
                          type="button"
                          onClick={() => acceptEstimatedSession(session)}
                          className="rounded-md border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[8px] font-bold text-emerald-200 hover:bg-emerald-300/15"
                        >
                          Accept estimate
                        </button>}
                        <button
                          type="button"
                          onClick={() => removeReviewedSession(session)}
                          className="rounded-md border border-rose-300/25 bg-rose-300/5 px-2 py-1 text-[8px] font-bold text-rose-200 hover:bg-rose-300/10"
                        >
                          Delete
                        </button>
                      </div>
                  </div>
                  <span className="font-mono font-bold text-emerald-200">
                    {energy.toFixed(1)} kWh
                  </span>
                  <span className="min-w-[52px] text-right font-mono font-bold text-violet-200">
                    £{cost.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="flex items-center justify-center gap-1.5 py-1 text-[10px] text-muted-foreground">
        <Clock3 className="h-3 w-3" />
        UK time · Octopus Agile · Home never wakes the car
      </div>
    </div>
  );
}

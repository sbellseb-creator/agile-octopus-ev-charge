import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BatteryCharging,
  CalendarClock,
  Car,
  ChevronRight,
  Clock3,
  PoundSterling,
  Sparkles,
  TrendingDown,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { fetchAgileRates } from "@/lib/octopus-api";
import { formatUK } from "@/lib/timezone";
import { minutesToClock } from "@/lib/schedule-time";
import {
  loadSchedules,
  type ChargeSchedule,
} from "@/lib/charge-schedule";
import ScheduleStatusBadge from "@/components/schedule/ScheduleStatusBadge";

import {
  formatRegistration,
  linkTeslaVehicleIds,
  vehicleModelLine,
  type Vehicle,
} from "@/lib/vehicle-data";

import type { ChargeSession } from "@/lib/charge-data";
import {
  listTeslaVehicles,
  type TeslaVehicle,
} from "@/lib/tesla";
import { getSettings, hasHomeLocation } from "@/lib/app-settings";
import { resolveHomeScene } from "@/lib/home-scene";
import { supabase } from "@/integrations/supabase/client";

import HomeHeroScene, {
  type HomeSceneTheme,
} from "@/components/home/HomeHeroScene";

interface Props {
  vehicles: Vehicle[];
  sessions: ChargeSession[];
  teslaVehicles?: TeslaVehicle[];
  onManageSchedule: () => void;
}

function dayLabel(planDate: string): string {
  const today = formatUK(new Date(), "yyyy-MM-dd");
  const tomorrow = formatUK(
    new Date(Date.now() + 86_400_000),
    "yyyy-MM-dd",
  );

  if (planDate === today) return "Tonight";
  if (planDate === tomorrow) return "Tomorrow";

  return formatUK(`${planDate}T12:00:00Z`, "EEE");
}

function getAutomaticTheme(): HomeSceneTheme {
  if (typeof window !== "undefined") {
    const forced = window.localStorage.getItem("ev-home-theme");

    const allowed: HomeSceneTheme[] = [
      "summer",
      "winter",
      "spring",
      "autumn",
      "easter",
      "christmas",
      "classic",
    ];

    if (forced && allowed.includes(forced as HomeSceneTheme)) {
      return forced as HomeSceneTheme;
    }
  }

  const month = Number(formatUK(new Date(), "M"));

  if (month === 12 || month <= 2) return "winter";
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  return "autumn";
}

function priceColour(price: number): string {
  if (price < 0) return "bg-emerald-300";
  if (price < 8) return "bg-green-400";
  if (price < 16) return "bg-lime-400";
  if (price < 25) return "bg-yellow-400";
  if (price < 35) return "bg-orange-400";
  return "bg-rose-500";
}

export default function HomeDashboard({
  vehicles,
  sessions,
  teslaVehicles = [],
  onManageSchedule,
}: Props) {
  const settings = getSettings();

  const [schedules, setSchedules] = useState<ChargeSchedule[]>([]);
  const [liveVehicles, setLiveVehicles] = useState<TeslaVehicle[]>(() => {
    if (teslaVehicles.length) return teslaVehicles;

    try {
      const cached = window.localStorage.getItem("ev-home-tesla-snapshot");
      return cached ? (JSON.parse(cached) as TeslaVehicle[]) : [];
    } catch {
      return [];
    }
  });

  const vehicle =
    vehicles.find((v) => v.is_default) ?? vehicles[0];

  useEffect(() => {
    let alive = true;

    const load = () =>
      loadSchedules().then((rows) => {
        if (alive) setSchedules(rows);
      });

    load();
    window.addEventListener("schedules:updated", load);

    return () => {
      alive = false;
      window.removeEventListener("schedules:updated", load);
    };
  }, []);

  // wake=false: opening Home must never wake the vehicle.
  useEffect(() => {
    let alive = true;

    listTeslaVehicles(false)
      .then(async (res) => {
        if (!alive || res.vehicles.length === 0) return;

        setLiveVehicles(res.vehicles);

        // Home must never wake the car, but it should remember the last
        // successful Tesla telemetry so an asleep car does not become "unknown".
        try {
          window.localStorage.setItem(
            "ev-home-tesla-snapshot",
            JSON.stringify(res.vehicles),
          );
        } catch {
          // localStorage unavailable — live state still works.
        }

        const changed = await linkTeslaVehicleIds(
          vehicles,
          res.vehicles,
        );

        if (changed) {
          window.dispatchEvent(new Event("vehicles:updated"));
        }
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles.length]);

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

  const { data: homeWeather } = useQuery({
    queryKey: [
      "home-current-weather",
      settings.home_latitude,
      settings.home_longitude,
    ],
    enabled:
      settings.home_theme === "automatic" &&
      hasHomeLocation(settings),
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

      return {
        weatherCode: Number(codes[bestIndex] ?? 3),
        temperatureC:
          temps[bestIndex] == null
            ? undefined
            : Number(temps[bestIndex]),
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

  const bestWindow = useMemo(() => {
    const slotCount = 6;

    if (future.length < slotCount) return null;

    let best = {
      start: 0,
      avg: Number.POSITIVE_INFINITY,
    };

    for (
      let i = 0;
      i + slotCount <= future.length;
      i++
    ) {
      const chunk = future.slice(i, i + slotCount);

      const avg =
        chunk.reduce(
          (sum, rate) => sum + rate.value_inc_vat,
          0,
        ) / slotCount;

      if (avg < best.avg) {
        best = { start: i, avg };
      }
    }

    const chunk = future.slice(
      best.start,
      best.start + slotCount,
    );

    return {
      from: chunk[0].valid_from,
      to: chunk[slotCount - 1].valid_to,
      avg: best.avg,
    };
  }, [future]);

  const nextPlan = schedules[0] ?? null;

  const month = useMemo(() => {
    const key = formatUK(new Date(), "yyyy-MM");

    const rows = sessions.filter((session) =>
      (session.session_date ?? "").startsWith(key),
    );

    return {
      kwh: rows.reduce(
        (total, session) =>
          total +
          (Number(session.energy_added_kwh) || 0),
        0,
      ),
      cost: rows.reduce(
        (total, session) =>
          total +
          (Number(session.total_cost_gbp) || 0),
        0,
      ),
      count: rows.length,
    };
  }, [sessions]);

  const chargingState =
    live?.charging_state?.toLowerCase() ?? "";

  const isCharging =
    chargingState === "charging" ||
    chargingState === "starting";

  const pluggedWaiting =
    !isCharging &&
    ["stopped", "nopower", "complete"].includes(
      chargingState,
    );

  const isPluggedIn =
    isCharging ||
    [
      "stopped",
      "complete",
      "nopower",
      "disconnected",
      "starting",
    ].includes(chargingState)
      ? chargingState !== "disconnected"
      : false;

  const scene = resolveHomeScene({
    preference: settings.home_theme ?? "automatic",
    weatherCode: homeWeather?.weatherCode,
    temperatureC: homeWeather?.temperatureC,
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
            )}p/kWh average in the best 3-hour window`
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
        )}–${formatUK(bestWindow.to, "HH:mm")} is currently the best 3-hour window.`,
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
        ? `Best upcoming 3-hour average ${bestWindow.avg.toFixed(
            2,
          )}p/kWh.`
        : "Waiting for enough price data.",
      tone: "text-primary",
    };
  })();

  const ribbon = [current, ...future]
    .filter(Boolean)
    .slice(0, 18);

  const averageMonthPrice =
    month.kwh > 0
      ? (month.cost / month.kwh) * 100
      : 0;

  return (
    <div className="space-y-4">
      {/* Vehicle scene */}
      <section className="overflow-hidden rounded-[30px] border border-white/10 bg-card shadow-2xl">
        <HomeHeroScene
          scene={scene}
          charging={isCharging}
          pluggedIn={isPluggedIn}
          batteryLevel={live?.battery_level}
          chargeLimit={live?.charge_limit_soc}
          chargerPowerKw={live?.charger_power_kw}
          timeToFullChargeHours={live?.time_to_full_charge}
          state={live?.state}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
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

            <p className="mt-0.5 text-xs text-muted-foreground">
              {vehicle
                ? vehicleModelLine(vehicle)
                : "Add a vehicle to get started"}
            </p>
          </div>

          {live?.charge_limit_soc !== null &&
            live?.charge_limit_soc !== undefined && (
              <div className="text-right">
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
      <section className="overflow-hidden rounded-[26px] border border-border bg-gradient-to-br from-card via-card to-primary/5 p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className={`text-[11px] font-bold uppercase tracking-[0.18em] ${recommendation.tone}`}
            >
              {recommendation.label}
            </p>

            <h2 className="mt-1 text-2xl font-black tracking-tight">
              {recommendation.title}
            </h2>

            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {recommendation.detail}
            </p>
          </div>

          <div className="rounded-2xl bg-primary/10 p-2.5">
            {isCharging ? (
              <BatteryCharging className="h-6 w-6 text-emerald-300" />
            ) : (
              <Sparkles className="h-6 w-6 text-primary" />
            )}
          </div>
        </div>

        {/* Price ribbon */}
        {ribbon.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Agile price timeline</span>
              <span>Next {ribbon.length / 2} hours</span>
            </div>

            <div className="flex h-9 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-1">
              {ribbon.map((rate, index) => (
                <div
                  key={`${rate!.valid_from}-${index}`}
                  title={`${formatUK(
                    rate!.valid_from,
                    "HH:mm",
                  )} · ${rate!.value_inc_vat.toFixed(
                    2,
                  )}p/kWh`}
                  className={`h-full flex-1 ${
                    index === 0
                      ? "rounded-l-lg"
                      : ""
                  } ${
                    index === ribbon.length - 1
                      ? "rounded-r-lg"
                      : ""
                  } ${priceColour(
                    rate!.value_inc_vat,
                  )} opacity-90`}
                />
              ))}
            </div>

            <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
              <span>
                Now{" "}
                {current
                  ? `· ${current.value_inc_vat.toFixed(
                      2,
                    )}p`
                  : ""}
              </span>

              {bestWindow && (
                <span>
                  Best{" "}
                  {formatUK(
                    bestWindow.from,
                    "HH:mm",
                  )}{" "}
                  · {bestWindow.avg.toFixed(2)}p
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Next charge */}
      <section className="rounded-[26px] border border-border bg-card p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-2xl bg-violet-500/10 p-2.5">
              <CalendarClock className="h-5 w-5 text-violet-300" />
            </div>

            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300">
                Next charge
              </p>

              {nextPlan ? (
                <>
                  <p className="mt-1 font-mono text-xl font-black">
                    {nextPlan.plan_date
                      ? `${dayLabel(
                          nextPlan.plan_date,
                        )} `
                      : ""}
                    {minutesToClock(
                      nextPlan.start_minutes,
                    )}
                    {nextPlan.end_minutes !== null
                      ? ` → ${minutesToClock(
                          nextPlan.end_minutes,
                        )}`
                      : ""}
                  </p>

                  {nextPlan.plan_date && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatUK(
                        `${nextPlan.plan_date}T12:00:00Z`,
                        "EEE dd/MM/yyyy",
                      )}{" "}
                      · UK time
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="mt-1 text-lg font-bold">
                    No charge planned
                  </p>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {bestWindow
                      ? `Best current opportunity ${formatUK(
                          bestWindow.from,
                          "HH:mm",
                        )}–${formatUK(
                          bestWindow.to,
                          "HH:mm",
                        )}.`
                      : "Use Planner to find the cheapest charging window."}
                  </p>
                </>
              )}
            </div>
          </div>

          {nextPlan && (
            <ScheduleStatusBadge
              status={nextPlan.status}
              readyToSend={Boolean(
                nextPlan.tesla_vehicle_id,
              )}
              verified={
                nextPlan.status === "confirmed" &&
                Boolean(nextPlan.last_verified_at) &&
                !nextPlan.last_error
              }
            />
          )}
        </div>

        {nextPlan && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-muted/35 p-2.5">
              <p className="text-[10px] text-muted-foreground">
                Energy
              </p>
              <p className="font-bold">
                {nextPlan.estimated_kwh.toFixed(1)} kWh
              </p>
            </div>

            <div className="rounded-xl bg-muted/35 p-2.5">
              <p className="text-[10px] text-muted-foreground">
                Est. cost
              </p>
              <p className="font-bold">
                £{nextPlan.estimated_cost_gbp.toFixed(2)}
              </p>
            </div>

            <div className="rounded-xl bg-muted/35 p-2.5">
              <p className="text-[10px] text-muted-foreground">
                Average
              </p>
              <p className="font-bold">
                {nextPlan.avg_pence_per_kwh.toFixed(2)}p
              </p>
            </div>

            <div className="rounded-xl bg-muted/35 p-2.5">
              <p className="text-[10px] text-muted-foreground">
                Charger
              </p>
              <p className="font-bold">
                {nextPlan.charger_kw} kW
              </p>
            </div>
          </div>
        )}

        {nextPlan?.last_error && (
          <p className="mt-2 text-xs text-destructive">
            {nextPlan.last_error}
          </p>
        )}

        <Button
          onClick={onManageSchedule}
          className="mt-4 w-full justify-between rounded-xl"
        >
          <span>
            {!nextPlan
              ? "Plan my next charge"
              : nextPlan.status === "confirmed"
                ? "Review or change schedule"
                : nextPlan.status === "failed"
                  ? "Try sending again"
                  : "Review and send to Tesla"}
          </span>

          <ChevronRight className="h-4 w-4" />
        </Button>
      </section>

      {/* This month */}
      <section className="rounded-[26px] border border-border bg-card px-4 py-3 shadow-lg">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          This month
        </p>

        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <CalendarClock className="mx-auto mb-1 h-4 w-4 text-primary" />
            <p className="text-lg font-black">
              {month.count}
            </p>
            <p className="text-[9px] text-muted-foreground">
              Charges
            </p>
          </div>

          <div>
            <BatteryCharging className="mx-auto mb-1 h-4 w-4 text-emerald-300" />
            <p className="text-lg font-black">
              {month.kwh.toFixed(1)}
            </p>
            <p className="text-[9px] text-muted-foreground">
              kWh
            </p>
          </div>

          <div>
            <PoundSterling className="mx-auto mb-1 h-4 w-4 text-violet-300" />
            <p className="text-lg font-black">
              £{month.cost.toFixed(2)}
            </p>
            <p className="text-[9px] text-muted-foreground">
              Spend
            </p>
          </div>

          <div>
            <TrendingDown className="mx-auto mb-1 h-4 w-4 text-amber-300" />
            <p className="text-lg font-black">
              {month.kwh > 0
                ? `${averageMonthPrice.toFixed(1)}p`
                : "—"}
            </p>
            <p className="text-[9px] text-muted-foreground">
              Average
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-center gap-1.5 py-1 text-[10px] text-muted-foreground">
        <Clock3 className="h-3 w-3" />
        UK time · Octopus Agile · Home never wakes the car
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BatteryCharging, CalendarClock, Car, PoundSterling, TrendingDown, Zap } from "lucide-react";
import { fetchAgileRates } from "@/lib/octopus-api";
import { formatUK } from "@/lib/timezone";
import { minutesToClock } from "@/lib/schedule-time";
import { loadSchedules, type ChargeSchedule } from "@/lib/charge-schedule";
import ScheduleStatusBadge from "@/components/schedule/ScheduleStatusBadge";
import { formatRegistration, linkTeslaVehicleIds, vehicleModelLine, type Vehicle } from "@/lib/vehicle-data";
import type { ChargeSession } from "@/lib/charge-data";
import { listTeslaVehicles, type TeslaVehicle } from "@/lib/tesla";
import { getSettings } from "@/lib/app-settings";

interface Props {
  vehicles: Vehicle[];
  sessions: ChargeSession[];
  /** Cached Tesla snapshot supplied by the Vehicles screen. Never fetched here. */
  teslaVehicles?: TeslaVehicle[];
  onManageSchedule: () => void;
}

const Tile = ({ icon: Icon, label, value, sub }: { icon: typeof Zap; label: string; value: string; sub?: string }) => (
  <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-2.5">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
    <p className="mt-1 truncate text-base font-bold sm:text-lg">{value}</p>
    {sub && <p className="truncate text-[10px] text-muted-foreground">{sub}</p>}
  </div>
);

export default function HomeDashboard({ vehicles, sessions, teslaVehicles = [], onManageSchedule }: Props) {
  const settings = getSettings();
  const [schedules, setSchedules] = useState<ChargeSchedule[]>([]);
  const vehicle = vehicles.find((v) => v.is_default) ?? vehicles[0];

  // Database read only — this never contacts the vehicle, so opening Home
  // can never wake the Tesla.
  useEffect(() => {
    let alive = true;
    loadSchedules().then((rows) => alive && setSchedules(rows));
    return () => {
      alive = false;
    };
  }, []);

  // Automatic read with wake=false only: this can never wake the car.
  const [liveVehicles, setLiveVehicles] = useState<TeslaVehicle[]>(teslaVehicles);
  useEffect(() => {
    let alive = true;
    listTeslaVehicles(false)
      .then(async (res) => {
        if (!alive || res.vehicles.length === 0) return;
        setLiveVehicles(res.vehicles);
        await linkTeslaVehicleIds(vehicles, res.vehicles);
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
      liveVehicles.find((t) => t.id === vehicle.tesla_vehicle_id) ??
      (liveVehicles.length === 1 && vehicle.source === "tesla" ? liveVehicles[0] : undefined)
    );
  }, [liveVehicles, vehicle]);

  const { data: rates = [] } = useQuery({
    queryKey: ["agile-home", settings.region],
    queryFn: () => fetchAgileRates(undefined, undefined, undefined, settings.region),
    staleTime: 15 * 60_000,
  });

  const now = Date.now();
  const current = rates.find((r) => new Date(r.valid_from).getTime() <= now && new Date(r.valid_to).getTime() > now);
  const future = useMemo(
    () => rates.filter((r) => new Date(r.valid_from).getTime() > now).sort((a, b) => a.valid_from.localeCompare(b.valid_from)),
    [rates, now],
  );

  /** Cheapest contiguous 3-hour block ahead (6 half-hour slots). */
  const bestWindow = useMemo(() => {
    const N = 6;
    if (future.length < N) return null;
    let best = { start: 0, avg: Infinity };
    for (let i = 0; i + N <= future.length; i++) {
      const chunk = future.slice(i, i + N);
      const avg = chunk.reduce((s, r) => s + r.value_inc_vat, 0) / N;
      if (avg < best.avg) best = { start: i, avg };
    }
    const chunk = future.slice(best.start, best.start + N);
    return { from: chunk[0].valid_from, to: chunk[N - 1].valid_to, avg: best.avg };
  }, [future]);

  const nextPlan = schedules[0] ?? null;

  const month = useMemo(() => {
    const key = formatUK(new Date(), "yyyy-MM");
    const rows = sessions.filter((s) => (s.session_date ?? "").startsWith(key));
    return {
      kwh: rows.reduce((t, s) => t + (Number(s.energy_added_kwh) || 0), 0),
      cost: rows.reduce((t, s) => t + (Number(s.total_cost_gbp) || 0), 0),
      count: rows.length,
    };
  }, [sessions]);

  return (
    <div className="space-y-4">
      {/* Vehicle hero */}
      <Card className="overflow-hidden border-primary/30">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex min-w-0 items-start gap-2">
            <Car className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="break-all font-mono text-lg font-bold uppercase tracking-wider">
                {formatRegistration(vehicle?.registration ?? "") || vehicle?.name || "No vehicle"}
              </p>
              <p className="truncate text-xs text-muted-foreground">{vehicle ? vehicleModelLine(vehicle) : "Add a vehicle to get started"}</p>
            </div>
            {live?.state && (
              <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                {live.state}
              </Badge>
            )}
          </div>

          {live?.battery_level !== null && live?.battery_level !== undefined ? (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BatteryCharging className="h-3.5 w-3.5" />
                  {live.charging_state ?? "Battery"}
                </span>
                <span className="text-xl font-bold text-primary">{live.battery_level}%</span>
              </div>
              <Progress value={live.battery_level} className="h-2" />
              {live.charge_limit_soc !== null && live.charge_limit_soc !== undefined && (
                <p className="text-[10px] text-muted-foreground">Charge limit {live.charge_limit_soc}%</p>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Live battery data appears after you open Vehicles. Opening the app never wakes the car.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Price + window tiles */}
      <div className="grid grid-cols-2 gap-2">
        <Tile
          icon={Zap}
          label="Agile now"
          value={current ? `${current.value_inc_vat.toFixed(2)}p` : "—"}
          sub={current ? `until ${formatUK(current.valid_to, "HH:mm")}` : "Loading prices"}
        />
        <Tile
          icon={TrendingDown}
          label="Best window"
          value={bestWindow ? `${bestWindow.avg.toFixed(2)}p` : "—"}
          sub={bestWindow ? `${formatUK(bestWindow.from, "HH:mm")}–${formatUK(bestWindow.to, "HH:mm")}` : "No data yet"}
        />
        <Tile icon={BatteryCharging} label="This month" value={`${month.kwh.toFixed(1)} kWh`} sub={`${month.count} session${month.count === 1 ? "" : "s"}`} />
        <Tile icon={PoundSterling} label="Month cost" value={`£${month.cost.toFixed(2)}`} sub={month.kwh > 0 ? `${((month.cost / month.kwh) * 100).toFixed(1)}p/kWh avg` : "—"} />
      </div>

      {/* Next planned charge */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">Next planned charge</span>
            {nextPlan && <ScheduleStatusBadge status={nextPlan.status} readyToSend={Boolean(nextPlan.tesla_vehicle_id)} />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {nextPlan ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="font-mono text-base font-bold text-primary">{minutesToClock(nextPlan.start_minutes)}</span>
                {nextPlan.end_minutes !== null && <span className="text-xs text-muted-foreground">ready by {minutesToClock(nextPlan.end_minutes)}</span>}
                {nextPlan.plan_date && <span className="text-xs text-muted-foreground">{formatUK(`${nextPlan.plan_date}T12:00:00Z`, "EEE dd-MM-yy")}</span>}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>{nextPlan.estimated_kwh.toFixed(1)} kWh</span>
                <span>£{nextPlan.estimated_cost_gbp.toFixed(2)}</span>
                <span>{nextPlan.avg_pence_per_kwh.toFixed(2)}p/kWh</span>
                <span>{nextPlan.charger_kw} kW</span>
              </div>
              {nextPlan.last_error && <p className="text-[11px] text-destructive">{nextPlan.last_error}</p>}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No plan yet. Use the Planner to find a cheap window.</p>
          )}
          <Button variant="outline" size="sm" onClick={onManageSchedule} className="w-full gap-1.5 text-xs">
            <CalendarClock className="h-3.5 w-3.5" /> {nextPlan ? "Review or manage schedule" : "Plan a charge"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

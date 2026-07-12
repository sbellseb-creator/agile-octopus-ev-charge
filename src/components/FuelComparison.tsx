import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Fuel, Droplet, Zap, TrendingDown, Settings2 } from "lucide-react";
import type { ChargeSession } from "@/lib/charge-data";
import type { Vehicle } from "@/lib/vehicle-data";
import { loadTrips } from "@/lib/work-data";
import { formatUK } from "@/lib/timezone";

interface Props {
  sessions: ChargeSession[];
  vehicles: Vehicle[];
}

type Period = "week" | "month" | "year" | "all";

// UK averages May 2026 (RAC Fuel Watch reference) — editable defaults
const DEFAULTS = {
  petrol_p_l: 138.5,
  diesel_p_l: 145.2,
  petrol_mpg: 45,
  diesel_mpg: 55,
};
const LITRES_PER_GALLON = 4.546;
const KEY = "fuel-compare-settings";

interface Settings {
  petrol_p_l: number;
  diesel_p_l: number;
  petrol_mpg: number;
  diesel_mpg: number;
}
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULTS;
}

function costPerMile(pPerL: number, mpg: number): number {
  return ((pPerL / 100) * LITRES_PER_GALLON) / mpg;
}

function filterByPeriod<T extends { date: string }>(rows: T[], period: Period): T[] {
  if (period === "all") return rows;
  const now = new Date();
  const cutoff = new Date(now);
  if (period === "week") cutoff.setDate(now.getDate() - 7);
  else if (period === "month") cutoff.setMonth(now.getMonth() - 1);
  else cutoff.setFullYear(now.getFullYear() - 1);
  const c = formatUK(cutoff, "yyyy-MM-dd");
  return rows.filter((r) => r.date >= c);
}

export default function FuelComparison({ sessions, vehicles }: Props) {
  const [period, setPeriod] = useState<Period>("month");
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings));
  }, [settings]);

  const trips = useMemo(() => loadTrips(), [sessions]); // refresh when sessions change

  const filteredSessions = useMemo(
    () => filterByPeriod(sessions.map((s) => ({ ...s, date: s.session_date })), period),
    [sessions, period]
  );
  const filteredTrips = useMemo(
    () => filterByPeriod(trips.map((t) => ({ ...t, date: t.trip_date })), period),
    [trips, period]
  );

  const totalKwh = filteredSessions.reduce((s, r) => s + r.energy_added_kwh, 0);
  const totalSessionCost = filteredSessions.reduce((s, r) => s + r.total_cost_gbp, 0);
  const tripExtras = filteredTrips.reduce((s, r) => s + (r.extra_charges_gbp ?? 0), 0);
  const totalEvCost = totalSessionCost + tripExtras;

  const usedVehicleIds = new Set(filteredSessions.map((s) => s.vehicle_id));
  const usedVehicles = vehicles.filter((v) => usedVehicleIds.has(v.id) && v.miles_per_kwh > 0);
  const avgMpkwh =
    usedVehicles.length > 0
      ? usedVehicles.reduce((a, v) => a + v.miles_per_kwh, 0) / usedVehicles.length
      : 3.5;

  const totalMiles = totalKwh * avgMpkwh;
  const evPerMile = totalMiles > 0 ? totalEvCost / totalMiles : 0;
  const petrolPerMile = costPerMile(settings.petrol_p_l, settings.petrol_mpg);
  const dieselPerMile = costPerMile(settings.diesel_p_l, settings.diesel_mpg);
  const petrolCost = totalMiles * petrolPerMile;
  const dieselCost = totalMiles * dieselPerMile;
  const savedVsPetrol = petrolCost - totalEvCost;
  const savedVsDiesel = dieselCost - totalEvCost;

  const rows = [
    {
      label: "Electric",
      icon: Zap,
      color: "text-primary",
      bg: "bg-primary/10",
      cost: totalEvCost,
      perMile: evPerMile,
      detail: `${avgMpkwh.toFixed(2)} mi/kWh${tripExtras > 0 ? ` · +£${tripExtras.toFixed(2)} extras` : ""}`,
    },
    {
      label: "Petrol",
      icon: Fuel,
      color: "text-chart-warning",
      bg: "bg-chart-warning/10",
      cost: petrolCost,
      perMile: petrolPerMile,
      detail: `${settings.petrol_mpg}mpg @ ${settings.petrol_p_l.toFixed(1)}p/L`,
    },
    {
      label: "Diesel",
      icon: Droplet,
      color: "text-muted-foreground",
      bg: "bg-muted/40",
      cost: dieselCost,
      perMile: dieselPerMile,
      detail: `${settings.diesel_mpg}mpg @ ${settings.diesel_p_l.toFixed(1)}p/L`,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4 text-accent" />
            Fuel Cost Comparison
          </CardTitle>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Edit fuel prices"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {totalMiles.toFixed(0)} mi · {totalKwh.toFixed(1)} kWh
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList className="grid grid-cols-4 w-full h-8">
            <TabsTrigger value="week" className="text-[11px]">Week</TabsTrigger>
            <TabsTrigger value="month" className="text-[11px]">Month</TabsTrigger>
            <TabsTrigger value="year" className="text-[11px]">Year</TabsTrigger>
            <TabsTrigger value="all" className="text-[11px]">All</TabsTrigger>
          </TabsList>
        </Tabs>

        {showSettings && (
          <div className="rounded-md border border-border bg-muted/30 p-2 grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Petrol p/L</Label>
              <Input
                type="number" step="0.1" className="h-8 text-xs"
                value={settings.petrol_p_l}
                onChange={(e) => setSettings({ ...settings, petrol_p_l: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Petrol mpg</Label>
              <Input
                type="number" step="1" className="h-8 text-xs"
                value={settings.petrol_mpg}
                onChange={(e) => setSettings({ ...settings, petrol_mpg: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Diesel p/L</Label>
              <Input
                type="number" step="0.1" className="h-8 text-xs"
                value={settings.diesel_p_l}
                onChange={(e) => setSettings({ ...settings, diesel_p_l: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Diesel mpg</Label>
              <Input
                type="number" step="1" className="h-8 text-xs"
                value={settings.diesel_mpg}
                onChange={(e) => setSettings({ ...settings, diesel_mpg: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
        )}

        {rows.map((r) => (
          <div key={r.label} className={`flex items-center gap-2 rounded-md p-2 ${r.bg}`}>
            <r.icon className={`h-4 w-4 shrink-0 ${r.color}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{r.label}</span>
                <span className="text-sm font-bold tabular-nums">£{r.cost.toFixed(2)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="truncate">{r.detail}</span>
                <span className="tabular-nums shrink-0">{(r.perMile * 100).toFixed(1)}p/mi</span>
              </div>
            </div>
          </div>
        ))}

        {totalMiles > 0 && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Saved vs Petrol</p>
              <p className="text-base font-bold text-primary tabular-nums">£{savedVsPetrol.toFixed(2)}</p>
            </div>
            <div className="rounded-md border border-accent/30 bg-accent/5 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Saved vs Diesel</p>
              <p className="text-base font-bold text-accent tabular-nums">£{savedVsDiesel.toFixed(2)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

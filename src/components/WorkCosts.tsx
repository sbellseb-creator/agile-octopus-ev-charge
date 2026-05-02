import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Briefcase, Plus, Trash2, TrendingUp, Coins, Route } from "lucide-react";
import {
  loadTrips,
  addTrip,
  deleteTrip,
  getDefaultRate,
  setDefaultRate,
  SUGGESTED_RATES,
  type WorkTrip,
} from "@/lib/work-data";
import type { ChargeSession } from "@/lib/charge-data";
import type { Vehicle } from "@/lib/vehicle-data";
import { toast } from "sonner";

type Period = "week" | "month" | "year" | "all";

function filterByPeriod<T extends { trip_date?: string; session_date?: string }>(
  rows: T[],
  period: Period,
  key: "trip_date" | "session_date"
): T[] {
  if (period === "all") return rows;
  const now = new Date();
  const cutoff = new Date(now);
  if (period === "week") cutoff.setDate(now.getDate() - 7);
  else if (period === "month") cutoff.setMonth(now.getMonth() - 1);
  else if (period === "year") cutoff.setFullYear(now.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return rows.filter((r) => (r[key] as string) >= cutoffStr);
}

function formatUkDate(d: string): string {
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0].slice(2)}` : d;
}

interface Props {
  sessions: ChargeSession[];
  vehicles: Vehicle[];
}

export default function WorkCosts({ sessions, vehicles }: Props) {
  const [trips, setTrips] = useState<WorkTrip[]>(loadTrips);
  const [period, setPeriod] = useState<Period>("month");
  const [rate, setRate] = useState<number>(getDefaultRate());
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [miles, setMiles] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => setDefaultRate(rate), [rate]);

  const handleAdd = () => {
    const m = parseFloat(miles);
    if (!Number.isFinite(m) || m <= 0) {
      toast.error("Enter valid miles");
      return;
    }
    setTrips(addTrip({ trip_date: date, description: desc, miles: m, rate_pence_per_mile: rate }));
    setMiles("");
    setDesc("");
    toast.success("Work trip logged");
  };

  const handleDelete = (id: string) => setTrips(deleteTrip(id));

  // Cost basis: weighted miles/kWh from used vehicles, fallback 3.5
  const usedIds = new Set(sessions.map((s) => s.vehicle_id));
  const usedVehicles = vehicles.filter((v) => usedIds.has(v.id) && v.miles_per_kwh > 0);
  const avgMpkwh =
    usedVehicles.length > 0
      ? usedVehicles.reduce((a, v) => a + v.miles_per_kwh, 0) / usedVehicles.length
      : 3.5;
  const totalKwh = sessions.reduce((s, r) => s + r.energy_added_kwh, 0);
  const totalEvCost = sessions.reduce((s, r) => s + r.total_cost_gbp, 0);
  const evCostPerMile = totalKwh > 0 ? totalEvCost / (totalKwh * avgMpkwh) : 0; // £/mile

  const filtered = useMemo(() => filterByPeriod(trips, period, "trip_date"), [trips, period]);

  const totals = useMemo(() => {
    const totalMiles = filtered.reduce((a, t) => a + t.miles, 0);
    const claimed = filtered.reduce((a, t) => a + (t.miles * t.rate_pence_per_mile) / 100, 0);
    const actualCost = totalMiles * evCostPerMile;
    return { totalMiles, claimed, actualCost, profit: claimed - actualCost };
  }, [filtered, evCostPerMile]);

  return (
    <div className="space-y-4">
      {/* Add trip */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Briefcase className="h-4 w-4 text-primary" /> Log Work Trip
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Miles</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={miles}
                onChange={(e) => setMiles(e.target.value)}
                placeholder="e.g. 42.5"
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Client visit, site survey…"
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Claim rate (p/mile)</Label>
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_RATES.map((r) => (
                <Button
                  key={r.label}
                  type="button"
                  size="sm"
                  variant={rate === r.value ? "default" : "outline"}
                  className="h-7 text-[10px] px-2"
                  onClick={() => setRate(r.value)}
                  title={r.detail}
                >
                  {r.label} · {r.value}p
                </Button>
              ))}
            </div>
            <Input
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
              className="h-9 mt-1"
            />
          </div>

          <Button onClick={handleAdd} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Add Trip
          </Button>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-accent" /> Summary
            </CardTitle>
            <Badge variant="outline" className="text-[10px]">
              EV {(evCostPerMile * 100).toFixed(1)}p/mi
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList className="grid grid-cols-4 w-full h-8">
              <TabsTrigger value="week" className="text-[11px]">Week</TabsTrigger>
              <TabsTrigger value="month" className="text-[11px]">Month</TabsTrigger>
              <TabsTrigger value="year" className="text-[11px]">Year</TabsTrigger>
              <TabsTrigger value="all" className="text-[11px]">All</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-border bg-muted/40 p-2">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Route className="h-3 w-3" /> Miles
              </p>
              <p className="text-base font-bold tabular-nums">{totals.totalMiles.toFixed(1)}</p>
            </div>
            <div className="rounded-md border border-border bg-muted/40 p-2">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Coins className="h-3 w-3" /> EV cost
              </p>
              <p className="text-base font-bold tabular-nums">£{totals.actualCost.toFixed(2)}</p>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/10 p-2">
              <p className="text-[10px] text-muted-foreground">Claim back</p>
              <p className="text-base font-bold text-primary tabular-nums">£{totals.claimed.toFixed(2)}</p>
            </div>
            <div
              className={`rounded-md border p-2 ${
                totals.profit >= 0 ? "border-accent/40 bg-accent/10" : "border-destructive/40 bg-destructive/10"
              }`}
            >
              <p className="text-[10px] text-muted-foreground">Net {totals.profit >= 0 ? "profit" : "loss"}</p>
              <p
                className={`text-base font-bold tabular-nums ${
                  totals.profit >= 0 ? "text-accent" : "text-destructive"
                }`}
              >
                £{totals.profit.toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trip list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Trips ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No trips logged for this period.</p>
          ) : (
            filtered.map((t) => {
              const claim = (t.miles * t.rate_pence_per_mile) / 100;
              const evCost = t.miles * evCostPerMile;
              const net = claim - evCost;
              return (
                <div key={t.id} className="rounded-md border border-border p-2 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold">{formatUkDate(t.trip_date)}</span>
                        <span className="text-xs tabular-nums">{t.miles.toFixed(1)} mi</span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1">
                          {t.rate_pence_per_mile}p/mi
                        </Badge>
                      </div>
                      {t.description && (
                        <p className="text-[11px] text-muted-foreground truncate">{t.description}</p>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleDelete(t.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Claim £{claim.toFixed(2)} · EV £{evCost.toFixed(2)}</span>
                    <span className={`font-semibold tabular-nums ${net >= 0 ? "text-accent" : "text-destructive"}`}>
                      {net >= 0 ? "+" : ""}£{net.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

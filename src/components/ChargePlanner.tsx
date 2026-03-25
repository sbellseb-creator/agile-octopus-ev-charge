import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { fetchAgileRates, type AgileRate } from "@/lib/octopus-api";
import type { Vehicle } from "@/lib/vehicle-data";
import type { ChargeMode } from "@/lib/charge-data";
import { CHARGE_MODE_LABELS } from "@/lib/charge-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Zap, Clock, TrendingDown, Activity,
  BarChart3, CheckCircle2, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";

interface Props {
  vehicles: Vehicle[];
}

const MODE_INFO: Record<ChargeMode, { icon: typeof Zap; desc: string }> = {
  immediate: { icon: Zap, desc: "Start charging now at whatever rate is current." },
  target_time: { icon: Clock, desc: "Find cheapest slots to be fully charged by your target time." },
  agile_cheapest: { icon: TrendingDown, desc: "Pick the cheapest half-hour slots from the Agile tariff." },
  realtime: { icon: Activity, desc: "Monitor live rates and charge only when price drops below your threshold." },
};

function rateColor(p: number): string {
  if (p <= 0) return "hsl(var(--primary))";
  if (p < 15) return "hsl(var(--chart-good))";
  if (p < 25) return "hsl(var(--chart-warning))";
  return "hsl(var(--chart-danger))";
}

export default function ChargePlanner({ vehicles }: Props) {
  const [mode, setMode] = useState<ChargeMode>("target_time");
  const [targetTime, setTargetTime] = useState("07:30");
  const [threshold, setThreshold] = useState("15");
  const [slotsNeeded, setSlotsNeeded] = useState("6");
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    () => (vehicles.find((v) => v.is_default) || vehicles[0])?.id || ""
  );

  const now = new Date();
  const periodFrom = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const periodTo = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data: rates, isLoading } = useQuery({
    queryKey: ["planner-rates", periodFrom],
    queryFn: () => fetchAgileRates(undefined, periodFrom, periodTo),
    refetchInterval: 15 * 60 * 1000,
  });

  const futureRates = useMemo(() => {
    if (!rates) return [];
    return rates
      .filter((r) => new Date(r.valid_to).getTime() > now.getTime())
      .sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  }, [rates]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
  const slotsCount = parseInt(slotsNeeded) || 6;

  const recommendation = useMemo(() => {
    if (futureRates.length === 0) return null;

    if (mode === "immediate") {
      const current = futureRates[0];
      return {
        slots: [current],
        avgPrice: current.value_inc_vat,
        summary: `Charging now at ${current.value_inc_vat.toFixed(1)}p/kWh`,
      };
    }

    if (mode === "target_time") {
      const [h, m] = targetTime.split(":").map(Number);
      const target = new Date(now);
      target.setHours(h, m, 0, 0);
      if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);

      const eligible = futureRates.filter(
        (r) => new Date(r.valid_to).getTime() <= target.getTime()
      );
      const sorted = [...eligible].sort((a, b) => a.value_inc_vat - b.value_inc_vat);
      const best = sorted.slice(0, slotsCount);
      const avg = best.length > 0 ? best.reduce((s, r) => s + r.value_inc_vat, 0) / best.length : 0;

      return {
        slots: best.sort((a, b) => a.valid_from.localeCompare(b.valid_from)),
        avgPrice: avg,
        summary: best.length > 0
          ? `${best.length} cheapest slots before ${targetTime} — avg ${avg.toFixed(1)}p/kWh`
          : "No slots available before target time",
      };
    }

    if (mode === "agile_cheapest") {
      const sorted = [...futureRates].sort((a, b) => a.value_inc_vat - b.value_inc_vat);
      const best = sorted.slice(0, slotsCount);
      const avg = best.length > 0 ? best.reduce((s, r) => s + r.value_inc_vat, 0) / best.length : 0;

      return {
        slots: best.sort((a, b) => a.valid_from.localeCompare(b.valid_from)),
        avgPrice: avg,
        summary: `${best.length} cheapest slots in next 24h — avg ${avg.toFixed(1)}p/kWh`,
      };
    }

    if (mode === "realtime") {
      const thresholdVal = parseFloat(threshold) || 15;
      const below = futureRates.filter((r) => r.value_inc_vat <= thresholdVal);
      const avg = below.length > 0 ? below.reduce((s, r) => s + r.value_inc_vat, 0) / below.length : 0;

      return {
        slots: below,
        avgPrice: avg,
        summary: below.length > 0
          ? `${below.length} slots below ${thresholdVal}p — avg ${avg.toFixed(1)}p/kWh`
          : `No upcoming slots below ${thresholdVal}p/kWh`,
      };
    }

    return null;
  }, [mode, futureRates, targetTime, slotsCount, threshold]);

  const chartData = futureRates.map((r) => {
    const isSelected = recommendation?.slots.some((s) => s.valid_from === r.valid_from);
    return {
      time: format(new Date(r.valid_from), "HH:mm"),
      price: r.value_inc_vat,
      isSelected,
    };
  });

  const estimatedCost = useMemo(() => {
    if (!recommendation || !selectedVehicle) return null;
    const kwhPerSlot = (selectedVehicle.battery_kwh * (selectedVehicle.charge_efficiency_pct / 100)) / slotsCount;
    const totalKwh = kwhPerSlot * recommendation.slots.length;
    const cost = recommendation.slots.reduce((s, r) => s + (r.value_inc_vat * kwhPerSlot) / 100, 0);
    return { totalKwh: totalKwh.toFixed(1), cost: cost.toFixed(2) };
  }, [recommendation, selectedVehicle, slotsCount]);

  const ModeIcon = MODE_INFO[mode].icon;

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {(Object.keys(MODE_INFO) as ChargeMode[]).map((m) => {
          const Icon = MODE_INFO[m].icon;
          const active = mode === m;
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all ${
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-sm font-medium">{CHARGE_MODE_LABELS[m]}</span>
            </button>
          );
        })}
      </div>

      {/* Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ModeIcon className="h-5 w-5 text-primary" />
            {CHARGE_MODE_LABELS[mode]} Settings
          </CardTitle>
          <p className="text-sm text-muted-foreground">{MODE_INFO[mode].desc}</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {vehicles.length > 0 && (
              <div className="space-y-2">
                <Label>Vehicle</Label>
                <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(mode === "target_time" || mode === "agile_cheapest") && (
              <div className="space-y-2">
                <Label>Slots Needed</Label>
                <Input
                  type="number"
                  min={1}
                  max={48}
                  value={slotsNeeded}
                  onChange={(e) => setSlotsNeeded(e.target.value)}
                />
              </div>
            )}

            {mode === "target_time" && (
              <div className="space-y-2">
                <Label>Ready By</Label>
                <Input
                  type="time"
                  value={targetTime}
                  onChange={(e) => setTargetTime(e.target.value)}
                />
              </div>
            )}

            {mode === "realtime" && (
              <div className="space-y-2">
                <Label>Price Threshold (p/kWh)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recommendation */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : recommendation && (
        <>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <CheckCircle2 className="h-8 w-8 shrink-0 text-primary" />
              <div className="flex-1">
                <p className="font-semibold">{recommendation.summary}</p>
                {estimatedCost && (
                  <p className="text-sm text-muted-foreground">
                    Est. ~{estimatedCost.totalKwh} kWh — ~£{estimatedCost.cost}
                  </p>
                )}
              </div>
              {recommendation.slots.length > 0 && (
                <Badge variant="secondary" className="text-sm">
                  {recommendation.avgPrice.toFixed(1)}p avg
                </Badge>
              )}
            </CardContent>
          </Card>

          {/* Chart with selected slots highlighted */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-primary" />
                Rate Forecast — Selected Slots Highlighted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={3} />
                  <YAxis unit="p" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "var(--radius)",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                    }}
                    formatter={(value: number) => [`${value.toFixed(2)}p/kWh`, "Price"]}
                  />
                  {mode === "realtime" && (
                    <ReferenceLine
                      y={parseFloat(threshold) || 15}
                      stroke="hsl(var(--chart-warning))"
                      strokeDasharray="4 4"
                      label={{ value: `${threshold}p`, fill: "hsl(var(--chart-warning))", fontSize: 11 }}
                    />
                  )}
                  <Bar dataKey="price" radius={[2, 2, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.isSelected ? "hsl(var(--primary))" : rateColor(entry.price)}
                        opacity={entry.isSelected ? 1 : 0.4}
                        stroke={entry.isSelected ? "hsl(var(--foreground))" : "none"}
                        strokeWidth={entry.isSelected ? 1.5 : 0}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Selected slots list */}
          {recommendation.slots.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Selected Charge Windows</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {recommendation.slots.map((slot) => (
                    <div
                      key={slot.valid_from}
                      className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2"
                    >
                      <span className="text-sm font-medium">
                        {format(new Date(slot.valid_from), "HH:mm")} – {format(new Date(slot.valid_to), "HH:mm")}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{ color: rateColor(slot.value_inc_vat) }}
                      >
                        {slot.value_inc_vat.toFixed(1)}p
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

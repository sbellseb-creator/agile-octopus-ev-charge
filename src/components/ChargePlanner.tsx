import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { fetchAgileRates } from "@/lib/octopus-api";
import type { Vehicle } from "@/lib/vehicle-data";
import type { ChargeMode } from "@/lib/charge-data";
import { CHARGE_MODE_LABELS, addSession } from "@/lib/charge-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Zap, Clock, TrendingDown, Activity,
  CheckCircle2, Loader2, Save,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface SlotRate {
  valid_from: string;
  valid_to: string;
  value_inc_vat: number;
}

function groupConsecutiveSlots(slots: SlotRate[]): { from: string; to: string; prices: number[]; count: number }[] {
  if (slots.length === 0) return [];
  const sorted = [...slots].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const groups: { from: string; to: string; prices: number[]; count: number }[] = [];
  let current = { from: sorted[0].valid_from, to: sorted[0].valid_to, prices: [sorted[0].value_inc_vat], count: 1 };
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].valid_from === current.to) {
      current.to = sorted[i].valid_to;
      current.prices.push(sorted[i].value_inc_vat);
      current.count++;
    } else {
      groups.push(current);
      current = { from: sorted[i].valid_from, to: sorted[i].valid_to, prices: [sorted[i].value_inc_vat], count: 1 };
    }
  }
  groups.push(current);
  return groups;
}

const CHARGER_KW = 6.9;
const SLOT_HOURS = 0.5;
const KWH_PER_SLOT = CHARGER_KW * SLOT_HOURS; // 3.45 kWh

interface Props {
  vehicles: Vehicle[];
  onSessionSaved?: () => void;
}

const MODE_INFO: Record<ChargeMode, { icon: typeof Zap; desc: string }> = {
  immediate: { icon: Zap, desc: "Charge now at the current rate." },
  target_time: { icon: Clock, desc: "Cheapest slots to be ready by your target time." },
  agile_cheapest: { icon: TrendingDown, desc: "Pick the absolute cheapest slots available." },
  realtime: { icon: Activity, desc: "Charge when price drops below your threshold." },
};

export default function ChargePlanner({ vehicles, onSessionSaved }: Props) {
  const [mode, setMode] = useState<ChargeMode>("target_time");
  const [targetTime, setTargetTime] = useState("07:30");
  const [threshold, setThreshold] = useState("15");
  const [startSoc, setStartSoc] = useState("20");
  const [endSoc, setEndSoc] = useState("80");
  const [notes, setNotes] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    () => (vehicles.find((v) => v.is_default) || vehicles[0])?.id || ""
  );

  const now = useMemo(() => new Date(), []);
  const periodFrom = useMemo(() => new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), [now]);
  const periodTo = useMemo(() => new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), [now]);

  const { data: rates, isLoading } = useQuery({
    queryKey: ["planner-rates", periodFrom],
    queryFn: () => fetchAgileRates(undefined, periodFrom, periodTo),
    refetchInterval: 15 * 60 * 1000,
    retry: 2,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const futureRates = useMemo(() => {
    if (!rates) return [];
    return rates
      .filter((r) => new Date(r.valid_to).getTime() > now.getTime())
      .sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  }, [rates, now]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  // Calculate slots needed from SoC delta and vehicle battery
  const slotsNeeded = useMemo(() => {
    if (!selectedVehicle) return 6;
    const socDelta = (parseFloat(endSoc) || 80) - (parseFloat(startSoc) || 20);
    const kwhNeeded = (selectedVehicle.battery_kwh * socDelta) / 100;
    return Math.max(1, Math.ceil(kwhNeeded / KWH_PER_SLOT));
  }, [selectedVehicle, startSoc, endSoc]);

  const recommendation = useMemo(() => {
    if (futureRates.length === 0) return null;

    if (mode === "immediate") {
      const current = futureRates.slice(0, slotsNeeded);
      const avg = current.reduce((s, r) => s + r.value_inc_vat, 0) / current.length;
      return { slots: current, avgPrice: avg, summary: `Charging now — ${current.length} consecutive slots` };
    }

    if (mode === "target_time") {
      const [h, m] = targetTime.split(":").map(Number);
      const target = new Date(now);
      target.setHours(h, m, 0, 0);
      if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
      const eligible = futureRates.filter(r => new Date(r.valid_to).getTime() <= target.getTime());
      const sorted = [...eligible].sort((a, b) => a.value_inc_vat - b.value_inc_vat);
      const best = sorted.slice(0, slotsNeeded);
      const avg = best.length > 0 ? best.reduce((s, r) => s + r.value_inc_vat, 0) / best.length : 0;
      return {
        slots: best.sort((a, b) => a.valid_from.localeCompare(b.valid_from)),
        avgPrice: avg,
        summary: best.length > 0 ? `${best.length} cheapest slots before ${targetTime}` : "No slots available before target",
      };
    }

    if (mode === "agile_cheapest") {
      const sorted = [...futureRates].sort((a, b) => a.value_inc_vat - b.value_inc_vat);
      const best = sorted.slice(0, slotsNeeded);
      const avg = best.length > 0 ? best.reduce((s, r) => s + r.value_inc_vat, 0) / best.length : 0;
      return {
        slots: best.sort((a, b) => a.valid_from.localeCompare(b.valid_from)),
        avgPrice: avg,
        summary: `${best.length} cheapest slots in next 24h`,
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
          ? `${below.length} slots below ${thresholdVal}p`
          : `No slots below ${thresholdVal}p`,
      };
    }

    return null;
  }, [mode, futureRates, targetTime, slotsNeeded, threshold, now]);

  const estimates = useMemo(() => {
    if (!recommendation || recommendation.slots.length === 0) return null;
    const totalKwh = KWH_PER_SLOT * recommendation.slots.length;
    const totalCost = recommendation.slots.reduce((s, r) => s + (r.value_inc_vat * KWH_PER_SLOT) / 100, 0);
    const avgPrice = recommendation.avgPrice;
    return { totalKwh, totalCost, avgPrice, numSlots: recommendation.slots.length };
  }, [recommendation]);

  const handleSave = () => {
    if (!estimates || !selectedVehicle || !recommendation) return;
    addSession({
      session_date: new Date().toISOString().slice(0, 10),
      vehicle_id: selectedVehicle.id,
      vehicle_name: selectedVehicle.name,
      charge_mode: mode,
      target_time: mode === "target_time" ? targetTime : undefined,
      start_soc: parseFloat(startSoc) || 0,
      end_soc: parseFloat(endSoc) || 0,
      energy_added_kwh: parseFloat(estimates.totalKwh.toFixed(1)),
      grid_kwh: 0,
      total_cost_gbp: parseFloat(estimates.totalCost.toFixed(2)),
      avg_pence_per_kwh: parseFloat(estimates.avgPrice.toFixed(1)),
      num_slots: estimates.numSlots,
      tariff_code: "",
      notes,
    });
    toast.success("Charge session saved!");
    onSessionSaved?.();
  };

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
                  ? "border-primary bg-primary/10 text-primary neon-border"
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
      <Card className="neon-border">
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

            <div className="space-y-2">
              <Label>Start SoC %</Label>
              <Input type="number" min={0} max={100} value={startSoc} onChange={(e) => setStartSoc(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>End SoC %</Label>
              <Input type="number" min={0} max={100} value={endSoc} onChange={(e) => setEndSoc(e.target.value)} />
            </div>

            {mode === "target_time" && (
              <div className="space-y-2">
                <Label>Ready By</Label>
                <Input type="time" value={targetTime} onChange={(e) => setTargetTime(e.target.value)} />
              </div>
            )}

            {mode === "realtime" && (
              <div className="space-y-2">
                <Label>Price Threshold (p/kWh)</Label>
                <Input type="number" step="0.5" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
              </div>
            )}
          </div>

          <div className="mt-4 text-sm text-muted-foreground">
            Charger: {CHARGER_KW}kW (30A) • {KWH_PER_SLOT} kWh/slot • {slotsNeeded} slots needed
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : recommendation && estimates && (
        <Card className="border-primary/30 neon-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              {recommendation.summary}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{estimates.numSlots}</p>
                <p className="text-xs text-muted-foreground">Slots</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{estimates.totalKwh.toFixed(1)} kWh</p>
                <p className="text-xs text-muted-foreground">Est. Energy</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">£{estimates.totalCost.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Est. Cost</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{estimates.avgPrice.toFixed(2)}p</p>
                <p className="text-xs text-muted-foreground">Avg p/kWh</p>
              </div>
            </div>

            {/* Slot list */}
            <div className="flex flex-wrap gap-2">
              {groupConsecutiveSlots(recommendation.slots).map((g) => {
                const avgP = g.prices.reduce((s, p) => s + p, 0) / g.prices.length;
                return (
                  <Badge key={g.from} variant="outline" className="border-primary/40 text-primary">
                    {format(new Date(g.from), "HH:mm")}–{format(new Date(g.to), "HH:mm")}
                    {g.count > 1 ? ` (${g.count} slots, avg ${avgP.toFixed(2)}p)` : ` (${avgP.toFixed(2)}p)`}
                  </Badge>
                );
              })}
            </div>

            {/* Notes + Save */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <Button onClick={handleSave} className="w-full gap-2">
              <Save className="h-4 w-4" /> Save as Charge Session
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

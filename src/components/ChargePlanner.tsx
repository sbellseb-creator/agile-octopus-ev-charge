import { useState, useMemo } from "react";
import ReviewScheduleDialog from "@/components/ReviewScheduleDialog";
import { buildTeslaSchedule } from "@/lib/teslaScheduler";
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
  CheckCircle2, Loader2, Save, X,
} from "lucide-react";
import { formatUK } from "@/lib/timezone";
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [removedSlots, setRemovedSlots] = useState<Set<string>>(new Set());
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    () => (vehicles.find((v) => v.is_default) || vehicles[0])?.id || ""
  );

  const now = useMemo(() => new Date(), []);
  const periodFrom = useMemo(() => new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), [now]);
  const periodTo = useMemo(() => {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 30, 0, 0);
    return tomorrow.toISOString();
  }, [now]);

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

  const requestedEnergyKwh = useMemo(() => {
    if (!selectedVehicle) return 0;
    const start = parseFloat(startSoc);
    const end = parseFloat(endSoc);
    const socDelta = (isNaN(end) ? 80 : end) - (isNaN(start) ? 20 : start);
    if (socDelta <= 0) return 0;
    return (selectedVehicle.battery_kwh * socDelta) / 100;
  }, [selectedVehicle, startSoc, endSoc]);

  // Calculate slots needed from SoC delta and vehicle battery
  const slotsNeeded = useMemo(() => {
    if (requestedEnergyKwh <= 0) return 1;
    return Math.max(1, Math.ceil(requestedEnergyKwh / KWH_PER_SLOT));
  }, [requestedEnergyKwh]);

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

  // Filter out removed slots
  const activeSlots = useMemo(() => {
    if (!recommendation) return [];
    return recommendation.slots.filter((s) => !removedSlots.has(s.valid_from));
  }, [recommendation, removedSlots]);

  // Reset removed slots when mode/settings change
  const recKey = useMemo(() => `${mode}-${targetTime}-${slotsNeeded}-${threshold}`, [mode, targetTime, slotsNeeded, threshold]);
  const [prevRecKey, setPrevRecKey] = useState(recKey);
  if (recKey !== prevRecKey) {
    setPrevRecKey(recKey);
    setRemovedSlots(new Set());
  }

  const estimates = useMemo(() => {
    if (!recommendation || activeSlots.length === 0) return null;
    const plannedKwh = KWH_PER_SLOT * activeSlots.length;
    const totalCost = activeSlots.reduce((s, r) => s + (r.value_inc_vat * KWH_PER_SLOT) / 100, 0);
    const avgPrice = activeSlots.length > 0 ? activeSlots.reduce((s, r) => s + r.value_inc_vat, 0) / activeSlots.length : 0;
    const remainingKwh = Math.max(0, requestedEnergyKwh - plannedKwh);

    // Real-world taper: the last 1% can take ~30 min. Append a 30-min tail when ending at 100%.
    const endVal = parseFloat(endSoc);
    const hasTail = !isNaN(endVal) && endVal >= 100;
    const TAIL_KWH = 0.1; // trickle energy during taper
    const lastRate = activeSlots[activeSlots.length - 1]?.value_inc_vat ?? avgPrice;
    const tailCost = hasTail ? (lastRate * TAIL_KWH) / 100 : 0;

    return {
      plannedKwh: plannedKwh + (hasTail ? TAIL_KWH : 0),
      requestedKwh: requestedEnergyKwh,
      remainingKwh,
      totalCost: totalCost + tailCost,
      avgPrice,
      numSlots: activeSlots.length,
      isFullyCovered: remainingKwh <= 0.05,
      hasTail,
      tailMinutes: hasTail ? 30 : 0,
    };
  }, [activeSlots, requestedEnergyKwh, recommendation, endSoc]);


  const handleSave = () => {
    if (!estimates || !selectedVehicle || !recommendation) return;
    addSession({

      session_date: formatUK(new Date(), "yyyy-MM-dd"),
      vehicle_id: selectedVehicle.id,
      vehicle_name: selectedVehicle.name,
      charge_mode: mode,
      target_time: mode === "target_time" ? targetTime : undefined,
      start_soc: parseFloat(startSoc) || 0,
      end_soc: parseFloat(endSoc) || 0,
      energy_added_kwh: parseFloat(estimates.plannedKwh.toFixed(1)),
      grid_kwh: 0,
       total_cost_gbp: parseFloat(estimates.totalCost.toFixed(2)),
      avg_pence_per_kwh: parseFloat(estimates.avgPrice.toFixed(1)),
      num_slots: estimates.numSlots,
      tariff_code: "",
      notes,
      slot_prices: activeSlots.map(s => ({
        valid_from: s.valid_from,
        valid_to: s.valid_to,
        value_inc_vat: s.value_inc_vat,
      })),
      start_time: activeSlots.length > 0 ? formatUK(activeSlots[0].valid_from, "HH:mm") : undefined,
      end_time: activeSlots.length > 0
        ? formatUK(new Date(new Date(activeSlots[activeSlots.length - 1].valid_to).getTime() + (estimates.hasTail ? 30 * 60 * 1000 : 0)), "HH:mm")
        : undefined,
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
            <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <p className="text-2xl font-bold">{estimates.numSlots}</p>
                <p className="text-xs text-muted-foreground">Slots</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{estimates.requestedKwh.toFixed(1)} kWh</p>
                <p className="text-xs text-muted-foreground">Energy Needed</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{estimates.plannedKwh.toFixed(1)} kWh</p>
                <p className="text-xs text-muted-foreground">Slots Cover</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">£{estimates.totalCost.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Est. Cost <span className="opacity-70">({(estimates.totalCost * 100).toFixed(1)}p)</span></p>
              </div>
              <div>
                <p className="text-2xl font-bold">{estimates.avgPrice.toFixed(2)}p</p>
                <p className="text-xs text-muted-foreground">Avg p/kWh</p>
              </div>
            </div>

            {!estimates.isFullyCovered && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                Current published slots only cover <span className="font-semibold text-foreground">{estimates.plannedKwh.toFixed(1)} kWh</span> of the
                <span className="font-semibold text-foreground"> {estimates.requestedKwh.toFixed(1)} kWh</span> needed, so this is not a full 0–100% plan yet.
              </div>
            )}

            {estimates.hasTail && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
                <span className="font-semibold text-primary">+30 min taper</span> added — the last 1% trickle-charges slowly past full power slots.
              </div>
            )}

            {/* Slot list — tap X to remove */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Tap ✕ to remove a slot · UK times</p>
                {removedSlots.size > 0 && (
                  <button
                    onClick={() => setRemovedSlots(new Set())}
                    className="text-xs text-primary underline"
                  >
                    Restore all
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {activeSlots
                  .sort((a, b) => a.valid_from.localeCompare(b.valid_from))
                  .map((slot) => (
                    <Badge key={slot.valid_from} variant="outline" className="border-primary/40 text-primary gap-1 pr-1">
                      {formatUK(slot.valid_from, "HH:mm")}–{formatUK(slot.valid_to, "HH:mm")}
                      {` (${slot.value_inc_vat.toFixed(2)}p)`}
                      <button
                        onClick={() => setRemovedSlots((prev) => new Set([...prev, slot.valid_from]))}
                        className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
              </div>
            </div>

            {/* Notes + Save */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
           <Button
  onClick={() => setReviewOpen(true)}
  className="w-full gap-2"
>
  <Save className="h-4 w-4" />
  Review Tesla Schedule
</Button>
          </CardContent>
        </Card>
      )}
    <ReviewScheduleDialog
  open={reviewOpen}
  onOpenChange={setReviewOpen}
  schedule={
    selectedVehicle && recommendation && estimates
      ? buildTeslaSchedule({
          vehicle: selectedVehicle,
          slots: activeSlots,
          home: {
            latitude: 54.971225737400076,
            longitude: -1.422143704414994,
          },
          estimatedCost: estimates.totalCost,
          estimatedEnergyKwh: estimates.plannedKwh,
        })
      : undefined
  }
/>

    </div>
  );
}

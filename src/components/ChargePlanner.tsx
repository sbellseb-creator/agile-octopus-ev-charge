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
  CheckCircle2, Loader2, Save, X, Plug,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { formatUK, getUKDayKey, ukClockToIso } from "@/lib/timezone";
import { buildPlan, clampPercent, expandToMinutes, simulateMinutes, type ChargeParams, type PlanStrategy } from "@/lib/charge-plan";
import { vehicleModelLine } from "@/lib/vehicle-data";
import { toast } from "sonner";
import ScheduleReviewCard from "@/components/schedule/ScheduleReviewCard";

const MINUTE_MS = 60_000;

interface Props {
  vehicles: Vehicle[];
  onSessionSaved?: () => void;
}

const MODE_INFO: Record<ChargeMode, { icon: typeof Zap; desc: string; strategy: PlanStrategy }> = {
  immediate: { icon: Zap, desc: "Start as soon as you're plugged in and charge until the target.", strategy: "now" },
  target_time: { icon: Clock, desc: "Cheapest minutes before your ready-by time.", strategy: "deadline" },
  agile_cheapest: { icon: TrendingDown, desc: "Top up to your target SoC in the cheapest minutes available.", strategy: "topup" },
  realtime: { icon: Activity, desc: "Only charge while the price is at or below your threshold.", strategy: "threshold" },
};

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Next occurrence (UK time) of an HH:mm clock strictly after `after`. */
function nextUkClock(clock: string, after: Date): Date | null {
  for (let i = 0; i < 3; i++) {
    const day = getUKDayKey(new Date(after.getTime() + i * 24 * 60 * MINUTE_MS));
    const iso = ukClockToIso(day, clock);
    if (iso && new Date(iso).getTime() > after.getTime()) return new Date(iso);
  }
  return null;
}

const fmtMinutes = (m: number) => {
  const r = Math.round(m);
  return r >= 60 ? `${Math.floor(r / 60)}h ${String(r % 60).padStart(2, "0")}m` : `${r}m`;
};

const fmtMoney = (gbp: number) => `${gbp < 0 ? "-" : ""}£${Math.abs(gbp).toFixed(2)}`;

export default function ChargePlanner({ vehicles, onSessionSaved }: Props) {
  const [mode, setMode] = useState<ChargeMode>("target_time");
  const [targetTime, setTargetTime] = useState("07:30");
  const [threshold, setThreshold] = useState("15");
  const [startSoc, setStartSoc] = useState("20");
  const [endSoc, setEndSoc] = useState("80");
  const [chargerKw, setChargerKw] = useState("6.9");
  const [efficiencyPct, setEfficiencyPct] = useState("93");
  const [taper, setTaper] = useState(true);
  const [extendNegative, setExtendNegative] = useState(true);
  const [pluggedAt, setPluggedAt] = useState<string>(() => toLocalInput(new Date()));
  const [unplugAt, setUnplugAt] = useState("");
  const [notes, setNotes] = useState("");
  const [removedWindows, setRemovedWindows] = useState<Set<number>>(new Set());
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    () => (vehicles.find((v) => v.is_default) || vehicles[0])?.id || ""
  );

  const [now] = useState(() => new Date());
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

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  const params = useMemo<ChargeParams>(() => {
    const eff = parseFloat(efficiencyPct);
    return {
      batteryKwh: selectedVehicle?.battery_kwh || 75,
      startSoc: clampPercent(parseFloat(startSoc), 20),
      endSoc: clampPercent(parseFloat(endSoc), 80),
      chargerKw: parseFloat(chargerKw) > 0 ? parseFloat(chargerKw) : 6.9,
      efficiency: eff > 0 && eff <= 100 ? eff / 100 : 0.93,
      taperAboveSoc: taper ? 80 : undefined,
      taperPowerFactor: 0.5,
    };
  }, [selectedVehicle, startSoc, endSoc, chargerKw, efficiencyPct, taper]);

  const from = useMemo(() => {
    const d = pluggedAt ? new Date(pluggedAt) : now;
    return Number.isNaN(d.getTime()) ? now : d;
  }, [pluggedAt, now]);

  // Deadline = ready-by (deadline mode) and/or unplug time, whichever is earlier.
  const until = useMemo(() => {
    const candidates: number[] = [];
    if (mode === "target_time") {
      const t = nextUkClock(targetTime, from);
      if (t) candidates.push(t.getTime());
    }
    if (unplugAt) {
      const u = new Date(unplugAt);
      if (!Number.isNaN(u.getTime())) candidates.push(u.getTime());
    }
    return candidates.length ? new Date(Math.min(...candidates)) : null;
  }, [mode, targetTime, unplugAt, from]);

  const plan = useMemo(() => {
    if (!rates || rates.length === 0) return null;
    return buildPlan({
      strategy: MODE_INFO[mode].strategy,
      params,
      rates,
      from,
      until,
      thresholdPence: parseFloat(threshold) || 0,
      extendIntoNegative: extendNegative,
    });
  }, [rates, mode, params, from, until, threshold, extendNegative]);

  // Reset removed windows whenever the plan inputs change
  const recKey = `${mode}-${targetTime}-${threshold}-${startSoc}-${endSoc}-${chargerKw}-${efficiencyPct}-${taper}-${extendNegative}-${pluggedAt}-${unplugAt}-${selectedVehicleId}`;
  const [prevRecKey, setPrevRecKey] = useState(recKey);
  if (recKey !== prevRecKey) {
    setPrevRecKey(recKey);
    setRemovedWindows(new Set());
  }

  // User-edited plan: re-price only the windows still kept, minute by minute.
  const activePlan = useMemo(() => {
    if (!plan || !rates) return null;
    if (removedWindows.size === 0) return plan;
    const kept = plan.windows.filter((_, i) => !removedWindows.has(i));
    if (kept.length === 0) return { ...plan, windows: [] };
    const lo = Math.min(...kept.map((w) => w.start.getTime()));
    const hi = Math.max(...kept.map((w) => w.end.getTime()));
    const minutes = expandToMinutes(rates, lo, hi).filter((m) =>
      kept.some((w) => m.t >= w.start.getTime() && m.t < w.end.getTime()),
    );
    // Price exactly the windows that remain; don't stretch them to hit the target.
    const edited = simulateMinutes({ ...params, endSoc: 100 }, minutes);
    const target = params.endSoc;
    return {
      ...edited,
      targetReached: edited.finalSoc >= target - 0.05,
      shortfallKwh: Math.max(0, ((target - edited.finalSoc) / 100) * params.batteryKwh),
    };
  }, [plan, rates, removedWindows, params]);

  const estimates = activePlan && activePlan.windows.length > 0 ? activePlan : null;

  const handleSave = () => {
    if (!estimates || !selectedVehicle || !activePlan || !estimates.start || !estimates.end) return;
    const touched = (rates || []).filter((r) =>
      estimates.windows.some((w) => new Date(r.valid_from) < w.end && new Date(r.valid_to) > w.start),
    );
    addSession({
      session_date: formatUK(from, "yyyy-MM-dd"),
      vehicle_id: selectedVehicle.id,
      vehicle_name: selectedVehicle.name,
      vehicle_registration: selectedVehicle.registration || undefined,
      charge_mode: mode,
      target_time: mode === "target_time" ? targetTime : undefined,
      start_soc: params.startSoc,
      end_soc: parseFloat(estimates.finalSoc.toFixed(1)),
      energy_added_kwh: parseFloat(estimates.batteryKwh.toFixed(1)),
      grid_kwh: parseFloat(estimates.gridKwh.toFixed(2)),
      total_cost_gbp: parseFloat(estimates.costGbp.toFixed(2)),
      avg_pence_per_kwh: parseFloat(estimates.avgPence.toFixed(1)),
      num_slots: touched.length,
      tariff_code: "",
      notes,
      slot_prices: touched.map((s) => ({
        valid_from: s.valid_from,
        valid_to: s.valid_to,
        value_inc_vat: s.value_inc_vat,
      })),
      start_time: formatUK(estimates.start, "HH:mm"),
      end_time: formatUK(estimates.end, "HH:mm"),
    });
    toast.success("Charge session saved!");
    onSessionSaved?.();
  };

  const ModeIcon = MODE_INFO[mode].icon;
  const minuteCount = estimates?.windows.reduce((n, w) => n + Math.round(w.minutes), 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Session bar */}
      <Card className="neon-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plug className="h-5 w-5 text-primary" /> Plug-in session
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Set when you plugged in and (optionally) when you'll unplug — to the minute.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Plugged in at</Label>
            <div className="flex gap-2">
              <Input type="datetime-local" value={pluggedAt} onChange={(e) => setPluggedAt(e.target.value)} />
              <Button type="button" variant="outline" onClick={() => setPluggedAt(toLocalInput(new Date()))}>
                Now
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Unplug at (optional)</Label>
            <div className="flex gap-2">
              <Input type="datetime-local" value={unplugAt} onChange={(e) => setUnplugAt(e.target.value)} />
              {unplugAt && (
                <Button type="button" variant="outline" onClick={() => setUnplugAt("")}>
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tesla</Label>
            <p className="text-sm text-muted-foreground">
              Planning works without a Tesla connection. Use Review below to connect and send the plan to the car.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Strategy selector */}
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
                      <SelectItem key={v.id} value={v.id}>{vehicleModelLine(v)}</SelectItem>
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
              <Label>Target SoC %</Label>
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

            <div className="space-y-2">
              <Label>Charger kW</Label>
              <Input type="number" step="0.1" min={0.1} value={chargerKw} onChange={(e) => setChargerKw(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Efficiency %</Label>
              <Input type="number" min={1} max={100} value={efficiencyPct} onChange={(e) => setEfficiencyPct(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-6 text-sm text-muted-foreground">
            <label className="flex items-center gap-2">
              <Checkbox checked={taper} onCheckedChange={(v) => setTaper(v === true)} />
              Slow down above 80% SoC
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={extendNegative} onCheckedChange={(v) => setExtendNegative(v === true)} />
              Keep charging past target while prices are negative
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !estimates || !activePlan ? (
        plan && (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              No charging minutes match these settings
              {until ? ` before ${formatUK(until, "EEE HH:mm")}` : ""}. Try a later ready-by time, a higher threshold or a different strategy.
            </CardContent>
          </Card>
        )
      ) : (
        <Card className="border-primary/30 neon-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              {formatUK(estimates.start!, "EEE HH:mm")} → {formatUK(estimates.end!, "EEE HH:mm")}
              <span className="text-sm font-normal text-muted-foreground">
                ({fmtMinutes(estimates.totalMinutes)} charging in {estimates.windows.length} window{estimates.windows.length === 1 ? "" : "s"})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <p className="text-2xl font-bold">{estimates.batteryKwh.toFixed(1)} kWh</p>
                <p className="text-xs text-muted-foreground">Added to battery</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{estimates.gridKwh.toFixed(1)} kWh</p>
                <p className="text-xs text-muted-foreground">From the grid</p>
              </div>
              <div>
                <p className={`text-2xl font-bold ${estimates.costGbp < 0 ? "text-emerald-400" : "text-primary"}`}>
                  {fmtMoney(estimates.costGbp)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {estimates.costGbp < 0 ? "You earn" : "Est. cost"}{" "}
                  <span className="opacity-70">({(estimates.costGbp * 100).toFixed(1)}p)</span>
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold">{estimates.avgPence.toFixed(2)}p</p>
                <p className="text-xs text-muted-foreground">Avg p/kWh</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{estimates.finalSoc.toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground">Final SoC</p>
              </div>
            </div>

            {estimates.negativeMinutes > 0 && (
              <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-300">
                <span className="font-semibold">Negative prices:</span> {fmtMinutes(estimates.negativeMinutes)} of this plan
                is paid-to-charge, earning {fmtMoney(estimates.negativeEarningsGbp)}.
              </div>
            )}

            {!estimates.targetReached && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                This plan reaches <span className="font-semibold text-foreground">{estimates.finalSoc.toFixed(0)}%</span>, short of the
                <span className="font-semibold text-foreground"> {params.endSoc.toFixed(0)}%</span> target by about
                <span className="font-semibold text-foreground"> {estimates.shortfallKwh.toFixed(1)} kWh</span> — the available
                rates or time window don't cover it.
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Tap ✕ to drop a window · UK times · {minuteCount} min
                </p>
                {removedWindows.size > 0 && (
                  <button onClick={() => setRemovedWindows(new Set())} className="text-xs text-primary underline">
                    Restore all
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {plan?.windows.map((w, i) =>
                  removedWindows.has(i) ? null : (
                    <Badge
                      key={w.start.getTime()}
                      variant="outline"
                      className={`gap-1 pr-1 ${w.hasNegative ? "border-emerald-400/50 text-emerald-300" : "border-primary/40 text-primary"}`}
                    >
                      {formatUK(w.start, "HH:mm")}–{formatUK(w.end, "HH:mm")} ({w.avgPence.toFixed(2)}p)
                      <button
                        onClick={() => setRemovedWindows((prev) => new Set([...prev, i]))}
                        className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                        aria-label="Remove window"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ),
                )}
              </div>
            </div>

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

      {/* Review & push the window to the vehicle — explicit user action only. */}
      {estimates && estimates.start && estimates.end && selectedVehicle && (
        <ScheduleReviewCard
          vehicle={selectedVehicle}
          startIso={estimates.start.toISOString()}
          endIso={estimates.end.toISOString()}
          estimatedKwh={estimates.batteryKwh}
          estimatedCostGbp={estimates.costGbp}
          avgPencePerKwh={estimates.avgPence}
          targetSoc={params.endSoc || 80}
        />
      )}
    </div>
  );
}

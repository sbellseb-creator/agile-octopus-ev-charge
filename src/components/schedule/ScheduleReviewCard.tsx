import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CarFront, Eye, RefreshCw, Save, Send, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { Vehicle } from "@/lib/vehicle-data";
import { formatRegistration } from "@/lib/vehicle-data";
import { formatUK } from "@/lib/timezone";
import { dayMaskFor, formatDaysMask, minutesToClock, ukMinutesAfterMidnight } from "@/lib/schedule-time";
import {
  dryRunPayload,
  loadSchedules,
  readTeslaSchedules,
  removeScheduleFromTesla,
  saveAppPlan,
  sendScheduleToTesla,
  type ChargeSchedule,
  type TeslaSchedule,
} from "@/lib/charge-schedule";
import ScheduleStatusBadge from "@/components/schedule/ScheduleStatusBadge";
import { getSettings } from "@/lib/app-settings";

interface Props {
  vehicle: Vehicle | undefined;
  /** First slot start (ISO/UTC) of the recommended window. */
  startIso: string | null;
  /** End of the recommended window (ISO/UTC), including any taper. */
  endIso: string | null;
  estimatedKwh: number;
  estimatedCostGbp: number;
  avgPencePerKwh: number;
  /** Planner target SoC — offered as an optional charge limit. */
  targetSoc: number;
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-2 border-b border-border/50 py-1 last:border-0">
    <span className="shrink-0 text-[11px] text-muted-foreground sm:text-xs">{label}</span>
    <span className="min-w-0 truncate text-right text-xs font-semibold sm:text-sm">{value}</span>
  </div>
);

export default function ScheduleReviewCard({ vehicle, startIso, endIso, estimatedKwh, estimatedCostGbp, avgPencePerKwh, targetSoc }: Props) {
  const settings = getSettings();
  const [plan, setPlan] = useState<ChargeSchedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendLimit, setSendLimit] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const [external, setExternal] = useState<TeslaSchedule[] | null>(null);

  const isTesla = Boolean(vehicle?.tesla_vehicle_id);
  const startMinutes = startIso ? ukMinutesAfterMidnight(startIso) : null;
  const endMinutes = endIso ? ukMinutesAfterMidnight(endIso) : null;
  const daysMask = startIso ? dayMaskFor(startIso) : 0;
  const planDate = startIso ? formatUK(startIso, "yyyy-MM-dd") : null;

  // Read-only DB load. No vehicle contact, so this is safe on mount.
  useEffect(() => {
    let alive = true;
    loadSchedules().then((rows) => {
      if (!alive) return;
      const match = rows.find((r) => (vehicle ? r.vehicle_id === vehicle.id : false)) ?? null;
      setPlan(match);
    });
    return () => {
      alive = false;
    };
  }, [vehicle]);

  const buildDraft = useCallback((): Omit<ChargeSchedule, "id" | "status" | "tesla_schedule_id" | "created_by_app" | "last_error" | "last_verified_at" | "updated_at" | "charge_limit_sent"> | null => {
    if (!vehicle || startMinutes === null) return null;
    return {
      provider: isTesla ? "tesla" : "manual",
      vehicle_id: vehicle.id,
      tesla_vehicle_id: vehicle.tesla_vehicle_id || null,
      registration: vehicle.registration || "",
      plan_date: planDate,
      start_minutes: startMinutes,
      end_minutes: endMinutes,
      days_mask: daysMask,
      one_time: true,
      charge_limit_soc: Number.isFinite(targetSoc) ? targetSoc : null,
      estimated_kwh: Number(estimatedKwh.toFixed(2)),
      estimated_cost_gbp: Number(estimatedCostGbp.toFixed(2)),
      avg_pence_per_kwh: Number(avgPencePerKwh.toFixed(2)),
      charger_kw: settings.charger_kw,
    };
  }, [vehicle, startMinutes, endMinutes, daysMask, planDate, isTesla, targetSoc, estimatedKwh, estimatedCostGbp, avgPencePerKwh, settings.charger_kw]);

  const savePlan = async (): Promise<ChargeSchedule | null> => {
    const draft = buildDraft();
    if (!draft) return null;
    const saved = await saveAppPlan(draft, plan?.id);
    if (saved) setPlan(saved);
    return saved;
  };

  const handleSaveOnly = async () => {
    setBusy(true);
    const saved = await savePlan();
    setBusy(false);
    toast[saved ? "success" : "error"](saved ? "Saved as an app plan. Nothing was sent to the vehicle." : "Could not save the plan.");
  };

  const handleCheckTesla = async () => {
    if (!vehicle?.tesla_vehicle_id) return;
    setBusy(true);
    try {
      const { schedules, error } = await readTeslaSchedules(vehicle.tesla_vehicle_id);
      if (error) toast.error(error);
      setExternal(schedules);
      if (!error) toast.success(`${schedules.length} schedule(s) on the vehicle. The car was not woken.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read schedules");
    }
    setBusy(false);
  };

  const doSend = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      const saved = (await savePlan()) ?? plan;
      if (!saved) throw new Error("Could not save the plan before sending.");
      const res = await sendScheduleToTesla({ ...saved }, { replace: Boolean(saved.tesla_schedule_id), alsoSetLimit: sendLimit });
      const rows = await loadSchedules();
      setPlan(rows.find((r) => r.id === saved.id) ?? saved);
      toast[res.ok ? "success" : "error"](res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    }
    setBusy(false);
  };

  const doRemove = async () => {
    if (!plan) return;
    setBusy(true);
    const res = await removeScheduleFromTesla(plan);
    const rows = await loadSchedules();
    setPlan(rows.find((r) => r.id === plan.id) ?? null);
    toast[res.ok ? "success" : "error"](res.message);
    setBusy(false);
  };

  if (!vehicle || startMinutes === null) return null;

  const payload = dryRunPayload({ start_minutes: startMinutes, end_minutes: endMinutes, days_mask: daysMask, one_time: true });
  const status = plan?.status ?? "app_plan";
  const otherSchedules = (external ?? []).filter((s) => Number(s.id) !== Number(plan?.tesla_schedule_id ?? -1));

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm sm:text-base">
          <CarFront className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">Review charging schedule</span>
          <ScheduleStatusBadge status={status} readyToSend={isTesla} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <Row label="Vehicle" value={vehicle.name || "Vehicle"} />
          <Row label="Registration" value={formatRegistration(vehicle.registration) || "—"} />
          <Row label="Date" value={planDate ? formatUK(startIso as string, "EEE dd-MM-yy") : "—"} />
          <Row label="Start" value={`${minutesToClock(startMinutes)} UK`} />
          <Row label="Ready by" value={endMinutes === null ? "Not set" : `${minutesToClock(endMinutes)} UK`} />
          <Row label="Repeats" value={plan?.one_time === false ? formatDaysMask(daysMask) : "One time"} />
          <Row label="Charge limit" value={`${targetSoc}%`} />
          <Row label="Charger" value={`${settings.charger_amps} A / ${settings.charger_kw} kW`} />
          <Row label="Estimated energy" value={`${estimatedKwh.toFixed(1)} kWh`} />
          <Row label="Estimated cost" value={`£${estimatedCostGbp.toFixed(2)}`} />
          <Row label="Average price" value={`${avgPencePerKwh.toFixed(2)}p/kWh`} />
          <Row
            label="Sent to Tesla"
            value={status === "confirmed" ? `Yes · id ${plan?.tesla_schedule_id ?? "—"}` : status === "differs" ? "Sent, mismatch" : "No"}
          />
        </div>

        {plan?.last_error && (
          <p className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {plan.last_error}
          </p>
        )}

        <button type="button" onClick={() => setShowPayload((v) => !v)} className="text-[11px] text-primary underline">
          {showPayload ? "Hide" : "Show"} exact command payload (dry run — sends nothing)
        </button>
        {showPayload && (
          <pre className="overflow-x-auto rounded-lg border border-border bg-background p-2 text-[10px] leading-relaxed">
{`POST /api/1/vehicles/${vehicle.tesla_vehicle_id || "{id}"}/command/add_charge_schedule
${JSON.stringify(payload, null, 2)}`}
          </pre>
        )}

        {!isTesla ? (
          <>
            <Button onClick={handleSaveOnly} disabled={busy} className="w-full gap-2">
              <Save className="h-4 w-4" /> Save app plan
            </Button>
            <p className="text-[11px] text-muted-foreground">
              This vehicle is not a connected Tesla, so the plan stays in the app for logging and cost analysis.
            </p>
          </>
        ) : (
          <div className="space-y-2">
            <Button onClick={() => setConfirmOpen(true)} disabled={busy} className="w-full gap-2">
              <Send className="h-4 w-4" />
              {plan?.tesla_schedule_id ? "Replace Tesla schedule" : "Send schedule to Tesla"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={handleSaveOnly} disabled={busy} className="gap-1.5 text-xs">
                <Save className="h-3.5 w-3.5" /> Keep as app plan
              </Button>
              <Button variant="outline" size="sm" onClick={handleCheckTesla} disabled={busy} className="gap-1.5 text-xs">
                <Eye className="h-3.5 w-3.5" /> Check Tesla
              </Button>
            </div>
            {plan?.tesla_schedule_id && (
              <Button variant="ghost" size="sm" onClick={doRemove} disabled={busy} className="w-full gap-1.5 text-xs text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Remove from Tesla
              </Button>
            )}
            {status === "failed" && (
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)} disabled={busy} className="w-full gap-1.5 text-xs">
                <RefreshCw className="h-3.5 w-3.5" /> Retry sending
              </Button>
            )}
          </div>
        )}

        {external !== null && (
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-2.5">
            <p className="text-[11px] font-semibold">Schedules already on the vehicle</p>
            {otherSchedules.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No other schedules found.</p>
            ) : (
              otherSchedules.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <Badge variant="outline" className="text-[10px]">id {s.id}</Badge>
                  <span>{minutesToClock(Number(s.start_time ?? 0))}</span>
                  {s.end_enabled && <span>→ {minutesToClock(Number(s.end_time ?? 0))}</span>}
                  <span className="text-muted-foreground">{formatDaysMask(Number(s.days_of_week ?? 0))}</span>
                  <span className="text-amber-500">not created here</span>
                </div>
              ))
            )}
            {otherSchedules.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                These were created elsewhere (for example in the Tesla app). This app will never change or delete them.
              </p>
            )}
          </div>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="max-w-[92vw] sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base">Send this schedule to your Tesla?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-xs">
                  <p>
                    This sends a command to <strong>{formatRegistration(vehicle.registration) || vehicle.name}</strong>.
                    <strong> Your car may be woken</strong> to receive it.
                  </p>
                  <div className="rounded-md border border-border p-2">
                    <Row label="Start" value={`${minutesToClock(startMinutes)} UK`} />
                    <Row label="Ready by" value={endMinutes === null ? "Not set" : `${minutesToClock(endMinutes)} UK`} />
                    <Row label="Repeats" value="One time" />
                    <Row label="Estimated cost" value={`£${estimatedCostGbp.toFixed(2)}`} />
                  </div>
                  {plan?.tesla_schedule_id && <p>The existing app-created schedule (id {plan.tesla_schedule_id}) will be replaced.</p>}
                  <div className="flex items-start gap-2 rounded-md border border-border p-2">
                    <Checkbox id="send-limit" checked={sendLimit} onCheckedChange={(v) => setSendLimit(v === true)} className="mt-0.5" />
                    <Label htmlFor="send-limit" className="text-xs font-normal leading-snug">
                      Also set the charge limit to <strong>{targetSoc}%</strong>. Leave unticked to keep the car's current limit.
                    </Label>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="mt-0">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={doSend}>Send command</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

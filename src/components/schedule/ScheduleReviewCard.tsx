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
import { CarFront, Check, Eye, Lock, RefreshCw, Save, Send, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { Vehicle } from "@/lib/vehicle-data";
import { formatRegistration, vehicleColorName, vehicleModelLine } from "@/lib/vehicle-data";
import { formatUK } from "@/lib/timezone";
import { dayMaskFor, formatDaysMask, minutesToClock, ukMinutesAfterMidnight } from "@/lib/schedule-time";
import {
  checkTeslaCapability,
  dryRunPayload,
  loadSchedules,
  readTeslaSchedules,
  removeScheduleFromTesla,
  saveAppPlan,
  homeLocation,
  NO_HOME_LOCATION_MESSAGE,
  sendScheduleToTesla,
  type ChargeSchedule,
  type TeslaCapability,
  type TeslaSchedule,
} from "@/lib/charge-schedule";
import ScheduleStatusBadge, { type BadgeState } from "@/components/schedule/ScheduleStatusBadge";
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
  /** Optional live Tesla snapshot for a richer vehicle line. Never fetched here. */
  live?: { car_type?: string | null; trim_badging?: string | null; exterior_color?: string | null } | null;
}

/** Grouped summary block — reads as a summary, not a settings table. */
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-xl border border-border bg-muted/20 p-3">
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
    {children}
  </section>
);

const Pair = ({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) => (
  <div className="min-w-0">
    <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={strong ? "truncate text-base font-bold text-primary" : "truncate text-sm font-semibold"}>{value}</p>
  </div>
);

export default function ScheduleReviewCard({
  vehicle,
  startIso,
  endIso,
  estimatedKwh,
  estimatedCostGbp,
  avgPencePerKwh,
  targetSoc,
  live,
}: Props) {
  const settings = getSettings();
  const [plan, setPlan] = useState<ChargeSchedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendLimit, setSendLimit] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const [external, setExternal] = useState<TeslaSchedule[] | null>(null);
  const [capability, setCapability] = useState<TeslaCapability | null>(null);
  const [differences, setDifferences] = useState<string[]>([]);

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

  // Readiness check: token inspection only, never contacts the vehicle.
  useEffect(() => {
    let alive = true;
    if (!isTesla) {
      setCapability(null);
      return;
    }
    checkTeslaCapability(vehicle?.tesla_vehicle_id).then((c) => alive && setCapability(c));
    return () => {
      alive = false;
    };
  }, [isTesla, vehicle?.tesla_vehicle_id]);

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
    toast[saved ? "success" : "error"](saved ? "Plan saved. Nothing was sent to your Tesla." : "Could not save the plan.");
  };

  const handleCheckTesla = async () => {
    if (!vehicle?.tesla_vehicle_id) return;
    setChecking(true);
    try {
      const { schedules, error } = await readTeslaSchedules(vehicle.tesla_vehicle_id);
      if (error) toast.error(error);
      setExternal(schedules);
      if (!error) toast.success(`${schedules.length} schedule(s) on the vehicle. The car was not woken.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read schedules");
    }
    setChecking(false);
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
      setDifferences(res.verified ? [] : res.differences ?? []);
      toast[res.ok ? "success" : "error"](res.message);
      // Home and any other listener refresh immediately, no manual reload.
      window.dispatchEvent(new Event("schedules:updated"));
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
    setDifferences([]);
    toast[res.ok ? "success" : "error"](res.message);
    window.dispatchEvent(new Event("schedules:updated"));
    setBusy(false);
  };

  if (!vehicle || startMinutes === null) return null;

  const payload = dryRunPayload({ start_minutes: startMinutes, end_minutes: endMinutes, days_mask: daysMask, one_time: true });
  const verified = plan?.status === "confirmed" && Boolean(plan?.last_verified_at) && !plan?.last_error;
  const badgeState: BadgeState = checking
    ? "checking"
    : isTesla && capability && !capability.connected
      ? "not_connected"
      : (plan?.status ?? "app_plan");
  const otherSchedules = (external ?? []).filter((s) => Number(s.id) !== Number(plan?.tesla_schedule_id ?? -1));
  const colour = vehicleColorName(vehicle, live);
  const home = homeLocation();
  const canSend = Boolean(capability?.connected && capability?.chargingCommands && home);

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm sm:text-base">
          <CarFront className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">Review charging schedule</span>
          <ScheduleStatusBadge status={badgeState} readyToSend={isTesla && canSend} verified={verified} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Group title="Vehicle">
          <p className="break-all font-mono text-lg font-bold uppercase tracking-wider">
            {formatRegistration(vehicle.registration) || vehicle.name || "Vehicle"}
          </p>
          <p className="break-words text-xs text-muted-foreground">{vehicleModelLine(vehicle, live)}</p>
          {colour && <p className="text-xs text-muted-foreground">{colour}</p>}
        </Group>

        <Group title="Schedule">
          <div className="grid grid-cols-2 gap-3">
            <Pair label="Start" value={`${minutesToClock(startMinutes)}`} strong />
            <Pair label="Ready by" value={endMinutes === null ? "Not set" : minutesToClock(endMinutes)} />
            <Pair label="Date" value={planDate ? formatUK(startIso as string, "EEE dd-MM-yy") : "—"} />
            <Pair label="Repeats" value={plan?.one_time === false ? formatDaysMask(daysMask) : "One time"} />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">All times are UK time, wherever you are.</p>
        </Group>

        <Group title="Charging">
          <div className="grid grid-cols-2 gap-3">
            <Pair label="Charge limit" value={`${targetSoc}%`} />
            <Pair label="Charger" value={`${settings.charger_amps} A · ${settings.charger_kw} kW`} />
          </div>
        </Group>

        <Group title="Cost estimate">
          <div className="grid grid-cols-2 gap-3">
            <Pair label="Estimated cost" value={`£${estimatedCostGbp.toFixed(2)}`} strong />
            <Pair label="Energy" value={`${estimatedKwh.toFixed(1)} kWh`} />
            <Pair label="Average price" value={`${avgPencePerKwh.toFixed(2)}p/kWh`} />
            {plan?.tesla_schedule_id ? <Pair label="Tesla schedule" value={`#${plan.tesla_schedule_id}`} /> : <Pair label="On the car" value="Not sent yet" />}
          </div>
        </Group>

        <p className="flex items-start gap-1.5 rounded-lg border border-border bg-background/60 p-2 text-[11px] text-muted-foreground">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" />
          Nothing is sent to your Tesla until you press "Send to Tesla".
        </p>

        {differences.length > 0 && (
          <div className="space-y-1 rounded-lg border border-orange-500/50 bg-orange-500/5 p-2 text-[11px] text-orange-400">
            <p className="font-semibold">Tesla saved something different:</p>
            {differences.map((d) => (
              <p key={d}>• {d}</p>
            ))}
          </div>
        )}

        {plan?.last_error && (
          <p className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {plan.last_error}
          </p>
        )}

        {/* Readiness card — plain English, no API terminology. */}
        {isTesla && (
          <div className="space-y-1 rounded-lg border border-border bg-muted/20 p-2.5 text-[11px]">
            {capability === null ? (
              <p className="text-muted-foreground">Checking your Tesla connection…</p>
            ) : !capability.connected ? (
              <>
                <p className="flex items-center gap-1.5 text-destructive">
                  <TriangleAlert className="h-3 w-3 shrink-0" /> Tesla connection required
                </p>
                <p className="text-muted-foreground">Reconnect Tesla on the Vehicles page, then come back here.</p>
              </>
            ) : !capability.chargingCommands ? (
              <>
                <p className="flex items-center gap-1.5 text-orange-400">
                  <TriangleAlert className="h-3 w-3 shrink-0" /> Charging permission missing
                </p>
                <p className="text-muted-foreground">
                  Tesla has not granted Vehicle Charging Management yet. Disconnect and reconnect Tesla on the Vehicles page, then accept the charging permission when Tesla asks.
                </p>
                {capability.grantedScopes && capability.grantedScopes.length > 0 && (
                  <p className="break-words text-muted-foreground">Currently granted: {capability.grantedScopes.join(", ")}</p>
                )}
              </>
            ) : (
              <>
                <p className="flex items-center gap-1.5 text-primary">
                  <Check className="h-3 w-3 shrink-0" /> Tesla connected
                </p>
                <p className="flex items-center gap-1.5 text-primary">
                  <Check className="h-3 w-3 shrink-0" /> Charging commands available
                </p>
                {home ? (
                  <p className="flex items-center gap-1.5 text-primary">
                    <ShieldCheck className="h-3 w-3 shrink-0" /> Ready to send
                  </p>
                ) : (
                  <p className="flex items-start gap-1.5 text-orange-400">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{NO_HOME_LOCATION_MESSAGE} Add it under Settings › Charging.</span>
                  </p>
                )}
                {!capability.signedCommandsConfigured && (
                  <p className="text-muted-foreground">
                    Some cars also need Tesla's signed-command support. If yours does, the app will tell you plainly and keep your plan.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {!isTesla ? (
          <>
            <Button onClick={handleSaveOnly} disabled={busy} className="w-full gap-2">
              <Save className="h-4 w-4" /> Save plan only
            </Button>
            <p className="text-[11px] text-muted-foreground">
              This vehicle is not a connected Tesla, so the plan stays in the app for logging and cost analysis.
            </p>
          </>
        ) : (
          <div className="space-y-2">
            <Button onClick={() => setConfirmOpen(true)} disabled={busy || !canSend} className="h-11 w-full gap-2 text-sm font-semibold">
              <Send className="h-4 w-4" />
              {plan?.tesla_schedule_id ? "Send to Tesla (replaces current)" : "Send to Tesla"}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">Recommended action</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" size="sm" onClick={handleSaveOnly} disabled={busy} className="w-full gap-1.5 text-xs">
                <Save className="h-3.5 w-3.5" /> Save plan only
              </Button>
              <Button variant="outline" size="sm" onClick={handleCheckTesla} disabled={busy || checking} className="w-full gap-1.5 text-xs">
                <Eye className="h-3.5 w-3.5" /> Check Tesla schedule
              </Button>
            </div>
            {plan?.tesla_schedule_id && (
              <Button variant="ghost" size="sm" onClick={doRemove} disabled={busy} className="w-full gap-1.5 text-xs text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Remove from Tesla
              </Button>
            )}
            {plan?.status === "failed" && (
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)} disabled={busy || !canSend} className="w-full gap-1.5 text-xs">
                <RefreshCw className="h-3.5 w-3.5" /> Try sending again
              </Button>
            )}
          </div>
        )}

        <button type="button" onClick={() => setShowPayload((v) => !v)} className="text-[11px] text-primary underline">
          {showPayload ? "Hide" : "Show"} exact command (dry run — sends nothing)
        </button>
        {showPayload && (
          <pre className="overflow-x-auto rounded-lg border border-border bg-background p-2 text-[10px] leading-relaxed">
{`POST /api/1/vehicles/${vehicle.tesla_vehicle_id || "{id}"}/command/add_charge_schedule
${JSON.stringify(payload, null, 2)}`}
          </pre>
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
                  <span className="text-orange-400">not created here</span>
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
                  <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-2">
                    <Pair label="Start" value={minutesToClock(startMinutes)} />
                    <Pair label="Ready by" value={endMinutes === null ? "Not set" : minutesToClock(endMinutes)} />
                    <Pair label="Repeats" value="One time" />
                    <Pair label="Estimated cost" value={`£${estimatedCostGbp.toFixed(2)}`} />
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
              <AlertDialogAction onClick={doSend}>Send to Tesla</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

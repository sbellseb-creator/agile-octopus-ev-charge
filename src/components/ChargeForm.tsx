import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Loader2 } from "lucide-react";
import type { Vehicle } from "@/lib/vehicle-data";
import { vehicleLabel } from "@/lib/vehicle-data";
import type { ChargeSession } from "@/lib/charge-data";
import { calculateManualSession, type ManualSessionCalc } from "@/lib/manual-session";
import { getSettings } from "@/lib/app-settings";
import { getUKDayKey, isoToUkClock } from "@/lib/timezone";
import { toast } from "sonner";

interface ChargeFormProps {
  onSessionAdded: (data: any) => void;
  onSessionUpdated?: (id: string, updates: any) => void;
  onCancelEdit?: () => void;
  editingSession?: ChargeSession | null;
  vehicles?: Vehicle[];
}

export default function ChargeForm({
  onSessionAdded,
  onSessionUpdated,
  onCancelEdit,
  editingSession = null,
  vehicles = [],
}: ChargeFormProps) {
  const [loading, setLoading] = useState(false);
  const [notes, setSaveNotes] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [date, setDate] = useState(() => getUKDayKey(new Date()));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [startSoc, setStartSoc] = useState("");
  const [endSoc, setEndSoc] = useState("");
  const [calc, setCalc] = useState<ManualSessionCalc | null>(null);
  const [calculating, setCalculating] = useState(false);

  const safeVehiclesList = Array.isArray(vehicles) ? vehicles.filter((v) => v && v.id) : [];
  const vehicle = safeVehiclesList.find((v) => v.id === vehicleId);
  const isEditing = !!editingSession;

  useEffect(() => {
    if (editingSession) return;
    if (safeVehiclesList.length > 0) {
      const defaultVehicle = safeVehiclesList.find((v) => v.is_default) || safeVehiclesList[0];
      if (defaultVehicle?.id) setVehicleId(defaultVehicle.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, editingSession]);

  useEffect(() => {
    if (!editingSession) return;
    setVehicleId(editingSession.vehicle_id || "");
    setDate(editingSession.session_date);
    setStartTime(isoToUkClock(editingSession.start_time) ?? "");
    setEndTime(isoToUkClock(editingSession.end_time) ?? "");
    setStartSoc(String(editingSession.start_soc ?? ""));
    setEndSoc(String(editingSession.end_soc ?? ""));
    setSaveNotes(editingSession.notes || "");
  }, [editingSession]);

  const socValid =
    startSoc !== "" && endSoc !== "" &&
    Number(startSoc) >= 0 && Number(endSoc) <= 100 && Number(endSoc) > Number(startSoc);

  const buildInput = () => ({
    session_date: date,
    start_time: startTime,
    end_time: endTime,
    start_soc: Number(startSoc),
    end_soc: Number(endSoc),
    batteryKwh: vehicle?.battery_kwh,
    efficiencyPct: vehicle?.charge_efficiency_pct,
    region: getSettings().region,
  });

  useEffect(() => {
    if (!date || !startTime || !endTime || !socValid) {
      setCalc(null);
      return;
    }
    let cancelled = false;
    setCalculating(true);
    calculateManualSession(buildInput())
      .then((r) => { if (!cancelled) setCalc(r); })
      .catch(() => { if (!cancelled) setCalc(null); })
      .finally(() => { if (!cancelled) setCalculating(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, startTime, endTime, startSoc, endSoc, vehicleId, vehicle?.battery_kwh, vehicle?.charge_efficiency_pct]);

  const resetForm = () => {
    setStartTime("");
    setEndTime("");
    setStartSoc("");
    setEndSoc("");
    setSaveNotes("");
    setCalc(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId || !date || !startTime || !endTime || !socValid) {
      toast.error("Please choose a vehicle, date, start/end times and a higher End SoC than Start SoC.");
      return;
    }

    try {
      setLoading(true);
      const result = calc ?? (await calculateManualSession(buildInput()));
      if (!result) {
        toast.error("Could not calculate energy and cost for this time window.");
        return;
      }
      const data = {
        vehicle_id: vehicleId,
        vehicle_name: vehicle ? vehicleLabel(vehicle) : "",
        vehicle_registration: vehicle?.registration || undefined,
        session_date: date,
        start_time: startTime,
        end_time: endTime,
        start_soc: Number(startSoc),
        end_soc: Number(endSoc),
        energy_added_kwh: result.energy_added_kwh,
        grid_kwh: result.grid_kwh,
        estimated_grid_energy_kwh: result.estimated_grid_energy_kwh,
        energy_source: result.energy_source,
        total_cost_gbp: result.total_cost_gbp,
        avg_pence_per_kwh: result.avg_pence_per_kwh,
        num_slots: result.num_slots,
        slot_prices: result.slot_prices,
        region: getSettings().region,
        notes: notes.trim(),
      };
      if (editingSession && onSessionUpdated) {
        onSessionUpdated(editingSession.id, data);
        toast.success("Charging session updated!");
      } else {
        onSessionAdded({
          ...data,
          charge_mode: "immediate",
          source: "manual",
          status: "manual",
          tariff_code: "",
          created_at: new Date().toISOString(),
        });
        toast.success("Charging session logged successfully!");
      }
      resetForm();
    } catch (err) {
      toast.error("Failed to save session data.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "h-9 bg-slate-950 border-white/10 text-xs font-mono";

  return (
    <Card className="bg-slate-900/40 border border-white/5 rounded-3xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          {isEditing ? "Edit Past Charge Session" : "Log a Past Charge Session"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="vehicle" className="text-xs text-slate-400">Select Vehicle</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger id="vehicle" className="h-9 bg-slate-950 border-white/10 text-xs">
                  <SelectValue placeholder={safeVehiclesList.length === 0 ? "Loading profiles..." : "Choose car"} />
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-white/10 text-xs">
                  {safeVehiclesList.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name || v.registration || "Tesla"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="session-date" className="text-xs text-slate-400">Date</Label>
              <Input id="session-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start-time" className="text-xs text-slate-400">Start Time</Label>
              <Input id="start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-time" className="text-xs text-slate-400">End Time</Label>
              <Input id="end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="start-soc" className="text-xs text-slate-400">Start SoC (%)</Label>
              <Input id="start-soc" type="number" min={0} max={100} placeholder="20" value={startSoc} onChange={(e) => setStartSoc(e.target.value)} className={inputCls} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-soc" className="text-xs text-slate-400">End SoC (%)</Label>
              <Input id="end-soc" type="number" min={0} max={100} placeholder="80" value={endSoc} onChange={(e) => setEndSoc(e.target.value)} className={inputCls} required />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 rounded-2xl border border-white/5 bg-slate-950/50 p-3 text-center" aria-live="polite">
            <div>
              <p className="text-[10px] uppercase text-slate-500">Energy Added</p>
              <p className="font-mono text-sm font-bold text-white">{calc ? `${calc.energy_added_kwh.toFixed(1)} kWh` : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-500">Total Cost</p>
              <p className="font-mono text-sm font-bold text-emerald-400">
                {calculating ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : calc ? `£${calc.total_cost_gbp.toFixed(2)}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-500">Avg Price</p>
              <p className="font-mono text-sm font-bold text-white">{calc ? `${calc.avg_pence_per_kwh.toFixed(2)}p` : "—"}</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500">
            Calculated automatically from your times, SoC and Agile rates.
            {vehicle && !vehicle.battery_kwh ? " Set the battery size on the vehicle for SoC-based energy; otherwise charger power × time is used." : ""}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs text-slate-400">Session Notes (Optional)</Label>
            <Input
              id="notes"
              placeholder="e.g., Overnight Agile slot charging"
              value={notes}
              onChange={(e) => setSaveNotes(e.target.value)}
              className="h-9 bg-slate-950 border-white/10 text-xs"
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={loading || calculating || safeVehiclesList.length === 0} className="flex-1 h-9 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isEditing ? "Update Charging Record" : "Save Charging Record"}
            </Button>
            {isEditing && (
              <Button type="button" variant="outline" onClick={() => { resetForm(); onCancelEdit?.(); }} className="h-9 rounded-xl text-xs">
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

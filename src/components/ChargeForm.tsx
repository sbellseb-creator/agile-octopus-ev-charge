import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import type { Vehicle } from "@/lib/vehicle-data";
import { CHARGE_MODE_LABELS, type ChargeMode } from "@/lib/charge-data";

interface Props {
  onAdd: (data: {
    session_date: string;
    start_time?: string;
    end_time?: string;
    vehicle_id: string;
    vehicle_name: string;
    charge_mode: ChargeMode;
    target_time?: string;
    start_soc: number;
    end_soc: number;
    energy_added_kwh: number;
    grid_kwh: number;
    total_cost_gbp: number;
    avg_pence_per_kwh: number;
    num_slots: number;
    tariff_code: string;
    notes: string;
  }) => void;
  vehicles: Vehicle[];
}

const CHARGER_KW = 6.9;
const KWH_PER_SLOT = CHARGER_KW * 0.5;
const DEFAULT_AVG_PRICE = 12; // fallback p/kWh

export default function ChargeForm({ onAdd, vehicles }: Props) {
  const defaultVehicle = vehicles.find((v) => v.is_default) || vehicles[0];
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState(defaultVehicle?.id || "");
  const [chargeMode, setChargeMode] = useState<ChargeMode>("immediate");
  const [targetTime, setTargetTime] = useState("");
  const [startSoc, setStartSoc] = useState("");
  const [endSoc, setEndSoc] = useState("");
  const [notes, setNotes] = useState("");

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);

  const estimates = useMemo(() => {
    if (!selectedVehicle || !startSoc || !endSoc) return null;
    const socDelta = (parseFloat(endSoc) || 0) - (parseFloat(startSoc) || 0);
    if (socDelta <= 0) return null;
    const kwhNeeded = (selectedVehicle.battery_kwh * socDelta) / 100;
    const slots = Math.ceil(kwhNeeded / KWH_PER_SLOT);
    const totalCost = (kwhNeeded * DEFAULT_AVG_PRICE) / 100;
    return {
      kwh: parseFloat(kwhNeeded.toFixed(1)),
      slots,
      totalCost: parseFloat(totalCost.toFixed(2)),
      avgPrice: DEFAULT_AVG_PRICE,
    };
  }, [selectedVehicle, startSoc, endSoc]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startSoc || !endSoc) return;
    const selected = vehicles.find((v) => v.id === selectedVehicleId);
    onAdd({
      session_date: date,
      start_time: startTime || undefined,
      end_time: endTime || undefined,
      vehicle_id: selected?.id || "",
      vehicle_name: selected?.name || "",
      charge_mode: chargeMode,
      target_time: chargeMode === "target_time" ? targetTime : undefined,
      start_soc: parseFloat(startSoc) || 0,
      end_soc: parseFloat(endSoc) || 0,
      energy_added_kwh: estimates?.kwh || 0,
      grid_kwh: 0,
      total_cost_gbp: estimates?.totalCost || 0,
      avg_pence_per_kwh: estimates?.avgPrice || 0,
      num_slots: estimates?.slots || 0,
      tariff_code: "",
      notes,
    });
    setStartSoc("");
    setEndSoc("");
    setStartTime("");
    setEndTime("");
    setNotes("");
  };

  return (
    <Card className="neon-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Plus className="h-5 w-5 text-primary" />
          Log Charge Session
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Start Time</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>End Time</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Vehicle</Label>
            {vehicles.length > 0 ? (
              <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground pt-2">Add a vehicle first</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Charge Mode</Label>
            <Select value={chargeMode} onValueChange={(v) => setChargeMode(v as ChargeMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(CHARGE_MODE_LABELS) as [ChargeMode, string][]).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {chargeMode === "target_time" && (
            <div className="space-y-2">
              <Label>Target Time</Label>
              <Input type="time" value={targetTime} onChange={(e) => setTargetTime(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label>Start SoC % *</Label>
            <Input type="number" step="1" placeholder="e.g. 20" value={startSoc} onChange={(e) => setStartSoc(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>End SoC % *</Label>
            <Input type="number" step="1" placeholder="e.g. 80" value={endSoc} onChange={(e) => setEndSoc(e.target.value)} required />
          </div>

          {/* Auto-calculated estimates */}
          {estimates && (
            <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-2">Auto-calculated (6.9kW charger)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm">
                <div>
                  <p className="font-bold text-foreground">{estimates.kwh} kWh</p>
                  <p className="text-xs text-muted-foreground">Energy</p>
                </div>
                <div>
                  <p className="font-bold text-foreground">{estimates.slots}</p>
                  <p className="text-xs text-muted-foreground">Slots</p>
                </div>
                <div>
                  <p className="font-bold text-foreground">£{estimates.totalCost.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Est. Cost</p>
                </div>
                <div>
                  <p className="font-bold text-foreground">{estimates.avgPrice}p</p>
                  <p className="text-xs text-muted-foreground">Avg p/kWh</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2 sm:col-span-2 lg:col-span-2">
            <Label>Notes</Label>
            <Textarea placeholder="Optional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" className="w-full" disabled={!startSoc || !endSoc}>Log Session</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

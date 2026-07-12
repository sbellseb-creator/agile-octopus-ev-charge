import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import type { Vehicle } from "@/lib/vehicle-data";
import { CHARGE_MODE_LABELS, type ChargeMode, type CachedSlotPrice, type ChargeSession } from "@/lib/charge-data";
import { recalcSessionCost } from "@/lib/session-cost";
import { formatUK } from "@/lib/timezone";

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
    slot_prices?: CachedSlotPrice[];
    region?: string;
  }) => void;
  vehicles: Vehicle[];
}

const CHARGER_KW = 6.9;
const KWH_PER_SLOT = CHARGER_KW * 0.5;

interface Estimates {
  kwh: number;
  slots: number;
  totalCost: number;
  avgPrice: number;
  slotPrices?: CachedSlotPrice[];
  region?: string;
  pricedFromAgile: boolean;
}

export default function ChargeForm({ onAdd, vehicles }: Props) {
  const defaultVehicle = vehicles.find((v) => v.is_default) || vehicles[0];
  const [date, setDate] = useState(formatUK(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState(defaultVehicle?.id || "");
  const [chargeMode, setChargeMode] = useState<ChargeMode>("immediate");
  const [targetTime, setTargetTime] = useState("");
  const [startSoc, setStartSoc] = useState("");
  const [endSoc, setEndSoc] = useState("");
  const [notes, setNotes] = useState("");
  const [estimates, setEstimates] = useState<Estimates | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(false);

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    if (!selectedVehicle || !startSoc || !endSoc) {
      setEstimates(null);
      return;
    }
    const socDelta = (parseFloat(endSoc) || 0) - (parseFloat(startSoc) || 0);
    if (socDelta <= 0) {
      setEstimates(null);
      return;
    }
    const kwhFromSoc = parseFloat(((selectedVehicle.battery_kwh * socDelta) / 100).toFixed(2));

    // No times yet — show SoC-derived kWh/slots only, no pricing.
    if (!startTime || !endTime) {
      const slots = Math.ceil(kwhFromSoc / KWH_PER_SLOT);
      setEstimates({
        kwh: kwhFromSoc,
        slots,
        totalCost: 0,
        avgPrice: 0,
        pricedFromAgile: false,
      });
      return;
    }

    // Debounce the network call so we don't spam while typing
    debounceRef.current = window.setTimeout(async () => {
      setLoadingPrices(true);
      try {
        const region = localStorage.getItem("agile-region") || "F";
        const synthetic: ChargeSession = {
          id: "draft",
          session_date: date,
          start_time: startTime,
          end_time: endTime,
          vehicle_id: selectedVehicle.id,
          vehicle_name: selectedVehicle.name,
          charge_mode: chargeMode,
          start_soc: parseFloat(startSoc) || 0,
          end_soc: parseFloat(endSoc) || 0,
          energy_added_kwh: 0,
          grid_kwh: 0,
          total_cost_gbp: 0,
          avg_pence_per_kwh: 0,
          num_slots: 0,
          tariff_code: "",
          notes: "",
          region,
          slot_prices: [],
        };
        const recalc = await recalcSessionCost(synthetic, {});
        if (!recalc) {
          const slots = Math.ceil(kwhFromSoc / KWH_PER_SLOT);
          setEstimates({ kwh: kwhFromSoc, slots, totalCost: 0, avgPrice: 0, pricedFromAgile: false });
          return;
        }
        // Prefer SoC-based kWh (truer to actual battery energy added)
        const kwh = kwhFromSoc;
        const totalCost = parseFloat(((kwh * recalc.avg_pence_per_kwh) / 100).toFixed(2));
        setEstimates({
          kwh,
          slots: recalc.num_slots,
          totalCost,
          avgPrice: recalc.avg_pence_per_kwh,
          slotPrices: recalc.slot_prices,
          region,
          pricedFromAgile: true,
        });
      } catch (e) {
        console.warn("Failed to fetch Agile prices for log estimate", e);
        const slots = Math.ceil(kwhFromSoc / KWH_PER_SLOT);
        setEstimates({ kwh: kwhFromSoc, slots, totalCost: 0, avgPrice: 0, pricedFromAgile: false });
      } finally {
        setLoadingPrices(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [date, startTime, endTime, selectedVehicle, startSoc, endSoc, chargeMode]);

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
      slot_prices: estimates?.slotPrices,
      region: estimates?.region,
    });
    setStartSoc("");
    setEndSoc("");
    setStartTime("");
    setEndTime("");
    setNotes("");
    setEstimates(null);
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
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                {loadingPrices && <Loader2 className="h-3 w-3 animate-spin" />}
                {loadingPrices
                  ? "Fetching real Agile prices…"
                  : estimates.pricedFromAgile
                    ? `Auto-calculated · real Agile avg (Region ${estimates.region})`
                    : "Auto-calculated · add Start & End time for real Agile pricing"}
              </p>
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
                  <p className="font-bold text-foreground">
                    {estimates.pricedFromAgile ? `£${estimates.totalCost.toFixed(2)}` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">Est. Cost</p>
                </div>
                <div>
                  <p className="font-bold text-foreground">
                    {estimates.pricedFromAgile ? `${estimates.avgPrice.toFixed(2)}p` : "—"}
                  </p>
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

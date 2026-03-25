import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import type { Vehicle } from "@/lib/vehicle-data";

interface Props {
  onAdd: (data: {
    session_date: string;
    vehicle_id: string;
    vehicle_name: string;
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

export default function ChargeForm({ onAdd, vehicles }: Props) {
  const defaultVehicle = vehicles.find((v) => v.is_default) || vehicles[0];
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedVehicleId, setSelectedVehicleId] = useState(defaultVehicle?.id || "");
  const [startSoc, setStartSoc] = useState("");
  const [endSoc, setEndSoc] = useState("");
  const [energyAdded, setEnergyAdded] = useState("");
  const [gridKwh, setGridKwh] = useState("");
  const [cost, setCost] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [numSlots, setNumSlots] = useState("");
  const [tariff, setTariff] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      session_date: date,
      vehicle_id: vehicleName.toLowerCase().replace(/\s+/g, "-"),
      vehicle_name: vehicleName,
      start_soc: parseFloat(startSoc) || 0,
      end_soc: parseFloat(endSoc) || 0,
      energy_added_kwh: parseFloat(energyAdded) || 0,
      grid_kwh: parseFloat(gridKwh) || 0,
      total_cost_gbp: parseFloat(cost) || 0,
      avg_pence_per_kwh: parseFloat(avgPrice) || 0,
      num_slots: parseInt(numSlots) || 0,
      tariff_code: tariff,
      notes,
    });
    setStartSoc("");
    setEndSoc("");
    setEnergyAdded("");
    setGridKwh("");
    setCost("");
    setAvgPrice("");
    setNumSlots("");
    setNotes("");
  };

  return (
    <Card>
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
            <Label>Vehicle</Label>
            <Input placeholder="e.g. Model 3" value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Start SoC %</Label>
            <Input type="number" step="1" placeholder="e.g. 20" value={startSoc} onChange={(e) => setStartSoc(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>End SoC %</Label>
            <Input type="number" step="1" placeholder="e.g. 80" value={endSoc} onChange={(e) => setEndSoc(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Energy Added (kWh)</Label>
            <Input type="number" step="0.1" placeholder="e.g. 35.2" value={energyAdded} onChange={(e) => setEnergyAdded(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Grid Draw (kWh)</Label>
            <Input type="number" step="0.1" placeholder="e.g. 38.5" value={gridKwh} onChange={(e) => setGridKwh(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Total Cost (£)</Label>
            <Input type="number" step="0.01" placeholder="e.g. 4.50" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Avg Price (p/kWh)</Label>
            <Input type="number" step="0.01" placeholder="e.g. 12.5" value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Slots Used</Label>
            <Input type="number" step="1" placeholder="e.g. 6" value={numSlots} onChange={(e) => setNumSlots(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Tariff Code</Label>
            <Input placeholder="e.g. AGILE-VAR-22-10-31" value={tariff} onChange={(e) => setTariff(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-2">
            <Label>Notes</Label>
            <Textarea placeholder="Optional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" className="w-full">Log Session</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

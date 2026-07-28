import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Vehicle } from "@/lib/vehicle-data";

interface Props {
  vehicle: Vehicle;
  onSave: (id: string, updates: Partial<Omit<Vehicle, "id">>) => void;
}

/** Editable vehicle fields (Settings → Vehicle). Single column on narrow screens. */
export default function VehicleEditForm({ vehicle, onSave }: Props) {
  const [form, setForm] = useState(vehicle);
  const [saved, setSaved] = useState(false);

  useEffect(() => setForm(vehicle), [vehicle]);

  const set = <K extends keyof Vehicle>(k: K, v: Vehicle[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(vehicle.id, {
      name: form.name,
      registration: form.registration,
      make: form.make,
      model: form.model,
      car_type: form.car_type,
      battery_kwh: form.battery_kwh === null || Number.isNaN(form.battery_kwh) ? null : Number(form.battery_kwh),
      charge_efficiency_pct: Number(form.charge_efficiency_pct) || 90,
      miles_per_kwh: Number(form.miles_per_kwh) || 0,
      is_default: form.is_default,
      color: form.color,
      notes: form.notes,
    });
    setSaved(true);
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-1.5">
        <Label className="text-xs">Registration</Label>
        <Input
          value={form.registration}
          placeholder="ND74 VCA"
          onChange={(e) => set("registration", e.target.value.toUpperCase())}
          className="w-full font-mono uppercase"
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label className="text-xs">Name</Label>
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} className="w-full" />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label className="text-xs">Make</Label>
        <Input value={form.make} placeholder="Unknown" onChange={(e) => set("make", e.target.value)} className="w-full" />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label className="text-xs">Model / car type</Label>
        <Input value={form.model} placeholder="Unknown" onChange={(e) => set("model", e.target.value)} className="w-full" />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label className="text-xs">Battery (kWh) — optional</Label>
        <Input
          type="number"
          step="0.1"
          inputMode="decimal"
          placeholder="Leave blank if unknown"
          value={form.battery_kwh ?? ""}
          onChange={(e) => set("battery_kwh", e.target.value === "" ? null : Number(e.target.value))}
          className="w-full"
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label className="text-xs">Charge efficiency %</Label>
        <Input
          type="number"
          inputMode="decimal"
          value={form.charge_efficiency_pct}
          onChange={(e) => set("charge_efficiency_pct", Number(e.target.value))}
          className="w-full"
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label className="text-xs">mi/kWh</Label>
        <Input
          type="number"
          step="0.1"
          inputMode="decimal"
          value={form.miles_per_kwh}
          onChange={(e) => set("miles_per_kwh", Number(e.target.value))}
          className="w-full"
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label className="text-xs">Colour</Label>
        <Input type="color" value={form.color} onChange={(e) => set("color", e.target.value)} className="h-10 w-full p-1" />
      </div>
      <div className="flex min-w-0 items-center gap-2 sm:col-span-2">
        <Switch id={`def-${vehicle.id}`} checked={form.is_default} onCheckedChange={(c) => set("is_default", c)} />
        <Label htmlFor={`def-${vehicle.id}`} className="text-xs">Default vehicle</Label>
      </div>
      <div className="min-w-0 space-y-1.5 sm:col-span-2">
        <Label className="text-xs">Notes</Label>
        <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} className="w-full" />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" className="w-full">{saved ? "Saved" : "Save vehicle"}</Button>
      </div>
    </form>
  );
}

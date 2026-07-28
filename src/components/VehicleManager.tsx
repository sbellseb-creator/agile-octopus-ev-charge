import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Car, ChevronDown } from "lucide-react";
import TeslaConnect from "@/components/TeslaConnect";
import VehicleCard from "@/components/vehicles/VehicleCard";
import type { Vehicle } from "@/lib/vehicle-data";

interface Props {
  vehicles: Vehicle[];
  onAdd: (v: Partial<Omit<Vehicle, "id">> & { name: string }) => void;
  onDelete: (id: string) => void;
}

/**
 * Vehicles view: connected Tesla first, then the vehicle cards (registration is
 * the primary identifier). The manual Add Vehicle form is secondary and
 * collapsed — it exists for non-Tesla or extra manually managed vehicles.
 */
export default function VehicleManager({ vehicles, onAdd, onDelete }: Props) {
  const [teslaConnected, setTeslaConnected] = useState(false);
  const [open, setOpen] = useState(false);
  const [registration, setRegistration] = useState("");
  const [name, setName] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [batteryKwh, setBatteryKwh] = useState("");
  const [efficiency, setEfficiency] = useState("90");
  const [mpkwh, setMpkwh] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [color, setColor] = useState("#22c55e");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!registration && !name) return;
    onAdd({
      name: name || registration,
      registration,
      make,
      model,
      battery_kwh: batteryKwh === "" ? null : parseFloat(batteryKwh),
      charge_efficiency_pct: parseFloat(efficiency) || 90,
      miles_per_kwh: parseFloat(mpkwh) || 0,
      is_default: isDefault,
      color,
      notes: "",
      source: "manual",
    });
    setRegistration("");
    setName("");
    setMake("");
    setModel("");
    setBatteryKwh("");
    setEfficiency("90");
    setMpkwh("");
    setIsDefault(false);
    setOpen(false);
  };

  const otherVehicles = teslaConnected ? vehicles.filter((v) => v.source !== "tesla") : vehicles;

  return (
    <div className="space-y-4">
      <TeslaConnect vehicles={vehicles} onStatus={setTeslaConnected} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Car className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 truncate">
              {teslaConnected ? `Other vehicles (${otherVehicles.length})` : `My vehicles (${vehicles.length})`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {otherVehicles.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              {teslaConnected ? "Your Tesla is shown above." : "No vehicles yet."}
            </p>
          ) : (
            otherVehicles.map((v) => <VehicleCard key={v.id} vehicle={v} onDelete={onDelete} />)
          )}
          <p className="text-xs text-muted-foreground">
            Edit vehicle details in Settings → Vehicle.
          </p>
        </CardContent>
      </Card>

      <Collapsible open={open} onOpenChange={setOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <button type="button" className="flex w-full items-center justify-between gap-2 p-3 text-left">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <Plus className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 truncate">Add a non-Tesla vehicle</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="pt-0">
              <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs">Registration *</Label>
                  <Input value={registration} onChange={(e) => setRegistration(e.target.value.toUpperCase())} placeholder="AB12 CDE" className="w-full font-mono uppercase" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Second car" className="w-full" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs">Make</Label>
                  <Input value={make} onChange={(e) => setMake(e.target.value)} className="w-full" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs">Model</Label>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} className="w-full" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs">Battery (kWh) — optional</Label>
                  <Input type="number" step="0.1" inputMode="decimal" value={batteryKwh} onChange={(e) => setBatteryKwh(e.target.value)} placeholder="Leave blank if unknown" className="w-full" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs">Charge efficiency %</Label>
                  <Input type="number" inputMode="decimal" value={efficiency} onChange={(e) => setEfficiency(e.target.value)} className="w-full" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs">mi/kWh</Label>
                  <Input type="number" step="0.1" inputMode="decimal" value={mpkwh} onChange={(e) => setMpkwh(e.target.value)} className="w-full" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs">Colour</Label>
                  <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-full p-1" />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch checked={isDefault} onCheckedChange={setIsDefault} id="manual-default" />
                  <Label htmlFor="manual-default" className="text-xs">Default vehicle</Label>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" size="sm" className="w-full">Add vehicle</Button>
                </div>
              </form>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Car } from "lucide-react";
import type { Vehicle } from "@/lib/vehicle-data";

interface Props {
  vehicles: Vehicle[];
  onAdd: (v: Omit<Vehicle, "id">) => void;
  onDelete: (id: string) => void;
}

export default function VehicleManager({ vehicles, onAdd, onDelete }: Props) {
  const [name, setName] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [batteryKwh, setBatteryKwh] = useState("");
  const [efficiency, setEfficiency] = useState("90");
  const [mpkwh, setMpkwh] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [color, setColor] = useState("#22c55e");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !batteryKwh) return;
    onAdd({
      name,
      make,
      model,
      battery_kwh: parseFloat(batteryKwh),
      charge_efficiency_pct: parseFloat(efficiency) || 90,
      miles_per_kwh: parseFloat(mpkwh) || 0,
      is_default: isDefault,
      color,
      notes,
    });
    setName("");
    setMake("");
    setModel("");
    setBatteryKwh("");
    setEfficiency("90");
    setMpkwh("");
    setIsDefault(false);
    setNotes("");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5 text-primary" />
            Add Vehicle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input placeholder="e.g. My Model Y" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Make</Label>
              <Input placeholder="e.g. Tesla" value={make} onChange={(e) => setMake(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input placeholder="e.g. Model Y" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Battery (kWh) *</Label>
              <Input type="number" step="0.1" placeholder="e.g. 75" value={batteryKwh} onChange={(e) => setBatteryKwh(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Charge Efficiency %</Label>
              <Input type="number" step="1" value={efficiency} onChange={(e) => setEfficiency(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>mi/kWh</Label>
              <Input type="number" step="0.1" placeholder="e.g. 3.5" value={mpkwh} onChange={(e) => setMpkwh(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Colour</Label>
              <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} id="default" />
              <Label htmlFor="default">Default vehicle</Label>
            </div>
            <div className="space-y-2 sm:col-span-2 lg:col-span-1">
              <Label>Notes</Label>
              <Textarea placeholder="Optional..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit" className="w-full">Add Vehicle</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Car className="h-5 w-5 text-primary" />
            Vehicles ({vehicles.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vehicles.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No vehicles added yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead>Name</TableHead>
                    <TableHead>Make / Model</TableHead>
                    <TableHead className="text-right">Battery</TableHead>
                    <TableHead className="text-right">Eff %</TableHead>
                    <TableHead className="text-right">mi/kWh</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicles.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell><span className="inline-block h-4 w-4 rounded-full" style={{ backgroundColor: v.color || "#888" }} /></TableCell>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell className="text-muted-foreground">{[v.make, v.model].filter(Boolean).join(" ") || "—"}</TableCell>
                      <TableCell className="text-right">{v.battery_kwh} kWh</TableCell>
                      <TableCell className="text-right">{v.charge_efficiency_pct}%</TableCell>
                      <TableCell className="text-right">{v.miles_per_kwh || "—"}</TableCell>
                      <TableCell>{v.is_default ? "✓" : ""}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(v.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

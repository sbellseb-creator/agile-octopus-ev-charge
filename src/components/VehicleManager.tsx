import { useState } from "react";
import {
  Car,
  ChevronDown,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import TeslaConnect from "@/components/TeslaConnect";
import type { Vehicle } from "@/lib/vehicle-data";

interface Props {
  vehicles: Vehicle[];
  onAdd: (vehicle: Omit<Vehicle, "id">) => void;
  onDelete: (id: string) => void;
}

export default function VehicleManager({
  vehicles,
  onAdd,
  onDelete,
}: Props) {
  const [manualOpen, setManualOpen] = useState(
    vehicles.length === 0,
  );

  const [name, setName] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [batteryKwh, setBatteryKwh] = useState("");
  const [efficiency, setEfficiency] = useState("93");
  const [mpkwh, setMpkwh] = useState("3.9");
  const [isDefault, setIsDefault] = useState(false);
  const [color, setColor] = useState("#22c55e");
  const [notes, setNotes] = useState("");

  const sortedVehicles = [...vehicles].sort((a, b) => {
    if (a.source === "tesla" && b.source !== "tesla") return -1;
    if (a.source !== "tesla" && b.source === "tesla") return 1;
    if (a.is_default && !b.is_default) return -1;
    if (!a.is_default && b.is_default) return 1;
    return a.name.localeCompare(b.name);
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!name || !batteryKwh) return;

    onAdd({
      name,
      make,
      model,
      battery_kwh: Number.parseFloat(batteryKwh),
      charge_efficiency_pct:
        Number.parseFloat(efficiency) || 93,
      miles_per_kwh: Number.parseFloat(mpkwh) || 0,
      is_default: isDefault,
      color,
      notes,
      source: "manual",
    });

    setName("");
    setMake("");
    setModel("");
    setBatteryKwh("");
    setEfficiency("93");
    setMpkwh("3.9");
    setIsDefault(false);
    setNotes("");
    setManualOpen(false);
  }

  return (
    <div className="space-y-6">
      <TeslaConnect />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Car className="h-5 w-5 text-primary" />
            Garage ({vehicles.length})
          </CardTitle>
        </CardHeader>

        <CardContent>
          {vehicles.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No vehicles added yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead>Name</TableHead>
                    <TableHead>Make / Model</TableHead>
                    <TableHead className="text-right">
                      Battery
                    </TableHead>
                    <TableHead className="text-right">
                      Efficiency
                    </TableHead>
                    <TableHead className="text-right">
                      mi/kWh
                    </TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {sortedVehicles.map((vehicle) => (
                    <TableRow key={vehicle.id}>
                      <TableCell>
                        <span
                          className="inline-block h-4 w-4 rounded-full border border-border"
                          style={{
                            backgroundColor:
                              vehicle.color || "#888888",
                          }}
                        />
                      </TableCell>

                      <TableCell className="font-medium">
                        <div>{vehicle.name}</div>

                        {vehicle.registration && (
                          <div className="text-xs text-muted-foreground">
                            {vehicle.registration}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {[vehicle.make, vehicle.model]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </TableCell>

                      <TableCell className="text-right">
                        {vehicle.battery_kwh} kWh
                      </TableCell>

                      <TableCell className="text-right">
                        {vehicle.charge_efficiency_pct}%
                      </TableCell>

                      <TableCell className="text-right">
                        {vehicle.miles_per_kwh || "—"}
                      </TableCell>

                      <TableCell>
                        {vehicle.source === "tesla" ? (
                          <Badge variant="secondary">
                            Tesla Fleet
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            Manual
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell>
                        {vehicle.is_default ? "✓" : ""}
                      </TableCell>

                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              aria-label={`Delete ${vehicle.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>

                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="flex items-center gap-2">
                                <TriangleAlert className="h-5 w-5 text-destructive" />
                                Delete {vehicle.name}?
                              </AlertDialogTitle>

                              <AlertDialogDescription>
                                This removes the vehicle from EV Charge
                                Tracker. It does not disconnect your Tesla
                                account or delete anything from Tesla.
                              </AlertDialogDescription>
                            </AlertDialogHeader>

                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                Cancel
                              </AlertDialogCancel>

                              <AlertDialogAction
                                onClick={() => onDelete(vehicle.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete vehicle
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Collapsible
        open={manualOpen}
        onOpenChange={setManualOpen}
      >
        <Card>
          <CardHeader className="pb-3">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-between p-0 hover:bg-transparent"
              >
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Plus className="h-5 w-5 text-primary" />
                  Add manual vehicle
                </CardTitle>

                <ChevronDown
                  className={`h-5 w-5 transition-transform ${
                    manualOpen ? "rotate-180" : ""
                  }`}
                />
              </Button>
            </CollapsibleTrigger>
          </CardHeader>

          <CollapsibleContent>
            <CardContent>
              <form
                onSubmit={handleSubmit}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    placeholder="e.g. My Model Y"
                    value={name}
                    onChange={(event) =>
                      setName(event.target.value)
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Make</Label>
                  <Input
                    placeholder="e.g. Tesla"
                    value={make}
                    onChange={(event) =>
                      setMake(event.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Model</Label>
                  <Input
                    placeholder="e.g. Model Y"
                    value={model}
                    onChange={(event) =>
                      setModel(event.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Battery (kWh) *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 75"
                    value={batteryKwh}
                    onChange={(event) =>
                      setBatteryKwh(event.target.value)
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Charging efficiency %</Label>
                  <Input
                    type="number"
                    step="1"
                    value={efficiency}
                    onChange={(event) =>
                      setEfficiency(event.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Typical mi/kWh</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={mpkwh}
                    onChange={(event) =>
                      setMpkwh(event.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Colour</Label>
                  <Input
                    type="color"
                    value={color}
                    onChange={(event) =>
                      setColor(event.target.value)
                    }
                    className="h-10 w-20 p-1"
                  />
                </div>

                <div className="flex items-end gap-2 pb-1">
                  <Switch
                    checked={isDefault}
                    onCheckedChange={setIsDefault}
                    id="default"
                  />
                  <Label htmlFor="default">
                    Default vehicle
                  </Label>
                </div>

                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Optional..."
                    value={notes}
                    onChange={(event) =>
                      setNotes(event.target.value)
                    }
                    rows={2}
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <Button type="submit" className="w-full">
                    Add manual vehicle
                  </Button>
                </div>
              </form>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}

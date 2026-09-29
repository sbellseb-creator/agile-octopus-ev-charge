import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Loader2 } from "lucide-react";
import type { Vehicle } from "@/lib/vehicle-data";
import { toast } from "sonner";

interface ChargeFormProps {
  onSessionAdded: (data: any) => void;
  vehicles?: Vehicle[];
}

export default function ChargeForm({ onSessionAdded, vehicles = [] }: ChargeFormProps) {
  const [loading, setLoading] = useState(false);
  const [kwh, setKwh] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setSaveNotes] = useState("");
  
  // 🛡️ SAFE VEHICLE ID FALLBACK MANAGEMENT
  const [vehicleId, setVehicleId] = useState("");

  useEffect(() => {
    if (Array.isArray(vehicles) && vehicles.length > 0) {
      const defaultVehicle = vehicles.find(v => v?.is_default) || vehicles[0];
      if (defaultVehicle?.id) {
        setVehicleId(defaultVehicle.id);
      }
    }
  }, [vehicles]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kwh || !cost || !vehicleId) {
      toast.error("Please fill in all required configuration values.");
      return;
    }

    try {
      setLoading(true);
      onSessionAdded({
        vehicle_id: vehicleId,
        added_kwh: parseFloat(kwh),
        cost: parseFloat(cost),
        notes: notes.trim() || undefined,
        created_at: new Date().toISOString()
      });
      setKwh("");
      setCost("");
      setSaveNotes("");
      toast.success("Charging session logged successfully!");
    } catch (err) {
      toast.error("Failed to save session records.");
    } finally {
      setLoading(false);
    }
  };

  const safeVehicles = Array.isArray(vehicles) ? vehicles.filter(v => v && v.id) : [];

  return (
    <Card className="bg-slate-900/40 border border-white/5 rounded-3xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" /> Log New Charge Session
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="vehicle" className="text-xs text-slate-400">Select Vehicle</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger id="vehicle" className="h-9 bg-slate-950 border-white/10 text-xs">
                  <SelectValue placeholder="Choose car" />
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-white/10 text-xs">
                  {safeVehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name || v.registration || "Tesla"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kwh" className="text-xs text-slate-400">Energy Added (kWh)</Label>
              <Input
                id="kwh"
                type="number"
                step="0.1"
                placeholder="45.2"
                value={kwh}
                onChange={(e) => setKwh(e.target.value)}
                className="h-9 bg-slate-950 border-white/10 text-xs font-mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cost" className="text-xs text-slate-400">Total Cost (£)</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                placeholder="4.50"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="h-9 bg-slate-950 border-white/10 text-xs font-mono"
                required
              />
            </div>
          </div>

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

          <Button type="submit" disabled={loading} className="w-full h-9 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Charging Record"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

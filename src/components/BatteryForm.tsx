import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

interface Props {
  onAdd: (data: {
    recorded_date: string;
    degradation_pct: number;
    range_at_100_miles: number;
    odometer_miles: number;
    notes: string;
  }) => void;
}

export default function BatteryForm({ onAdd }: Props) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [degradation, setDegradation] = useState("");
  const [range, setRange] = useState("");
  const [odometer, setOdometer] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      recorded_date: date,
      degradation_pct: parseFloat(degradation) || 0,
      range_at_100_miles: parseFloat(range) || 0,
      odometer_miles: parseFloat(odometer) || 0,
      notes,
    });
    setDegradation("");
    setRange("");
    setOdometer("");
    setNotes("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Plus className="h-5 w-5 text-primary" />
          New Reading
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="degradation">Degradation %</Label>
            <Input id="degradation" type="number" step="0.1" placeholder="e.g. 5.2" value={degradation} onChange={(e) => setDegradation(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="range">Range at 100% (mi)</Label>
            <Input id="range" type="number" step="0.1" placeholder="e.g. 280" value={range} onChange={(e) => setRange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="odometer">Odometer (mi)</Label>
            <Input id="odometer" type="number" step="1" placeholder="e.g. 32000" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" placeholder="Optional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" className="w-full">Add Reading</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

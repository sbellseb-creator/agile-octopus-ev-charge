import { Card, CardContent } from "@/components/ui/card";
import { Zap, PoundSterling, BatteryCharging, Clock } from "lucide-react";
import type { ChargeSession } from "@/lib/charge-data";

interface Props {
  sessions: ChargeSession[];
}

export default function ChargeStats({ sessions }: Props) {
  const totalCost = sessions.reduce((s, r) => s + r.total_cost_gbp, 0);
  const totalKwh = sessions.reduce((s, r) => s + r.energy_added_kwh, 0);
  const avgPrice = sessions.length > 0
    ? sessions.reduce((s, r) => s + r.avg_pence_per_kwh, 0) / sessions.length
    : 0;

  const stats = [
    { label: "Total Sessions", value: sessions.length.toString(), icon: BatteryCharging, color: "text-primary" },
    { label: "Total Cost", value: `£${totalCost.toFixed(2)}`, icon: PoundSterling, color: "text-accent" },
    { label: "Energy Added", value: `${totalKwh.toFixed(1)} kWh`, icon: Zap, color: "text-chart-warning" },
    { label: "Avg Price", value: `${avgPrice.toFixed(2)}p/kWh`, icon: Clock, color: "text-muted-foreground" },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="flex items-center gap-3 p-4">
            <s.icon className={`h-8 w-8 shrink-0 ${s.color}`} />
            <div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

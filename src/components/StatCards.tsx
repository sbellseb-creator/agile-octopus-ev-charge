import { Card, CardContent } from "@/components/ui/card";
import { BatteryFull, TrendingDown, Gauge, Route } from "lucide-react";
import type { BatteryHealth } from "@/lib/battery-data";

interface Props {
  records: BatteryHealth[];
}

export default function StatCards({ records }: Props) {
  const latest = records[records.length - 1];
  const first = records[0];

  const stats = [
    {
      label: "Current Degradation",
      value: latest ? `${latest.degradation_pct}%` : "—",
      icon: TrendingDown,
      color: "text-destructive",
    },
    {
      label: "Current Range",
      value: latest ? `${latest.range_at_100_miles} mi` : "—",
      icon: Route,
      color: "text-primary",
    },
    {
      label: "Total Miles",
      value: latest ? latest.odometer_miles.toLocaleString() : "—",
      icon: Gauge,
      color: "text-accent",
    },
    {
      label: "Readings",
      value: records.length.toString(),
      icon: BatteryFull,
      color: "text-primary",
    },
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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import type { ChargeSession } from "@/lib/charge-data";

interface Props {
  sessions: ChargeSession[];
}

export default function ChargeCharts({ sessions }: Props) {
  if (sessions.length < 2) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Charging Trends</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Add at least 2 sessions to see charts.</p>
        </CardContent>
      </Card>
    );
  }

  const data = sessions.map((s) => {
    const parts = s.session_date.split("-");
    const ukDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0].slice(2)}` : s.session_date;
    return {
      date: ukDate,
      cost: s.total_cost_gbp,
      kwh: s.energy_added_kwh,
      price: s.avg_pence_per_kwh,
    };
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-lg">Cost per Session (£)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ borderRadius: "var(--radius)", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
              <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Avg Price (p/kWh)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="gradPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-warning))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--chart-warning))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis unit="p" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ borderRadius: "var(--radius)", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
              <Area type="monotone" dataKey="price" stroke="hsl(var(--chart-warning))" fill="url(#gradPrice)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

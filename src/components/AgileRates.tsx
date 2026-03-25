import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { fetchAgileRates, type AgileRate } from "@/lib/octopus-api";
import { Zap, Loader2 } from "lucide-react";
import { format } from "date-fns";

function rateColor(p: number): string {
  if (p <= 0) return "hsl(var(--primary))";
  if (p < 15) return "hsl(var(--chart-good))";
  if (p < 25) return "hsl(var(--chart-warning))";
  return "hsl(var(--chart-danger))";
}

export default function AgileRates() {
  const now = new Date();
  const periodFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: rates, isLoading, error } = useQuery({
    queryKey: ["agile-rates", periodFrom],
    queryFn: () => fetchAgileRates(undefined, periodFrom),
    refetchInterval: 30 * 60 * 1000,
  });

  const currentRate = rates?.find((r) => {
    const from = new Date(r.valid_from).getTime();
    const to = new Date(r.valid_to).getTime();
    return now.getTime() >= from && now.getTime() < to;
  });

  const chartData = (rates || [])
    .slice()
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from))
    .map((r) => ({
      time: format(new Date(r.valid_from), "HH:mm"),
      price: r.value_inc_vat,
      isCurrent: currentRate?.valid_from === r.valid_from,
    }));

  const avg = chartData.length > 0
    ? chartData.reduce((s, d) => s + d.price, 0) / chartData.length
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Zap className="h-8 w-8 shrink-0 text-primary" />
            <div>
              <p className="text-2xl font-bold">
                {currentRate ? `${currentRate.value_inc_vat.toFixed(1)}p` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Current Rate (inc VAT)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Zap className="h-8 w-8 shrink-0 text-chart-good" />
            <div>
              <p className="text-2xl font-bold">
                {chartData.length > 0 ? `${Math.min(...chartData.map((d) => d.price)).toFixed(1)}p` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Lowest (24h)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Zap className="h-8 w-8 shrink-0 text-chart-warning" />
            <div>
              <p className="text-2xl font-bold">{avg > 0 ? `${avg.toFixed(1)}p` : "—"}</p>
              <p className="text-xs text-muted-foreground">Average (24h)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Agile Tariff Rates (p/kWh inc VAT)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-destructive text-sm py-4 text-center">
              Failed to load rates. Check your API key and try again.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={3} />
                <YAxis unit="p" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    borderRadius: "var(--radius)",
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))",
                  }}
                  formatter={(value: number) => [`${value.toFixed(2)}p/kWh`, "Price"]}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <Bar dataKey="price" radius={[2, 2, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={rateColor(entry.price)}
                      stroke={entry.isCurrent ? "hsl(var(--foreground))" : "none"}
                      strokeWidth={entry.isCurrent ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

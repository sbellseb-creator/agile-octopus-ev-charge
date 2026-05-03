import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { fetchAgileRates } from "@/lib/octopus-api";
import { Scale } from "lucide-react";

// Typical Octopus Flexible (variable) tariff – Region F, late 2025. User can override.
const DEFAULT_FLEX_UNIT_P = 24.5; // p/kWh
const DEFAULT_FLEX_STANDING_P = 63.0; // p/day
const DEFAULT_AGILE_STANDING_P = 47.0; // p/day (typical Agile)

interface Props {
  /** Daily kWh consumption assumption */
  defaultKwhPerDay?: number;
}

export default function TariffComparison({ defaultKwhPerDay = 10 }: Props) {
  const [kwh, setKwh] = useState(defaultKwhPerDay);
  const [flexUnit, setFlexUnit] = useState(DEFAULT_FLEX_UNIT_P);
  const [flexStanding, setFlexStanding] = useState(DEFAULT_FLEX_STANDING_P);
  const [agileStanding, setAgileStanding] = useState(DEFAULT_AGILE_STANDING_P);

  // Pull last 7 days of Agile rates to compute avg unit price
  const { data: rates, isLoading } = useQuery({
    queryKey: ["agile-7d-avg"],
    queryFn: async () => {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      return fetchAgileRates(undefined, from.toISOString(), to.toISOString());
    },
    staleTime: 60 * 60 * 1000,
  });

  const agileAvgP = useMemo(() => {
    if (!rates || rates.length === 0) return 22;
    return rates.reduce((s, r) => s + r.value_inc_vat, 0) / rates.length;
  }, [rates]);

  const data = useMemo(() => {
    const agileDay = (agileAvgP * kwh + agileStanding) / 100;
    const flexDay = (flexUnit * kwh + flexStanding) / 100;
    return [
      { name: "Agile", day: agileDay, month: agileDay * 30, year: agileDay * 365, fill: "hsl(var(--neon-cyan))" },
      { name: "Flexible", day: flexDay, month: flexDay * 30, year: flexDay * 365, fill: "hsl(var(--chart-warning))" },
    ];
  }, [agileAvgP, agileStanding, flexUnit, flexStanding, kwh]);

  const saving = data[1].year - data[0].year;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" /> Agile vs Flexible
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            Agile avg {isLoading ? "…" : `${agileAvgP.toFixed(1)}p`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px]">kWh / day</Label>
            <Input
              type="number"
              step="0.5"
              value={kwh}
              onChange={(e) => setKwh(parseFloat(e.target.value) || 0)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Flex unit (p/kWh)</Label>
            <Input
              type="number"
              step="0.1"
              value={flexUnit}
              onChange={(e) => setFlexUnit(parseFloat(e.target.value) || 0)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Flex standing (p/day)</Label>
            <Input
              type="number"
              step="0.1"
              value={flexStanding}
              onChange={(e) => setFlexStanding(parseFloat(e.target.value) || 0)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Agile standing (p/day)</Label>
            <Input
              type="number"
              step="0.1"
              value={agileStanding}
              onChange={(e) => setAgileStanding(parseFloat(e.target.value) || 0)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="h-44 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v) => `£${v.toFixed(2)}`}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  fontSize: 11,
                }}
                formatter={(v: number, n) => [`£${v.toFixed(2)}`, n === "day" ? "Per day" : n]}
              />
              <Bar dataKey="day" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
                <LabelList
                  dataKey="day"
                  position="top"
                  formatter={(v: number) => `£${v.toFixed(2)}`}
                  style={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {(["day", "month", "year"] as const).map((k) => {
            const a = data[0][k];
            const f = data[1][k];
            const diff = f - a;
            return (
              <div key={k} className="rounded-md border border-border bg-muted/40 p-2">
                <p className="text-[9px] uppercase text-muted-foreground">{k}</p>
                <p className="text-[10px]">A £{a.toFixed(2)}</p>
                <p className="text-[10px]">F £{f.toFixed(2)}</p>
                <p className={`text-[11px] font-semibold tabular-nums ${diff >= 0 ? "text-accent" : "text-destructive"}`}>
                  {diff >= 0 ? "−" : "+"}£{Math.abs(diff).toFixed(2)}
                </p>
              </div>
            );
          })}
        </div>
        {saving > 0 && (
          <p className="text-[11px] text-center text-muted-foreground">
            Estimated annual saving on Agile: <span className="text-accent font-semibold">£{saving.toFixed(2)}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

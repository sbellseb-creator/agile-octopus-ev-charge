import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { fetchAgileRates } from "@/lib/octopus-api";
import { Scale, Home } from "lucide-react";

// Octopus Flexible — North East (region F) defaults, Q4 2025/Q1 2026
const DEFAULT_FLEX_UNIT_P = 27.03;
const DEFAULT_FLEX_STANDING_P = 70.0;
const DEFAULT_AGILE_STANDING_P = 70.0;

const HOME_RATE_KEY = "home-charge-cost-p";
const FLEX_UNIT_KEY = "flex-unit-p";
const FLEX_STANDING_KEY = "flex-standing-p";
const AGILE_STANDING_KEY = "agile-standing-p";

function loadNum(key: string, fallback: number): number {
  const v = localStorage.getItem(key);
  const n = v ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function loadHomeRate(): number | null {
  const v = localStorage.getItem(HOME_RATE_KEY);
  const n = v ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

type RangeKey = "last7" | "last30" | string; // string = YYYY-MM

function buildRangeOptions(): { key: RangeKey; label: string; from: Date; to: Date }[] {
  const now = new Date();
  const opts: { key: RangeKey; label: string; from: Date; to: Date }[] = [
    { key: "last7", label: "Last 7 days", from: new Date(now.getTime() - 7 * 864e5), to: now },
    { key: "last30", label: "Last 30 days", from: new Date(now.getTime() - 30 * 864e5), to: now },
  ];
  // Months from Jan of current year up to current month
  const year = now.getFullYear();
  for (let m = 0; m <= now.getMonth(); m++) {
    const from = new Date(year, m, 1);
    const to = new Date(year, m + 1, 1);
    opts.push({
      key: `${year}-${String(m + 1).padStart(2, "0")}`,
      label: from.toLocaleString("en-GB", { month: "long", year: "numeric" }),
      from,
      to: to > now ? now : to,
    });
  }
  return opts.reverse();
}

export default function TariffComparison({ defaultKwhPerDay = 10 }: { defaultKwhPerDay?: number }) {
  const [kwh, setKwh] = useState(defaultKwhPerDay);
  const [flexUnit, setFlexUnit] = useState(() => loadNum(FLEX_UNIT_KEY, DEFAULT_FLEX_UNIT_P));
  const [flexStanding, setFlexStanding] = useState(() => loadNum(FLEX_STANDING_KEY, DEFAULT_FLEX_STANDING_P));
  const [agileStanding, setAgileStanding] = useState(() => loadNum(AGILE_STANDING_KEY, DEFAULT_AGILE_STANDING_P));
  const [unit, setUnit] = useState<"week" | "month" | "year">("month");
  const ranges = useMemo(buildRangeOptions, []);
  const [rangeKey, setRangeKey] = useState<RangeKey>("last30");
  const range = ranges.find((r) => r.key === rangeKey) ?? ranges[0];

  const [homeRate, setHomeRate] = useState<string>(() => {
    const v = loadHomeRate();
    return v !== null ? String(v) : "";
  });
  const homeRateNum = parseFloat(homeRate);
  const homeRateValid = Number.isFinite(homeRateNum) && homeRateNum >= 0;

  const { data: rates, isLoading } = useQuery({
    queryKey: ["agile-range", rangeKey],
    queryFn: () => fetchAgileRates(undefined, range.from.toISOString(), range.to.toISOString()),
    staleTime: 60 * 60 * 1000,
  });

  const agileAvgP = useMemo(() => {
    if (!rates || rates.length === 0) return 22;
    return rates.reduce((s, r) => s + r.value_inc_vat, 0) / rates.length;
  }, [rates]);

  const days = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 864e5));
  const multiplier = unit === "week" ? 7 : unit === "month" ? 30 : 365;
  const unitLabel = unit === "week" ? "/ week" : unit === "month" ? "/ month" : "/ year";

  const data = useMemo(() => {
    const agileDay = (agileAvgP * kwh + agileStanding) / 100;
    const flexDay = (flexUnit * kwh + flexStanding) / 100;
    const items = [
      { name: "Agile", cost: agileDay * multiplier, fill: "hsl(var(--neon-cyan))" },
      { name: "Flexible", cost: flexDay * multiplier, fill: "hsl(var(--chart-warning))" },
    ];
    if (homeRateValid) {
      const homeDay = (homeRateNum * kwh + agileStanding) / 100;
      items.push({ name: "Home", cost: homeDay * multiplier, fill: "hsl(var(--primary))" });
    }
    return items;
  }, [agileAvgP, agileStanding, flexUnit, flexStanding, kwh, multiplier, homeRateValid, homeRateNum]);

  const saving = data[1].cost - data[0].cost;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" /> Agile vs Flexible
          </CardTitle>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px]">Region F · NE</Badge>
            <Badge variant="outline" className="text-[10px]">
              Agile avg {isLoading ? "…" : `${agileAvgP.toFixed(1)}p`} · {days}d
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Period & range */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px]">Show as</Label>
            <Select value={unit} onValueChange={(v) => setUnit(v as "week" | "month" | "year")}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Per Week</SelectItem>
                <SelectItem value="month">Per Month</SelectItem>
                <SelectItem value="year">Per Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Agile data range</Label>
            <Select value={rangeKey} onValueChange={(v) => setRangeKey(v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ranges.map((r) => (
                  <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Home charge cost (highlighted) */}
        <div className="rounded-md border border-primary/40 bg-primary/10 p-2 space-y-1">
          <Label className="text-[10px] flex items-center gap-1 text-primary">
            <Home className="h-3 w-3" /> Home charge cost (p/kWh) — your actual rate
          </Label>
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.01"
              value={homeRate}
              onChange={(e) => {
                setHomeRate(e.target.value);
                if (e.target.value === "") localStorage.removeItem(HOME_RATE_KEY);
                else localStorage.setItem(HOME_RATE_KEY, e.target.value);
              }}
              placeholder={`e.g. ${agileAvgP.toFixed(1)}`}
              className="h-8 text-xs flex-1"
            />
            <button
              type="button"
              onClick={() => {
                const v = agileAvgP.toFixed(2);
                setHomeRate(v);
                localStorage.setItem(HOME_RATE_KEY, v);
              }}
              className="text-[10px] px-2 rounded border border-primary/40 text-primary hover:bg-primary/20"
            >
              Use Agile avg
            </button>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px]">kWh / day</Label>
            <Input type="number" step="0.5" value={kwh} onChange={(e) => setKwh(parseFloat(e.target.value) || 0)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Flex unit (p/kWh)</Label>
            <Input type="number" step="0.1" value={flexUnit} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setFlexUnit(v); localStorage.setItem(FLEX_UNIT_KEY, String(v)); }} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Flex standing (p/day)</Label>
            <Input type="number" step="0.1" value={flexStanding} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setFlexStanding(v); localStorage.setItem(FLEX_STANDING_KEY, String(v)); }} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Agile standing (p/day)</Label>
            <Input type="number" step="0.1" value={agileStanding} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setAgileStanding(v); localStorage.setItem(AGILE_STANDING_KEY, String(v)); }} className="h-8 text-xs" />
          </div>
        </div>

        <div className="h-44 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `£${v.toFixed(0)}`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                formatter={(v: number) => [`£${v.toFixed(2)}`, unitLabel.trim()]}
              />
              <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                {data.map((d) => <Cell key={d.name} fill={d.fill} />)}
                <LabelList dataKey="cost" position="top" formatter={(v: number) => `£${v.toFixed(2)}`} style={{ fontSize: 10, fill: "hsl(var(--foreground))" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={`grid gap-2 text-center ${data.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {data.map((d) => (
            <div
              key={d.name}
              className={`rounded-md border p-2 ${
                d.name === "Home"
                  ? "border-primary/40 bg-primary/10"
                  : "border-border bg-muted/40"
              }`}
            >
              <p className="text-[9px] uppercase text-muted-foreground">{d.name} {unitLabel}</p>
              <p className="text-sm font-bold tabular-nums">£{d.cost.toFixed(2)}</p>
            </div>
          ))}
        </div>
        {saving > 0 && (
          <p className="text-[11px] text-center text-muted-foreground">
            Agile saves <span className="text-accent font-semibold">£{saving.toFixed(2)}</span> vs Flexible {unitLabel}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

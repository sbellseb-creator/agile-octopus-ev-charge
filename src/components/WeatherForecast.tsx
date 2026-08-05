import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchWeatherForecast, weatherCodeToEmoji, weatherCodeToLabel, type AgileBaseline } from "@/lib/weather-api";
import { fetchAgileRates } from "@/lib/octopus-api";
import { getOctopusConfig } from "@/lib/octopus-config";
import { CloudSun, Wind, Sun, TrendingDown, TrendingUp, Minus, Loader2, Sparkles } from "lucide-react";
import { parseISO } from "date-fns";
import { formatUK } from "@/lib/timezone";

const UK_REGIONS = [
  { code: "A", label: "East Scotland" },
  { code: "B", label: "East England" },
  { code: "C", label: "South Wales" },
  { code: "D", label: "West Midlands" },
  { code: "E", label: "East Midlands" },
  { code: "F", label: "North East" },
  { code: "G", label: "North West" },
  { code: "H", label: "South West" },
  { code: "J", label: "South England" },
  { code: "K", label: "Yorkshire" },
  { code: "L", label: "Merseyside" },
  { code: "M", label: "South Scotland" },
  { code: "N", label: "Edinburgh" },
  { code: "P", label: "Lincolnshire" },
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

export default function WeatherForecast() {
  const initialOctopusConfig = useMemo(
    () => getOctopusConfig(),
    [],
  );

  const [region, setRegion] = useState(
    initialOctopusConfig.region,
  );

  const { data: baseline } = useQuery<AgileBaseline>({
    queryKey: ["agile-baseline", region],
    queryFn: async () => {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      try {
        const rates = await fetchAgileRates(undefined, from.toISOString(), to.toISOString(), region);
        if (!rates || rates.length === 0) throw new Error("no rates");
        const prices = rates.map(r => r.value_inc_vat).sort((a, b) => a - b);
        return {
          avg: prices.reduce((s, p) => s + p, 0) / prices.length,
          low: percentile(prices, 10),
          high: percentile(prices, 90),
          source: "live" as const,
        };
      } catch {
        return { avg: 18, low: 6, high: 35, source: "default" as const };
      }
    },
    staleTime: 60 * 60 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["weather-forecast", region, baseline?.source, baseline?.avg],
    queryFn: () => fetchWeatherForecast(region, baseline),
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    enabled: !!baseline,
  });

  const summary = useMemo(() => {
    if (!data?.daily || data.daily.length === 0) return null;
    const prices = data.daily.map(d => d.predicted_agile_avg);
    const cheapestIdx = prices.indexOf(Math.min(...prices));
    const priciestIdx = prices.indexOf(Math.max(...prices));
    const first = prices[0];
    const last = prices[prices.length - 1];
    const pctChange = first > 0 ? ((last - first) / first) * 100 : 0;
    const direction = pctChange > 2 ? "up" : pctChange < -2 ? "down" : "stable";
    return {
      cheapest: data.daily[cheapestIdx],
      priciest: data.daily[priciestIdx],
      direction,
      pct: Math.abs(pctChange),
      avgPrice: prices.reduce((s, p) => s + p, 0) / prices.length,
    };
  }, [data]);

  const maxPrice = useMemo(() => {
    if (!data?.daily) return 0;
    return Math.max(...data.daily.map(d => d.predicted_agile_high));
  }, [data]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <CloudSun className="h-5 w-5 text-primary shrink-0" />
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="flex-1 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UK_REGIONS.map((r) => (
              <SelectItem key={r.code} value={r.code} className="text-xs">
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
      {error && <p className="text-destructive text-sm">Failed to load weather data</p>}

      {data && summary && (
        <>
          {/* Headline summary */}
          <Card className="neon-border">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {summary.direction === "down" ? (
                    <TrendingDown className="h-4 w-4 text-chart-good shrink-0" />
                  ) : summary.direction === "up" ? (
                    <TrendingUp className="h-4 w-4 text-destructive shrink-0" />
                  ) : (
                    <Minus className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-xs font-medium truncate">
                    {summary.direction === "down" ? "Trending cheaper" : summary.direction === "up" ? "Trending pricier" : "Holding steady"}
                    {summary.direction !== "stable" && ` (${summary.pct.toFixed(0)}%)`}
                  </span>
                </div>
                {baseline && (
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 shrink-0 ${baseline.source === "live" ? "border-primary/50 text-primary" : "border-muted-foreground/40 text-muted-foreground"}`}>
                    {baseline.source === "live" ? `7d avg ${baseline.avg.toFixed(1)}p` : "Estimated"}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Sparkles className="h-3.5 w-3.5 text-chart-good shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Best day</p>
                    <p className="text-xs font-medium truncate">
                      {formatUK(parseISO(summary.cheapest.date), "EEE")} · {summary.cheapest.predicted_agile_avg.toFixed(1)}p
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <TrendingUp className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Avoid</p>
                    <p className="text-xs font-medium truncate">
                      {formatUK(parseISO(summary.priciest.date), "EEE")} · {summary.priciest.predicted_agile_avg.toFixed(1)}p
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Unified 5-day forecast */}
          <Card className="neon-border">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm">5-Day Forecast</CardTitle>
              <p className="text-[10px] text-muted-foreground">Weather + predicted Agile price (p/kWh)</p>
            </CardHeader>
            <CardContent className="p-2 space-y-1.5">
              {data.daily.map((d) => {
                const isCheapest = d.date === summary.cheapest.date;
                const isPriciest = d.date === summary.priciest.date;
                const pricePct = maxPrice > 0 ? (d.predicted_agile_avg / maxPrice) * 100 : 0;
                return (
                  <div
                    key={d.date}
                    className={`rounded-md p-2 text-xs transition-colors ${
                      isCheapest
                        ? "bg-chart-good/10 border border-chart-good/40"
                        : isPriciest
                        ? "bg-destructive/10 border border-destructive/30"
                        : "bg-secondary/50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl leading-none shrink-0" title={weatherCodeToLabel(d.weathercode)}>
                        {weatherCodeToEmoji(d.weathercode)}
                      </span>
                        <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <p className="font-semibold">{formatUK(parseISO(d.date), "EEE")}</p>
                          <p className="text-[10px] text-muted-foreground">{formatUK(parseISO(d.date), "dd MMM")}</p>
                          {isCheapest && <Badge className="ml-auto text-[8px] px-1 py-0 bg-chart-good/20 text-chart-good border-chart-good/40">Cheapest</Badge>}
                          {isPriciest && <Badge className="ml-auto text-[8px] px-1 py-0 bg-destructive/20 text-destructive border-destructive/40">Pricey</Badge>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                          <span>{Math.round(d.temp_min)}–{Math.round(d.temp_max)}°</span>
                          <span className="flex items-center gap-0.5"><Wind className="h-2.5 w-2.5" />{Math.round(d.windspeed_max)}</span>
                          <span className="flex items-center gap-0.5"><Sun className="h-2.5 w-2.5" />{d.sunshine_hours}h</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-mono font-bold text-sm ${isCheapest ? "text-chart-good" : isPriciest ? "text-destructive" : "text-primary"}`}>
                          {d.predicted_agile_avg.toFixed(1)}p
                        </p>
                        <p className="text-[9px] text-muted-foreground font-mono">
                          {d.predicted_agile_low.toFixed(0)}–{d.predicted_agile_high.toFixed(0)}p
                        </p>
                      </div>
                    </div>
                    {/* Price bar */}
                    <div className="mt-1.5 h-1 rounded-full bg-background/60 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isCheapest ? "bg-chart-good" : isPriciest ? "bg-destructive" : "bg-primary/60"}`}
                        style={{ width: `${pricePct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-[9px] text-muted-foreground text-center pt-1">
                Predictions blend your recent Agile baseline with wind, sun &amp; temperature.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

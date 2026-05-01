import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { fetchWeatherForecast, weatherCodeToEmoji, weatherCodeToLabel, type AgileBaseline } from "@/lib/weather-api";
import { fetchAgileRates } from "@/lib/octopus-api";
import { CloudSun, Wind, Sun, Thermometer, TrendingDown, TrendingUp, Loader2, Zap } from "lucide-react";
import { format, parseISO } from "date-fns";

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
  const [region, setRegion] = useState("F");

  // Fetch the last 7 days of actual Agile prices to anchor the prediction baseline
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

  const priceChartData = useMemo(() => {
    if (!data?.daily) return [];
    return data.daily.map((d) => ({
      day: format(parseISO(d.date), "EEE"),
      date: format(parseISO(d.date), "dd/MM"),
      avg: d.predicted_agile_avg,
      low: d.predicted_agile_low,
      high: d.predicted_agile_high,
    }));
  }, [data]);

  const weatherChartData = useMemo(() => {
    if (!data?.daily) return [];
    return data.daily.map((d) => ({
      day: format(parseISO(d.date), "EEE"),
      wind: d.windspeed_max,
      sun: d.sunshine_hours,
      tempMax: d.temp_max,
      tempMin: d.temp_min,
    }));
  }, [data]);

  const trend = useMemo(() => {
    if (!priceChartData.length || priceChartData.length < 2) return null;
    const first = priceChartData[0].avg;
    const last = priceChartData[priceChartData.length - 1].avg;
    const pctChange = ((last - first) / first) * 100;
    return { direction: pctChange > 2 ? "up" : pctChange < -2 ? "down" : "stable", pct: Math.abs(pctChange) };
  }, [priceChartData]);

  return (
    <div className="space-y-4">
      {/* Region selector */}
      <div className="flex items-center gap-2">
        <CloudSun className="h-5 w-5 text-primary" />
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="w-48 h-8 text-xs">
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

      {data && (
        <>
          {/* 5-day weather cards */}
          <div className="grid grid-cols-5 gap-1.5">
            {data.daily.map((d) => (
              <Card key={d.date} className="neon-border">
                <CardContent className="p-2 text-center space-y-0.5">
                  <p className="text-[10px] text-muted-foreground font-medium">
                    {format(parseISO(d.date), "EEE")}
                  </p>
                  <p className="text-lg leading-none">{weatherCodeToEmoji(d.weathercode)}</p>
                  <p className="text-[9px] text-muted-foreground">{weatherCodeToLabel(d.weathercode)}</p>
                  <div className="flex items-center justify-center gap-1 text-[10px]">
                    <span className="text-foreground font-medium">{Math.round(d.temp_max)}°</span>
                    <span className="text-muted-foreground">{Math.round(d.temp_min)}°</span>
                  </div>
                  <div className="flex items-center justify-center gap-0.5 text-[9px] text-muted-foreground">
                    <Wind className="h-2.5 w-2.5" />
                    {Math.round(d.windspeed_max)}
                  </div>
                  <div className="flex items-center justify-center gap-0.5 text-[9px] text-muted-foreground">
                    <Sun className="h-2.5 w-2.5" />
                    {d.sunshine_hours}h
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Trend indicator */}
          {trend && (
            <Card className="neon-border">
              <CardContent className="flex items-center gap-2 p-3">
                {trend.direction === "down" ? (
                  <TrendingDown className="h-5 w-5 text-chart-good" />
                ) : trend.direction === "up" ? (
                  <TrendingUp className="h-5 w-5 text-destructive" />
                ) : (
                  <Thermometer className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {trend.direction === "down"
                      ? "Prices predicted to drop"
                      : trend.direction === "up"
                      ? "Prices predicted to rise"
                      : "Prices predicted to stay stable"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ~{trend.pct.toFixed(1)}% {trend.direction === "stable" ? "change" : trend.direction} over 5 days based on weather
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Predicted Agile Price Chart */}
          <Card className="neon-border">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-primary" />
                Predicted Agile Prices (p/kWh)
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">Based on wind, solar & temperature forecasts</p>
            </CardHeader>
            <CardContent className="p-2">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={priceChartData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={30} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      formatter={(value: number, name: string) => [
                        `${value.toFixed(1)}p`,
                        name === "avg" ? "Average" : name === "low" ? "Low" : "High",
                      ]}
                      labelFormatter={(label, payload) => {
                        const item = payload?.[0]?.payload;
                        return item ? `${label} ${item.date}` : label;
                      }}
                    />
                    <Bar dataKey="low" fill="hsl(var(--chart-good))" radius={[2, 2, 0, 0]} name="low" />
                    <Bar dataKey="avg" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} name="avg" />
                    <Bar dataKey="high" fill="hsl(var(--chart-danger))" radius={[2, 2, 0, 0]} name="high" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-3 mt-1 text-[10px]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm" style={{ background: "hsl(var(--chart-good))" }} />
                  Low
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm" style={{ background: "hsl(var(--primary))" }} />
                  Avg
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm" style={{ background: "hsl(var(--chart-danger))" }} />
                  High
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Weather factors chart */}
          <Card className="neon-border">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <CloudSun className="h-4 w-4 text-neon-cyan" />
                Weather Factors
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">Wind speed (km/h) • Sunshine (hrs) • Temperature (°C)</p>
            </CardHeader>
            <CardContent className="p-2">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weatherChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={30} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                    />
                    <Line type="monotone" dataKey="wind" stroke="hsl(var(--neon-cyan))" strokeWidth={2} dot={{ r: 3 }} name="Wind (km/h)" />
                    <Line type="monotone" dataKey="sun" stroke="hsl(var(--neon-yellow))" strokeWidth={2} dot={{ r: 3 }} name="Sun (hrs)" />
                    <Line type="monotone" dataKey="tempMax" stroke="hsl(var(--chart-danger))" strokeWidth={2} dot={{ r: 3 }} name="Max Temp °C" />
                    <Line type="monotone" dataKey="tempMin" stroke="hsl(var(--neon-blue))" strokeWidth={2} dot={{ r: 3 }} name="Min Temp °C" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-1 text-[10px]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--neon-cyan))" }} /> Wind
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--neon-yellow))" }} /> Sun
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--chart-danger))" }} /> Max°C
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--neon-blue))" }} /> Min°C
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Daily breakdown table */}
          <Card className="neon-border">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm">5-Day Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="space-y-1.5">
                {data.daily.map((d) => (
                  <div key={d.date} className="flex items-center gap-2 p-2 rounded-md bg-secondary/50 text-xs">
                    <span className="text-base">{weatherCodeToEmoji(d.weathercode)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{format(parseISO(d.date), "EEE dd MMM")}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {Math.round(d.temp_min)}–{Math.round(d.temp_max)}°C • Wind {Math.round(d.windspeed_max)}km/h • Sun {d.sunshine_hours}h
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-medium text-primary">{d.predicted_agile_avg.toFixed(1)}p</p>
                      <p className="text-[9px] text-muted-foreground">
                        {d.predicted_agile_low.toFixed(1)}–{d.predicted_agile_high.toFixed(1)}p
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}


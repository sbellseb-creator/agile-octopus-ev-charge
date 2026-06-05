import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchTrackerRates } from "@/lib/octopus-api";
import { Loader2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { format, subDays, addDays, startOfDay } from "date-fns";

type Period = "week" | "month" | "year";
const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, year: 365 };

function priceColorClass(p: number): string {
  if (p < 10) return "text-[hsl(var(--neon-green))]";
  if (p < 15) return "text-[hsl(var(--neon-cyan))]";
  if (p < 20) return "text-chart-good";
  if (p < 30) return "text-chart-warning";
  return "text-chart-danger";
}

function changeBgClass(pct: number): string {
  if (pct < -5) return "bg-[hsl(var(--neon-green)/0.15)]";
  if (pct < 0) return "bg-chart-good/10";
  if (pct === 0) return "bg-muted/30";
  if (pct < 5) return "bg-chart-warning/10";
  return "bg-chart-danger/10";
}

function changeTextClass(pct: number): string {
  if (pct < 0) return "text-[hsl(var(--neon-green))]";
  if (pct === 0) return "text-muted-foreground";
  return "text-chart-danger";
}

export default function TrackerRates() {
  const now = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState<Period>("week");

  const periodFrom = useMemo(() => {
    const d = subDays(startOfDay(now), PERIOD_DAYS[period]);
    return d.toISOString();
  }, [now, period]);

  const periodTo = useMemo(() => {
    const d = addDays(startOfDay(now), 2);
    return d.toISOString();
  }, [now]);

  const { data: rates, isLoading, error } = useQuery({
    queryKey: ["tracker-rates", periodFrom, periodTo],
    queryFn: () => fetchTrackerRates("SILVER-24-10-01", "F", periodFrom, periodTo),
    refetchInterval: 60 * 60 * 1000,
    retry: 2,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const dailyRates = useMemo(() => {
    if (!rates || rates.length === 0) return [];

    // Group by date and average the rate (tracker is daily but API may return multiple slots)
    const byDate = new Map<string, number[]>();
    for (const r of rates) {
      const dateKey = format(new Date(r.valid_from), "yyyy-MM-dd");
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey)!.push(r.value_inc_vat);
    }

    const entries = Array.from(byDate.entries())
      .map(([date, prices]) => ({
        date,
        price: prices.reduce((a, b) => a + b, 0) / prices.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return entries;
  }, [rates]);

  const todayStr = format(now, "yyyy-MM-dd");
  const tomorrowStr = format(addDays(now, 1), "yyyy-MM-dd");

  const todayRate = dailyRates.find(r => r.date === todayStr);
  const tomorrowRate = dailyRates.find(r => r.date === tomorrowStr);

  const pctChange = todayRate && tomorrowRate
    ? ((tomorrowRate.price - todayRate.price) / todayRate.price) * 100
    : null;

  return (
    <div className="space-y-4">
      {/* Today / Tomorrow highlight */}
      <div className="grid gap-4 grid-cols-2">
        <Card className="neon-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Today</p>
            <p className={`text-2xl font-bold ${todayRate ? priceColorClass(todayRate.price) : ""}`}>
              {todayRate ? `${todayRate.price.toFixed(2)}p` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">per kWh (inc VAT)</p>
          </CardContent>
        </Card>
        <Card className="neon-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Tomorrow</p>
            <p className={`text-2xl font-bold ${tomorrowRate ? priceColorClass(tomorrowRate.price) : ""}`}>
              {tomorrowRate ? `${tomorrowRate.price.toFixed(2)}p` : "—"}
            </p>
            {pctChange !== null && (
              <div className={`flex items-center gap-1 mt-1 ${changeTextClass(pctChange)}`}>
                {pctChange < 0 ? <TrendingDown className="h-3 w-3" /> : pctChange > 0 ? <TrendingUp className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                <span className="text-xs font-medium">
                  {pctChange > 0 ? "Up" : pctChange < 0 ? "Down" : ""} {Math.abs(pctChange).toFixed(2)}%
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <p className="text-destructive text-sm py-4 text-center">
          Failed to load Tracker rates.
        </p>
      )}

      {/* 7-day history */}
      {!isLoading && !error && dailyRates.length > 0 && (
        <Card className="neon-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm sm:text-lg">
              Tracker Price History
              <span className="text-[10px] sm:text-xs text-muted-foreground font-normal ml-2">
                SILVER-24-10-01 · North East
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {dailyRates.map((entry, i) => {
              const prevEntry = i > 0 ? dailyRates[i - 1] : null;
              const dayChange = prevEntry
                ? ((entry.price - prevEntry.price) / prevEntry.price) * 100
                : null;

              const isToday = entry.date === todayStr;
              const isTomorrow = entry.date === tomorrowStr;
              const dateLabel = format(new Date(entry.date + "T00:00:00"), "EEE dd MMM");

              return (
                <div
                  key={entry.date}
                  className={`flex items-center justify-between rounded-md px-3 py-2.5 text-sm transition-colors ${
                    isToday
                      ? "bg-primary/15 border border-primary/40"
                      : isTomorrow
                        ? "bg-accent/15 border border-accent/40"
                        : i % 2 === 0
                          ? "bg-muted/30"
                          : ""
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-muted-foreground w-[100px] shrink-0">
                      {dateLabel}
                    </span>
                    {isToday && (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">TODAY</Badge>
                    )}
                    {isTomorrow && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 border-accent/40 text-accent-foreground">TMW</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {dayChange !== null && (
                      <span className={`text-[10px] font-medium flex items-center gap-0.5 ${changeTextClass(dayChange)}`}>
                        {dayChange < 0 ? <TrendingDown className="h-2.5 w-2.5" /> : dayChange > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : null}
                        {dayChange !== 0 ? `${Math.abs(dayChange).toFixed(1)}%` : "—"}
                      </span>
                    )}
                    <span className={`font-bold tabular-nums min-w-[60px] text-right ${priceColorClass(entry.price)}`}>
                      {entry.price.toFixed(2)}p
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchOfficialRates, fetchWholesale } from "@/lib/agileForecastApi";
import {
  buildEstimate, buildOfficial, cheapestSlot, cheapestWindow, generateDaySlots, hasFullData,
  tomorrowKey, ukMidnightUtc, loadCachedSlots, saveCachedSlots, addDaysToDateKey, CHEAP_WINDOW_SLOTS, type PricedSlot,
  isPastPublishTime, RETRY_INTERVAL_MS, BAND_COLOURS, BAND_LABELS, dayThresholds, priceBand, type PriceBand,
} from "@/lib/agileForecast";

const fmt = (p: number | null) => (p === null ? "–" : p.toFixed(2));

export default function AgileCrystalBall() {
  // Europe/London clock, re-evaluated every minute so day rollover and the ~11:00 publish check stay correct.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  const dateKey = tomorrowKey(now);
  const published = isPastPublishTime(now);
  const fromIso = useMemo(() => ukMidnightUtc(dateKey).toISOString(), [dateKey]);
  const toIso = useMemo(() => ukMidnightUtc(addDaysToDateKey(dateKey, 1)).toISOString(), [dateKey]);

  // One request for the whole day; retried every few minutes only while the full day is not yet available.
  const wholesale = useQuery({
    queryKey: ["acb-wholesale", dateKey],
    queryFn: () => fetchWholesale(dateKey),
    enabled: published,
    retry: 1,
    staleTime: (q) => (q.state.data && hasFullData(buildEstimate(dateKey, q.state.data.points)) ? Infinity : 0),
    refetchInterval: (q) => (q.state.data && hasFullData(buildEstimate(dateKey, q.state.data.points)) ? false : RETRY_INTERVAL_MS),
    refetchOnWindowFocus: false,
  });
  const official = useQuery({
    queryKey: ["acb-official", dateKey],
    queryFn: () => fetchOfficialRates(fromIso, toIso),
    enabled: published,
    retry: 1,
    staleTime: 10 * 60 * 1000,
    refetchInterval: (q) => (q.state.data && hasFullData(buildOfficial(dateKey, q.state.data)) ? false : RETRY_INTERVAL_MS),
    refetchOnWindowFocus: false,
  });

  // Only complete days are shown: partial or stale data is never rendered.
  const { slots, source } = useMemo(() => {
    const est = buildEstimate(dateKey, wholesale.data?.points ?? []);
    if (hasFullData(est)) return { slots: est, source: "estimate" as const };
    const cached = loadCachedSlots(dateKey);
    if (cached && hasFullData(cached)) return { slots: cached, source: "estimate" as const };
    const off = buildOfficial(dateKey, official.data ?? []);
    if (hasFullData(off)) return { slots: off, source: "official" as const };
    return { slots: generateDaySlots(dateKey).map((s): PricedSlot => ({ ...s, price: null, isNegative: false })), source: "none" as const };
  }, [dateKey, official.data, wholesale.data]);

  useEffect(() => {
    if (source === "estimate" && wholesale.data && hasFullData(slots)) saveCachedSlots(dateKey, slots);
  }, [source, slots, dateKey, wholesale.data]);

  const cheapest = cheapestSlot(slots);
  const window = cheapestWindow(slots, CHEAP_WINDOW_SLOTS);
  const inWindow = (i: number) => !!window && i >= window.startIndex && i < window.startIndex + window.length;
  const loading = published && wholesale.isLoading && official.isLoading && source === "none";
  const bothFailed = published && wholesale.isError && official.isError;
  const chartData = slots.map((s, i) => ({ label: s.label, price: s.price, i }));

  const thresholds = useMemo(() => dayThresholds(slots), [slots]);
  const band = (s: PricedSlot, i: number): PriceBand => priceBand(s, thresholds, inWindow(i));
  const colour = (s: PricedSlot, i: number) => BAND_COLOURS[band(s, i)];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Agile Crystal Ball – {dateKey} (region F)</CardTitle>
          {source === "official" && <Badge className="bg-emerald-500/20 text-emerald-300">Official Octopus Rates</Badge>}
          {source === "estimate" && <Badge className="bg-amber-500/20 text-amber-300">Estimated from Wholesale Auctions</Badge>}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading prices…</div>}
          {bothFailed && <p className="text-chart-danger">Could not load prices. Please try again later.</p>}
          {!loading && !bothFailed && source === "none" && (
            <p className="text-muted-foreground">
              {published
                ? "Tomorrow's prices are not available yet. Checking again every 5 minutes until the full day is published (official Octopus rates follow at about 16:00)."
                : "Prices for tomorrow are published around 11:00 (UK time). Check back then."}
            </p>
          )}
          {!loading && published && source === "none" && (
            <ul className="text-xs text-muted-foreground list-disc pl-4">
              {(wholesale.data?.attempts ?? []).map((a) => <li key={a.source}>{a.source}: {a.detail}</li>)}
              {wholesale.isError && <li>Wholesale lookup failed: {String((wholesale.error as Error)?.message ?? "unknown error")}</li>}
              <li>Official Octopus rates: {official.isError ? `request failed: ${String((official.error as Error)?.message ?? "unknown")}` : "not published yet"}</li>
            </ul>
          )}
          {source !== "none" && (
            <div className="flex flex-wrap gap-2 text-xs">
              {cheapest && <Badge variant="outline">Cheapest slot: {cheapest.label} @ {fmt(cheapest.price)}p</Badge>}
              {window && (
                <Badge variant="outline">
                  Cheapest {CHEAP_WINDOW_SLOTS / 2}h: {slots[window.startIndex].label}–{slots[window.startIndex + window.length - 1].label} (avg {fmt(window.average)}p)
                </Badge>
              )}
              {slots.some((s) => s.isNegative) && <Badge className="bg-cyan-500/20 text-cyan-300">Negative/plunge prices</Badge>}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Estimates are derived from day-ahead wholesale prices using an approximation of the Agile formula and may
            differ from the official Octopus rates.
          </p>
        </CardContent>
      </Card>

      {source !== "none" && (
        <>
          <Card>
            <CardContent className="h-64 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="label" interval={5} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} unit="p" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.2)", color: "#ffffff" }}
                    cursor={{ fill: "rgba(255,255,255,0.08)" }}
                    labelStyle={{ color: "#ffffff" }}
                    itemStyle={{ color: "#ffffff" }}
                    formatter={(v: number | null) => [v === null || v === undefined ? "–" : `${Number(v).toFixed(2)}p/kWh`, "Price"]}
                  />
                  <Bar dataKey="price">
                    {slots.map((s, i) => <Cell key={s.start} fill={colour(s, i)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap gap-x-4 gap-y-1 pt-4 text-xs text-foreground">
              {(Object.keys(BAND_LABELS) as PriceBand[]).map((b) => (
                <span key={b} className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: BAND_COLOURS[b] }} />
                  {BAND_LABELS[b]}
                </span>
              ))}
              <span className="w-full text-muted-foreground">
                Colours are relative to this day's prices (33rd / 67th percentile
                {thresholds ? `: below ${fmt(thresholds.low)}p low, ${fmt(thresholds.high)}p and above high` : ""}).
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="max-h-96 overflow-y-auto pt-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground"><th className="py-1">Time</th><th>p/kWh inc VAT</th><th /></tr>
                </thead>
                <tbody>
                  {slots.map((s, i) => (
                    <tr key={s.start} className={`border-t border-white/5 ${inWindow(i) ? "bg-emerald-500/10" : ""} ${s.isNegative ? "bg-cyan-500/10" : ""}`}>
                      <td className="py-1"><span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: colour(s, i) }} />{s.label}</td>
                      <td className={s.isNegative ? "text-cyan-300" : ""}>{fmt(s.price)}</td>
                      <td className="text-[10px]">
                        {s.isNegative && <span className="text-cyan-300">Plunge ≤ 0p </span>}
                        {cheapest && cheapest.start === s.start && <span className="text-emerald-300">Cheapest</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

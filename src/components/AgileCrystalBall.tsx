import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchOfficialRates, fetchWholesale } from "@/lib/agileForecastApi";
import {
  buildEstimate, buildOfficial, cheapestSlot, cheapestWindow, generateDaySlots, hasFullData,
  targetDayKey, ukMidnightUtc, loadCachedSlots, saveCachedSlots, addDaysToDateKey, CHEAP_WINDOW_SLOTS, type PricedSlot,
} from "@/lib/agileForecast";

const fmt = (p: number | null) => (p === null ? "–" : p.toFixed(2));

export default function AgileCrystalBall() {
  const dateKey = useMemo(() => targetDayKey(), []);
  const fromIso = useMemo(() => ukMidnightUtc(dateKey).toISOString(), [dateKey]);
  const toIso = useMemo(() => ukMidnightUtc(addDaysToDateKey(dateKey, 1)).toISOString(), [dateKey]);
  const opts = { retry: 1, staleTime: 10 * 60 * 1000, refetchInterval: 15 * 60 * 1000, refetchOnWindowFocus: false };

  const wholesale = useQuery({ queryKey: ["acb-wholesale", dateKey], queryFn: () => fetchWholesale(dateKey, fromIso, toIso), ...opts });
  const official = useQuery({ queryKey: ["acb-official", dateKey], queryFn: () => fetchOfficialRates(fromIso, toIso), ...opts });

  const { slots, source } = useMemo(() => {
    const est = buildEstimate(dateKey, wholesale.data?.points ?? []);
    if (est.some((s) => s.price !== null)) return { slots: est, source: "estimate" as const };
    const cached = wholesale.data ? null : loadCachedSlots(dateKey);
    if (cached) return { slots: cached, source: "estimate" as const };
    const off = buildOfficial(dateKey, official.data ?? []);
    if (hasFullData(off)) return { slots: off, source: "official" as const };
    return { slots: generateDaySlots(dateKey).map((s): PricedSlot => ({ ...s, price: null, isNegative: false })), source: "none" as const };
  }, [dateKey, official.data, wholesale.data]);

  useEffect(() => {
    if (source === "estimate" && wholesale.data?.points.length) saveCachedSlots(dateKey, slots);
  }, [source, slots, dateKey, wholesale.data]);

  const cheapest = cheapestSlot(slots);
  const window = cheapestWindow(slots, CHEAP_WINDOW_SLOTS);
  const inWindow = (i: number) => !!window && i >= window.startIndex && i < window.startIndex + window.length;
  const loading = wholesale.isLoading && official.isLoading && source === "none";
  const bothFailed = wholesale.isError && official.isError;
  const chartData = slots.map((s, i) => ({ label: s.label, price: s.price, i }));

  const colour = (s: PricedSlot, i: number) =>
    s.isNegative ? "#22d3ee" : inWindow(i) ? "#4ade80" : s.price !== null && s.price > 30 ? "#f87171" : "#a78bfa";

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
              Auction results for this day are not available yet. Day-ahead results are typically published around
              midday UK time and official Octopus rates at about 16:00 – check back then.
            </p>
          )}
          {!loading && source === "none" && (
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
            <CardContent className="max-h-96 overflow-y-auto pt-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground"><th className="py-1">Time</th><th>p/kWh inc VAT</th><th /></tr>
                </thead>
                <tbody>
                  {slots.map((s, i) => (
                    <tr key={s.start} className={`border-t border-white/5 ${inWindow(i) ? "bg-emerald-500/10" : ""} ${s.isNegative ? "bg-cyan-500/10" : ""}`}>
                      <td className="py-1">{s.label}</td>
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

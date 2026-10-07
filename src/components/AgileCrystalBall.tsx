import { useEffect, useMemo, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRICE_BAND_ORDER, priceBand } from "@/lib/priceBands";
import { fetchMidFallback, fetchNordPool, fetchOfficialRates } from "@/lib/agileForecastApi";
import {
  chooseSlots, cheapestSlot, cheapestWindow, cacheKey, purgeLegacyCaches,
  targetDayKey, ukMidnightUtc, loadCachedSlots, saveCachedSlots, addDaysToDateKey, CHEAP_WINDOW_SLOTS, type PricedSlot,
} from "@/lib/agileForecast";

const sourceNote: Record<string, string> = {
  nordpool: "Nord Pool GB half-hour auction",
  cache: "last saved Nord Pool prices (cached)",
  mid: "Elexon market index (MID) fallback",
};

const fmt = (p: number | null) => (p === null ? "–" : p.toFixed(2));

export default function AgileCrystalBall() {
  const dateKey = useMemo(() => targetDayKey(), []);
  const fromIso = useMemo(() => ukMidnightUtc(dateKey).toISOString(), [dateKey]);
  const toIso = useMemo(() => ukMidnightUtc(addDaysToDateKey(dateKey, 1)).toISOString(), [dateKey]);
  const opts = { retry: 1, staleTime: 10 * 60 * 1000, refetchInterval: 15 * 60 * 1000, refetchOnWindowFocus: false };

  const nordPool = useQuery({ queryKey: ["acb-nordpool", dateKey], queryFn: () => fetchNordPool(dateKey), ...opts });
  const nordPoolFailed = !nordPool.isLoading && !nordPool.data?.points.length;
  const mid = useQuery({
    queryKey: ["acb-mid", dateKey], queryFn: () => fetchMidFallback(fromIso, toIso), ...opts, enabled: nordPoolFailed,
  });
  const official = useQuery({ queryKey: ["acb-official", dateKey], queryFn: () => fetchOfficialRates(fromIso, toIso), ...opts });

  useEffect(() => purgeLegacyCaches(), []);

  const { slots, source, partial } = useMemo(
    () => chooseSlots(dateKey, {
      nordPool: nordPool.data?.points,
      cached: loadCachedSlots(dateKey, undefined, Date.now(), true),
      mid: mid.data?.points,
      official: official.data,
    }),
    [dateKey, nordPool.data, mid.data, official.data],
  );

  useEffect(() => {
    if (source === "nordpool") saveCachedSlots(dateKey, slots);
  }, [source, slots, dateKey]);

  const cheapest = cheapestSlot(slots);
  const window = cheapestWindow(slots, CHEAP_WINDOW_SLOTS);
  const inWindow = (i: number) => !!window && i >= window.startIndex && i < window.startIndex + window.length;
  const loading = (nordPool.isLoading || mid.isLoading || official.isLoading) && source === "none";
  const bothFailed = nordPool.isError && mid.isError && official.isError;
  const chartData = slots.map((s, i) => ({ label: s.label, price: s.price, i }));

  const colour = (s: PricedSlot) => (s.price === null ? "#64748b" : priceBand(s.price).colour);
  const rowVars = { "--r1": slots.length, "--r2": Math.ceil(slots.length / 2), "--r4": Math.ceil(slots.length / 4) } as CSSProperties;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Agile Crystal Ball – {dateKey} (region F)</CardTitle>
          {source === "official" && <Badge className="bg-emerald-500/20 text-emerald-300">Official Octopus Rates</Badge>}
          {source !== "official" && source !== "none" && <Badge className="bg-amber-500/20 text-amber-300">Estimated from Wholesale Auctions</Badge>}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading prices…</div>}
          {bothFailed && <p className="text-chart-danger">Could not load prices. Please try again later.</p>}
          {!loading && source === "none" && partial && (
            <p className="text-chart-danger">Incomplete data: only part of the day was returned, so no prices are shown.</p>
          )}
          {!loading && !bothFailed && source === "none" && !partial && (
            <p className="text-muted-foreground">
              Auction results for this day are not available yet. Day-ahead results are typically published around
              midday UK time and official Octopus rates at about 16:00 – check back then.
            </p>
          )}
          {!loading && source === "none" && (
            <ul className="text-xs text-muted-foreground list-disc pl-4">
              {[...(nordPool.data?.attempts ?? []), ...(mid.data?.attempts ?? [])].map((a) => <li key={a.source}>{a.source}: {a.detail}</li>)}
              <li>Official Octopus rates: {official.isError ? `request failed: ${String((official.error as Error)?.message ?? "unknown")}` : "not published yet"}</li>
            </ul>
          )}
          {source !== "none" && source !== "official" && (
            <p className="text-xs text-muted-foreground">
              Source: {sourceNote[source]} [{source === "cache" ? cacheKey(dateKey) : source}]
              {source !== "nordpool" && nordPoolFailed ? " (Nord Pool unavailable)" : ""}
            </p>
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
            <CardContent className="pt-4"><div className="h-64">
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
                    {slots.map((s, i) => (
                      <Cell key={s.start} fill={colour(s)} stroke={inWindow(i) ? "#ffffff" : "none"} strokeWidth={inWindow(i) ? 1.5 : 0} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Price key">
                {PRICE_BAND_ORDER.map((b) => (
                  <span key={b.id} className="flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: b.colour }} />
                    <span style={{ color: b.colour }}>{b.label}</span>: {b.range}
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm border border-white" /> Cheapest {CHEAP_WINDOW_SLOTS / 2}h window
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="mb-1 flex justify-between border-b border-white/10 pb-1 text-xs text-muted-foreground">
                <span>Time</span><span>p/kWh inc VAT</span>
              </div>
              <div
                className="grid grid-flow-col grid-rows-[repeat(var(--r1),auto)] gap-x-6 text-xs sm:grid-rows-[repeat(var(--r2),auto)] lg:grid-rows-[repeat(var(--r4),auto)]"
                style={rowVars}
              >
                {slots.map((s, i) => {
                  const c = colour(s);
                  return (
                    <div
                      key={s.start}
                      className={`flex items-center justify-between border-b border-white/5 border-l-4 px-1 py-1 ${inWindow(i) ? "bg-emerald-500/10" : ""}`}
                      style={{ borderLeftColor: c }}
                    >
                      <span>{s.label}</span>
                      <span className="flex items-center gap-1">
                        {s.isNegative && <span className="text-[10px]" style={{ color: c }}>Negative</span>}
                        {cheapest && cheapest.start === s.start && <span className="text-[10px] text-emerald-300">Cheapest</span>}
                        {s.price === null ? <span className="text-muted-foreground">–</span> : <span className="font-medium" style={{ color: c }}>{fmt(s.price)}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

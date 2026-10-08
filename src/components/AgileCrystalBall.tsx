import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { Loader2, Zap, AlertCircle } from "lucide-react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  priceBand,
} from "@/lib/priceBands";
import {
  fetchDayAhead,
  fetchMidFallback,
  fetchOfficialRates,
} from "@/lib/agileForecastApi";
import {
  chooseSlots,
  cheapestWindow,
  purgeLegacyCaches,
  targetDayKey,
  ukMidnightUtc,
  loadCachedSlots,
  saveCachedSlots,
  addDaysToDateKey,
  type PricedSlot,
} from "@/lib/agileForecast";

const PRICE_CAP_RATE = 26.11; // Standard variable price cap reference (p/kWh)

const fmt = (p: number | null | undefined) => (p == null ? "–" : p.toFixed(2));

export default function AgileCrystalBall() {
  const [activeTab, setActiveTab] = useState<"today" | "tomorrow">("today");

  // Determine dateKey dynamically: Today vs Tomorrow
  const dateKey = useMemo(() => {
    const todayKey = targetDayKey();
    return activeTab === "tomorrow" ? addDaysToDateKey(todayKey, 1) : todayKey;
  }, [activeTab]);

  const fromIso = useMemo(() => ukMidnightUtc(dateKey).toISOString(), [dateKey]);
  const toIso = useMemo(() => ukMidnightUtc(addDaysToDateKey(dateKey, 1)).toISOString(), [dateKey]);

  const opts = {
    retry: 2,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  };

  // Official Octopus Rates (Primary for Today, Fallback/Confirmation for Tomorrow)
  const official = useQuery({
    queryKey: ["acb-official", dateKey],
    queryFn: () => fetchOfficialRates(fromIso, toIso),
    ...opts,
  });

  // Day-Ahead Wholesale (Only required for Tomorrow's predictions)
  const nordPool = useQuery({
    queryKey: ["acb-nordpool", dateKey],
    queryFn: () => fetchDayAhead(dateKey),
    ...opts,
    enabled: activeTab === "tomorrow",
  });

  const nordPoolFailed = !nordPool.isLoading && !nordPool.data?.points?.length;

  const mid = useQuery({
    queryKey: ["acb-mid", dateKey],
    queryFn: () => fetchMidFallback(fromIso, toIso),
    ...opts,
    enabled: activeTab === "tomorrow" && nordPoolFailed,
  });

  useEffect(() => {
    purgeLegacyCaches();
  }, []);

  // Format slots depending on activeTab
  const { slots, source } = useMemo(() => {
    if (activeTab === "today" && official.data && official.data.length > 0) {
      return {
        slots: official.data,
        source: "official",
        partial: false,
      };
    }

    return chooseSlots(dateKey, {
      nordPool: nordPool.data?.points,
      cached: loadCachedSlots(dateKey, undefined, Date.now(), true),
      mid: mid.data?.points,
      official: official.data,
    });
  }, [activeTab, dateKey, official.data, nordPool.data, mid.data]);

  useEffect(() => {
    if (source === "nordpool" && slots.length === 48) {
      saveCachedSlots(dateKey, slots);
    }
  }, [source, slots, dateKey]);

  // Summary Metrics
  const stats = useMemo(() => {
    if (!slots || slots.length === 0) return null;
    const validPrices = slots.map((s) => s.price).filter((p): p is number => p !== null);
    if (validPrices.length === 0) return null;

    const minSlot = slots.reduce((prev, curr) =>
      curr.price !== null && (prev.price === null || curr.price < prev.price) ? curr : prev
    );
    const maxSlot = slots.reduce((prev, curr) =>
      curr.price !== null && (prev.price === null || curr.price > prev.price) ? curr : prev
    );
    const avg = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
    const vsCapPct = Math.round(((avg - PRICE_CAP_RATE) / PRICE_CAP_RATE) * 100);

    const win1h = cheapestWindow(slots, 2);
    const win2h = cheapestWindow(slots, 4);
    const win3h = cheapestWindow(slots, 6);
    const win4h = cheapestWindow(slots, 8);

    return { minSlot, maxSlot, avg, vsCapPct, win1h, win2h, win3h, win4h };
  }, [slots]);

  // Groupings for Half-Hourly Grid
  const groupedSlots = useMemo(() => {
    const morning: PricedSlot[] = [];
    const afternoon: PricedSlot[] = [];
    const peak: PricedSlot[] = [];
    const evening: PricedSlot[] = [];

    slots.forEach((s) => {
      const hour = parseInt(s.label.split(":")[0], 10);
      if (hour >= 0 && hour < 12) morning.push(s);
      else if (hour >= 12 && hour < 16) afternoon.push(s);
      else if (hour >= 16 && hour < 19) peak.push(s);
      else evening.push(s);
    });

    return { morning, afternoon, peak, evening };
  }, [slots]);

  const loading =
    activeTab === "today"
      ? official.isLoading
      : (nordPool.isLoading || mid.isLoading || official.isLoading) && source === "none";

  return (
    <div className="space-y-6 text-slate-100">
      {/* Top View Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={activeTab === "today" ? "default" : "outline"}
            onClick={() => setActiveTab("today")}
            className="rounded-lg text-xs"
          >
            Today's Rates
          </Button>
          <Button
            size="sm"
            variant={activeTab === "tomorrow" ? "default" : "outline"}
            onClick={() => setActiveTab("tomorrow")}
            className="rounded-lg text-xs"
          >
            Tomorrow's Predictions
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Region: <strong className="text-white">North Eastern England (F)</strong></span>
          {source === "official" && <Badge className="bg-emerald-500/20 text-emerald-300">Official Octopus Rates</Badge>}
          {source !== "official" && source !== "none" && <Badge className="bg-amber-500/20 text-amber-300">Wholesale Estimate</Badge>}
        </div>
      </div>

      {/* Overview Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl">
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-slate-400">Min Import</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-emerald-400">{fmt(stats.minSlot.price)}p</span>
                <span className="text-[10px] text-slate-400">/kWh</span>
              </div>
              <p className="mt-1 text-[11px] font-semibold text-slate-300">{stats.minSlot.label}</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl">
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-slate-400">Max Import</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-rose-400">{fmt(stats.maxSlot.price)}p</span>
                <span className="text-[10px] text-slate-400">/kWh</span>
              </div>
              <p className="mt-1 text-[11px] font-semibold text-slate-300">{stats.maxSlot.label}</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl">
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-slate-400">Average Rate</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-white">{fmt(stats.avg)}p</span>
                <span className="text-[10px] text-slate-400">/kWh</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Across all slots</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl">
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-slate-400">vs Price Cap</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className={`text-2xl font-black ${stats.vsCapPct <= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {stats.vsCapPct}%
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Agile vs {PRICE_CAP_RATE}p cap</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cheapest Windows Widgets */}
      {stats && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Cheapest Windows ({dateKey})</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "1 hr", win: stats.win1h },
              { label: "2 hr", win: stats.win2h },
              { label: "3 hr", win: stats.win3h },
              { label: "4 hr", win: stats.win4h },
            ].map(({ label, win }) =>
              win ? (
                <Card key={label} className="border-slate-800 bg-slate-900/40 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1 font-semibold text-emerald-400"><Zap className="h-3.5 w-3.5" /> {label}</span>
                  </div>
                  <div className="mt-1 text-lg font-black text-white">{fmt(win.average)}<span className="text-xs font-normal text-slate-400">p/kWh</span></div>
                  <div className="text-[11px] font-medium text-slate-300">
                    {slots[win.startIndex]?.label} – {slots[win.startIndex + win.length - 1]?.label}
                  </div>
                </Card>
              ) : null
            )}
          </div>
        </div>
      )}

      {/* Graph View */}
      {!loading && slots.length > 0 && (
        <Card className="border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Import Rate Profile (p/kWh)</CardTitle>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={slots} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} interval={5} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} unit="p" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px" }}
                  formatter={(v: number) => [`${fmt(v)} p/kWh`, "Import Rate"]}
                />
                <ReferenceLine y={PRICE_CAP_RATE} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Cap", fill: "#ef4444", fontSize: 10 }} />
                <Area type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#rateGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Loading & Empty States */}
      {loading && (
        <div className="flex items-center justify-center p-12 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Fetching Agile rates from Octopus Energy…
        </div>
      )}

      {!loading && slots.length === 0 && (
        <Card className="border-rose-900/40 bg-rose-950/20 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
            <div>
              <h4 className="text-sm font-semibold text-rose-300">Rates Unavailable</h4>
              <p className="mt-1 text-xs text-rose-200/80">
                {activeTab === "tomorrow"
                  ? "Tomorrow's wholesale rates publish around 12:30 UK time, and official rates arrive around 16:00."
                  : "Unable to retrieve today's official rates. Check network connection."}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Half-Hour Slot Cards */}
      {!loading && slots.length > 0 && (
        <div className="space-y-4">
          {[
            { title: "MORNING · 00:00 – 12:00", items: groupedSlots.morning },
            { title: "AFTERNOON · 12:00 – 16:00", items: groupedSlots.afternoon },
            { title: "PEAK WINDOW · 16:00 – 19:00", items: groupedSlots.peak },
            { title: "EVENING · 19:00 – 00:00", items: groupedSlots.evening },
          ].map(
            (section) =>
              section.items.length > 0 && (
                <div key={section.title} className="space-y-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{section.title}</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                    {section.items.map((s) => {
                      const band = priceBand(s.price ?? 0);
                      return (
                        <div
                          key={s.start}
                          className="flex flex-col justify-between rounded-lg border border-slate-800 bg-slate-900/80 p-2.5 shadow-sm"
                        >
                          <span className="text-[11px] text-slate-400">{s.label}</span>
                          <div className="mt-1 flex items-baseline gap-0.5">
                            <span className="text-base font-extrabold text-white">{fmt(s.price)}</span>
                            <span className="text-[10px] text-slate-400">p</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between border-t border-slate-800/80 pt-1">
                            <span className="text-[9px] font-semibold" style={{ color: band.colour }}>
                              {band.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
          )}
        </div>
      )}
    </div>
  );
}

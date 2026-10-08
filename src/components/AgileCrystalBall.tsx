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
import { priceBand } from "@/lib/priceBands";
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

const fmt = (p: number | null | undefined) =>
  p == null || isNaN(p) ? "–" : p.toFixed(2);

export default function AgileCrystalBall() {
  const [activeTab, setActiveTab] = useState<"today" | "tomorrow">("today");

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

  // Official Octopus API
  const official = useQuery({
    queryKey: ["acb-official", dateKey],
    queryFn: () => fetchOfficialRates(fromIso, toIso),
    ...opts,
  });

  // Wholesale NordPool
  const nordPool = useQuery({
    queryKey: ["acb-nordpool", dateKey],
    queryFn: () => fetchDayAhead(dateKey),
    ...opts,
    enabled: activeTab === "tomorrow",
  });

  const nordPoolFailed = !nordPool.isLoading && !nordPool.data?.points?.length;

  // Wholesale Elexon MID
  const mid = useQuery({
    queryKey: ["acb-mid", dateKey],
    queryFn: () => fetchMidFallback(fromIso, toIso),
    ...opts,
    enabled: activeTab === "tomorrow" && nordPoolFailed,
  });

  useEffect(() => {
    purgeLegacyCaches();
  }, []);

  const rawChoice = useMemo(() => {
    if (activeTab === "today" && official.data && official.data.length > 0) {
      return {
        slots: official.data,
        source: "official",
      };
    }

    return chooseSlots(dateKey, {
      nordPool: nordPool.data?.points,
      cached: loadCachedSlots(dateKey, undefined, Date.now(), true),
      mid: mid.data?.points,
      official: official.data,
    });
  }, [activeTab, dateKey, official.data, nordPool.data, mid.data]);

  // Normalize API data to guarantee correct `price`, `label`, and `start` fields
  const safeSlots: PricedSlot[] = useMemo(() => {
    if (!rawChoice.slots || rawChoice.slots.length === 0) return [];

    return rawChoice.slots
      .map((item: any) => {
        // Extract price from value_inc_vat, price, or rate
        const rawPrice = item.value_inc_vat ?? item.price ?? item.rate ?? null;
        const price = rawPrice !== null && !isNaN(Number(rawPrice)) ? Number(rawPrice) : null;

        // Extract ISO start time
        const startIso = item.valid_from ?? item.start ?? item.time ?? "";
        
        // Format time label (HH:mm)
        let label = item.label || "";
        if (!label && startIso) {
          try {
            const dateObj = new Date(startIso);
            const hours = String(dateObj.getUTCHours()).padStart(2, "0");
            const minutes = String(dateObj.getUTCMinutes()).padStart(2, "0");
            label = `${hours}:${minutes}`;
          } catch {
            label = "00:00";
          }
        }

        return {
          start: startIso,
          label: label || "00:00",
          price,
        };
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [rawChoice.slots]);

  const source = rawChoice.source;

  useEffect(() => {
    if (source === "nordpool" && safeSlots.length === 48) {
      saveCachedSlots(dateKey, safeSlots);
    }
  }, [source, safeSlots, dateKey]);

  // Analytical Metrics
  const stats = useMemo(() => {
    const validSlots = safeSlots.filter((s) => s.price !== null && !isNaN(s.price));
    if (validSlots.length === 0) return null;

    const prices = validSlots.map((s) => s.price as number);
    const minSlot = validSlots.reduce((prev, curr) => (curr.price! < prev.price! ? curr : prev));
    const maxSlot = validSlots.reduce((prev, curr) => (curr.price! > prev.price! ? curr : prev));
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const vsCapPct = Math.round(((avg - PRICE_CAP_RATE) / PRICE_CAP_RATE) * 100);

    const win1h = cheapestWindow(validSlots, 2);
    const win2h = cheapestWindow(validSlots, 4);
    const win3h = cheapestWindow(validSlots, 6);
    const win4h = cheapestWindow(validSlots, 8);

    return { minSlot, maxSlot, avg, vsCapPct, win1h, win2h, win3h, win4h };
  }, [safeSlots]);

  // Categorized Slot Windows
  const groupedSlots = useMemo(() => {
    const morning: PricedSlot[] = [];
    const afternoon: PricedSlot[] = [];
    const peak: PricedSlot[] = [];
    const evening: PricedSlot[] = [];

    safeSlots.forEach((s) => {
      const hour = parseInt((s.label || "00:00").split(":")[0], 10) || 0;
      if (hour >= 0 && hour < 12) morning.push(s);
      else if (hour >= 12 && hour < 16) afternoon.push(s);
      else if (hour >= 16 && hour < 19) peak.push(s);
      else evening.push(s);
    });

    return { morning, afternoon, peak, evening };
  }, [safeSlots]);

  const loading =
    activeTab === "today"
      ? official.isLoading
      : (nordPool.isLoading || mid.isLoading || official.isLoading) && source === "none";

  const hasData = !loading && stats !== null && safeSlots.some((s) => s.price !== null);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Tab Switcher */}
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
          <span>
            Region: <strong className="text-white">North Eastern England (F)</strong>
          </span>
          {source === "official" && (
            <Badge className="bg-emerald-500/20 text-emerald-300">Official Octopus Rates</Badge>
          )}
          {source !== "official" && source !== "none" && (
            <Badge className="bg-amber-500/20 text-amber-300">Wholesale Estimate</Badge>
          )}
        </div>
      </div>

      {/* Primary Summary Cards */}
      {hasData && stats && (
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
                <span
                  className={`text-2xl font-black ${
                    stats.vsCapPct <= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {stats.vsCapPct}%
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Agile vs {PRICE_CAP_RATE}p cap</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cheapest Windows Widgets */}
      {hasData && stats && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Cheapest Windows ({dateKey})
          </h3>
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
                    <span className="flex items-center gap-1 font-semibold text-emerald-400">
                      <Zap className="h-3.5 w-3.5" /> {label}
                    </span>
                  </div>
                  <div className="mt-1 text-lg font-black text-white">
                    {fmt(win.average)}
                    <span className="text-xs font-normal text-slate-400">p/kWh</span>
                  </div>
                  <div className="text-[11px] font-medium text-slate-300">
                    {safeSlots[win.startIndex]?.label} –{" "}
                    {safeSlots[win.startIndex + win.length - 1]?.label}
                  </div>
                </Card>
              ) : null
            )}
          </div>
        </div>
      )}

      {/* Profile Graph */}
      {hasData && (
        <Card className="border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Import Rate Profile (p/kWh)</CardTitle>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={safeSlots} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "8px",
                  }}
                  formatter={(v: number) => [`${fmt(v)} p/kWh`, "Import Rate"]}
                />
                <ReferenceLine
                  y={PRICE_CAP_RATE}
                  stroke="#ef4444"
                  strokeDasharray="3 3"
                  label={{ value: "Cap", fill: "#ef4444", fontSize: 10 }}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#rateGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="flex items-center justify-center p-12 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Fetching Agile energy rates…
        </div>
      )}

      {/* Pending / Unavailable Rate Warning Banner */}
      {!loading && !hasData && (
        <Card className="border-rose-900/40 bg-rose-950/20 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
            <div>
              <h4 className="text-sm font-semibold text-rose-300">
                {activeTab === "tomorrow" ? "Auction Rates Pending or Unavailable" : "Rates Unavailable"}
              </h4>
              <p className="mt-1 text-xs text-rose-200/80">
                {activeTab === "tomorrow"
                  ? `Day-ahead market prices for ${dateKey} publish around 12:30 UK time, and official Octopus rates arrive around 16:00.`
                  : "Unable to retrieve today's official rates. Check API response or network connection."}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Interactive Slot Cards */}
      {hasData && (
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
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {section.title}
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                    {section.items.map((s, idx) => {
                      const band = priceBand(s.price ?? 0);
                      return (
                        <div
                          key={s.start || idx}
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

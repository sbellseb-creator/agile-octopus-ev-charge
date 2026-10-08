import { useEffect, useMemo } from "react";
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
import { Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { priceBand } from "@/lib/priceBands";
import {
  targetDayKey,
  addDaysToDateKey,
  saveCachedSlots,
  type PricedSlot,
} from "@/lib/agileForecast";

const PRICE_CAP_RATE = 26.11; // Standard variable cap reference rate (p/kWh)

const fmt = (p: number | null | undefined) =>
  p == null || isNaN(p) ? "–" : p.toFixed(2);

// Fetch live day-ahead auction rates directly from agile-rates.uk via CORS proxy
async function fetchTomorrowAgilePredictions(
  dateKey: string,
  regionCode = "F"
): Promise<PricedSlot[]> {
 // Replace lines 34-37 with this:
const edgeFunctionUrl = `https://xrtpcohdyfyjmrxwhtjd.supabase.co/functions/v1/crystal-ball?region=${regionCode}`;
const response = await fetch(edgeFunctionUrl);
const data = await response.json();

// If the component expects an array of rates, use data.rates or data.results:
const rawRates = data.rates || data.results || [];
  if (!response.ok) {
    throw new Error("Agile Rates feed unavailable");
  }

  const rawData = await response.json();
  const ratesList = Array.isArray(rawData) ? rawData : rawData?.rates || [];

  // Filter half-hourly slots for tomorrow's date key (e.g., "2026-10-09")
  const targetSlots = ratesList.filter((slot: any) => {
    const slotTime = slot.date_time || slot.valid_from || slot.start;
    return slotTime && slotTime.startsWith(dateKey);
  });

  if (!targetSlots || targetSlots.length < 48) {
    throw new Error("Tomorrow's auction rates are not published yet");
  }

  // Map slots with Europe/London timezone to prevent BST/UTC hour offsets
  return targetSlots.map((slot: any) => {
    const isoString = slot.date_time || slot.valid_from || slot.start;
    const priceVal =
      slot.agileRate?.result?.rate ??
      slot.value_inc_vat ??
      slot.price ??
      slot.value;

    return {
      start: isoString,
      label: new Date(isoString).toLocaleTimeString("en-GB", {
        timeZone: "Europe/London",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      price: Number(Number(priceVal).toFixed(2)),
    };
  });
}

export default function AgileCrystalBall() {
  const dateKey = useMemo(() => {
    const todayKey = targetDayKey();
    return addDaysToDateKey(todayKey, 1);
  }, []);

  const query = useQuery({
    queryKey: ["agile-rates-uk-feed-v2", dateKey],
    queryFn: () => fetchTomorrowAgilePredictions(dateKey, "F"),
    retry: 2,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const slots: PricedSlot[] = useMemo(() => {
    if (!query.data) return [];
    return [...query.data].sort((a, b) => a.start.localeCompare(b.start));
  }, [query.data]);

  // Persist into cache after a verified full set of 48 slots arrives
  useEffect(() => {
    if (slots.length === 48) {
      saveCachedSlots(dateKey, slots);
    }
  }, [slots, dateKey]);

  // Calculate high-level summary metrics
  const stats = useMemo(() => {
    const valid = slots.filter((s) => s.price !== null && !isNaN(s.price));
    if (valid.length !== 48) return null;

    const prices = valid.map((s) => s.price as number);
    const minSlot = valid.reduce((prev, curr) => (curr.price! < prev.price! ? curr : prev));
    const maxSlot = valid.reduce((prev, curr) => (curr.price! > prev.price! ? curr : prev));
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const vsCapPct = Math.round(((avg - PRICE_CAP_RATE) / PRICE_CAP_RATE) * 100);

    return { minSlot, maxSlot, avg, vsCapPct };
  }, [slots]);

  // Group slots into standard time blocks
  const groupedSlots = useMemo(() => {
    const morning: PricedSlot[] = [];
    const afternoon: PricedSlot[] = [];
    const peak: PricedSlot[] = [];
    const evening: PricedSlot[] = [];

    slots.forEach((s) => {
      const hour = parseInt((s.label || "00:00").split(":")[0], 10) || 0;
      if (hour >= 0 && hour < 12) morning.push(s);
      else if (hour >= 12 && hour < 16) afternoon.push(s);
      else if (hour >= 16 && hour < 19) peak.push(s);
      else evening.push(s);
    });

    return { morning, afternoon, peak, evening };
  }, [slots]);

  // Check UK Local Time for status messaging
  const now = new Date();
  const ukTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const ukHour = ukTime.getHours();

  const isBefore10AM = ukHour < 10;
  const isBetween10and4 = ukHour >= 10 && ukHour < 16;
  const isPost4PM = ukHour >= 16;

  const isLoading = query.isLoading;
  const isError = query.isError || (!isLoading && slots.length < 48);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Dynamic Schedule Banner */}
      {isBefore10AM && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          ⏳ Day-ahead wholesale auction predictions for tomorrow will publish around <strong>10:00 AM</strong>.
        </div>
      )}

      {isBetween10and4 && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          ⚡ Displaying 10:00 AM day-ahead market predictions sourced directly from <strong>agile-rates.uk</strong>.
        </div>
      )}

      {isPost4PM && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-300">
          ✅ Tomorrow's official rates are live. You can view them on the main <strong>Rates</strong> tab.
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <Badge className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1">
          Tomorrow's Predictions ({dateKey})
        </Badge>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>
            Region: <strong className="text-white">North Eastern England (F)</strong>
          </span>
          <Badge className="bg-amber-500/20 text-amber-300">Agile Market Predictions</Badge>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {!isLoading && stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl">
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-slate-400">Tomorrow's Min Rate</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-emerald-400">{fmt(stats.minSlot.price)}p</span>
                <span className="text-[10px] text-slate-400">/kWh</span>
              </div>
              <p className="mt-1 text-[11px] font-semibold text-slate-300">{stats.minSlot.label}</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl">
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-slate-400">Tomorrow's Max Rate</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-rose-400">{fmt(stats.maxSlot.price)}p</span>
                <span className="text-[10px] text-slate-400">/kWh</span>
              </div>
              <p className="mt-1 text-[11px] font-semibold text-slate-300">{stats.maxSlot.label}</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl">
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-slate-400">Predicted Avg Rate</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-white">{fmt(stats.avg)}p</span>
                <span className="text-[10px] text-slate-400">/kWh</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Across all predicted slots</p>
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
                  {stats.vsCapPct > 0 ? `+${stats.vsCapPct}%` : `${stats.vsCapPct}%`}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Agile avg vs {PRICE_CAP_RATE}p cap rate</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rate Profile Chart */}
      {!isLoading && stats && (
        <Card className="border-slate-800 bg-slate-900/60 p-4">
          <CardTitle className="text-sm font-semibold mb-4">Predicted Rate Profile (p/kWh)</CardTitle>
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
                  formatter={(v: number) => [`${fmt(v)} p/kWh`, "Predicted Rate"]}
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
      {isLoading && (
        <div className="flex items-center justify-center p-12 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-400" /> Fetching day-ahead auction rates from agile-rates.uk…
        </div>
      )}

      {/* Error / Pending Banner */}
      {isError && (
        <Card className="border-rose-900/40 bg-rose-950/20 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
            <div>
              <h4 className="text-sm font-semibold text-rose-300">
                Auction Rates Pending or Unavailable
              </h4>
              <p className="mt-1 text-xs text-rose-200/80">
                Day-ahead wholesale auction prices publish around 10:00 AM UK time. Check back after 10:00 AM to see tomorrow's prediction.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Detailed Half-Hourly Slots Grid */}
      {!isLoading && !isError && (
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

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import EvMascot from "@/components/crystal/EvMascot";
import PushSettings from "@/components/crystal/PushSettings";
import { AGILE_REGION } from "@/lib/agile-config";
import { formatInTimeZone } from "date-fns-tz";
import { fetchCrystalBall, fetchCrystalDiagnostic, fetchOfficialForDate } from "@/lib/crystal-ball";
import {
  addDays, compareEstimateToOfficial, deriveCrystalState, formatDuration, summarise, tomorrowUk, ukDate, waitingInfo,
} from "@/lib/crystal-ball-utils";

const WINDOW_HOURS = 3;
const NEG = "#38bdf8";
const CHEAP = "#34d399";
const NORMAL = "#a78bfa";

const fmt = (v: string, f: string) => formatInTimeZone(new Date(v), "Europe/London", f);
const hhmm = (iso: string) => fmt(iso, "HH:mm");
const p = (n: number | null | undefined) => (n == null ? "–" : `${n.toFixed(1)}p`);

const dayLabel = (d: string, today: string) =>
  `${d === addDays(today, 1) ? "Tomorrow" : d === today ? "Today" : "Past"} · ${fmt(`${d}T12:00:00Z`, "EEE d MMM")}`;

export default function CrystalBallTab() {
  const [date, setDate] = useState(tomorrowUk());
  const today = ukDate(new Date());
  const dayOptions = Array.from({ length: 9 }, (_, i) => addDays(today, 1 - i));
  const isFuture = date > today;

  const official = useQuery({
    queryKey: ["crystal-official", date],
    queryFn: () => fetchOfficialForDate(date),
    refetchInterval: isFuture ? 10 * 60_000 : false,
  });
  const hasOfficial = (official.data?.length ?? 0) >= 46;

  const estimate = useQuery({
    queryKey: ["crystal-estimate", date],
    queryFn: () => fetchCrystalBall(date),
    retry: 1,
    refetchInterval: isFuture ? 5 * 60_000 : false,
  });
  const diagnostic = useMutation({ mutationFn: fetchCrystalDiagnostic });

  const estimateSlots = useMemo(() => estimate.data?.results ?? [], [estimate.data]);
  const slots = useMemo(() => (hasOfficial ? official.data! : estimateSlots), [hasOfficial, official.data, estimateSlots]);
  const summary = useMemo(() => summarise(slots, WINDOW_HOURS), [slots]);
  const comparison = useMemo(
    () => (hasOfficial && estimateSlots.length ? compareEstimateToOfficial(estimateSlots, official.data!) : null),
    [hasOfficial, estimateSlots, official.data],
  );

  const loading = estimate.isLoading || official.isLoading;
  const noData = !loading && slots.length === 0;
  const now = new Date();
  const fetchError = estimate.isError
    ? (estimate.error instanceof Error ? estimate.error.message : "Request failed")
    : estimate.data?.status === "error" ? (estimate.data.error ?? "The data source failed") : null;
  const state = deriveCrystalState({ date, now, hasOfficial, estimateCount: estimateSlots.length, fetchError, loaded: !!estimate.data || estimate.isError });
  const wait = waitingInfo(date, now);
  const happy = hasOfficial || summary.negatives.length > 0;
  const refreshing = estimate.isFetching || official.isFetching;
  const refresh = () => { void estimate.refetch(); void official.refetch(); };

  const cheapestStart = summary.cheapest?.valid_from;
  const windowStart = summary.window?.start;
  const windowEnd = summary.window?.end;
  const chartData = slots.map((s) => ({
    t: hhmm(s.valid_from),
    price: Number(s.value_inc_vat.toFixed(2)),
    kind: s.value_inc_vat < 0 ? "neg" : s.valid_from === cheapestStart ? "cheap" : "normal",
  }));

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-br from-indigo-950/60 via-slate-900/90 to-purple-950/40 p-4 shadow-[0_0_25px_rgba(168,85,247,0.15)]">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-black text-white">
              <Sparkles className="h-5 w-5 text-purple-400" /> Crystal Ball: likely Agile rates
            </h2>
            <p className="text-xs text-slate-400">Estimates from the real day-ahead wholesale auction + the Agile formula. Not official Octopus rates.</p>
            <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-bold">
              <span className={`rounded-full border px-2 py-0.5 ${state === "official" || state === "available" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : state === "error" ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
                {{ official: "Official rates", available: "Estimated from wholesale data, not official", waiting: "Waiting for wholesale results", error: "Data source problem", no_data: "No wholesale data for this day" }[state]}
              </span>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-slate-300">Region {AGILE_REGION}</span>
              <select
                aria-label="Choose day"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-full border border-white/20 bg-slate-900 px-2 py-0.5 text-slate-100"
              >
                {dayOptions.map((d) => <option key={d} value={d}>{dayLabel(d, today)}</option>)}
              </select>
              {estimate.data?.is_mock && <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-rose-300">MOCK DATA</span>}
            </div>
          </div>
          <EvMascot mood={happy ? "happy" : "confused"} className="h-24 w-32 shrink-0" />
        </div>

        <p className="mt-2 text-xs text-slate-300">
          {loading && "Gazing into the crystal ball…"}
          {!loading && state === "waiting" && `Not published yet, so there's nothing to show (no guesses here!). The auction closes ~11:00 UK and results usually publish ~11:30–11:42; official rates follow ~16:00.${isFuture && wait.pastDue ? ` Expected ~${hhmm(wait.expectedAt)}, now ${fmt(now.toISOString(), "HH:mm")} (${formatDuration(wait.minutesPast)} past due).` : ""}`}
          {!loading && state === "error" && "Couldn't fetch wholesale data. The reason is shown below."}
          {!loading && state === "no_data" && "No wholesale data was returned for this day."}
          {!loading && !noData && hasOfficial && "Good news: the official rates have landed! Showing those instead of the estimate."}
          {!loading && !noData && !hasOfficial && summary.negatives.length > 0 && "Ooh, negative prices predicted! (Still just an estimate.)"}
          {!loading && !noData && !hasOfficial && summary.negatives.length === 0 && "Hmm, nothing dramatic spotted. Treat this as a friendly guess."}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <span className="text-[10px] text-slate-400">
            {estimate.dataUpdatedAt && !fetchError
              ? `Last successful fetch ${fmt(new Date(estimate.dataUpdatedAt).toISOString(), "d MMM HH:mm")} UK · Source: ${estimate.data?.source}`
              : "No successful fetch yet" + (estimate.data?.source ? ` · Source: ${estimate.data.source}` : "")}
          </span>
        </div>
        {fetchError && (
          <p className="mt-2 text-xs text-rose-300">Fetch failed: {fetchError}{hasOfficial ? " (official rates shown instead)" : ""}</p>
        )}
      </Card>

      {loading && <Card className="h-64 animate-pulse border-white/10 bg-slate-900/60" />}

      {!loading && slots.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Chip label="Cheapest slot" value={summary.cheapest ? `${hhmm(summary.cheapest.valid_from)} · ${p(summary.cheapest.value_inc_vat)}` : "–"} />
            <Chip label={`Cheapest ${WINDOW_HOURS}h window`} value={windowStart && windowEnd ? `${hhmm(windowStart)}–${hhmm(windowEnd)} · avg ${p(summary.window!.average)}` : "–"} />
            <Chip label="Negative prices" value={summary.negatives.length ? `${summary.negatives.length} slots (${(summary.negatives.length / 2).toFixed(1)}h)` : "None expected"} tone={summary.negatives.length ? "neg" : undefined} />
            <Chip label={hasOfficial ? "Average" : "Estimated average"} value={`${p(summary.average)} /kWh`} />
          </div>

          <Card className="border-white/10 bg-slate-900/70 p-3">
            <div className="mb-2 flex flex-wrap gap-3 text-[10px] text-slate-300">
              <Legend colour={NEG} label="Negative" /><Legend colour={CHEAP} label="Cheapest slot" /><Legend colour={NORMAL} label={hasOfficial ? "Official" : "Estimated"} />
            </div>
            <div className="h-60 w-full">
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={5} />
                  <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} unit="p" />
                  <Tooltip
                   contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11, color: "#ffffff" }}
                   labelStyle={{ color: "#ffffff", fontWeight: 700 }}
                  itemStyle={{ color: "#ffffff" }}
                  cursor={{ fill: "rgba(255,255,255,0.08)" }}
                   formatter={(v: number) => [`${v}p/kWh`, hasOfficial ? "Official" : "Estimate"]}
                 />
                  <ReferenceLine y={0} stroke="#64748b" />
                  <Bar dataKey="price" radius={[2, 2, 0, 0]}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.kind === "neg" ? NEG : d.kind === "cheap" ? CHEAP : NORMAL} fillOpacity={hasOfficial ? 1 : 0.7} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">p/kWh inc VAT, half-hourly slots, UK time.</p>
          </Card>
        </>
      )}

      {comparison && (
        <Card className="border-white/10 bg-slate-900/70 p-3 text-xs text-slate-300">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-200">Estimate vs official</h3>
          <p>
            Average difference (official − estimate): <b>{p(comparison.averageDiff)}</b> · typical slot error: <b>{p(comparison.meanAbsDiff)}</b>
          </p>
          <div className="mt-2 max-h-48 overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead className="text-slate-400"><tr><th className="text-left">Slot</th><th className="text-right">Estimate</th><th className="text-right">Official</th><th className="text-right">Diff</th></tr></thead>
              <tbody>
                {comparison.slots.map((s) => (
                  <tr key={s.valid_from}>
                    <td>{hhmm(s.valid_from)}</td><td className="text-right">{p(s.estimate)}</td><td className="text-right">{p(s.official)}</td>
                    <td className={`text-right ${s.diff == null ? "" : s.diff > 0 ? "text-rose-300" : "text-emerald-300"}`}>{s.diff == null ? "–" : `${s.diff > 0 ? "+" : ""}${s.diff.toFixed(1)}p`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="border-white/10 bg-slate-900/70 p-3 text-xs text-slate-300">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-200">Data source check (previous 7 days)</h3>
          <Button size="sm" variant="outline" onClick={() => diagnostic.mutate()} disabled={diagnostic.isPending}>Run check</Button>
        </div>
        {diagnostic.isError && <p className="mt-2 text-rose-300">Check failed: {diagnostic.error instanceof Error ? diagnostic.error.message : "error"}</p>}
        {diagnostic.data && (
          <div className="mt-2 space-y-1">
            <p className={diagnostic.data.verdict.verdict === "ok" ? "text-emerald-300" : "text-amber-300"}>{diagnostic.data.verdict.message}</p>
            <p className="text-[10px] text-slate-400">Source: {diagnostic.data.provider}</p>
            <ul className="text-[10px]">
              {diagnostic.data.checks.map((c) => (
                <li key={c.date}>{c.date}: {c.status === "error" ? `error – ${c.reason}` : `${c.rows} rows`}</li>
              ))}
            </ul>
            <ul className="text-[10px]">
              {diagnostic.data.accuracy.map((a) => (
                <li key={a.date}>{a.date}: {a.error ? `n/a (${a.error})` : `avg diff ${p(a.average_diff)}, typical slot error ${p(a.mean_abs_error)} over ${a.compared} slots`}</li>
              ))}
            </ul>
            {diagnostic.data.fitted_formula && (
              <p className="text-[10px] text-slate-400">
                Fitted to official rates: multiplier ≈ {diagnostic.data.fitted_formula.multiplier.toFixed(2)}, peak adder ≈ {diagnostic.data.fitted_formula.peakAdder.toFixed(1)}p
                ({diagnostic.data.fitted_formula.samples} slots). Set AGILE_MULTIPLIER / AGILE_PEAK_ADDER secrets to adopt.
              </p>
            )}
          </div>
        )}
      </Card>

      <PushSettings />
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: "neg" }) {
  return (
    <div className={`rounded-2xl border p-2 ${tone === "neg" ? "border-sky-500/40 bg-sky-500/10" : "border-white/10 bg-slate-950/60"}`}>
      <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="mt-0.5 block text-xs font-extrabold text-white">{value}</span>
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: colour }} />{label}</span>;
}

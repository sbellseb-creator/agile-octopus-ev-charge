import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Briefcase, Plus, Trash2, TrendingUp, Coins, Route, Pencil, Check, X, Zap } from "lucide-react";
import {
  loadTrips,
  addTrip,
  updateTrip,
  deleteTrip,
  getDefaultRate,
  setDefaultRate,
  SUGGESTED_RATES,
  type WorkTrip,
} from "@/lib/work-data";
import type { ChargeSession } from "@/lib/charge-data";
import type { Vehicle } from "@/lib/vehicle-data";
import { toast } from "sonner";

type Period = "week" | "month" | "year" | "all";

function filterByPeriod<T extends { trip_date?: string }>(rows: T[], period: Period): T[] {
  if (period === "all") return rows;
  const now = new Date();
  const cutoff = new Date(now);
  if (period === "week") cutoff.setDate(now.getDate() - 7);
  else if (period === "month") cutoff.setMonth(now.getMonth() - 1);
  else if (period === "year") cutoff.setFullYear(now.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return rows.filter((r) => (r.trip_date as string) >= cutoffStr);
}

function formatUkDate(d: string): string {
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0].slice(2)}` : d;
}

interface Props {
  sessions: ChargeSession[];
  vehicles: Vehicle[];
}

interface EditDraft {
  trip_date: string;
  miles: string;
  description: string;
  rate_pence_per_mile: string;
  extra_charges_gbp: string;
  extra_charges_note: string;
  charge_session_ids: string[];
}

export default function WorkCosts({ sessions, vehicles }: Props) {
  const [trips, setTrips] = useState<WorkTrip[]>(loadTrips);
  const [period, setPeriod] = useState<Period>("month");
  const [rate, setRate] = useState<number>(getDefaultRate());
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [miles, setMiles] = useState("");
  const [desc, setDesc] = useState("");
  const [extra, setExtra] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [linkedSessionIds, setLinkedSessionIds] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  useEffect(() => setDefaultRate(rate), [rate]);

  // Number sessions chronologically (oldest = #1) so they have stable picker labels
  const sessionsNumbered = useMemo(() => {
    const sorted = [...sessions].sort((a, b) =>
      `${a.session_date} ${a.start_time ?? ""}`.localeCompare(`${b.session_date} ${b.start_time ?? ""}`)
    );
    return sorted.map((s, i) => ({ ...s, number: i + 1 }));
  }, [sessions]);

  // All sessions for the picker (most recent first), scrollable
  const pickerSessions = useMemo(
    () => [...sessionsNumbered].reverse(),
    [sessionsNumbered]
  );


  const sessionById = useMemo(() => {
    const m = new Map<string, (typeof sessionsNumbered)[number]>();
    sessionsNumbered.forEach((s) => m.set(s.id, s));
    return m;
  }, [sessionsNumbered]);

  /** Average p/kWh across linked sessions (kWh-weighted). */
  const linkedAvgPPerKwh = (ids: string[]): number => {
    const linked = ids.map((id) => sessionById.get(id)).filter(Boolean) as ChargeSession[];
    const tk = linked.reduce((a, s) => a + s.energy_added_kwh, 0);
    const tc = linked.reduce((a, s) => a + s.total_cost_gbp, 0);
    return tk > 0 ? (tc / tk) * 100 : 0; // p/kWh
  };

  const usedIds = new Set(sessions.map((s) => s.vehicle_id));
  const usedVehicles = vehicles.filter((v) => usedIds.has(v.id) && v.miles_per_kwh > 0);
  const fleetAvgMpkwh =
    usedVehicles.length > 0
      ? usedVehicles.reduce((a, v) => a + v.miles_per_kwh, 0) / usedVehicles.length
      : 3.5;

  const totalKwh = sessions.reduce((s, r) => s + r.energy_added_kwh, 0);
  const totalEvCost = sessions.reduce((s, r) => s + r.total_cost_gbp, 0);
  const fleetSessionCostPerMile = totalKwh > 0 ? totalEvCost / (totalKwh * fleetAvgMpkwh) : 0;

  /** Cost per mile for a trip — uses linked sessions if any, otherwise overall sessions average. */
  const tripEvCostPerMile = (ids?: string[]): number => {
    if (ids && ids.length > 0) {
      const p = linkedAvgPPerKwh(ids);
      if (p > 0) return (p / 100) / fleetAvgMpkwh;
    }
    return fleetSessionCostPerMile;
  };

  const handleAdd = () => {
    const m = parseFloat(miles);
    if (!Number.isFinite(m) || m <= 0) {
      toast.error("Enter valid miles");
      return;
    }
    const ex = parseFloat(extra);
    setTrips(
      addTrip({
        trip_date: date,
        description: desc,
        miles: m,
        rate_pence_per_mile: rate,
        extra_charges_gbp: Number.isFinite(ex) && ex > 0 ? ex : undefined,
        extra_charges_note: Number.isFinite(ex) && ex > 0 ? extraNote : undefined,
        charge_session_ids: linkedSessionIds.length > 0 ? linkedSessionIds : undefined,
      })
    );
    setMiles("");
    setDesc("");
    setExtra("");
    setExtraNote("");
    setLinkedSessionIds([]);
    toast.success("Work trip logged");
  };

  const startEdit = (t: WorkTrip) => {
    setEditingId(t.id);
    setDraft({
      trip_date: t.trip_date,
      miles: String(t.miles),
      description: t.description ?? "",
      rate_pence_per_mile: String(t.rate_pence_per_mile),
      extra_charges_gbp: t.extra_charges_gbp ? String(t.extra_charges_gbp) : "",
      extra_charges_note: t.extra_charges_note ?? "",
      charge_session_ids: t.charge_session_ids ?? [],
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = (id: string) => {
    if (!draft) return;
    const m = parseFloat(draft.miles);
    const r = parseFloat(draft.rate_pence_per_mile);
    if (!Number.isFinite(m) || m <= 0) return toast.error("Invalid miles");
    if (!Number.isFinite(r) || r < 0) return toast.error("Invalid rate");
    const ex = parseFloat(draft.extra_charges_gbp);
    setTrips(
      updateTrip(id, {
        trip_date: draft.trip_date,
        miles: m,
        description: draft.description,
        rate_pence_per_mile: r,
        extra_charges_gbp: Number.isFinite(ex) && ex > 0 ? ex : undefined,
        extra_charges_note: Number.isFinite(ex) && ex > 0 ? draft.extra_charges_note : undefined,
        charge_session_ids: draft.charge_session_ids.length > 0 ? draft.charge_session_ids : undefined,
      })
    );
    cancelEdit();
    toast.success("Trip updated");
  };

  const handleDelete = (id: string) => setTrips(deleteTrip(id));

  const filtered = useMemo(() => filterByPeriod(trips, period), [trips, period]);

  const totals = useMemo(() => {
    const totalMiles = filtered.reduce((a, t) => a + t.miles, 0);
    const claimed = filtered.reduce((a, t) => a + (t.miles * t.rate_pence_per_mile) / 100, 0);
    const extras = filtered.reduce((a, t) => a + (t.extra_charges_gbp ?? 0), 0);
    const evMileCost = filtered.reduce((a, t) => a + t.miles * tripEvCostPerMile(t.charge_session_ids), 0);
    const actualCost = evMileCost + extras;
    return { totalMiles, claimed, actualCost, extras, evMileCost, profit: claimed - actualCost };
  }, [filtered, fleetAvgMpkwh, fleetSessionCostPerMile, sessionById]);

  const toggleLink = (ids: string[], setter: (ids: string[]) => void, sid: string) => {
    setter(ids.includes(sid) ? ids.filter((x) => x !== sid) : [...ids, sid]);
  };

  const SessionPicker = ({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) => (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1">
        <Zap className="h-3 w-3 text-primary" /> Link charge session(s) — optional
      </Label>
      {pickerSessions.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">No sessions logged yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
          {pickerSessions.map((s) => {
            const isOn = selected.includes(s.id);
            return (
              <Button
                key={s.id}
                type="button"
                size="sm"
                variant={isOn ? "default" : "outline"}
                className="h-7 text-[10px] px-2"
                onClick={() => toggleLink(selected, onChange, s.id)}
                title={`${s.energy_added_kwh.toFixed(1)} kWh @ ${s.avg_pence_per_kwh.toFixed(1)}p/kWh`}
              >
                #{s.number} · {formatUkDate(s.session_date)} · {s.energy_added_kwh.toFixed(1)}kWh
              </Button>
            );
          })}
        </div>
      )}
      {selected.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Avg from linked: {linkedAvgPPerKwh(selected).toFixed(2)}p/kWh →
          {" "}{(tripEvCostPerMile(selected) * 100).toFixed(2)}p/mi
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Add trip */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Briefcase className="h-4 w-4 text-primary" /> Log Work Trip
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Miles</Label>
              <Input
                type="number" inputMode="decimal" step="0.1"
                value={miles} onChange={(e) => setMiles(e.target.value)}
                placeholder="e.g. 42.5" className="h-9"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="Client visit, site survey…" className="h-9"
            />
          </div>

          <SessionPicker selected={linkedSessionIds} onChange={setLinkedSessionIds} />

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Extra charge £</Label>
              <Input
                type="number" inputMode="decimal" step="0.01"
                value={extra} onChange={(e) => setExtra(e.target.value)}
                placeholder="e.g. 22.40" className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Extra note</Label>
              <Input
                value={extraNote} onChange={(e) => setExtraNote(e.target.value)}
                placeholder="Tesla supercharger…" className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Claim rate (p/mile)</Label>
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_RATES.map((r) => (
                <Button
                  key={r.label} type="button" size="sm"
                  variant={rate === r.value ? "default" : "outline"}
                  className="h-7 text-[10px] px-2"
                  onClick={() => setRate(r.value)}
                  title={r.detail}
                >
                  {r.label} · {r.value}p
                </Button>
              ))}
            </div>
            <Input
              type="number" step="0.01" value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
              className="h-9 mt-1"
            />
          </div>

          <Button onClick={handleAdd} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Add Trip
          </Button>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-accent" /> Summary
            </CardTitle>
            <Badge variant="outline" className="text-[10px]">
              avg {(fleetSessionCostPerMile * 100).toFixed(1)}p/mi
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList className="grid grid-cols-4 w-full h-8">
              <TabsTrigger value="week" className="text-[11px]">Week</TabsTrigger>
              <TabsTrigger value="month" className="text-[11px]">Month</TabsTrigger>
              <TabsTrigger value="year" className="text-[11px]">Year</TabsTrigger>
              <TabsTrigger value="all" className="text-[11px]">All</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-border bg-muted/40 p-2">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Route className="h-3 w-3" /> Miles
              </p>
              <p className="text-base font-bold tabular-nums">{totals.totalMiles.toFixed(1)}</p>
            </div>
            <div className="rounded-md border border-border bg-muted/40 p-2">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Coins className="h-3 w-3" /> Cost (EV+extras)
              </p>
              <p className="text-base font-bold tabular-nums">£{totals.actualCost.toFixed(2)}</p>
              <p className="text-[9px] text-muted-foreground">
                energy £{totals.evMileCost.toFixed(2)} + extras £{totals.extras.toFixed(2)}
              </p>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/10 p-2">
              <p className="text-[10px] text-muted-foreground">Claim back</p>
              <p className="text-base font-bold text-primary tabular-nums">£{totals.claimed.toFixed(2)}</p>
            </div>
            <div className={`rounded-md border p-2 ${
              totals.profit >= 0 ? "border-accent/40 bg-accent/10" : "border-destructive/40 bg-destructive/10"
            }`}>
              <p className="text-[10px] text-muted-foreground">Net {totals.profit >= 0 ? "profit" : "loss"}</p>
              <p className={`text-base font-bold tabular-nums ${
                totals.profit >= 0 ? "text-accent" : "text-destructive"
              }`}>
                £{totals.profit.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Itemised totals breakdown */}
          <div className="rounded-md border border-border bg-muted/20 p-2 text-[10px] space-y-0.5">
            <p className="font-semibold text-muted-foreground mb-1">Breakdown</p>
            <div className="flex justify-between"><span>Total miles</span><span className="tabular-nums">{totals.totalMiles.toFixed(1)} mi</span></div>
            <div className="flex justify-between"><span>Fleet efficiency</span><span className="tabular-nums">{fleetAvgMpkwh.toFixed(2)} mi/kWh</span></div>
            <div className="flex justify-between"><span>Energy used (est)</span><span className="tabular-nums">{(totals.totalMiles / fleetAvgMpkwh).toFixed(2)} kWh</span></div>
            <div className="flex justify-between"><span>Fleet avg price</span><span className="tabular-nums">{(fleetSessionCostPerMile * fleetAvgMpkwh * 100).toFixed(2)}p/kWh</span></div>
            <div className="flex justify-between"><span>Energy cost (Σ trips)</span><span className="tabular-nums">£{totals.evMileCost.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Extra charges (Σ)</span><span className="tabular-nums">£{totals.extras.toFixed(2)}</span></div>
            <div className="flex justify-between border-t border-border pt-0.5 mt-0.5 font-semibold"><span>Total cost</span><span className="tabular-nums">£{totals.actualCost.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Claim back (miles × rate)</span><span className="tabular-nums text-primary">£{totals.claimed.toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold"><span>Net</span><span className={`tabular-nums ${totals.profit >= 0 ? "text-accent" : "text-destructive"}`}>£{totals.profit.toFixed(2)}</span></div>
          </div>

        </CardContent>
      </Card>

      {/* Trip list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Trips ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No trips logged for this period.</p>
          ) : (
            filtered.map((t) => {
              const isEditing = editingId === t.id;
              const claim = (t.miles * t.rate_pence_per_mile) / 100;
              const cpm = tripEvCostPerMile(t.charge_session_ids);
              const evCost = t.miles * cpm + (t.extra_charges_gbp ?? 0);
              const net = claim - evCost;
              const linkedNumbers = (t.charge_session_ids ?? [])
                .map((id) => sessionById.get(id)?.number)
                .filter(Boolean) as number[];

              if (isEditing && draft) {
                return (
                  <div key={t.id} className="rounded-md border border-primary/40 bg-primary/5 p-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Date</Label>
                        <Input type="date" value={draft.trip_date}
                          onChange={(e) => setDraft({ ...draft, trip_date: e.target.value })}
                          className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Miles</Label>
                        <Input type="number" step="0.1" value={draft.miles}
                          onChange={(e) => setDraft({ ...draft, miles: e.target.value })}
                          className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Rate p/mi</Label>
                        <Input type="number" step="0.01" value={draft.rate_pence_per_mile}
                          onChange={(e) => setDraft({ ...draft, rate_pence_per_mile: e.target.value })}
                          className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Extra £</Label>
                        <Input type="number" step="0.01" value={draft.extra_charges_gbp}
                          onChange={(e) => setDraft({ ...draft, extra_charges_gbp: e.target.value })}
                          className="h-8 text-xs" />
                      </div>
                    </div>
                    <Input placeholder="Description" value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      className="h-8 text-xs" />
                    <Input placeholder="Extra charge note" value={draft.extra_charges_note}
                      onChange={(e) => setDraft({ ...draft, extra_charges_note: e.target.value })}
                      className="h-8 text-xs" />
                    <SessionPicker
                      selected={draft.charge_session_ids}
                      onChange={(ids) => setDraft({ ...draft, charge_session_ids: ids })}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => saveEdit(t.id)}>
                        <Check className="h-3 w-3 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={cancelEdit}>
                        <X className="h-3 w-3 mr-1" /> Cancel
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={t.id} className="rounded-md border border-border p-2 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-semibold">{formatUkDate(t.trip_date)}</span>
                        <span className="text-xs tabular-nums">{t.miles.toFixed(1)} mi</span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1">
                          {t.rate_pence_per_mile}p/mi
                        </Badge>
                        {t.extra_charges_gbp ? (
                          <Badge variant="secondary" className="text-[9px] h-4 px-1">
                            +£{t.extra_charges_gbp.toFixed(2)}
                          </Badge>
                        ) : null}
                        {linkedNumbers.length > 0 && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 border-primary/50 text-primary">
                            ⚡{linkedNumbers.map((n) => `#${n}`).join(",")}
                          </Badge>
                        )}
                      </div>
                      {t.description && (
                        <p className="text-[11px] text-muted-foreground truncate">{t.description}</p>
                      )}
                      {t.extra_charges_note && (
                        <p className="text-[10px] text-muted-foreground truncate italic">
                          Extra: {t.extra_charges_note}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(t.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Claim £{claim.toFixed(2)} · Cost £{evCost.toFixed(2)} ({(cpm * 100).toFixed(1)}p/mi)</span>
                    <span className={`font-semibold tabular-nums ${net >= 0 ? "text-accent" : "text-destructive"}`}>
                      {net >= 0 ? "+" : ""}£{net.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

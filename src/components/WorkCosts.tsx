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
  type WorkExtraCharge,
} from "@/lib/work-data";
import type { ChargeSession } from "@/lib/charge-data";
import type { Vehicle } from "@/lib/vehicle-data";
import { toast } from "sonner";

type Period = "week" | "month" | "year" | "all";

type ExtraChargeDraft = {
  id: string;
  amount: string;
  note: string;
};

interface NumberedSession extends ChargeSession {
  number: number;
}

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

function newExtraChargeDraft(): ExtraChargeDraft {
  return { id: crypto.randomUUID(), amount: "", note: "" };
}

function parseExtraChargeDrafts(rows: ExtraChargeDraft[]): WorkExtraCharge[] {
  return rows
    .map((row) => ({
      id: row.id || crypto.randomUUID(),
      amount_gbp: parseFloat(row.amount),
      note: row.note.trim() || undefined,
    }))
    .filter((row) => Number.isFinite(row.amount_gbp) && row.amount_gbp > 0);
}

function tripExtraCharges(trip: WorkTrip): WorkExtraCharge[] {
  if (trip.extra_charges?.length) return trip.extra_charges;
  if (trip.extra_charges_gbp && trip.extra_charges_gbp > 0) {
    return [{
      id: "legacy-extra",
      amount_gbp: trip.extra_charges_gbp,
      note: trip.extra_charges_note,
    }];
  }
  return [];
}

function extraDraftsFromTrip(trip: WorkTrip): ExtraChargeDraft[] {
  const extras = tripExtraCharges(trip);
  if (extras.length === 0) return [newExtraChargeDraft()];
  return extras.map((extra) => ({
    id: extra.id || crypto.randomUUID(),
    amount: String(extra.amount_gbp),
    note: extra.note ?? "",
  }));
}

function sumExtraCharges(extras: WorkExtraCharge[]): number {
  return extras.reduce((total, extra) => total + extra.amount_gbp, 0);
}

function legacyExtraNote(extras: WorkExtraCharge[]): string | undefined {
  const notes = extras.map((extra) => extra.note).filter(Boolean) as string[];
  return notes.length > 0 ? notes.join("; ") : undefined;
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
  extra_charges: ExtraChargeDraft[];
  charge_session_ids: string[];
}

function ExtraChargesEditor({
  items,
  onChange,
  labelClassName = "text-xs",
}: {
  items: ExtraChargeDraft[];
  onChange: (items: ExtraChargeDraft[]) => void;
  labelClassName?: string;
}) {
  const updateItem = (id: string, updates: Partial<ExtraChargeDraft>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const removeItem = (id: string) => {
    const remaining = items.filter((item) => item.id !== id);
    onChange(remaining.length > 0 ? remaining : [newExtraChargeDraft()]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className={labelClassName}>Extra charging costs</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[10px] px-2"
          onClick={() => onChange([...items, newExtraChargeDraft()])}
        >
          <Plus className="h-3 w-3 mr-1" /> Add extra
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item.id} className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.2fr)_auto] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">£ {index + 1}</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={item.amount}
                onChange={(e) => updateItem(item.id, { amount: e.target.value })}
                placeholder="7.52"
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1 min-w-0">
              <Label className="text-[10px] text-muted-foreground">Note</Label>
              <Input
                value={item.note}
                onChange={(e) => updateItem(item.id, { note: e.target.value })}
                placeholder="Tesla, public charger…"
                className="h-9 text-xs"
              />
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 text-destructive"
              onClick={() => removeItem(item.id)}
              aria-label="Remove extra charge"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WorkCosts({ sessions }: Props) {
  const [trips, setTrips] = useState<WorkTrip[]>(loadTrips);
  const [period, setPeriod] = useState<Period>("month");
  const [rate, setRate] = useState<number>(getDefaultRate());
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [miles, setMiles] = useState("");
  const [desc, setDesc] = useState("");
  const [extraCharges, setExtraCharges] = useState<ExtraChargeDraft[]>(() => [newExtraChargeDraft()]);
  const [linkedSessionIds, setLinkedSessionIds] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  useEffect(() => setDefaultRate(rate), [rate]);

  const sessionsNumbered = useMemo(() => {
    const sorted = [...sessions].sort((a, b) =>
      `${a.session_date} ${a.start_time ?? ""}`.localeCompare(`${b.session_date} ${b.start_time ?? ""}`)
    );
    return sorted.map((s, i) => ({ ...s, number: i + 1 }));
  }, [sessions]);

  const pickerSessions = useMemo(
    () => [...sessionsNumbered].reverse(),
    [sessionsNumbered]
  );

  const sessionById = useMemo(() => {
    const m = new Map<string, NumberedSession>();
    sessionsNumbered.forEach((s) => m.set(s.id, s));
    return m;
  }, [sessionsNumbered]);

  const linkedSessions = (ids?: string[]): NumberedSession[] =>
    (ids ?? []).map((id) => sessionById.get(id)).filter(Boolean) as NumberedSession[];

  const linkedSessionCost = (ids?: string[]): number =>
    linkedSessions(ids).reduce((total, session) => total + session.total_cost_gbp, 0);

  const handleAdd = () => {
    const m = parseFloat(miles);
    if (!Number.isFinite(m) || m <= 0) {
      toast.error("Enter valid miles");
      return;
    }
    const extras = parseExtraChargeDrafts(extraCharges);
    const extrasTotal = sumExtraCharges(extras);
    setTrips(
      addTrip({
        trip_date: date,
        description: desc,
        miles: m,
        rate_pence_per_mile: rate,
        extra_charges: extras.length > 0 ? extras : undefined,
        extra_charges_gbp: extrasTotal > 0 ? extrasTotal : undefined,
        extra_charges_note: extrasTotal > 0 ? legacyExtraNote(extras) : undefined,
        charge_session_ids: linkedSessionIds.length > 0 ? linkedSessionIds : undefined,
      })
    );
    setMiles("");
    setDesc("");
    setExtraCharges([newExtraChargeDraft()]);
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
      extra_charges: extraDraftsFromTrip(t),
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
    const extras = parseExtraChargeDrafts(draft.extra_charges);
    const extrasTotal = sumExtraCharges(extras);
    setTrips(
      updateTrip(id, {
        trip_date: draft.trip_date,
        miles: m,
        description: draft.description,
        rate_pence_per_mile: r,
        extra_charges: extras.length > 0 ? extras : undefined,
        extra_charges_gbp: extrasTotal > 0 ? extrasTotal : undefined,
        extra_charges_note: extrasTotal > 0 ? legacyExtraNote(extras) : undefined,
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
    const extras = filtered.reduce((a, t) => a + sumExtraCharges(tripExtraCharges(t)), 0);
    const sessionCost = filtered.reduce((a, t) => a + linkedSessionCost(t.charge_session_ids), 0);
    const actualCost = sessionCost + extras;
    return { totalMiles, claimed, actualCost, extras, sessionCost, profit: claimed - actualCost };
  }, [filtered, sessionById]);

  const toggleLink = (ids: string[], setter: (ids: string[]) => void, sid: string) => {
    setter(ids.includes(sid) ? ids.filter((x) => x !== sid) : [...ids, sid]);
  };

  const SessionPicker = ({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) => (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1">
        <Zap className="h-3 w-3 text-primary" /> Link charge session cost(s) — optional
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
                title={`Session #${s.number}: £${s.total_cost_gbp.toFixed(2)} · ${s.energy_added_kwh.toFixed(1)} kWh @ ${s.avg_pence_per_kwh.toFixed(1)}p/kWh`}
              >
                #{s.number} · {formatUkDate(s.session_date)} · £{s.total_cost_gbp.toFixed(2)}
              </Button>
            );
          })}
        </div>
      )}
      {selected.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Selected session cost: £{linkedSessionCost(selected).toFixed(2)}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
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
          <ExtraChargesEditor items={extraCharges} onChange={setExtraCharges} />

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

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-accent" /> Summary
            </CardTitle>
            <Badge variant="outline" className="text-[10px]">
              session costs only
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
                <Coins className="h-3 w-3" /> Cost (sessions+extras)
              </p>
              <p className="text-base font-bold tabular-nums">£{totals.actualCost.toFixed(2)}</p>
              <p className="text-[9px] text-muted-foreground">
                sessions £{totals.sessionCost.toFixed(2)} + extras £{totals.extras.toFixed(2)}
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

          <div className="rounded-md border border-border bg-muted/20 p-2 text-[10px] space-y-0.5">
            <p className="font-semibold text-muted-foreground mb-1">Breakdown</p>
            <div className="flex justify-between"><span>Total miles</span><span className="tabular-nums">{totals.totalMiles.toFixed(1)} mi</span></div>
            <div className="flex justify-between"><span>Selected charge sessions (Σ)</span><span className="tabular-nums">£{totals.sessionCost.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Extra charges (Σ)</span><span className="tabular-nums">£{totals.extras.toFixed(2)}</span></div>
            <div className="flex justify-between border-t border-border pt-0.5 mt-0.5 font-semibold"><span>Total cost</span><span className="tabular-nums">£{totals.actualCost.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Claim back (miles × rate)</span><span className="tabular-nums text-primary">£{totals.claimed.toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold"><span>Net</span><span className={`tabular-nums ${totals.profit >= 0 ? "text-accent" : "text-destructive"}`}>£{totals.profit.toFixed(2)}</span></div>
          </div>
        </CardContent>
      </Card>

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
              const linked = linkedSessions(t.charge_session_ids);
              const linkedNumbers = linked.map((session) => session.number);
              const selectedSessionCost = linked.reduce((total, session) => total + session.total_cost_gbp, 0);
              const extras = tripExtraCharges(t);
              const extrasCost = sumExtraCharges(extras);
              const evCost = selectedSessionCost + extrasCost;
              const net = claim - evCost;

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
                      <div className="space-y-1 col-span-2">
                        <Label className="text-[10px]">Rate p/mi</Label>
                        <Input type="number" step="0.01" value={draft.rate_pence_per_mile}
                          onChange={(e) => setDraft({ ...draft, rate_pence_per_mile: e.target.value })}
                          className="h-8 text-xs" />
                      </div>
                    </div>
                    <Input placeholder="Description" value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      className="h-8 text-xs" />
                    <SessionPicker
                      selected={draft.charge_session_ids}
                      onChange={(ids) => setDraft({ ...draft, charge_session_ids: ids })}
                    />
                    <ExtraChargesEditor
                      items={draft.extra_charges}
                      onChange={(items) => setDraft({ ...draft, extra_charges: items })}
                      labelClassName="text-[10px]"
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
                        {extrasCost > 0 ? (
                          <Badge variant="secondary" className="text-[9px] h-4 px-1">
                            extras £{extrasCost.toFixed(2)}
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
                  <div className="rounded-sm bg-muted/30 p-1.5 text-[10px] space-y-0.5 mt-1">
                    {linked.length > 0 ? (
                      linked.map((session) => (
                        <div key={session.id} className="flex justify-between gap-2">
                          <span>
                            Session #{session.number} ({formatUkDate(session.session_date)} · {session.energy_added_kwh.toFixed(2)} kWh × {session.avg_pence_per_kwh.toFixed(2)}p/kWh)
                          </span>
                          <span className="tabular-nums">£{session.total_cost_gbp.toFixed(2)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="flex justify-between text-muted-foreground italic">
                        <span>No charge sessions linked</span>
                        <span className="tabular-nums">£0.00</span>
                      </div>
                    )}
                    {extras.map((extra, index) => (
                      <div key={extra.id || index} className="flex justify-between gap-2">
                        <span>Extra {index + 1} ({extra.note || "ad-hoc"})</span>
                        <span className="tabular-nums">£{extra.amount_gbp.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-border pt-0.5">
                      <span>Total cost</span>
                      <span className="tabular-nums">£{evCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Claim ({t.miles.toFixed(1)} mi × {t.rate_pence_per_mile}p)</span>
                      <span className="tabular-nums text-primary">£{claim.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>Net (claim − sessions − extras)</span>
                      <span className={`tabular-nums ${net >= 0 ? "text-accent" : "text-destructive"}`}>
                        {net >= 0 ? "+" : ""}£{net.toFixed(2)}
                      </span>
                    </div>
                    {linkedNumbers.length > 0 && (
                      <div className="pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] px-2 w-full"
                          onClick={() => {
                            setTrips(updateTrip(t.id, { charge_session_ids: undefined }));
                            toast.success("Unlinked all charge sessions from trip");
                          }}
                        >
                          Unlink all charge sessions
                        </Button>
                      </div>
                    )}
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

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Zap, Pencil, Check, X, Loader2 } from "lucide-react";
import { CHARGE_MODE_LABELS, type ChargeSession } from "@/lib/charge-data";
import { recalcSessionCost } from "@/lib/session-cost";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

/** Format YYYY-MM-DD to DD-MM-YY */
function formatUkDate(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0].slice(2)}`;
}

const CHARGER_KW = 6.9;

/** Calculate duration in hours between two HH:MM time strings */
function getHoursBetween(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // overnight
  return mins / 60;
}

interface Props {
  sessions: ChargeSession[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ChargeSession>) => void;
}

function SessionCard({
  s,
  isEditing,
  isSaving,
  editValues,
  setEditValues,
  onStartEdit,
  onSave,
  onCancel,
  onDelete,
}: {
  s: ChargeSession;
  isEditing: boolean;
  isSaving: boolean;
  editValues: Partial<ChargeSession>;
  setEditValues: React.Dispatch<React.SetStateAction<Partial<ChargeSession>>>;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  if (isEditing) {
    return (
      <Card className="border-primary/40">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{formatUkDate(s.session_date)}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={onSave} disabled={isSaving} className="text-primary h-7 w-7">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={onCancel} disabled={isSaving} className="text-muted-foreground h-7 w-7">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Start Time</label>
              <Input type="time" className="h-7 text-xs" value={editValues.start_time || ""} onChange={e => setEditValues(v => ({ ...v, start_time: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">End Time</label>
              <Input type="time" className="h-7 text-xs" value={editValues.end_time || ""} onChange={e => setEditValues(v => ({ ...v, end_time: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Start SoC %</label>
              <Input type="number" className="h-7 text-xs" value={editValues.start_soc ?? ""} onChange={e => setEditValues(v => ({ ...v, start_soc: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">End SoC %</label>
              <Input type="number" className="h-7 text-xs" value={editValues.end_soc ?? ""} onChange={e => setEditValues(v => ({ ...v, end_soc: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">kWh</label>
              <Input type="number" step="0.1" className="h-7 text-xs" value={editValues.energy_added_kwh ?? ""} onChange={e => setEditValues(v => ({ ...v, energy_added_kwh: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Cost £</label>
              <Input type="number" step="0.01" className="h-7 text-xs" value={editValues.total_cost_gbp ?? ""} onChange={e => setEditValues(v => ({ ...v, total_cost_gbp: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">p/kWh</label>
              <Input type="number" step="0.1" className="h-7 text-xs" value={editValues.avg_pence_per_kwh ?? ""} onChange={e => setEditValues(v => ({ ...v, avg_pence_per_kwh: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Slots</label>
              <Input type="number" className="h-7 text-xs" value={editValues.num_slots ?? ""} onChange={e => setEditValues(v => ({ ...v, num_slots: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Top row: date, time, mode */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{formatUkDate(s.session_date)}</span>
              {(s.start_time || s.end_time) && (
                <span className="text-xs text-muted-foreground">
                  {s.start_time || "?"} – {s.end_time || "?"}
                </span>
              )}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {CHARGE_MODE_LABELS[s.charge_mode] || "—"}
              </Badge>
            </div>

            {/* Vehicle */}
            <p className="text-xs text-muted-foreground mt-0.5">{s.vehicle_name || "—"}</p>

            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-x-3 gap-y-1 mt-2 text-xs">
              <div>
                <span className="text-muted-foreground">SoC</span>
                <p className="font-medium">{s.start_soc}→{s.end_soc}%</p>
              </div>
              <div>
                <span className="text-muted-foreground">kWh</span>
                <p className="font-medium">{s.energy_added_kwh}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Cost</span>
                <p className="font-medium">£{s.total_cost_gbp.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">p/kWh</span>
                <p className="font-medium">{s.avg_pence_per_kwh.toFixed(2)}p</p>
              </div>
            </div>

            {/* Notes */}
            {s.notes && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{s.notes}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" onClick={onStartEdit} className="text-muted-foreground hover:text-primary h-7 w-7">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive hover:text-destructive h-7 w-7">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ChargeTable({ sessions, onDelete, onUpdate }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ChargeSession>>({});

  const startEdit = (s: ChargeSession) => {
    setEditingId(s.id);
    setEditValues({
      start_soc: s.start_soc,
      end_soc: s.end_soc,
      start_time: s.start_time || "",
      end_time: s.end_time || "",
      energy_added_kwh: s.energy_added_kwh,
      total_cost_gbp: s.total_cost_gbp,
      avg_pence_per_kwh: s.avg_pence_per_kwh,
      num_slots: s.num_slots,
    });
  };

  const [savingId, setSavingId] = useState<string | null>(null);

  const saveEdit = async () => {
    if (!editingId) return;
    const session = sessions.find((s) => s.id === editingId);
    if (!session) return;
    const finalUpdates: Partial<ChargeSession> = { ...editValues };
    const timesProvided = !!(finalUpdates.start_time && finalUpdates.end_time);

    if (timesProvided) {
      // Recalc cost using actual cached half-hour prices (and fetch any missing slots)
      setSavingId(editingId);
      try {
        const recalc = await recalcSessionCost(session, finalUpdates);
        if (recalc) {
          finalUpdates.energy_added_kwh = recalc.energy_added_kwh;
          finalUpdates.total_cost_gbp = recalc.total_cost_gbp;
          finalUpdates.avg_pence_per_kwh = recalc.avg_pence_per_kwh;
          finalUpdates.num_slots = recalc.num_slots;
          finalUpdates.slot_prices = recalc.slot_prices;
          toast.success("Recalculated using actual Agile prices");
        } else {
          // Fallback: simple time-based recalc with current avg price
          const hours = getHoursBetween(finalUpdates.start_time, finalUpdates.end_time);
          if (hours !== null && hours > 0) {
            const kwh = CHARGER_KW * hours;
            const avgPrice = finalUpdates.avg_pence_per_kwh ?? session.avg_pence_per_kwh ?? 0;
            finalUpdates.energy_added_kwh = parseFloat(kwh.toFixed(1));
            finalUpdates.total_cost_gbp = parseFloat(((kwh * avgPrice) / 100).toFixed(2));
            finalUpdates.num_slots = Math.ceil(hours * 2);
          }
        }
      } catch (e) {
        toast.error("Couldn't fetch historical prices, using estimate");
      } finally {
        setSavingId(null);
      }
    }
    onUpdate(editingId, finalUpdates);
    setEditingId(null);
    setEditValues({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-5 w-5 text-accent" />
          Charge History ({sessions.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">No sessions yet.</p>
        ) : (
          <div className="space-y-2">
            {[...sessions].reverse().map((s) => (
              <SessionCard
                key={s.id}
                s={s}
                isEditing={editingId === s.id}
                isSaving={savingId === s.id}
                editValues={editValues}
                setEditValues={setEditValues}
                onStartEdit={() => startEdit(s)}
                onSave={saveEdit}
                onCancel={cancelEdit}
                onDelete={() => onDelete(s.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

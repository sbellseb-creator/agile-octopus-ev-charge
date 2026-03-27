import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Zap, Pencil, Check, X } from "lucide-react";
import { CHARGE_MODE_LABELS, type ChargeSession } from "@/lib/charge-data";
import { Badge } from "@/components/ui/badge";

interface Props {
  sessions: ChargeSession[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ChargeSession>) => void;
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

  const saveEdit = () => {
    if (!editingId) return;
    onUpdate(editingId, editValues);
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date / Time</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">SoC</TableHead>
                  <TableHead className="text-right">kWh</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">p/kWh</TableHead>
                  <TableHead className="text-right">Slots</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...sessions].reverse().map((s) => {
                  const isEditing = editingId === s.id;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {isEditing ? (
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">{formatUkDate(s.session_date)}</div>
                            <Input
                              type="time"
                              className="h-7 text-xs w-24"
                              value={editValues.start_time || ""}
                              onChange={(e) => setEditValues(v => ({ ...v, start_time: e.target.value }))}
                              placeholder="Start"
                            />
                            <Input
                              type="time"
                              className="h-7 text-xs w-24"
                              value={editValues.end_time || ""}
                              onChange={(e) => setEditValues(v => ({ ...v, end_time: e.target.value }))}
                              placeholder="End"
                            />
                          </div>
                        ) : (
                          <div>
                            <div>{formatUkDate(s.session_date)}</div>
                            {(s.start_time || s.end_time) && (
                              <div className="text-xs text-muted-foreground">
                                {s.start_time || "?"} – {s.end_time || "?"}
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{s.vehicle_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {CHARGE_MODE_LABELS[s.charge_mode] || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="space-y-1">
                            <Input
                              type="number"
                              className="h-7 text-xs w-16 text-right"
                              value={editValues.start_soc ?? ""}
                              onChange={(e) => setEditValues(v => ({ ...v, start_soc: parseFloat(e.target.value) || 0 }))}
                            />
                            <Input
                              type="number"
                              className="h-7 text-xs w-16 text-right"
                              value={editValues.end_soc ?? ""}
                              onChange={(e) => setEditValues(v => ({ ...v, end_soc: parseFloat(e.target.value) || 0 }))}
                            />
                          </div>
                        ) : (
                          `${s.start_soc}→${s.end_soc}%`
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.1"
                            className="h-7 text-xs w-16 text-right"
                            value={editValues.energy_added_kwh ?? ""}
                            onChange={(e) => setEditValues(v => ({ ...v, energy_added_kwh: parseFloat(e.target.value) || 0 }))}
                          />
                        ) : s.energy_added_kwh}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            className="h-7 text-xs w-16 text-right"
                            value={editValues.total_cost_gbp ?? ""}
                            onChange={(e) => setEditValues(v => ({ ...v, total_cost_gbp: parseFloat(e.target.value) || 0 }))}
                          />
                        ) : `£${s.total_cost_gbp.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.1"
                            className="h-7 text-xs w-16 text-right"
                            value={editValues.avg_pence_per_kwh ?? ""}
                            onChange={(e) => setEditValues(v => ({ ...v, avg_pence_per_kwh: parseFloat(e.target.value) || 0 }))}
                          />
                        ) : `${s.avg_pence_per_kwh.toFixed(2)}p`}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <Input
                            type="number"
                            className="h-7 text-xs w-14 text-right"
                            value={editValues.num_slots ?? ""}
                            onChange={(e) => setEditValues(v => ({ ...v, num_slots: parseInt(e.target.value) || 0 }))}
                          />
                        ) : s.num_slots}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-muted-foreground text-sm">{s.notes || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {isEditing ? (
                            <>
                              <Button variant="ghost" size="icon" onClick={saveEdit} className="text-primary hover:text-primary h-8 w-8">
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={cancelEdit} className="text-muted-foreground h-8 w-8">
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => startEdit(s)} className="text-muted-foreground hover:text-primary h-8 w-8">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => onDelete(s.id)} className="text-destructive hover:text-destructive h-8 w-8">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

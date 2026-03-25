import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2, Zap } from "lucide-react";
import { CHARGE_MODE_LABELS, type ChargeSession } from "@/lib/charge-data";
import { Badge } from "@/components/ui/badge";

interface Props {
  sessions: ChargeSession[];
  onDelete: (id: string) => void;
}

export default function ChargeTable({ sessions, onDelete }: Props) {
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
                  <TableHead>Date</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">SoC</TableHead>
                  <TableHead className="text-right">kWh</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">p/kWh</TableHead>
                  <TableHead className="text-right">Slots</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...sessions].reverse().map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.session_date}</TableCell>
                    <TableCell>{s.vehicle_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {CHARGE_MODE_LABELS[s.charge_mode] || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{s.start_soc}→{s.end_soc}%</TableCell>
                    <TableCell className="text-right">{s.energy_added_kwh}</TableCell>
                    <TableCell className="text-right">£{s.total_cost_gbp.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{s.avg_pence_per_kwh.toFixed(1)}p</TableCell>
                    <TableCell className="text-right">{s.num_slots}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-muted-foreground text-sm">{s.notes || "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(s.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2, Battery } from "lucide-react";
import type { BatteryHealth } from "@/lib/battery-data";

interface Props {
  records: BatteryHealth[];
  onDelete: (id: string) => void;
}

export default function BatteryTable({ records, onDelete }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Battery className="h-5 w-5 text-primary" />
          History ({records.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">No readings yet. Add your first one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Degradation</TableHead>
                  <TableHead className="text-right">Range (mi)</TableHead>
                  <TableHead className="text-right">Odometer</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...records].reverse().map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.recorded_date}</TableCell>
                    <TableCell className="text-right">{r.degradation_pct}%</TableCell>
                    <TableCell className="text-right">{r.range_at_100_miles}</TableCell>
                    <TableCell className="text-right">{r.odometer_miles.toLocaleString()}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">{r.notes || "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(r.id)} className="text-destructive hover:text-destructive">
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

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, Trash2, Car } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { vehicleModelLine, type Vehicle } from "@/lib/vehicle-data";

interface Props {
  vehicle: Vehicle;
  onDelete?: (id: string) => void;
  /** Live Tesla status for this vehicle, when available. */
  live?: {
    battery_level: number | null;
    charging_state: string | null;
    charge_limit_soc: number | null;
    state?: string | null;
    display_name?: string | null;
    car_type?: string | null;
    trim_badging?: string | null;
    vin_last4?: string | null;
  } | null;
}

const val = (v: string | number | null | undefined, suffix = "") =>
  v === null || v === undefined || v === "" ? "Unknown" : `${v}${suffix}`;

/** Vehicle card. Registration is the primary identifier; VIN lives in Advanced. */
export default function VehicleCard({ vehicle: v, onDelete, live }: Props) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const isTesla = v.source === "tesla" || Boolean(live);

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span
                className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-sm font-bold uppercase tracking-wider"
                style={{ borderColor: v.color || undefined }}
              >
                {v.registration || "No reg"}
              </span>
              {v.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
              {live?.state && <Badge variant="outline" className="text-[10px] capitalize">{live.state}</Badge>}
            </div>
            <p className="mt-1 break-words text-xs text-muted-foreground">{vehicleModelLine(v, live)}</p>
          </div>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-destructive"
              onClick={() => setConfirm(true)}
              aria-label={`Delete ${v.registration || v.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {live && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="min-w-0">
              <div className="text-muted-foreground">Battery</div>
              <div className="font-semibold">{live.battery_level != null ? `${live.battery_level}%` : "Unknown"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-muted-foreground">Charging</div>
              <div className="break-words font-semibold">{live.charging_state ?? "Unknown"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-muted-foreground">Limit</div>
              <div className="font-semibold">{live.charge_limit_soc != null ? `${live.charge_limit_soc}%` : "Unknown"}</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="min-w-0">
            <div className="text-muted-foreground">Battery capacity</div>
            <div className="break-words font-semibold">{v.battery_kwh ? `${v.battery_kwh} kWh` : "Unknown"}</div>
          </div>
          <div className="min-w-0">
            <div className="text-muted-foreground">mi/kWh</div>
            <div className="font-semibold">{v.miles_per_kwh || "Unknown"}</div>
          </div>
        </div>

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-full justify-between px-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <Car className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Advanced Vehicle Details</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1.5 pt-2 text-xs">
            <Row
              label="VIN"
              value={v.vin ? `••••••••${v.vin.slice(-4)}` : live?.vin_last4 ? `••••••••${live.vin_last4}` : "Unknown"}
            />
            {live?.display_name && <Row label="Tesla name" value={live.display_name} />}
            <Row label="Tesla vehicle ID" value={val(v.tesla_vehicle_id)} />
            <Row label="Model code" value={val(live?.car_type ?? v.car_type)} />
            {live?.trim_badging && <Row label="Trim badge" value={live.trim_badging} />}
            <Row label="Charge efficiency" value={val(v.charge_efficiency_pct, "%")} />
            <Row label="Data source" value={isTesla ? "Tesla Fleet API" : "Manual"} />

            {v.notes && <Row label="Notes" value={v.notes} />}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="max-w-[92vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {v.registration || v.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isTesla
                ? "This vehicle is linked to your connected Tesla. Deleting removes the saved profile (registration, capacity, efficiency) — it does not disconnect your Tesla account, and it will reappear as an unnamed vehicle on the next refresh."
                : "This removes the saved vehicle profile."}{" "}
              Existing charging sessions are kept and stay linked to this vehicle's ID.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onDelete?.(v.id)}
            >
              Delete vehicle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-b border-border/50 pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all text-right font-medium">{value}</span>
    </div>
  );
}

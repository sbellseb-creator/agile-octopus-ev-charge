import { Car } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { vehicleModelLine, type Vehicle } from "@/lib/vehicle-data";

interface Props {
  vehicles: Vehicle[];
}

/**
 * Prominent registration-first identity strip shown on every screen.
 * Registration is the primary identifier; VIN is never shown here.
 */
export default function VehicleIdentityBar({ vehicles }: Props) {
  const v = vehicles.find((x) => x.is_default) ?? vehicles[0];
  if (!v) return null;

  return (
    <div className="border-b border-border bg-muted/30">
      <div className="container flex min-w-0 flex-wrap items-center gap-2 py-2">
        <Car className="h-4 w-4 shrink-0 text-primary" />
        <span
          className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-sm font-bold uppercase tracking-wider break-all"
          style={{ borderColor: v.color || undefined }}
        >
          {v.registration || "No reg"}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {vehicleModelLine(v)}
        </span>
        {v.source === "tesla" && <Badge variant="outline" className="shrink-0 text-[10px]">Tesla</Badge>}
      </div>
    </div>
  );
}

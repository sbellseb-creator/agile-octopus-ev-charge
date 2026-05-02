import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Fuel, Droplet, Zap, TrendingDown } from "lucide-react";
import type { ChargeSession } from "@/lib/charge-data";
import type { Vehicle } from "@/lib/vehicle-data";

interface Props {
  sessions: ChargeSession[];
  vehicles: Vehicle[];
}

// UK averages (Nov 2025 reference) — used as fallback baseline
const PETROL_PRICE_PER_L = 1.35; // £
const DIESEL_PRICE_PER_L = 1.42; // £
const PETROL_MPG = 45;           // typical efficient ICE
const DIESEL_MPG = 55;           // typical efficient diesel
const LITRES_PER_GALLON = 4.546; // UK gallon

function costPerMile(pricePerL: number, mpg: number): number {
  // £/mile = pricePerL * litresPerGallon / mpg
  return (pricePerL * LITRES_PER_GALLON) / mpg;
}

export default function FuelComparison({ sessions, vehicles }: Props) {
  const totalKwh = sessions.reduce((s, r) => s + r.energy_added_kwh, 0);
  const totalEvCost = sessions.reduce((s, r) => s + r.total_cost_gbp, 0);

  // Weighted miles/kWh from vehicles actually used in sessions, fallback 3.5
  const usedVehicleIds = new Set(sessions.map((s) => s.vehicle_id));
  const usedVehicles = vehicles.filter((v) => usedVehicleIds.has(v.id) && v.miles_per_kwh > 0);
  const avgMpkwh =
    usedVehicles.length > 0
      ? usedVehicles.reduce((a, v) => a + v.miles_per_kwh, 0) / usedVehicles.length
      : 3.5;

  const totalMiles = totalKwh * avgMpkwh;
  const evPerMile = totalMiles > 0 ? totalEvCost / totalMiles : 0;
  const petrolPerMile = costPerMile(PETROL_PRICE_PER_L, PETROL_MPG);
  const dieselPerMile = costPerMile(DIESEL_PRICE_PER_L, DIESEL_MPG);

  const petrolCost = totalMiles * petrolPerMile;
  const dieselCost = totalMiles * dieselPerMile;
  const savedVsPetrol = petrolCost - totalEvCost;
  const savedVsDiesel = dieselCost - totalEvCost;

  const rows = [
    {
      label: "Electric",
      icon: Zap,
      color: "text-primary",
      bg: "bg-primary/10",
      cost: totalEvCost,
      perMile: evPerMile,
      detail: `${avgMpkwh.toFixed(2)} mi/kWh`,
    },
    {
      label: "Petrol",
      icon: Fuel,
      color: "text-chart-warning",
      bg: "bg-chart-warning/10",
      cost: petrolCost,
      perMile: petrolPerMile,
      detail: `${PETROL_MPG} mpg @ £${PETROL_PRICE_PER_L}/L`,
    },
    {
      label: "Diesel",
      icon: Droplet,
      color: "text-muted-foreground",
      bg: "bg-muted/40",
      cost: dieselCost,
      perMile: dieselPerMile,
      detail: `${DIESEL_MPG} mpg @ £${DIESEL_PRICE_PER_L}/L`,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingDown className="h-4 w-4 text-accent" />
          Fuel Cost Comparison
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {totalMiles.toFixed(0)} mi driven · {totalKwh.toFixed(1)} kWh
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className={`flex items-center gap-2 rounded-md p-2 ${r.bg}`}>
            <r.icon className={`h-4 w-4 shrink-0 ${r.color}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{r.label}</span>
                <span className="text-sm font-bold tabular-nums">£{r.cost.toFixed(2)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="truncate">{r.detail}</span>
                <span className="tabular-nums shrink-0">{(r.perMile * 100).toFixed(1)}p/mi</span>
              </div>
            </div>
          </div>
        ))}

        {totalMiles > 0 && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Saved vs Petrol</p>
              <p className="text-base font-bold text-primary tabular-nums">
                £{savedVsPetrol.toFixed(2)}
              </p>
            </div>
            <div className="rounded-md border border-accent/30 bg-accent/5 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Saved vs Diesel</p>
              <p className="text-base font-bold text-accent tabular-nums">
                £{savedVsDiesel.toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

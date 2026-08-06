import { useCallback, useEffect, useState } from "react";
import {
  BatteryCharging,
  Car,
  CheckCircle2,
  Clock3,
  Gauge,
  Loader2,
  MapPin,
  Palette,
  Plug,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

import {
  listTeslaVehicles,
  startTeslaOAuth,
  type TeslaVehicle,
} from "@/lib/tesla";

const VEHICLE_PROFILE = {
  make: "Tesla",
  model: "Model Y Long Range RWD",
  registration: "ND74 VCA",
  colour: "Quicksilver",
};

function formatChargingState(state: string | null): string {
  if (!state) return "Unknown";

  return state
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatVehicleState(state: string | null): string {
  if (!state) return "Unknown";

  return state.charAt(0).toUpperCase() + state.slice(1);
}

function batteryText(level: number | null): string {
  return level === null ? "—" : `${level}%`;
}

function rangeText(range: number | null): string {
  return range === null ? "—" : `${Math.round(range)} mi`;
}

function limitText(limit: number | null): string {
  return limit === null ? "—" : `${limit}%`;
}

export default function TeslaConnect() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [vehicles, setVehicles] = useState<TeslaVehicle[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadVehicles = useCallback(
    async (wake: boolean) => {
      setLoading(true);

      try {
        const response = await listTeslaVehicles(wake);

        setConnected(response.connected);
        setVehicles(response.vehicles);

        if (response.connected) {
          setLastUpdated(new Date());
        }

        if (response.error) {
          toast({
            title: "Tesla",
            description: response.error,
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Tesla",
          description:
            error instanceof Error
              ? error.message
              : "Could not load Tesla vehicles",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void loadVehicles(false);
  }, [loadVehicles]);

  async function connect() {
    setConnecting(true);

    try {
      const url = await startTeslaOAuth();
      window.location.href = url;
    } catch (error) {
      toast({
        title: "Tesla sign-in failed",
        description:
          error instanceof Error
            ? error.message
            : "Unknown error",
        variant: "destructive",
      });

      setConnecting(false);
    }
  }

  return (
    <Card className="neon-border">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plug className="h-5 w-5 text-primary" />
              Tesla
            </CardTitle>

            <CardDescription className="mt-1">
              Live vehicle status from the Tesla Fleet API.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {connected ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline">Not connected</Badge>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadVehicles(true)}
              disabled={loading || !connected}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${
                  loading ? "animate-spin" : ""
                }`}
              />
              Refresh
            </Button>

            <Button
              type="button"
              size="sm"
              variant={connected ? "ghost" : "default"}
              onClick={connect}
              disabled={connecting}
            >
              {connecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : connected ? (
                <RotateCcw className="mr-2 h-4 w-4" />
              ) : null}

              {connected ? "Reconnect" : "Connect Tesla"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!connected && !loading && (
          <p className="text-sm text-muted-foreground">
            Connect your Tesla account to view live battery, range and
            charging information.
          </p>
        )}

        {loading && vehicles.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading Tesla…
          </div>
        )}

        {vehicles.map((vehicle) => (
          <VehicleDetails
            key={vehicle.id}
            vehicle={vehicle}
            lastUpdated={lastUpdated}
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface VehicleDetailsProps {
  vehicle: TeslaVehicle;
  lastUpdated: Date | null;
}

function VehicleDetails({
  vehicle,
  lastUpdated,
}: VehicleDetailsProps) {
  const batteryLevel = vehicle.battery_level ?? 0;

  return (
    <div className="space-y-5 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />

            <h3 className="font-semibold">
              {VEHICLE_PROFILE.make} {VEHICLE_PROFILE.model}
            </h3>
          </div>

          {vehicle.display_name &&
            vehicle.display_name.toLowerCase() !== "tesla" && (
              <p className="mt-1 text-sm text-muted-foreground">
                {vehicle.display_name}
              </p>
            )}
        </div>

        <Badge variant="outline">
          {VEHICLE_PROFILE.registration}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Battery
          </span>

          <span className="font-semibold">
            {batteryText(vehicle.battery_level)}
          </span>
        </div>

        <Progress
          value={batteryLevel}
          aria-label={`Battery ${batteryLevel}%`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <StatusItem
          icon={Gauge}
          label="Range"
          value={rangeText(vehicle.battery_range)}
        />

        <StatusItem
          icon={BatteryCharging}
          label="Charging"
          value={formatChargingState(vehicle.charging_state)}
        />

        <StatusItem
          icon={Plug}
          label="Charge limit"
          value={limitText(vehicle.charge_limit_soc)}
        />

        <StatusItem
          icon={MapPin}
          label="Vehicle state"
          value={formatVehicleState(vehicle.state)}
        />
      </div>

      <div className="grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
        <StatusItem
          icon={Palette}
          label="Colour"
          value={VEHICLE_PROFILE.colour}
        />

        <StatusItem
          icon={Car}
          label="VIN"
          value={`•••• ${vehicle.vin_last4}`}
        />

        <StatusItem
          icon={Clock3}
          label="Last updated"
          value={
            lastUpdated
              ? lastUpdated.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"
          }
        />
      </div>
    </div>
  );
}

interface StatusItemProps {
  icon: typeof Car;
  label: string;
  value: string;
}

function StatusItem({
  icon: Icon,
  label,
  value,
}: StatusItemProps) {
  return (
    <div className="space-y-1 rounded-lg bg-background/60 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>

      <div className="break-words font-semibold">
        {value}
      </div>
    </div>
  );
}

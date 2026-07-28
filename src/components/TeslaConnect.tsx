import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plug, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  listTeslaVehicles,
  startTeslaOAuth,
  type TeslaVehicle,
} from "@/lib/tesla";

export default function TeslaConnect() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [vehicles, setVehicles] = useState<TeslaVehicle[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const res = await listTeslaVehicles(true);

      setConnected(res.connected);
      setVehicles(res.vehicles);

      if (res.error) {
        toast({
          title: "Tesla",
          description: res.error,
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Tesla",
        description:
          e instanceof Error
            ? e.message
            : "Could not load Tesla vehicles",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
  setLoading(true);

  listTeslaVehicles(false)
    .then((res) => {
      setConnected(res.connected);
      setVehicles(res.vehicles);

      if (res.error) {
        toast({
          title: "Tesla",
          description: res.error,
          variant: "destructive",
        });
      }
    })
    .catch((e) => {
      toast({
        title: "Tesla",
        description:
          e instanceof Error
            ? e.message
            : "Could not load Tesla vehicles",
        variant: "destructive",
      });
    })
    .finally(() => setLoading(false));
}, [toast]);

  const connect = async () => {
    setConnecting(true);

    try {
      const url = await startTeslaOAuth();
      window.location.href = url;
    } catch (e) {
      toast({
        title: "Tesla sign-in failed",
        description:
          e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });

      setConnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Plug className="h-5 w-5 text-primary" />
          Tesla
        </CardTitle>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh Tesla data"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                loading ? "animate-spin" : ""
              }`}
            />
          </Button>

          <Button
            size="sm"
            onClick={connect}
            disabled={connecting}
          >
            {connecting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : null}

            {connected ? "Reconnect" : "Connect Tesla"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {!connected && !loading && (
          <p className="text-sm text-muted-foreground">
            Connect your Tesla account to see live battery and
            charging status.
          </p>
        )}

        {vehicles.map((v) => (
          <div
            key={v.id}
            className="space-y-1.5 rounded-lg border border-border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {v.display_name}
              </span>

              <Badge variant="outline">ND74 VCA</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div>
                <div className="text-muted-foreground">
                  Battery
                </div>
                <div className="font-semibold">
                  {v.battery_level != null
                    ? `${v.battery_level}%`
                    : "—"}
                </div>
              </div>

              <div>
                <div className="text-muted-foreground">
                  Range
                </div>
                <div className="font-semibold">
                  {v.battery_range != null
                    ? `${Math.round(v.battery_range)} mi`
                    : "—"}
                </div>
              </div>

              <div>
                <div className="text-muted-foreground">
                  Charging
                </div>
                <div className="font-semibold">
                  {v.charging_state ?? "—"}
                </div>
              </div>

              <div>
                <div className="text-muted-foreground">
                  Limit
                </div>
                <div className="font-semibold">
                  {v.charge_limit_soc != null
                    ? `${v.charge_limit_soc}%`
                    : "—"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
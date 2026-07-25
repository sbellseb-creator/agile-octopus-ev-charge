import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, RefreshCw, Link2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { startTeslaOAuth, listTeslaVehicles, type TeslaVehicle } from "@/lib/tesla-api";

export default function TeslaConnect() {
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [vehicles, setVehicles] = useState<TeslaVehicle[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTeslaVehicles();
      setConnected(!!res.connected);
      setVehicles(res.vehicles ?? []);
      if (res.error) toast({ title: "Tesla error", description: res.error, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tesla") === "connected") {
      toast({ title: "Tesla connected" });
      params.delete("tesla");
      const q = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (q ? "?" + q : ""));
    }
    refresh();
  }, [refresh]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await startTeslaOAuth();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start";
      toast({ title: "Tesla sign-in failed", description: msg, variant: "destructive" });
      setConnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-5 w-5 text-primary" />
          Tesla Account
        </CardTitle>
        {connected && (
          <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!connected ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Link your Tesla account to pull live vehicle status.
            </p>
            <Button onClick={handleConnect} disabled={connecting} className="w-full sm:w-auto">
              <Link2 className="h-4 w-4 mr-2" />
              {connecting ? "Redirecting…" : "Connect Tesla"}
            </Button>
          </div>
        ) : vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Connected. No vehicles found.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {vehicles.map((v) => (
              <div key={v.id} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium truncate">{v.name}</div>
                  <Badge variant={v.online ? "default" : "secondary"} className="text-[10px]">
                    {v.state}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">VIN •••• {v.vin_last4 || "----"}</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <Stat label="Battery" value={v.battery_level != null ? `${v.battery_level}%` : "—"} />
                  <Stat label="Charging" value={v.charging_state ?? "—"} />
                  <Stat label="Limit" value={v.charge_limit_soc != null ? `${v.charge_limit_soc}%` : "—"} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted/40 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}

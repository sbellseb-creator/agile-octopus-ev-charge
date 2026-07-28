import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plug, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { listTeslaVehicles, startTeslaOAuth, type TeslaVehicle } from "@/lib/tesla";
import { vehicleModelLine, type Vehicle } from "@/lib/vehicle-data";

interface Props {
  /** App vehicles, used to resolve the registration for a Tesla. */
  vehicles?: Vehicle[];
  /** Notified whenever the connection state is known (no extra API calls). */
  onStatus?: (connected: boolean) => void;
  /** Notified with the live Tesla vehicles so the parent can merge them into vehicle cards. */
  onVehicles?: (vehicles: TeslaVehicle[]) => void;
  /** Compact mode renders only the slim connection status bar (no vehicle blocks). */
  compact?: boolean;
}

export default function TeslaConnect({ vehicles = [], onStatus, onVehicles, compact = false }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [teslaVehicles, setTeslaVehicles] = useState<TeslaVehicle[]>([]);
  const pollRef = useRef<number | null>(null);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const vehiclesRef = useRef(onVehicles);
  vehiclesRef.current = onVehicles;

  /** Registration for a Tesla: matched by Tesla id, then VIN suffix, else default vehicle. */
  const regFor = (t: TeslaVehicle): string => {
    const byId = vehicles.find((v) => v.tesla_vehicle_id && v.tesla_vehicle_id === t.id);
    if (byId?.registration) return byId.registration;
    const byVin = vehicles.find((v) => v.vin && v.vin.slice(-4) === t.vin_last4);
    if (byVin?.registration) return byVin.registration;
    const def = vehicles.find((v) => v.is_default) ?? vehicles[0];
    return def?.registration ?? "";
  };

  const load = useCallback(
    async (wake: boolean) => {
      setLoading(true);
      try {
        const res = await listTeslaVehicles(wake);
        setConnected(res.connected);
        statusRef.current?.(res.connected);
        setTeslaVehicles(res.vehicles);
        vehiclesRef.current?.(res.vehicles);

        if (res.error)
          toast({
            title: res.rateLimited ? "Showing latest saved data" : "Tesla",
            description: res.error,
            variant: res.rateLimited ? "default" : "destructive",
          });
        return res.connected;
      } catch (e) {
        toast({
          title: "Tesla",
          description: e instanceof Error ? e.message : "Could not load Tesla vehicles",
          variant: "destructive",
        });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    // Automatic page load: never wake the car.
    load(false);
  }, [load]);

  // Handle the OAuth return. If this document is the popup opened by the app,
  // close it so the original (still signed-in) tab keeps its session.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("tesla");
    const err = params.get("tesla_error");
    if (!ok && !err) return;

    if (window.opener && window.opener !== window) {
      try {
        window.opener.postMessage({ type: "tesla-oauth", ok: Boolean(ok), error: err }, window.location.origin);
      } catch {
        /* ignore */
      }
      window.close();
      return;
    }

    if (err) toast({ title: "Tesla sign-in failed", description: err, variant: "destructive" });
    else {
      toast({ title: "Tesla connected", description: "Your Tesla account is linked." });
      load(false);
    }
    params.delete("tesla");
    params.delete("tesla_error");
    const q = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : "") + window.location.hash);
  }, [toast, load]);

  // Always clear any polling timer on unmount.
  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  const watchForConnection = useCallback(
    (popup: Window | null) => {
      const started = Date.now();
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        const timedOut = Date.now() - started > 3 * 60_000;
        const closed = Boolean(popup?.closed);
        const isConnected = await load(false).catch(() => false);
        if (isConnected || timedOut || (closed && Date.now() - started > 4000)) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setConnecting(false);
        }
      }, 3000);
    },
    [load],
  );

  const connect = async () => {
    setConnecting(true);
    try {
      const url = await startTeslaOAuth();
      // Tesla forbids framing its login page. Open a separate top-level window so
      // the signed-in app session in this tab is never navigated away or lost.
      const popup = window.open(url, "tesla-oauth", "noopener=no,width=520,height=760");
      if (!popup) {
        // Popup blocked: fall back to a full top-level navigation.
        const target = window.top ?? window;
        try {
          target.location.href = url;
        } catch {
          window.location.assign(url);
        }
        return;
      }
      watchForConnection(popup);
    } catch (e) {
      toast({
        title: "Tesla sign-in failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      setConnecting(false);
    }
  };

  // Popup posts back on completion.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as { type?: string; ok?: boolean; error?: string | null } | null;
      if (!data || data.type !== "tesla-oauth") return;
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setConnecting(false);
      if (data.error) toast({ title: "Tesla sign-in failed", description: data.error, variant: "destructive" });
      else {
        toast({ title: "Tesla connected", description: "Your Tesla account is linked." });
        load(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [toast, load]);

  const controls = (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button variant="ghost" size="icon" onClick={() => load(true)} disabled={loading} aria-label="Refresh Tesla data">
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      </Button>
      <Button size="sm" className="px-3" onClick={connect} disabled={connecting}>
        {connecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
        {connecting ? "Connecting" : connected ? "Reconnect" : "Connect"}
      </Button>
    </div>
  );

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-xs">
          <Plug className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-medium">Tesla</span>
          <Badge variant={connected ? "secondary" : "outline"} className="shrink-0 text-[10px]">
            {loading ? "Checking" : connected ? "Connected" : "Not connected"}
          </Badge>
        </span>
        {controls}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
          <Plug className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0 truncate">Tesla</span>
        </CardTitle>
        {controls}
      </CardHeader>
      <CardContent className="space-y-3">
        {!connected && !loading && (
          <p className="text-sm text-muted-foreground">
            Connect your Tesla account to see live battery and charging status.
          </p>
        )}

        {teslaVehicles.map((v) => {
          const reg = regFor(v);
          return (
            <div key={v.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-sm font-bold uppercase tracking-wider break-all">
                  {reg || "No reg set"}
                </span>
                <Badge variant="outline" className="shrink-0 text-[10px]">{v.state ?? "Unknown"}</Badge>
              </div>
              <p className="break-words text-xs text-muted-foreground">
                {vehicleModelLine({ make: "", model: "", car_type: v.car_type ?? "" }, v)}
              </p>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="min-w-0">
                  <div className="text-muted-foreground">Battery</div>
                  <div className="font-semibold">{v.battery_level != null ? `${v.battery_level}%` : "Unknown"}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-muted-foreground">Charging</div>
                  <div className="break-words font-semibold">{v.charging_state ?? "Unknown"}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-muted-foreground">Limit</div>
                  <div className="font-semibold">{v.charge_limit_soc != null ? `${v.charge_limit_soc}%` : "Unknown"}</div>
                </div>
              </div>
              {!reg && (
                <p className="text-[11px] text-muted-foreground">
                  Add your registration in Settings → Vehicle to show it here.
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

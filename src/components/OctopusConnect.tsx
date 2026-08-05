import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  PlugZap,
  Unplug,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { verifyOctopusAccount } from "@/lib/octopus-api";
import {
  clearOctopusConfig,
  getOctopusConfig,
  saveOctopusConfig,
  type OctopusConfig,
} from "@/lib/octopus-config";

interface DiscoveredSupply {
  propertyId: number;
  address: string;
  postcode: string;
  mpan: string;
  meterSerials: string[];
  tariffCode: string;
  productCode: string;
  regionCode: string;
  regionName: string;
  tariffType: string;
  agreementValidFrom: string;
  agreementValidTo: string | null;
}

interface VerifyAccountResponse {
  success: boolean;
  accountNumber: string;
  supplies: DiscoveredSupply[];
  selectedSupply: DiscoveredSupply | null;
}

function getSupplyLabel(supply: DiscoveredSupply): string {
  const address = supply.address || supply.postcode || "Property";
  return `${address} · ${supply.regionName} · ${supply.tariffType}`;
}

export default function OctopusConnect() {
  const initialConfig = useMemo(() => getOctopusConfig(), []);

  const [config, setConfig] = useState<OctopusConfig>(initialConfig);
  const [apiKey, setApiKey] = useState(initialConfig.apiKey ?? "");
  const [accountNumber, setAccountNumber] = useState(
    initialConfig.accountNumber ?? "",
  );

  const [showApiKey, setShowApiKey] = useState(false);
  const [supplies, setSupplies] = useState<DiscoveredSupply[]>([]);
  const [selectedMpan, setSelectedMpan] = useState(
    initialConfig.mpan ?? "",
  );

  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleChange = (event: Event) => {
      const customEvent = event as CustomEvent<OctopusConfig>;
      setConfig(customEvent.detail ?? getOctopusConfig());
    };

    window.addEventListener(
      "octopus-config-changed",
      handleChange,
    );

    return () => {
      window.removeEventListener(
        "octopus-config-changed",
        handleChange,
      );
    };
  }, []);

  const selectedSupply =
    supplies.find((supply) => supply.mpan === selectedMpan) ??
    supplies[0] ??
    null;

  async function handleVerify() {
    setError(null);
    setMessage(null);

    const trimmedApiKey = apiKey.trim();
    const trimmedAccountNumber = accountNumber.trim().toUpperCase();

    if (!trimmedApiKey) {
      setError("Enter your Octopus API key.");
      return;
    }

    if (!trimmedAccountNumber) {
      setError("Enter your Octopus account number.");
      return;
    }

    setLoading(true);

    try {
      const response = await verifyOctopusAccount(
        trimmedApiKey,
        trimmedAccountNumber,
      ) as VerifyAccountResponse;

      if (!response.success) {
        throw new Error("Octopus account verification failed.");
      }

      if (!response.supplies?.length) {
        throw new Error(
          "The account was verified, but no supported electricity supply was found.",
        );
      }

      setSupplies(response.supplies);

      const preferred =
        response.supplies.find(
          (supply) => supply.mpan === config.mpan,
        ) ??
        response.selectedSupply ??
        response.supplies[0];

      setSelectedMpan(preferred.mpan);

      const meterSerial = preferred.meterSerials?.[0] ?? undefined;

      const updated = saveOctopusConfig({
        apiKey: trimmedApiKey,
        accountNumber: response.accountNumber,
        productCode: preferred.productCode,
        tariffCode: preferred.tariffCode,
        region: preferred.regionCode,
        propertyId: String(preferred.propertyId),
        propertyAddress: preferred.address,
        postcode: preferred.postcode,
        mpan: preferred.mpan,
        meterSerial,
        connected: true,
        verifiedAt: new Date().toISOString(),
      });

      setConfig(updated);
      setMessage(
        `Connected to ${preferred.regionName} on ${preferred.tariffType}.`,
      );
    } catch (cause) {
      const text =
        cause instanceof Error
          ? cause.message
          : "Unable to verify the Octopus account.";

      setError(text);
    } finally {
      setLoading(false);
    }
  }

  function handleSupplyChange(mpan: string) {
    setSelectedMpan(mpan);

    const supply = supplies.find(
      (item) => item.mpan === mpan,
    );

    if (!supply) return;

    const updated = saveOctopusConfig({
      productCode: supply.productCode,
      tariffCode: supply.tariffCode,
      region: supply.regionCode,
      propertyId: String(supply.propertyId),
      propertyAddress: supply.address,
      postcode: supply.postcode,
      mpan: supply.mpan,
      meterSerial: supply.meterSerials?.[0] ?? undefined,
      connected: true,
      verifiedAt: new Date().toISOString(),
    });

    setConfig(updated);
    setMessage(
      `Using ${supply.regionName} on ${supply.tariffType}.`,
    );
  }

  function handleDisconnect() {
    setDisconnecting(true);
    setError(null);
    setMessage(null);

    try {
      const reset = clearOctopusConfig();

      setConfig(reset);
      setApiKey("");
      setAccountNumber("");
      setSupplies([]);
      setSelectedMpan("");
      setMessage("Octopus account disconnected.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card className="neon-border">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PlugZap className="h-5 w-5 text-primary" />
              Octopus Energy
            </CardTitle>

            <CardDescription className="mt-1">
              Connect your account to discover your property, tariff,
              MPAN, meter and UK region automatically.
            </CardDescription>
          </div>

          {config.connected ? (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Connected
            </Badge>
          ) : (
            <Badge variant="outline">Not connected</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Octopus connection failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {message && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Octopus</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {config.connected && (
          <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Account</p>
              <p className="font-medium">
                {config.accountNumber ?? "—"}
              </p>
            </div>

            <div>
              <p className="text-muted-foreground">Region</p>
              <p className="font-medium">
                {config.region}
              </p>
            </div>

            <div>
              <p className="text-muted-foreground">Tariff</p>
              <p className="break-all font-medium">
                {config.tariffCode ?? config.productCode}
              </p>
            </div>

            <div>
              <p className="text-muted-foreground">MPAN</p>
              <p className="break-all font-medium">
                {config.mpan ?? "—"}
              </p>
            </div>

            <div>
              <p className="text-muted-foreground">Meter</p>
              <p className="font-medium">
                {config.meterSerial ?? "—"}
              </p>
            </div>

            <div>
              <p className="text-muted-foreground">Property</p>
              <p className="font-medium">
                {config.propertyAddress || config.postcode || "—"}
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="octopus-account-number">
              Account number
            </Label>

            <Input
              id="octopus-account-number"
              value={accountNumber}
              onChange={(event) =>
                setAccountNumber(event.target.value)
              }
              placeholder="A-12345678"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="octopus-api-key">
              API key
            </Label>

            <div className="relative">
              <Input
                id="octopus-api-key"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) =>
                  setApiKey(event.target.value)
                }
                placeholder="sk_live_..."
                autoComplete="off"
                className="pr-10"
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowApiKey((current) => !current)}
                aria-label={
                  showApiKey ? "Hide API key" : "Show API key"
                }
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {supplies.length > 1 && (
          <div className="space-y-2">
            <Label>Electricity supply</Label>

            <Select
              value={selectedMpan}
              onValueChange={handleSupplyChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a supply" />
              </SelectTrigger>

              <SelectContent>
                {supplies.map((supply) => (
                  <SelectItem
                    key={supply.mpan}
                    value={supply.mpan}
                  >
                    {getSupplyLabel(supply)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            onClick={handleVerify}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying…
              </>
            ) : config.connected ? (
              "Reverify account"
            ) : (
              "Connect Octopus"
            )}
          </Button>

          {config.connected && (
            <Button
              type="button"
              variant="outline"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              <Unplug className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Your API key is stored in this browser for the current
          development version. Before a public release, move customer
          credentials into encrypted server-side storage.
        </p>
      </CardContent>
    </Card>
  );
}
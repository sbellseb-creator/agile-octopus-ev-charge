import { useEffect, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Car, Plug, Zap, PoundSterling, Fuel, Bell, ShieldCheck, Settings as Cog } from "lucide-react";
import TeslaConnect from "@/components/TeslaConnect";
import VehicleEditForm from "@/components/vehicles/VehicleEditForm";
import {
  CHARGER_MAX_AMPS,
  CHARGER_MAX_KW,
  getSettings,
  loadSettingsFromCloud,
  saveSettings,
  subscribeSettings,
  type AppSettings,
} from "@/lib/app-settings";
import { getSyncStatus, subscribeSync, type SyncStatus } from "@/lib/cloud-sync";
import { getTeslaDiagnostics } from "@/lib/tesla";
import { getDefaultRate, setDefaultRate } from "@/lib/work-data";
import type { Vehicle } from "@/lib/vehicle-data";

export const APP_VERSION = "2C.0";
const SCHEMA_VERSION = "2026-07-28 (Phase 2B)";
const FUEL_KEY = "fuel-compare-settings";

const UK_REGIONS = [
  ["A", "Eastern England"], ["B", "East Midlands"], ["C", "London"], ["D", "Merseyside & N Wales"],
  ["E", "West Midlands"], ["F", "North East"], ["G", "North West"], ["H", "Southern England"],
  ["J", "South East"], ["K", "South Wales"], ["L", "South West"], ["M", "Yorkshire"],
  ["N", "South Scotland"], ["P", "North Scotland"],
] as const;

interface FuelSettings {
  petrol_p_l: number;
  diesel_p_l: number;
  petrol_mpg: number;
  diesel_mpg: number;
}

function readFuel(): FuelSettings {
  const defaults: FuelSettings = { petrol_p_l: 138.5, diesel_p_l: 145.2, petrol_mpg: 45, diesel_mpg: 55 };
  try {
    const raw = localStorage.getItem(FUEL_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaults;
}

interface Props {
  vehicles: Vehicle[];
  onUpdateVehicle: (id: string, updates: Partial<Omit<Vehicle, "id">>) => void;
}

/** Single consolidated Settings destination. Mobile-first, one column at 320px. */
export default function SettingsPanel({ vehicles, onUpdateVehicle }: Props) {
  const [settings, setSettings] = useState<AppSettings>(getSettings);
  const [fuel, setFuel] = useState<FuelSettings>(readFuel);
  const [claimRate, setClaimRate] = useState<number>(getDefaultRate);
  const [sync, setSync] = useState<SyncStatus>(getSyncStatus);
  const tesla = getTeslaDiagnostics();

  useEffect(() => subscribeSettings(setSettings), []);
  useEffect(() => subscribeSync(setSync), []);
  useEffect(() => {
    void loadSettingsFromCloud();
  }, []);

  const patch = (p: Partial<AppSettings>) => void saveSettings(p);

  const saveFuel = (p: Partial<FuelSettings>) => {
    const next = { ...fuel, ...p };
    setFuel(next);
    localStorage.setItem(FUEL_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("fuel-settings:updated"));
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
          <Cog className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0 truncate">Settings</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <div className="mb-3 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px]">
            Cloud sync: {sync.state === "error" ? "error" : sync.state}
          </span>
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px]">
            Tesla: {tesla.connected == null ? "unknown" : tesla.connected ? "connected" : "not connected"}
          </span>
        </div>
        <Accordion type="multiple" className="w-full">
          {/* Vehicle */}
          <AccordionItem value="vehicle">
            <AccordionTrigger className="gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2"><Car className="h-4 w-4 shrink-0 text-primary" />Vehicle</span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4">
              {vehicles.length === 0 && <p className="text-xs text-muted-foreground">No vehicles yet — add one on the Vehicles tab.</p>}
              {vehicles.map((v) => (
                <div key={v.id} className="space-y-2 rounded-lg border border-border p-3">
                  <p className="font-mono text-sm font-bold uppercase tracking-wider break-all">{v.registration || "No reg"}</p>
                  <VehicleEditForm vehicle={v} onSave={onUpdateVehicle} />
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>

          {/* Home charger */}
          <AccordionItem value="charger">
            <AccordionTrigger className="gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2"><Zap className="h-4 w-4 shrink-0 text-primary" />Charging</span>
            </AccordionTrigger>
            <AccordionContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">Current (A) — max {CHARGER_MAX_AMPS} A</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  max={CHARGER_MAX_AMPS}
                  value={settings.charger_amps}
                  onChange={(e) => patch({ charger_amps: Math.min(Number(e.target.value) || 0, CHARGER_MAX_AMPS) })}
                  className="w-full"
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">Power (kW) — max {CHARGER_MAX_KW} kW</Label>
                <Input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  max={CHARGER_MAX_KW}
                  value={settings.charger_kw}
                  onChange={(e) => patch({ charger_kw: Math.min(Number(e.target.value) || 0, CHARGER_MAX_KW) })}
                  className="w-full"
                />
              </div>
              <div className="min-w-0 space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Charging location</Label>
                <Input value={settings.charging_location} onChange={(e) => patch({ charging_location: e.target.value })} className="w-full" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">Home latitude</Label>
                <Input
                  type="number"
                  step="0.000001"
                  inputMode="decimal"
                  placeholder="e.g. 51.507351"
                  value={settings.home_latitude ?? ""}
                  onChange={(e) => patch({ home_latitude: e.target.value === "" ? null : Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">Home longitude</Label>
                <Input
                  type="number"
                  step="0.000001"
                  inputMode="decimal"
                  placeholder="e.g. -0.127758"
                  value={settings.home_longitude ?? ""}
                  onChange={(e) => patch({ home_longitude: e.target.value === "" ? null : Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div className="min-w-0 sm:col-span-2">
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={useCurrentLocation}>
                  Use my current location
                </Button>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Tesla charge schedules are tied to a location. Your device location is only read when you press this button.
                </p>
              </div>

              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Tariff and region */}
          <AccordionItem value="tariff">
            <AccordionTrigger className="gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2"><PoundSterling className="h-4 w-4 shrink-0 text-primary" />Electricity</span>
            </AccordionTrigger>
            <AccordionContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">Region</Label>
                <Select value={settings.region} onValueChange={(v) => patch({ region: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UK_REGIONS.map(([code, label]) => (
                      <SelectItem key={code} value={code}>{code} — {label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">Tariff</Label>
                <Select value={settings.tariff} onValueChange={(v) => patch({ tariff: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agile">Octopus Agile</SelectItem>
                    <SelectItem value="tracker">Octopus Tracker</SelectItem>
                    <SelectItem value="flexible">Octopus Flexible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[11px] text-muted-foreground sm:col-span-2">
                Rate pages keep their own selector; this is your default preference.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Fuel and mileage */}
          <AccordionItem value="fuel">
            <AccordionTrigger className="gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2"><Fuel className="h-4 w-4 shrink-0 text-primary" />Fuel and mileage (comparison)</span>
            </AccordionTrigger>
            <AccordionContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">Petrol (p/litre)</Label>
                <Input type="number" step="0.1" inputMode="decimal" value={fuel.petrol_p_l} onChange={(e) => saveFuel({ petrol_p_l: Number(e.target.value) })} className="w-full" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">Diesel (p/litre)</Label>
                <Input type="number" step="0.1" inputMode="decimal" value={fuel.diesel_p_l} onChange={(e) => saveFuel({ diesel_p_l: Number(e.target.value) })} className="w-full" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">Petrol mpg</Label>
                <Input type="number" inputMode="decimal" value={fuel.petrol_mpg} onChange={(e) => saveFuel({ petrol_mpg: Number(e.target.value) })} className="w-full" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">Diesel mpg</Label>
                <Input type="number" inputMode="decimal" value={fuel.diesel_mpg} onChange={(e) => saveFuel({ diesel_mpg: Number(e.target.value) })} className="w-full" />
              </div>
              <div className="min-w-0 space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Work claim rate (p/mile)</Label>
                <Input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={claimRate}
                  onChange={(e) => {
                    const r = Number(e.target.value);
                    setClaimRate(r);
                    setDefaultRate(r);
                    patch({ work_rate_pence_per_mile: r });
                  }}
                  className="w-full"
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Tesla connection */}
          <AccordionItem value="tesla">
            <AccordionTrigger className="gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2"><Plug className="h-4 w-4 shrink-0 text-primary" />Tesla connection</span>
            </AccordionTrigger>
            <AccordionContent>
              <TeslaConnect vehicles={vehicles} />
            </AccordionContent>
          </AccordionItem>

          {/* Notifications */}
          <AccordionItem value="notifications">
            <AccordionTrigger className="gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2"><Bell className="h-4 w-4 shrink-0 text-primary" />Notifications</span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              <Toggle label="Cheap slot alerts" checked={settings.notify_cheap_slots} onChange={(c) => patch({ notify_cheap_slots: c })} />
              <Toggle label="Charge complete" checked={settings.notify_charge_complete} onChange={(c) => patch({ notify_charge_complete: c })} />
              <Toggle label="Price spike alerts" checked={settings.notify_price_alerts} onChange={(c) => patch({ notify_price_alerts: c })} />
              <p className="text-[11px] text-muted-foreground">Preferences are saved now; delivery arrives in a later phase.</p>
            </AccordionContent>
          </AccordionItem>

          {/* Privacy and diagnostics */}
          <AccordionItem value="diagnostics" className="border-b-0">
            <AccordionTrigger className="gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />Privacy & Cloud</span>
            </AccordionTrigger>
            <AccordionContent className="space-y-1.5 text-xs">
              <Diag label="App version" value={APP_VERSION} />
              <Diag label="Schema version" value={SCHEMA_VERSION} />
              <Diag label="Sync state" value={sync.state} />
              <Diag label="Last successful sync" value={sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString("en-GB") : "Never"} />
              <Diag label="Pending changes" value={String(sync.pendingLocalChanges)} />
              {sync.state === "error" && <Diag label="Last sync error" value={sync.message ?? "Unknown"} />}
              <Diag label="Tesla connection" value={tesla.connected == null ? "Unknown" : tesla.connected ? "Connected" : "Not connected"} />
              <Diag label="Last Tesla update" value={tesla.last_success_at ? new Date(tesla.last_success_at).toLocaleString("en-GB") : "Never"} />
              <Diag label="Last Tesla request" value={tesla.last_wake_flag == null ? "Unknown" : tesla.last_wake_flag ? "wake=true (manual refresh)" : "wake=false"} />
              <p className="pt-2 text-[11px] text-muted-foreground">
                Tokens, OAuth secrets and full VIN are never shown here and never leave the server.
              </p>
              <Button variant="outline" size="sm" className="w-full" onClick={() => void loadSettingsFromCloud()}>
                Reload settings from cloud
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <Label className="min-w-0 break-words text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Diag({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-border/50 pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all text-right font-medium">{value}</span>
    </div>
  );
}

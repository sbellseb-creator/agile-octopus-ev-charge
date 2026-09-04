import { useState, useEffect, useCallback, useRef } from "react";
import { Zap, Car, TrendingDown, CalendarClock, Gauge, CloudSun, Briefcase, LogOut, Home as HomeIcon, Settings as Cog } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { loadSessions, addSession, deleteSession, updateSession } from "@/lib/charge-data";
import { loadVehicles, addVehicle, updateVehicle, deleteVehicle } from "@/lib/vehicle-data";
import type { Vehicle } from "@/lib/vehicle-data";
import { useAuth } from "@/hooks/useAuth";
import ChargeForm from "@/components/ChargeForm";
import ChargeCharts from "@/components/ChargeCharts";
import ChargeTable from "@/components/ChargeTable";
import ChargeStats from "@/components/ChargeStats";
import VehicleManager from "@/components/VehicleManager";
import AgileRates from "@/components/AgileRates";
import ChargePlanner from "@/components/ChargePlanner";
import TrackerRates from "@/components/TrackerRates";
import WeatherForecast from "@/components/WeatherForecast";
import FuelComparison from "@/components/FuelComparison";
import WorkCosts from "@/components/WorkCosts";
import WorkMileageCard from "@/components/WorkMileageCard";
import TariffComparison from "@/components/TariffComparison";
import SyncIndicator from "@/components/SyncIndicator";
import SettingsPanel from "@/components/SettingsPanel";
import VehicleIdentityBar from "@/components/vehicles/VehicleIdentityBar";
import { loadSettingsFromCloud } from "@/lib/app-settings";
import { startAutoSync } from "@/lib/cloud-sync";
import { recalculateHistoricalSessions } from "@/lib/recalc-historical";
import HomeDashboard from "@/components/HomeDashboard";

export default function Index() {
  const [sessions, setSessions] = useState(loadSessions);
  const [sessionsCloudConfirmed, setSessionsCloudConfirmed] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [tab, setTab] = useState("home");
  const historicalSessionsRecalculated = useRef(false);
  const { signOut } = useAuth();

  useEffect(() => {
    void loadVehicles().then(setVehicles);
    void loadSettingsFromCloud();
    const reload = () => void loadVehicles().then(setVehicles);
    window.addEventListener("vehicles:updated", reload);
    return () => window.removeEventListener("vehicles:updated", reload);
  }, []);

  useEffect(() => {
    if (
      !sessionsCloudConfirmed ||
      vehicles.length === 0 ||
      historicalSessionsRecalculated.current
    ) {
      return;
    }

    historicalSessionsRecalculated.current = true;
    const capacityByVehicle = new Map(
      vehicles.map((vehicle) => [vehicle.id, vehicle.battery_kwh]),
    );
    const corrections = recalculateHistoricalSessions(
      sessions,
      (session) => capacityByVehicle.get(session.vehicle_id),
    );

    if (corrections.length === 0) return;

    corrections.forEach(({ id, updates }) => updateSession(id, updates));
    setSessions(loadSessions());
  }, [sessions, sessionsCloudConfirmed, vehicles]);

  useEffect(() => {
    // Cloud sync: migrate/merge local data, then keep devices in step.
    const stop = startAutoSync();
    const onUpdated = () => {
      setSessions(loadSessions());
      setSessionsCloudConfirmed(true);
    };
    window.addEventListener("cloud-sync:updated", onUpdated);
    return () => {
      window.removeEventListener("cloud-sync:updated", onUpdated);
      stop();
    };
  }, []);

  const handleAddSession = (data: Parameters<typeof addSession>[0]) => setSessions(addSession(data));
  const handleDeleteSession = (id: string) => setSessions(deleteSession(id));
  const handleUpdateSession = (id: string, updates: Partial<Parameters<typeof updateSession>[1]>) => setSessions(updateSession(id, updates));
  
  const handleAddVehicle = useCallback(async (v: Omit<Vehicle, "id">) => {
    const updated = await addVehicle(v);
    setVehicles(updated);
  }, []);
  
  const handleUpdateVehicle = useCallback(async (id: string, updates: Partial<Omit<Vehicle, "id">>) => {
    const updated = await updateVehicle(id, updates);
    setVehicles(updated);
  }, []);

  const handleDeleteVehicle = useCallback(async (id: string) => {
    const updated = await deleteVehicle(id);
    setVehicles(updated);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container flex min-w-0 items-center gap-1.5 py-3 sm:gap-3 sm:py-4">
          <Zap className="h-5 w-5 shrink-0 text-primary sm:h-7 sm:w-7" />
          <h1 className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight sm:text-xl">EV Charge Tracker</h1>
          <span className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300 min-[430px]:inline">
            Release 031
          </span>
          <SyncIndicator />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setTab("settings")}
            aria-label="Settings"
          >
            <Cog className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={signOut} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <VehicleIdentityBar vehicles={vehicles} />

      <main className="container py-3 sm:py-4">
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="sticky top-2 z-50 grid h-auto w-full grid-cols-4 gap-0.5 border border-white/10 bg-slate-900/95 p-1 shadow-2xl backdrop-blur-xl auto-rows-max">
            <TabsTrigger value="home" className="flex h-9 flex-col items-center gap-1 px-2 py-2 text-[10px] font-medium">
              <HomeIcon className="h-4 w-4 shrink-0" /> Home
            </TabsTrigger>
            <TabsTrigger value="agile" className="flex h-9 flex-col items-center gap-1 px-2 py-2 text-[10px] font-medium">
              <TrendingDown className="h-4 w-4 shrink-0" /> Agile
            </TabsTrigger>
            <TabsTrigger value="charging" className="flex h-9 flex-col items-center gap-1 px-2 py-2 text-[10px] font-medium">
              <Zap className="h-4 w-4 shrink-0" /> Charge
            </TabsTrigger>
            <TabsTrigger value="tracker" className="flex h-9 flex-col items-center gap-1 px-2 py-2 text-[10px] font-medium">
              <Gauge className="h-4 w-4 shrink-0" /> Tracker
            </TabsTrigger>
            <TabsTrigger value="planner" className="flex h-9 flex-col items-center gap-1 px-2 py-2 text-[10px] font-medium">
              <CalendarClock className="h-4 w-4 shrink-0" /> Planner
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="flex h-9 flex-col items-center gap-1 px-2 py-2 text-[10px] font-medium">
              <Car className="h-4 w-4 shrink-0" /> Vehicles
            </TabsTrigger>
            <TabsTrigger value="forecast" className="flex h-9 flex-col items-center gap-1 px-2 py-2 text-[10px] font-medium">
              <CloudSun className="h-4 w-4 shrink-0" /> Forecast
            </TabsTrigger>
            <TabsTrigger value="work" className="flex h-9 flex-col items-center gap-1 px-2 py-2 text-[10px] font-medium">
              <Briefcase className="h-4 w-4 shrink-0" /> Work
            </TabsTrigger>
          </TabsList>

          <TabsContent value="home" className="space-y-6">
            <HomeDashboard
              vehicles={vehicles}
              sessions={sessionsCloudConfirmed ? sessions : []}
              onSessionsChanged={() => setSessions(loadSessions())}
              onManageSchedule={() => setTab("planner")}
              onReviewCharges={() => setTab("charging")}
            />
          </TabsContent>

          <TabsContent value="agile" className="space-y-6">
            <AgileRates vehicles={vehicles} onSessionSaved={() => setSessions(loadSessions())} />
            <TariffComparison />
          </TabsContent>

          <TabsContent value="tracker" className="space-y-6">
            <TrackerRates />
          </TabsContent>

          <TabsContent value="forecast" className="space-y-6">
            <WeatherForecast />
          </TabsContent>

          <TabsContent value="planner" className="space-y-6">
            <ChargePlanner vehicles={vehicles} onSessionSaved={() => setSessions(loadSessions())} />
          </TabsContent>

          <TabsContent value="charging" className="space-y-6">
            <ChargeStats sessions={sessionsCloudConfirmed ? sessions : []} />
            <FuelComparison sessions={sessionsCloudConfirmed ? sessions : []} vehicles={vehicles} />
            <ChargeCharts sessions={sessionsCloudConfirmed ? sessions : []} />
            <ChargeForm onAdd={handleAddSession} vehicles={vehicles} />
            <ChargeTable
              sessions={sessionsCloudConfirmed ? sessions : []}
              onDelete={handleDeleteSession}
              onUpdate={handleUpdateSession}
            />
          </TabsContent>

          <TabsContent value="work" className="space-y-6">
            <WorkMileageCard vehicles={vehicles} />
            <WorkCosts sessions={sessions} vehicles={vehicles} />
          </TabsContent>

          <TabsContent value="vehicles" className="space-y-6">
            <VehicleManager vehicles={vehicles} onAdd={handleAddVehicle} onDelete={handleDeleteVehicle} />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <SettingsPanel vehicles={vehicles} onUpdateVehicle={handleUpdateVehicle} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
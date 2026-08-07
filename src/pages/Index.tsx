import { useState, useEffect, useCallback } from "react";
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
import HomeDashboard from "@/components/HomeDashboard";

export default function Index() {
  const [sessions, setSessions] = useState(loadSessions);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [tab, setTab] = useState("home");
  const { signOut } = useAuth();

  useEffect(() => {
    void loadVehicles().then(setVehicles);
    void loadSettingsFromCloud();
    const reload = () => void loadVehicles().then(setVehicles);
    window.addEventListener("vehicles:updated", reload);
    return () => window.removeEventListener("vehicles:updated", reload);
  }, []);

  useEffect(() => {
    // Cloud sync: migrate/merge local data, then keep devices in step.
    const stop = startAutoSync();
    const onUpdated = () => setSessions(loadSessions());
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

      <main className="container py-6">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="grid grid-cols-4 w-full h-auto p-1 gap-1">
            <TabsTrigger value="home" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <HomeIcon className="h-4 w-4 shrink-0" /> Home
            </TabsTrigger>
            <TabsTrigger value="agile" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <TrendingDown className="h-4 w-4 shrink-0" /> Agile
            </TabsTrigger>
            <TabsTrigger value="tracker" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <Gauge className="h-4 w-4 shrink-0" /> Tracker
            </TabsTrigger>
            <TabsTrigger value="forecast" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <CloudSun className="h-4 w-4 shrink-0" /> Forecast
            </TabsTrigger>
          </TabsList>
          <TabsList className="grid grid-cols-4 w-full h-auto p-1 gap-1">
            <TabsTrigger value="planner" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <CalendarClock className="h-4 w-4 shrink-0" /> Planner
            </TabsTrigger>
            <TabsTrigger value="charging" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <Zap className="h-4 w-4 shrink-0" /> Sessions
            </TabsTrigger>
            <TabsTrigger value="work" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <Briefcase className="h-4 w-4 shrink-0" /> Work
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <Car className="h-4 w-4 shrink-0" /> Vehicles
            </TabsTrigger>
          </TabsList>

          <TabsContent value="home" className="space-y-6">
            <HomeDashboard vehicles={vehicles} sessions={sessions} onManageSchedule={() => setTab("planner")} />
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
            <ChargeStats sessions={sessions} />
            <FuelComparison sessions={sessions} vehicles={vehicles} />
            <ChargeCharts sessions={sessions} />
            <ChargeForm onAdd={handleAddSession} vehicles={vehicles} />
            <ChargeTable sessions={sessions} onDelete={handleDeleteSession} onUpdate={handleUpdateSession} />
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

import { useState, useEffect, useCallback } from "react";
import { Zap, Car, TrendingDown, CalendarClock, Gauge, CloudSun, Briefcase, LogOut, Home as HomeIcon, Settings as Cog, MoreHorizontal } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  const [sessionsCloudConfirmed, setSessionsCloudConfirmed] = useState(false);
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

      <main className="container py-4 pb-24 sm:py-6 lg:pb-6">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="fixed inset-x-2 bottom-2 z-50 grid h-auto grid-cols-6 gap-1 border border-white/10 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-xl lg:static lg:w-full lg:bg-card/90 lg:p-1">
            <TabsTrigger value="home" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <HomeIcon className="h-4 w-4 shrink-0" /> Home
            </TabsTrigger>
            <TabsTrigger value="charging" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <Zap className="h-4 w-4 shrink-0" /> Charge
            </TabsTrigger>
            <TabsTrigger value="tracker" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <Gauge className="h-4 w-4 shrink-0" /> Tracker
            </TabsTrigger>
            <TabsTrigger value="planner" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <CalendarClock className="h-4 w-4 shrink-0" /> Planner
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <Car className="h-4 w-4 shrink-0" /> Vehicles
            </TabsTrigger>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-full min-w-0 flex-col gap-0.5 px-1 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground sm:text-sm sm:flex-row sm:gap-1.5">
                  <MoreHorizontal className="h-4 w-4 shrink-0" /> More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-48 lg:side-bottom">
                <DropdownMenuItem onSelect={() => setTab("agile")}>
                  <TrendingDown className="mr-2 h-4 w-4" /> Agile prices
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTab("forecast")}>
                  <CloudSun className="mr-2 h-4 w-4" /> Forecast
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTab("work")}>
                  <Briefcase className="mr-2 h-4 w-4" /> Work
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TabsList>

          <TabsContent value="home" className="space-y-6">
            <HomeDashboard
              vehicles={vehicles}
              sessions={sessionsCloudConfirmed ? sessions : []}
              onManageSchedule={() => setTab("planner")}
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

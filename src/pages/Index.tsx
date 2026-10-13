import { useState, useEffect, useCallback, useRef } from "react";
import { Zap, Car, TrendingDown, Gauge, CloudSun, Briefcase, Sparkles, LogOut, Home as HomeIcon, Settings as Cog, TrendingUp } from "lucide-react";
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
import AgileCrystalBall from "@/components/AgileCrystalBall";
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
import HopefulEvMan from "@/components/HopefulEvMan";

export default function Index() {
  const [sessions, setSessions] = useState(loadSessions);
  const [sessionsCloudConfirmed, setSessionsCloudConfirmed] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [editingSession, setEditingSession] = useState<any>(null);
  const [tab, setTab] = useState("home");
  const [agileSub, setAgileSub] = useState<"rates" | "crystal">("rates");
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
      (Array.isArray(vehicles) ? vehicles : []).map((vehicle) => [vehicle?.id, vehicle?.battery_kwh]),
    );
    const corrections = recalculateHistoricalSessions(
      Array.isArray(sessions) ? sessions : [],
      (session) => capacityByVehicle.get(session?.vehicle_id) || 75,
    );
    
    if (!corrections || !Array.isArray(corrections) || corrections.length === 0) return;

    corrections.forEach(({ id, updates }) => updateSession(id, updates));
    setSessions(loadSessions());
  }, [sessions, sessionsCloudConfirmed, vehicles]);

  useEffect(() => {
    let stop = () => {};
    try {
      stop = startAutoSync() || (() => {});
    } catch (e) {
      console.error("Cloud sync init guard:", e);
    }

    const onUpdated = () => {
      try {
        const rawData = loadSessions();
        setSessions(Array.isArray(rawData) ? rawData : []);
        setSessionsCloudConfirmed(true);
      } catch (err) {
        console.error("Sync payload layout error caught safely:", err);
      }
    };

    window.addEventListener("cloud-sync:updated", onUpdated);

    return () => {
      window.removeEventListener("cloud-sync:updated", onUpdated);
      stop();
    };
  }, []);

  const handleAddSession = (data: any) => {
    try {
      const updated = addSession(data);
      if (Array.isArray(updated)) setSessions(updated);
    } catch (e) {
      console.error("Session insert error handled silently:", e);
    }
  };

  const handleDeleteSession = (id: string) => {
    try {
      if (!id) return;
      const updated = deleteSession(id);
      setEditingSession((cur: any) => (cur?.id === id ? null : cur));
      if (Array.isArray(updated)) setSessions(updated);
    } catch (e) {
      console.error("Session drop error handled silently:", e);
    }
  };

  const handleUpdateSession = (id: string, updates: any) => {
    try {
      if (!id) return;
      const updated = updateSession(id, updates);
      if (Array.isArray(updated)) setSessions(updated);
    } catch (e) {
      console.error("Session update error handled silently:", e);
    }
  };
  
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

  const mainTabs = [
    { id: 'home', label: 'Home', icon: HomeIcon },
    { id: 'agile', label: 'Agile', icon: TrendingDown },
    { id: 'charging', label: 'Charge', icon: Zap },
    { id: 'tracker', label: 'Tracker', icon: Gauge },
    { id: 'vehicles', label: 'Vehicles', icon: Car },
    { id: 'forecast', label: 'Forecast', icon: CloudSun },
    { id: 'work', label: 'Work', icon: Briefcase },
  ];

  return (
    <div className="min-h-screen bg-background text-white">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl">
        <div className="container flex min-w-0 items-center gap-2 py-3 sm:gap-3 sm:py-4">
          <Zap className="h-5 w-5 shrink-0 text-emerald-400 sm:h-7 sm:w-7" />
          <h1 className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight sm:text-xl">EV Charge Tracker</h1>
          <span className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 min-[430px]:inline">
            Release 032
          </span>
          <SyncIndicator />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-slate-400 hover:text-white"
            onClick={() => setTab("settings")}
            aria-label="Settings"
          >
            <Cog className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-400 hover:text-white" onClick={signOut} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="container py-4 space-y-4">
        <Tabs value={tab === "planner" ? "charging" : tab} onValueChange={setTab} className="space-y-4">
          
          {/* Sleek Floating Glassmorphism Navigation Dock */}
          <div className="sticky top-2 z-50 bg-slate-900/90 backdrop-blur-2xl border border-slate-800/80 rounded-2xl p-2 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
              {mainTabs.map((t) => {
                const Icon = t.icon;
                const isActive = (tab === "planner" ? "charging" : tab) === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 whitespace-nowrap ${
                      isActive
                        ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30 shadow-inner'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Contextual Sub-menu for Agile View */}
            {tab === "agile" && (
              <div className="flex items-center bg-slate-950/70 p-1 rounded-xl border border-slate-800/60 w-full md:w-auto justify-center">
                <button
                  onClick={() => setAgileSub("rates")}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                    agileSub === "rates"
                      ? 'bg-amber-400 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Live Rates</span>
                </button>
                <button
                  onClick={() => setAgileSub("crystal")}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                    agileSub === "crystal"
                      ? 'bg-amber-400 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Crystal Ball</span>
                  <HopefulEvMan />
                </button>
              </div>
            )}
          </div>

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
            {agileSub === "rates" ? (
              <div className="space-y-6">
                <AgileRates vehicles={vehicles} onSessionSaved={() => setSessions(loadSessions())} />
                <TariffComparison />
              </div>
            ) : (
              <div className="space-y-6">
                <AgileCrystalBall />
              </div>
            )}
          </TabsContent>

          <TabsContent value="charging" className="space-y-6">
            <ChargePlanner vehicles={vehicles} onSessionSaved={() => setSessions(loadSessions())} />
            <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Log a past session manually</h2>
            <ChargeForm
              onSessionAdded={handleAddSession}
              onSessionUpdated={(id, updates) => { handleUpdateSession(id, updates); setEditingSession(null); }}
              onCancelEdit={() => setEditingSession(null)}
              editingSession={editingSession}
              vehicles={vehicles}
            />
            <ChargeStats sessions={sessions || []} />
            <ChargeTable sessions={sessions || []} onDeleteSession={handleDeleteSession}
              onEditSession={(s) => { setEditingSession(s); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            />
          </TabsContent>

          <TabsContent value="tracker" className="space-y-6">
            <TrackerRates />
          </TabsContent>

          <TabsContent value="vehicles" className="space-y-6">
            <VehicleManager
              vehicles={vehicles}
              onAddVehicle={handleAddVehicle}
              onUpdateVehicle={handleUpdateVehicle}
              onDeleteVehicle={handleDeleteVehicle}
            />
          </TabsContent>

          <TabsContent value="forecast" className="space-y-6">
            <WeatherForecast />
          </TabsContent>

          <TabsContent value="work" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {vehicles && vehicles.length > 0 ? <WorkCosts sessions={sessions || []} vehicles={vehicles} /> : <div className="text-xs text-slate-400 p-4">Loading business profile data...</div>}
              <WorkMileageCard vehicles={vehicles} />
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <SettingsPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

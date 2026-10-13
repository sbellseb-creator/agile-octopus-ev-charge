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
    <div className="min-h-screen bg-slate-950 text-white selection:bg-emerald-500 selection:text-slate-950">
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-xl">
        <div className="container flex min-w-0 items-center gap-3 py-3 sm:py-4">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <Zap className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-wider uppercase bg-gradient-to-r from-white via-slate-200 to-emerald-400 bg-clip-text text-transparent sm:text-xl">
              EV Charge Hub
            </h1>
            <p className="text-[10px] font-semibold text-emerald-400/80 tracking-widest uppercase">Telemetry & Rates</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.15)] min-[430px]:inline">
              REL 032
            </span>
            <SyncIndicator />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
              onClick={() => setTab("settings")}
              aria-label="Settings"
            >
              <Cog className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 shrink-0 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-rose-400 hover:bg-rose-500/10 transition-all" 
              onClick={signOut} 
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        <Tabs value={tab === "planner" ? "charging" : tab} onValueChange={setTab} className="space-y-6">
          
          {/* 🔥 RESPONSIVE ADAPTIVE DOCK (PERFECT ON DESKTOP, FOLD OPEN, & FOLD OUTER) */}
          <div className="sticky top-3 z-50 bg-slate-900/95 backdrop-blur-2xl border border-emerald-500/30 rounded-2xl p-2.5 shadow-[0_0_30px_rgba(0,0,0,0.8),0_0_15px_rgba(16,185,129,0.15)] flex flex-col lg:flex-row items-center justify-center lg:justify-between gap-3 w-full max-w-4xl mx-auto">
            <div className="grid grid-cols-4 sm:flex sm:flex-wrap items-center justify-center gap-1.5 w-full lg:w-auto">
              {mainTabs.map((t) => {
                const Icon = t.icon;
                const isActive = (tab === "planner" ? "charging" : tab) === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-300 whitespace-nowrap ${
                      isActive
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.4)] scale-105 font-black col-span-2 sm:col-span-1'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80 col-span-1'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-950 stroke-[2.5]' : 'text-emerald-400'}`} />
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>

            {tab === "agile" && (
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-emerald-500/20 w-full lg:w-auto justify-center shadow-inner shrink-0">
                <button
                  onClick={() => setAgileSub("rates")}
                  className={`flex-1 lg:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-200 ${
                    agileSub === "rates"
                      ? 'bg-amber-400 text-slate-950 shadow-[0_0_15px_rgba(251,191,36,0.4)] scale-105'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Live Rates</span>
                </button>
                <button
                  onClick={() => setAgileSub("crystal")}
                  className={`flex-1 lg:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-200 ${
                    agileSub === "crystal"
                      ? 'bg-amber-400 text-slate-950 shadow-[0_0_15px_rgba(251,191,36,0.4)] scale-105'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
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

import { useState, useEffect, useCallback } from "react";
import { Zap, Car, TrendingDown, CalendarClock, Gauge, CloudSun } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadSessions, addSession, deleteSession, updateSession } from "@/lib/charge-data";
import { loadVehicles, addVehicle, deleteVehicle } from "@/lib/vehicle-data";
import type { Vehicle } from "@/lib/vehicle-data";
import ChargeForm from "@/components/ChargeForm";
import ChargeCharts from "@/components/ChargeCharts";
import ChargeTable from "@/components/ChargeTable";
import ChargeStats from "@/components/ChargeStats";
import VehicleManager from "@/components/VehicleManager";
import AgileRates from "@/components/AgileRates";
import ChargePlanner from "@/components/ChargePlanner";
import TrackerRates from "@/components/TrackerRates";
import WeatherForecast from "@/components/WeatherForecast";

export default function Index() {
  const [sessions, setSessions] = useState(loadSessions);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    loadVehicles().then(setVehicles);
  }, []);

  const handleAddSession = (data: Parameters<typeof addSession>[0]) => setSessions(addSession(data));
  const handleDeleteSession = (id: string) => setSessions(deleteSession(id));
  const handleUpdateSession = (id: string, updates: Partial<Parameters<typeof updateSession>[1]>) => setSessions(updateSession(id, updates));
  
  const handleAddVehicle = useCallback(async (v: Omit<Vehicle, "id">) => {
    const updated = await addVehicle(v);
    setVehicles(updated);
  }, []);
  
  const handleDeleteVehicle = useCallback(async (id: string) => {
    const updated = await deleteVehicle(id);
    setVehicles(updated);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container flex items-center gap-3 py-4">
          <Zap className="h-7 w-7 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">EV Charge Tracker</h1>
        </div>
      </header>

      <main className="container py-6">
        <Tabs defaultValue="agile" className="space-y-6">
          <TabsList className="grid grid-cols-3 w-full h-auto p-1 gap-1">
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
          <TabsList className="grid grid-cols-3 w-full h-auto p-1 gap-1">
            <TabsTrigger value="planner" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <CalendarClock className="h-4 w-4 shrink-0" /> Planner
            </TabsTrigger>
            <TabsTrigger value="charging" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <Zap className="h-4 w-4 shrink-0" /> Sessions
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-sm sm:flex-row sm:gap-1.5">
              <Car className="h-4 w-4 shrink-0" /> Vehicles
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agile" className="space-y-6">
            <AgileRates vehicles={vehicles} onSessionSaved={() => setSessions(loadSessions())} />
          </TabsContent>

          <TabsContent value="tracker" className="space-y-6">
            <TrackerRates />
          </TabsContent>

          <TabsContent value="forecast" className="space-y-6">
            <WeatherForecast />
          </TabsContent>
          </TabsContent>

          <TabsContent value="planner" className="space-y-6">
            <ChargePlanner vehicles={vehicles} onSessionSaved={() => setSessions(loadSessions())} />
          </TabsContent>

          <TabsContent value="charging" className="space-y-6">
            <ChargeStats sessions={sessions} />
            <ChargeCharts sessions={sessions} />
            <ChargeForm onAdd={handleAddSession} vehicles={vehicles} />
            <ChargeTable sessions={sessions} onDelete={handleDeleteSession} onUpdate={handleUpdateSession} />
          </TabsContent>

          <TabsContent value="vehicles" className="space-y-6">
            <VehicleManager vehicles={vehicles} onAdd={handleAddVehicle} onDelete={handleDeleteVehicle} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

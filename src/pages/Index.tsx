import { useState, useEffect, useCallback } from "react";
import { Zap, Car, TrendingDown, CalendarClock } from "lucide-react";
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
          <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="agile" className="gap-1 text-xs sm:text-sm flex-1 min-w-0">
              <TrendingDown className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Agile</span>
            </TabsTrigger>
            <TabsTrigger value="planner" className="gap-1 text-xs sm:text-sm flex-1 min-w-0">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Planner</span>
            </TabsTrigger>
            <TabsTrigger value="charging" className="gap-1 text-xs sm:text-sm flex-1 min-w-0">
              <Zap className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Sessions</span>
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="gap-1 text-xs sm:text-sm flex-1 min-w-0">
              <Car className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Vehicles</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agile" className="space-y-6">
            <AgileRates />
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

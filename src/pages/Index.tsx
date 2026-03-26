import { useState } from "react";
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
  const [vehicles, setVehicles] = useState(loadVehicles);

  const handleAddSession = (data: Parameters<typeof addSession>[0]) => setSessions(addSession(data));
  const handleDeleteSession = (id: string) => setSessions(deleteSession(id));
  const handleAddVehicle = (v: Omit<Vehicle, "id">) => setVehicles(addVehicle(v));
  const handleDeleteVehicle = (id: string) => setVehicles(deleteVehicle(id));

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
          <TabsList>
            <TabsTrigger value="agile" className="gap-1.5">
              <TrendingDown className="h-4 w-4" /> Agile Rates
            </TabsTrigger>
            <TabsTrigger value="planner" className="gap-1.5">
              <CalendarClock className="h-4 w-4" /> Charge Planner
            </TabsTrigger>
            <TabsTrigger value="charging" className="gap-1.5">
              <Zap className="h-4 w-4" /> Charge Sessions
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="gap-1.5">
              <Car className="h-4 w-4" /> Vehicles
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
            <ChargeTable sessions={sessions} onDelete={handleDeleteSession} />
          </TabsContent>

          <TabsContent value="vehicles" className="space-y-6">
            <VehicleManager vehicles={vehicles} onAdd={handleAddVehicle} onDelete={handleDeleteVehicle} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

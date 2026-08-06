import { useCallback, useEffect, useState } from "react";
import {
  Briefcase,
  CalendarClock,
  Car,
  CloudSun,
  Gauge,
  Settings,
  TrendingDown,
  Zap,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import AgileRates from "@/components/AgileRates";
import ChargeCharts from "@/components/ChargeCharts";
import ChargeForm from "@/components/ChargeForm";
import ChargePlanner from "@/components/ChargePlanner";
import ChargeStats from "@/components/ChargeStats";
import ChargeTable from "@/components/ChargeTable";
import FuelComparison from "@/components/FuelComparison";
import OctopusConnect from "@/components/OctopusConnect";
import TariffComparison from "@/components/TariffComparison";
import TrackerRates from "@/components/TrackerRates";
import VehicleManager from "@/components/VehicleManager";
import WeatherForecast from "@/components/WeatherForecast";
import WorkCosts from "@/components/WorkCosts";
import WorkMileageCard from "@/components/WorkMileageCard";

import {
  addSession,
  deleteSession,
  loadSessions,
  updateSession,
} from "@/lib/charge-data";
import {
  addVehicle,
  deleteVehicle,
  loadVehicles,
} from "@/lib/vehicle-data";
import type { Vehicle } from "@/lib/vehicle-data";

export default function Index() {
  const [sessions, setSessions] = useState(loadSessions);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    loadVehicles().then(setVehicles);
  }, []);

  const handleAddSession = (
    data: Parameters<typeof addSession>[0],
  ) => {
    setSessions(addSession(data));
  };

  const handleDeleteSession = (id: string) => {
    setSessions(deleteSession(id));
  };

  const handleUpdateSession = (
    id: string,
    updates: Partial<Parameters<typeof updateSession>[1]>,
  ) => {
    setSessions(updateSession(id, updates));
  };

  const handleAddVehicle = useCallback(
    async (vehicle: Omit<Vehicle, "id">) => {
      const updated = await addVehicle(vehicle);
      setVehicles(updated);
    },
    [],
  );

  const handleDeleteVehicle = useCallback(async (id: string) => {
    const updated = await deleteVehicle(id);
    setVehicles(updated);
  }, []);

  const refreshSessions = () => {
    setSessions(loadSessions());
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container flex items-center gap-3 py-4">
          <Zap className="h-7 w-7 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">
            EV Charge Tracker
          </h1>
        </div>
      </header>

      <main className="container py-6">
        <Tabs defaultValue="agile" className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1">
            <TabsTrigger
              value="agile"
              className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:flex-row sm:gap-1.5 sm:text-sm"
            >
              <TrendingDown className="h-4 w-4 shrink-0" />
              Agile
            </TabsTrigger>

            <TabsTrigger
              value="tracker"
              className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:flex-row sm:gap-1.5 sm:text-sm"
            >
              <Gauge className="h-4 w-4 shrink-0" />
              Tracker
            </TabsTrigger>

            <TabsTrigger
              value="forecast"
              className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:flex-row sm:gap-1.5 sm:text-sm"
            >
              <CloudSun className="h-4 w-4 shrink-0" />
              Forecast
            </TabsTrigger>
          </TabsList>

          <TabsList className="grid h-auto w-full grid-cols-5 gap-1 p-1">
            <TabsTrigger
              value="planner"
              className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:flex-row sm:gap-1.5 sm:text-sm"
            >
              <CalendarClock className="h-4 w-4 shrink-0" />
              Planner
            </TabsTrigger>

            <TabsTrigger
              value="charging"
              className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:flex-row sm:gap-1.5 sm:text-sm"
            >
              <Zap className="h-4 w-4 shrink-0" />
              Sessions
            </TabsTrigger>

            <TabsTrigger
              value="work"
              className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:flex-row sm:gap-1.5 sm:text-sm"
            >
              <Briefcase className="h-4 w-4 shrink-0" />
              Work
            </TabsTrigger>

            <TabsTrigger
              value="vehicles"
              className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:flex-row sm:gap-1.5 sm:text-sm"
            >
              <Car className="h-4 w-4 shrink-0" />
              Vehicles
            </TabsTrigger>

            <TabsTrigger
              value="settings"
              className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] sm:flex-row sm:gap-1.5 sm:text-sm"
            >
              <Settings className="h-4 w-4 shrink-0" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agile" className="space-y-6">
            <AgileRates
              vehicles={vehicles}
              onSessionSaved={refreshSessions}
            />
            <TariffComparison />
          </TabsContent>

          <TabsContent value="tracker" className="space-y-6">
            <TrackerRates />
          </TabsContent>

          <TabsContent value="forecast" className="space-y-6">
            <WeatherForecast />
          </TabsContent>

          <TabsContent value="planner" className="space-y-6">
            <ChargePlanner
              vehicles={vehicles}
              onSessionSaved={refreshSessions}
            />
          </TabsContent>

          <TabsContent value="charging" className="space-y-6">
            <ChargeStats sessions={sessions} />

            <FuelComparison
              sessions={sessions}
              vehicles={vehicles}
            />

            <ChargeCharts sessions={sessions} />

            <ChargeForm
              onAdd={handleAddSession}
              vehicles={vehicles}
            />

            <ChargeTable
              sessions={sessions}
              onDelete={handleDeleteSession}
              onUpdate={handleUpdateSession}
            />
          </TabsContent>

          <TabsContent value="work" className="space-y-6">
            <WorkMileageCard vehicles={vehicles} />

            <WorkCosts
              sessions={sessions}
              vehicles={vehicles}
            />
          </TabsContent>

          <TabsContent value="vehicles" className="space-y-6">
            <VehicleManager
              vehicles={vehicles}
              onAdd={handleAddVehicle}
              onDelete={handleDeleteVehicle}
            />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <OctopusConnect />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
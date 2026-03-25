import { useState } from "react";
import { Battery, Zap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadRecords, addRecord, deleteRecord } from "@/lib/battery-data";
import { loadSessions, addSession, deleteSession } from "@/lib/charge-data";
import BatteryForm from "@/components/BatteryForm";
import BatteryChart from "@/components/BatteryChart";
import BatteryTable from "@/components/BatteryTable";
import StatCards from "@/components/StatCards";
import ChargeForm from "@/components/ChargeForm";
import ChargeCharts from "@/components/ChargeCharts";
import ChargeTable from "@/components/ChargeTable";
import ChargeStats from "@/components/ChargeStats";

export default function Index() {
  const [records, setRecords] = useState(loadRecords);
  const [sessions, setSessions] = useState(loadSessions);

  const handleAddRecord = (data: Parameters<typeof addRecord>[0]) => setRecords(addRecord(data));
  const handleDeleteRecord = (id: string) => setRecords(deleteRecord(id));
  const handleAddSession = (data: Parameters<typeof addSession>[0]) => setSessions(addSession(data));
  const handleDeleteSession = (id: string) => setSessions(deleteSession(id));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex items-center gap-3 py-4">
          <Battery className="h-7 w-7 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">EV Tracker</h1>
        </div>
      </header>

      <main className="container py-6">
        <Tabs defaultValue="battery" className="space-y-6">
          <TabsList>
            <TabsTrigger value="battery" className="gap-1.5">
              <Battery className="h-4 w-4" /> Battery Health
            </TabsTrigger>
            <TabsTrigger value="charging" className="gap-1.5">
              <Zap className="h-4 w-4" /> Charge Sessions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="battery" className="space-y-6">
            <StatCards records={records} />
            <BatteryChart records={records} />
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <BatteryForm onAdd={handleAddRecord} />
              </div>
              <div className="lg:col-span-3">
                <BatteryTable records={records} onDelete={handleDeleteRecord} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="charging" className="space-y-6">
            <ChargeStats sessions={sessions} />
            <ChargeCharts sessions={sessions} />
            <ChargeForm onAdd={handleAddSession} />
            <ChargeTable sessions={sessions} onDelete={handleDeleteSession} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

import { useState } from "react";
import { Zap } from "lucide-react";
import { loadSessions, addSession, deleteSession } from "@/lib/charge-data";
import ChargeForm from "@/components/ChargeForm";
import ChargeCharts from "@/components/ChargeCharts";
import ChargeTable from "@/components/ChargeTable";
import ChargeStats from "@/components/ChargeStats";

export default function Index() {
  const [sessions, setSessions] = useState(loadSessions);

  const handleAddSession = (data: Parameters<typeof addSession>[0]) => setSessions(addSession(data));
  const handleDeleteSession = (id: string) => setSessions(deleteSession(id));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex items-center gap-3 py-4">
          <Zap className="h-7 w-7 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">EV Charge Tracker</h1>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        <ChargeStats sessions={sessions} />
        <ChargeCharts sessions={sessions} />
        <ChargeForm onAdd={handleAddSession} />
        <ChargeTable sessions={sessions} onDelete={handleDeleteSession} />
      </main>
    </div>
  );
}

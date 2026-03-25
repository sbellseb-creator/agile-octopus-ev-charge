import { useState } from "react";
import { Battery } from "lucide-react";
import { loadRecords, addRecord, deleteRecord } from "@/lib/battery-data";
import BatteryForm from "@/components/BatteryForm";
import BatteryChart from "@/components/BatteryChart";
import BatteryTable from "@/components/BatteryTable";
import StatCards from "@/components/StatCards";

export default function Index() {
  const [records, setRecords] = useState(loadRecords);

  const handleAdd = (data: Parameters<typeof addRecord>[0]) => {
    setRecords(addRecord(data));
  };

  const handleDelete = (id: string) => {
    setRecords(deleteRecord(id));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex items-center gap-3 py-4">
          <Battery className="h-7 w-7 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Battery Health Tracker</h1>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        <StatCards records={records} />
        <BatteryChart records={records} />
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <BatteryForm onAdd={handleAdd} />
          </div>
          <div className="lg:col-span-3">
            <BatteryTable records={records} onDelete={handleDelete} />
          </div>
        </div>
      </main>
    </div>
  );
}

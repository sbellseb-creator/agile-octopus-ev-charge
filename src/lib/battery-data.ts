export interface BatteryHealth {
  id: string;
  recorded_date: string;
  degradation_pct: number;
  range_at_100_miles: number;
  odometer_miles: number;
  notes: string;
}

const STORAGE_KEY = "battery-health-records";

export function loadRecords(): BatteryHealth[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as BatteryHealth[];
}

export function saveRecords(records: BatteryHealth[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function addRecord(record: Omit<BatteryHealth, "id">): BatteryHealth[] {
  const records = loadRecords();
  const newRecord: BatteryHealth = { ...record, id: crypto.randomUUID() };
  records.push(newRecord);
  records.sort((a, b) => a.recorded_date.localeCompare(b.recorded_date));
  saveRecords(records);
  return records;
}

export function deleteRecord(id: string): BatteryHealth[] {
  const records = loadRecords().filter((r) => r.id !== id);
  saveRecords(records);
  return records;
}

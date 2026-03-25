export interface Vehicle {
  id: string;
  name: string;
  make: string;
  model: string;
  battery_kwh: number;
  charge_efficiency_pct: number;
  miles_per_kwh: number;
  is_default: boolean;
  color: string;
  notes: string;
}

const STORAGE_KEY = "vehicles";

export function loadVehicles(): Vehicle[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Vehicle[];
}

export function saveVehicles(vehicles: Vehicle[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicles));
}

export function addVehicle(v: Omit<Vehicle, "id">): Vehicle[] {
  const vehicles = loadVehicles();
  if (v.is_default) vehicles.forEach((x) => (x.is_default = false));
  vehicles.push({ ...v, id: crypto.randomUUID() });
  saveVehicles(vehicles);
  return vehicles;
}

export function deleteVehicle(id: string): Vehicle[] {
  const vehicles = loadVehicles().filter((v) => v.id !== id);
  saveVehicles(vehicles);
  return vehicles;
}

export function getDefaultVehicle(): Vehicle | undefined {
  const vehicles = loadVehicles();
  return vehicles.find((v) => v.is_default) || vehicles[0];
}

import { supabase } from "@/integrations/supabase/client";

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

export async function loadVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to load vehicles:", error);
    return [];
  }
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    make: d.make ?? "",
    model: d.model ?? "",
    battery_kwh: Number(d.battery_kwh),
    charge_efficiency_pct: Number(d.charge_efficiency_pct),
    miles_per_kwh: Number(d.miles_per_kwh ?? 0),
    is_default: d.is_default,
    color: d.color ?? "#22c55e",
    notes: d.notes ?? "",
  }));
}

export async function addVehicle(v: Omit<Vehicle, "id">): Promise<Vehicle[]> {
  if (v.is_default) {
    await supabase.from("vehicles").update({ is_default: false }).eq("is_default", true);
  }
  const { error } = await supabase.from("vehicles").insert({
    name: v.name,
    make: v.make,
    model: v.model,
    battery_kwh: v.battery_kwh,
    charge_efficiency_pct: v.charge_efficiency_pct,
    miles_per_kwh: v.miles_per_kwh,
    is_default: v.is_default,
    color: v.color,
    notes: v.notes,
  });
  if (error) console.error("Failed to add vehicle:", error);
  return loadVehicles();
}

export async function deleteVehicle(id: string): Promise<Vehicle[]> {
  const { error } = await supabase.from("vehicles").delete().eq("id", id);
  if (error) console.error("Failed to delete vehicle:", error);
  return loadVehicles();
}

export async function getDefaultVehicle(): Promise<Vehicle | undefined> {
  const vehicles = await loadVehicles();
  return vehicles.find((v) => v.is_default) || vehicles[0];
}

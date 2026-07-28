import { supabase } from "@/integrations/supabase/client";

export interface Vehicle {
  id: string;
  name: string;
  make: string;
  model: string;
  /** Primary visible identifier, e.g. "ND74 VCA". */
  registration: string;
  /** Stored internally only — shown under Advanced Vehicle Details. */
  vin: string;
  tesla_vehicle_id: string;
  car_type: string;
  /** "tesla" when populated from the Tesla Fleet API, otherwise "manual". */
  source: string;
  /** Optional: never invented when unknown. */
  battery_kwh: number | null;
  charge_efficiency_pct: number;
  miles_per_kwh: number;
  is_default: boolean;
  color: string;
  notes: string;
}

/** Human label for a vehicle: registration first, then name. */
export function vehicleLabel(v: Pick<Vehicle, "registration" | "name">): string {
  return v.registration?.trim() || v.name || "Vehicle";
}

/** Format a UK registration as "AB12 CDE" for display. */
export function formatRegistration(raw: string): string {
  const s = (raw ?? "").toUpperCase().replace(/\s+/g, "");
  if (s.length === 7) return `${s.slice(0, 4)} ${s.slice(4)}`;
  return (raw ?? "").toUpperCase().trim();
}

async function requireUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * One-time migration: vehicles created before authentication existed have no
 * owner. Claim them for the signed-in user so no data is lost.
 */
export async function claimLegacyVehicles(): Promise<void> {
  const userId = await requireUserId();
  if (!userId) return;
  const { error } = await supabase.from("vehicles").update({ user_id: userId }).is("user_id", null);
  if (error) console.error("Failed to claim legacy vehicles:", error.message);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toVehicle(d: any): Vehicle {
  return {
    id: d.id,
    name: d.name,
    make: d.make ?? "",
    model: d.model ?? "",
    registration: d.registration ?? "",
    vin: d.vin ?? "",
    tesla_vehicle_id: d.tesla_vehicle_id ?? "",
    car_type: d.car_type ?? "",
    source: d.source ?? "manual",
    battery_kwh: d.battery_kwh === null || d.battery_kwh === undefined ? null : Number(d.battery_kwh),
    charge_efficiency_pct: Number(d.charge_efficiency_pct),
    miles_per_kwh: Number(d.miles_per_kwh ?? 0),
    is_default: d.is_default,
    color: d.color ?? "#22c55e",
    notes: d.notes ?? "",
  };
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
  return (data ?? []).map(toVehicle);
}

export async function addVehicle(v: Partial<Omit<Vehicle, "id">> & { name: string }): Promise<Vehicle[]> {
  const userId = await requireUserId();
  if (!userId) {
    console.error("Cannot add vehicle: not signed in");
    return loadVehicles();
  }
  if (v.is_default) {
    await supabase.from("vehicles").update({ is_default: false }).eq("is_default", true).eq("user_id", userId);
  }
  const { error } = await supabase.from("vehicles").insert({
    user_id: userId,
    name: v.name,
    make: v.make ?? "",
    model: v.model ?? "",
    registration: v.registration ? formatRegistration(v.registration) : null,
    vin: v.vin || null,
    tesla_vehicle_id: v.tesla_vehicle_id || null,
    car_type: v.car_type || null,
    source: v.source ?? "manual",
    battery_kwh: v.battery_kwh ?? null,
    charge_efficiency_pct: v.charge_efficiency_pct ?? 90,
    miles_per_kwh: v.miles_per_kwh ?? 0,
    is_default: v.is_default ?? false,
    color: v.color ?? "#22c55e",
    notes: v.notes ?? "",
  });
  if (error) console.error("Failed to add vehicle:", error);
  return loadVehicles();
}

export async function updateVehicle(id: string, updates: Partial<Omit<Vehicle, "id">>): Promise<Vehicle[]> {
  const userId = await requireUserId();
  if (!userId) return loadVehicles();
  if (updates.is_default) {
    await supabase.from("vehicles").update({ is_default: false }).eq("user_id", userId);
  }
  const patch: Record<string, unknown> = { ...updates };
  if (typeof updates.registration === "string") patch.registration = formatRegistration(updates.registration) || null;
  const { error } = await supabase.from("vehicles").update(patch).eq("id", id);
  if (error) console.error("Failed to update vehicle:", error);
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

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
  const { error } = await supabase.from("vehicles").update(patch as never).eq("id", id);
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

const TESLA_MODELS: Record<string, string> = {
  model3: "Model 3",
  modely: "Model Y",
  models: "Model S",
  modelx: "Model X",
  cybertruck: "Cybertruck",
  roadster: "Roadster",
  semi: "Semi",
};

/** Recognised trims only — never inferred from raw codes or numeric fragments. */
const TRIM_PATTERNS: [RegExp, string][] = [
  [/long\s*range/i, "Long Range"],
  [/performance/i, "Performance"],
  [/standard\s*range/i, "Standard Range"],
  [/plaid/i, "Plaid"],
];

/** Recognised drivetrains only — never inferred from option codes. */
const DRIVE_PATTERNS: [RegExp, string][] = [
  [/\brear[-\s]?wheel\s*drive\b|\brwd\b/i, "Rear-Wheel Drive"],
  [/\ball[-\s]?wheel\s*drive\b|\bawd\b|\bdual\s*motor\b/i, "All-Wheel Drive"],
];

function matchFirst(patterns: [RegExp, string][], candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    if (!c) continue;
    for (const [re, label] of patterns) if (re.test(c)) return label;
  }
  return "";
}

function cleanTrim(...candidates: (string | null | undefined)[]): string {
  return matchFirst(TRIM_PATTERNS, candidates);
}

/**
 * One clean human-readable model line, e.g. "Tesla Model Y" or
 * "Tesla Model Y Long Range Rear-Wheel Drive". Raw identifiers ("modely",
 * option codes, numeric fragments) are never surfaced.
 */
export function vehicleModelLine(
  v: Pick<Vehicle, "make" | "model" | "car_type">,
  live?: { car_type?: string | null; trim_badging?: string | null } | null,
): string {
  const rawType = (live?.car_type ?? v.car_type ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const teslaModel = TESLA_MODELS[rawType];

  const make = (v.make ?? "").trim();
  const model = (v.model ?? "").trim();

  // Saved Tesla profiles may hold shorthand such as "Y LR" or "Model Y LR".
  const savedTesla =
    !teslaModel && /tesla/i.test(make)
      ? (model.match(/model\s*([3sxy])/i)?.[1] ?? model.match(/^\s*([3sxy])\b/i)?.[1] ?? "").toUpperCase()
      : "";

  const resolved = teslaModel ?? (savedTesla ? `Model ${savedTesla}` : "");
  if (resolved) {
    const trim = cleanTrim(live?.trim_badging, model);
    const drive = matchFirst(DRIVE_PATTERNS, [live?.trim_badging, model]);
    return `Tesla ${resolved}${trim ? ` ${trim}` : ""}${drive ? ` ${drive}` : ""}`;
  }


  const line = [make, model].filter(Boolean).join(" ").trim();
  return line || "Vehicle";
}

/**
 * Persist the Tesla vehicle id onto the saved vehicle profile it belongs to.
 *
 * Without this link the app cannot tell which saved car a charge schedule
 * should be sent to. Matching order: existing Tesla id → VIN suffix → default
 * vehicle. Read-only when nothing needs changing; never contacts the vehicle.
 */
export async function linkTeslaVehicleIds(
  vehicles: Vehicle[],
  teslaVehicles: Array<{ id: string; vin_last4: string; car_type?: string | null }>,
): Promise<boolean> {
  let changed = false;
  const used = new Set<string>();
  for (const t of teslaVehicles) {
    const match =
      vehicles.find((v) => v.tesla_vehicle_id === t.id) ??
      vehicles.find((v) => v.vin && v.vin.slice(-4) === t.vin_last4 && !used.has(v.id)) ??
      vehicles.find((v) => v.is_default && !v.tesla_vehicle_id && !used.has(v.id));
    if (!match) continue;
    used.add(match.id);
    if (match.tesla_vehicle_id === t.id) continue;
    await updateVehicle(match.id, { tesla_vehicle_id: t.id, source: "tesla" });
    changed = true;
  }
  return changed;
}

/**
 * Tesla paint codes → the names Tesla uses in its own UI. Unknown codes are
 * never guessed; the colour line is simply hidden instead.
 */
const TESLA_PAINT: Record<string, string> = {
  quicksilver: "Quicksilver",
  pearlwhite: "Pearl White",
  pearlwhitemulticoat: "Pearl White",
  solidwhite: "White",
  midnightsilver: "Midnight Silver",
  midnightsilvermetallic: "Midnight Silver",
  deepblue: "Deep Blue",
  deepbluemetallic: "Deep Blue Metallic",
  solidblack: "Solid Black",
  obsidianblack: "Obsidian Black",
  redmulticoat: "Red Multi-Coat",
  ultrared: "Ultra Red",
  stealthgrey: "Stealth Grey",
  stealthgray: "Stealth Grey",
  diamondblack: "Diamond Black",
  lunarsilver: "Lunar Silver",
  glacierblue: "Glacier Blue",
};

/**
 * Human colour name for display, e.g. "Quicksilver". Returns "" when the
 * stored value is a raw hex swatch or an unrecognised Tesla code.
 */
export function vehicleColorName(
  v: Pick<Vehicle, "notes" | "color">,
  live?: { exterior_color?: string | null } | null,
): string {
  const candidates = [live?.exterior_color, v.notes];
  for (const c of candidates) {
    if (!c) continue;
    const key = c.toLowerCase().replace(/[^a-z]/g, "");
    if (TESLA_PAINT[key]) return TESLA_PAINT[key];
    // A user-confirmed plain word such as "Quicksilver" typed into notes.
    if (/^[a-z][a-z\s-]{2,24}$/i.test(c.trim()) && !c.startsWith("#")) {
      const t = c.trim();
      return t.charAt(0).toUpperCase() + t.slice(1);
    }
  }
  return "";
}

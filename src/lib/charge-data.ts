import { readJSON, writeJSON } from "@/lib/safe-storage";
import { markDirty, nowIso, recordTombstone, registerEntity } from "@/lib/cloud-sync";

export type ChargeMode = "immediate" | "target_time" | "agile_cheapest" | "realtime";

export const CHARGE_MODE_LABELS: Record<ChargeMode, string> = {
  immediate: "Immediate",
  target_time: "Ready By Target",
  agile_cheapest: "Cheapest Slots",
  realtime: "Real-time",
};

/** A single half-hour agile price slot, cached on the session for accurate edits. */
export interface CachedSlotPrice {
  valid_from: string; // ISO
  valid_to: string;   // ISO
  value_inc_vat: number; // p/kWh
}

/**
 * Optional observations captured for the future Learning Engine.
 * Nothing is calculated from these yet — they are stored so the engine can be
 * built later without another database redesign.
 */
export interface LearningFields {
  planned_start?: string;
  actual_start?: string;
  planned_finish?: string;
  actual_finish?: string;
  planned_cost_gbp?: number;
  actual_cost_gbp?: number;
  configured_charger_kw?: number;
  observed_charger_kw?: number;
  charging_efficiency_pct?: number;
  charging_location?: string;
  predicted_energy_kwh?: number;
  actual_energy_kwh?: number;
  outside_temp_c?: number;
  confidence_score?: number;
  raw_observations?: Record<string, unknown>;
}

export interface ChargeSession extends LearningFields {
  id: string;
  session_date: string;
  start_time?: string;
  end_time?: string;
  vehicle_id: string;
  vehicle_name: string;
  charge_mode: ChargeMode;
  target_time?: string;
  start_soc: number;
  end_soc: number;
  energy_added_kwh: number;
  grid_kwh: number;
  total_cost_gbp: number;
  avg_pence_per_kwh: number;
  num_slots: number;
  tariff_code: string;
  notes: string;
  /** Cached actual half-hour Octopus Agile prices for this session. Used for accurate edit recalculation. */
  slot_prices?: CachedSlotPrice[];
  /** Region the slot prices were fetched from (for re-fetching missing slots on edit). */
  region?: string;
  /** Last local modification — used for last-write-wins cloud sync. */
  updated_at?: string;
  // History of edits
  history?: Array<{
    timestamp: string;
    start_soc: number;
    end_soc: number;
    energy_added_kwh: number;
    total_cost_gbp: number;
    avg_pence_per_kwh: number;
    num_slots: number;
    start_time?: string;
    end_time?: string;
  }>;
}

const STORAGE_KEY = "charge-sessions";
export const CHARGE_STORAGE_KEY = STORAGE_KEY;

const num = (v: unknown, fallback = 0) => (v === null || v === undefined || v === "" ? fallback : Number(v));
const opt = <T>(v: T | null | undefined) => (v === null ? undefined : v);

/** Register charge sessions with the cloud sync engine. */
registerEntity({
  table: "charge_sessions",
  storageKey: STORAGE_KEY,
  sort: (a: ChargeSession, b: ChargeSession) => a.session_date.localeCompare(b.session_date),
  toRow: (s: ChargeSession) => ({
    session_date: s.session_date,
    start_time: s.start_time ?? null,
    end_time: s.end_time ?? null,
    vehicle_id: s.vehicle_id ?? null,
    vehicle_name: s.vehicle_name ?? "",
    charge_mode: s.charge_mode ?? "immediate",
    target_time: s.target_time ?? null,
    start_soc: num(s.start_soc),
    end_soc: num(s.end_soc),
    energy_added_kwh: num(s.energy_added_kwh),
    grid_kwh: num(s.grid_kwh),
    total_cost_gbp: num(s.total_cost_gbp),
    avg_pence_per_kwh: num(s.avg_pence_per_kwh),
    num_slots: num(s.num_slots),
    tariff_code: s.tariff_code ?? "",
    notes: s.notes ?? "",
    region: s.region ?? null,
    slot_prices: s.slot_prices ?? [],
    history: s.history ?? [],
    // Learning Engine capture (stored only)
    planned_start: s.planned_start ?? null,
    actual_start: s.actual_start ?? s.start_time ?? null,
    planned_finish: s.planned_finish ?? null,
    actual_finish: s.actual_finish ?? s.end_time ?? null,
    planned_cost_gbp: s.planned_cost_gbp ?? null,
    actual_cost_gbp: s.actual_cost_gbp ?? null,
    configured_charger_kw: s.configured_charger_kw ?? 6.9,
    observed_charger_kw: s.observed_charger_kw ?? null,
    charging_efficiency_pct: s.charging_efficiency_pct ?? null,
    charging_location: s.charging_location ?? null,
    predicted_energy_kwh: s.predicted_energy_kwh ?? null,
    actual_energy_kwh: s.actual_energy_kwh ?? null,
    outside_temp_c: s.outside_temp_c ?? null,
    confidence_score: s.confidence_score ?? null,
    raw_observations: s.raw_observations ?? {},
    updated_at: s.updated_at ?? nowIso(),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toLocal: (r: any): ChargeSession => ({
    id: r.local_id ?? r.id,
    session_date: r.session_date,
    start_time: opt(r.start_time),
    end_time: opt(r.end_time),
    vehicle_id: r.vehicle_id ?? "",
    vehicle_name: r.vehicle_name ?? "",
    charge_mode: (r.charge_mode ?? "immediate") as ChargeMode,
    target_time: opt(r.target_time),
    start_soc: num(r.start_soc),
    end_soc: num(r.end_soc),
    energy_added_kwh: num(r.energy_added_kwh),
    grid_kwh: num(r.grid_kwh),
    total_cost_gbp: num(r.total_cost_gbp),
    avg_pence_per_kwh: num(r.avg_pence_per_kwh),
    num_slots: num(r.num_slots),
    tariff_code: r.tariff_code ?? "",
    notes: r.notes ?? "",
    region: opt(r.region),
    slot_prices: Array.isArray(r.slot_prices) ? r.slot_prices : [],
    history: Array.isArray(r.history) ? r.history : [],
    planned_start: opt(r.planned_start),
    actual_start: opt(r.actual_start),
    planned_finish: opt(r.planned_finish),
    actual_finish: opt(r.actual_finish),
    planned_cost_gbp: opt(r.planned_cost_gbp) ?? undefined,
    actual_cost_gbp: opt(r.actual_cost_gbp) ?? undefined,
    configured_charger_kw: opt(r.configured_charger_kw) ?? undefined,
    observed_charger_kw: opt(r.observed_charger_kw) ?? undefined,
    charging_efficiency_pct: opt(r.charging_efficiency_pct) ?? undefined,
    charging_location: opt(r.charging_location),
    predicted_energy_kwh: opt(r.predicted_energy_kwh) ?? undefined,
    actual_energy_kwh: opt(r.actual_energy_kwh) ?? undefined,
    outside_temp_c: opt(r.outside_temp_c) ?? undefined,
    confidence_score: opt(r.confidence_score) ?? undefined,
    raw_observations: r.raw_observations ?? {},
    updated_at: r.updated_at,
  }),
});

export function loadSessions(): ChargeSession[] {
  const rows = readJSON<ChargeSession[]>(STORAGE_KEY, [], (v) => Array.isArray(v));
  // Drop any entry that is not a usable session object rather than crashing later.
  return rows.filter((s): s is ChargeSession => !!s && typeof s === "object" && typeof s.id === "string");
}

export function saveSessions(sessions: ChargeSession[]) {
  writeJSON(STORAGE_KEY, sessions);
}

export function addSession(session: Omit<ChargeSession, "id">): ChargeSession[] {
  const sessions = loadSessions();
  sessions.push({ ...session, id: crypto.randomUUID(), updated_at: nowIso() });
  sessions.sort((a, b) => a.session_date.localeCompare(b.session_date));
  saveSessions(sessions);
  markDirty();
  return sessions;
}

export function updateSession(id: string, updates: Partial<ChargeSession>): ChargeSession[] {
  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx >= 0) {
    const existing = sessions[idx];
    // Save current values to history before updating
    const historyEntry = {
      timestamp: new Date().toISOString(),
      start_soc: existing.start_soc,
      end_soc: existing.end_soc,
      energy_added_kwh: existing.energy_added_kwh,
      total_cost_gbp: existing.total_cost_gbp,
      avg_pence_per_kwh: existing.avg_pence_per_kwh,
      num_slots: existing.num_slots,
      start_time: existing.start_time,
      end_time: existing.end_time,
    };
    const history = [...(existing.history || []), historyEntry];
    sessions[idx] = { ...existing, ...updates, history, updated_at: nowIso() };
  }
  saveSessions(sessions);
  markDirty();
  return sessions;
}

export function deleteSession(id: string): ChargeSession[] {
  const sessions = loadSessions().filter((s) => s.id !== id);
  saveSessions(sessions);
  recordTombstone(STORAGE_KEY, id);
  markDirty();
  return sessions;
}

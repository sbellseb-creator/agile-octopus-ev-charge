export type ChargeMode = "immediate" | "target_time" | "agile_cheapest" | "realtime";

export const CHARGE_MODE_LABELS: Record<ChargeMode, string> = {
  immediate: "Immediate",
  target_time: "Ready By Target",
  agile_cheapest: "Cheapest Slots",
  realtime: "Real-time",
};

export interface ChargeSession {
  id: string;
  session_date: string;
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
}

const STORAGE_KEY = "charge-sessions";

export function loadSessions(): ChargeSession[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as ChargeSession[];
}

export function saveSessions(sessions: ChargeSession[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function addSession(session: Omit<ChargeSession, "id">): ChargeSession[] {
  const sessions = loadSessions();
  sessions.push({ ...session, id: crypto.randomUUID() });
  sessions.sort((a, b) => a.session_date.localeCompare(b.session_date));
  saveSessions(sessions);
  return sessions;
}

export function deleteSession(id: string): ChargeSession[] {
  const sessions = loadSessions().filter((s) => s.id !== id);
  saveSessions(sessions);
  return sessions;
}

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
    sessions[idx] = { ...existing, ...updates, history };
  }
  saveSessions(sessions);
  return sessions;
}

export function deleteSession(id: string): ChargeSession[] {
  const sessions = loadSessions().filter((s) => s.id !== id);
  saveSessions(sessions);
  return sessions;
}

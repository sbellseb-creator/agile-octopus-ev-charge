/**
 * Central application settings.
 *
 * Local-first: values are read synchronously from localStorage so the UI never
 * blocks, then reconciled with the `user_settings` cloud row.
 *
 * Nothing here changes existing calculations — the planner, sessions and the
 * future optimiser simply read the same numbers from one place.
 */
import { supabase } from "@/integrations/supabase/client";
import { readJSON, writeJSON } from "@/lib/safe-storage";

/** Home charger hard limits. Never 32 A / 7.2 kW / 7.4 kW. */
export const CHARGER_MAX_AMPS = 30;
export const CHARGER_MAX_KW = 6.9;

export interface AppSettings {
  /** Home charger */
  charger_amps: number;
  charger_kw: number;
  charging_location: string;
  /** Saved home charging coordinates. Required by Tesla charge schedules. */
  home_latitude: number | null;
  home_longitude: number | null;
  /** Tariff and region */
  region: string;
  tariff: string;
  /** Fuel and mileage */
  petrol_price_ppl: number;
  diesel_price_ppl: number;
  petrol_mpg: number;
  diesel_mpg: number;
  work_rate_pence_per_mile: number;
  /** Notifications */
  notify_cheap_slots: boolean;
  notify_charge_complete: boolean;
  notify_price_alerts: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  charger_amps: CHARGER_MAX_AMPS,
  charger_kw: CHARGER_MAX_KW,
  charging_location: "Home",
  region: "F",
  tariff: "agile",
  petrol_price_ppl: 134.9,
  diesel_price_ppl: 142.9,
  petrol_mpg: 45,
  diesel_mpg: 55,
  work_rate_pence_per_mile: 15,
  notify_cheap_slots: false,
  notify_charge_complete: false,
  notify_price_alerts: false,
};

const KEY = "app-settings";
const listeners = new Set<(s: AppSettings) => void>();

function clampCharger(s: AppSettings): AppSettings {
  return {
    ...s,
    charger_amps: Math.min(Number(s.charger_amps) || CHARGER_MAX_AMPS, CHARGER_MAX_AMPS),
    charger_kw: Math.min(Number(s.charger_kw) || CHARGER_MAX_KW, CHARGER_MAX_KW),
  };
}

export function getSettings(): AppSettings {
  const stored = readJSON<Partial<AppSettings>>(KEY, {}, (v) => !!v && typeof v === "object");
  return clampCharger({ ...DEFAULT_SETTINGS, ...stored });
}

export function subscribeSettings(fn: (s: AppSettings) => void): () => void {
  listeners.add(fn);
  fn(getSettings());
  return () => listeners.delete(fn);
}

function emit() {
  const s = getSettings();
  listeners.forEach((l) => l(s));
}

/** Persist a partial update locally, then push it to the cloud (best effort). */
export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = clampCharger({ ...getSettings(), ...patch });
  writeJSON(KEY, next);
  emit();
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (userId) {
      await supabase.from("user_settings").upsert({ user_id: userId, ...next }, { onConflict: "user_id" });
    }
  } catch (e) {
    console.warn("[settings] cloud save failed", e);
  }
  return next;
}

/** Pull the cloud row into the local copy. Safe to call on every app start. */
export async function loadSettingsFromCloud(): Promise<AppSettings> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return getSettings();
    const { data, error } = await supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
    if (error || !data) return getSettings();
    const merged = clampCharger({
      ...getSettings(),
      charger_amps: Number(data.charger_amps),
      charger_kw: Number(data.charger_kw),
      charging_location: data.charging_location ?? "Home",
      region: data.region ?? "F",
      tariff: data.tariff ?? "agile",
      petrol_price_ppl: Number(data.petrol_price_ppl),
      diesel_price_ppl: Number(data.diesel_price_ppl),
      petrol_mpg: Number(data.petrol_mpg),
      diesel_mpg: Number(data.diesel_mpg),
      work_rate_pence_per_mile: Number(data.work_rate_pence_per_mile),
      notify_cheap_slots: Boolean(data.notify_cheap_slots),
      notify_charge_complete: Boolean(data.notify_charge_complete),
      notify_price_alerts: Boolean(data.notify_price_alerts),
    });
    writeJSON(KEY, merged);
    emit();
    return merged;
  } catch {
    return getSettings();
  }
}

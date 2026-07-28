import { readJSON, readNumber, writeJSON, writeString } from "@/lib/safe-storage";
import { markDirty, nowIso, recordTombstone, registerEntity } from "@/lib/cloud-sync";

export interface WorkTrip {
  id: string;
  trip_date: string; // YYYY-MM-DD
  description: string;
  miles: number;
  rate_pence_per_mile: number; // claim rate
  extra_charges?: WorkExtraCharge[]; // multiple manually-entered public/supercharger costs
  extra_charges_gbp?: number; // legacy single ad-hoc cost (e.g. Tesla Supercharger)
  extra_charges_note?: string;
  /** Optional linked home charge session IDs that powered this trip. */
  charge_session_ids?: string[];
  /** Last local modification — used for last-write-wins cloud sync. */
  updated_at?: string;
}

export interface WorkExtraCharge {
  id: string;
  amount_gbp: number;
  note?: string;
}

const STORAGE_KEY = "work-trips";
export const WORK_STORAGE_KEY = STORAGE_KEY;
const RATE_KEY = "work-default-rate";

/** HMRC AER for fully electric company cars (Sep 2025): 7p. Personal car AMAP: 45p first 10k.
 *  User-specified reimbursement: 15p/mile. */
export const SUGGESTED_RATES: { label: string; value: number; detail: string }[] = [
  { label: "User claim rate", value: 15, detail: "Your employer's rate (15p/mi)" },
  { label: "HMRC AER (EV)", value: 7, detail: "Advisory Electricity Rate – company car" },
  { label: "AMAP first 10k", value: 45, detail: "HMRC personal car ≤10,000 mi/yr" },
  { label: "AMAP after 10k", value: 25, detail: "HMRC personal car >10,000 mi/yr" },
];

registerEntity({
  table: "work_trips",
  storageKey: STORAGE_KEY,
  sort: (a: WorkTrip, b: WorkTrip) => b.trip_date.localeCompare(a.trip_date),
  toRow: (t: WorkTrip) => ({
    trip_date: t.trip_date,
    description: t.description ?? "",
    miles: Number(t.miles) || 0,
    rate_pence_per_mile: Number(t.rate_pence_per_mile) || 15,
    // legacy single charge is folded into the array so nothing is lost
    extra_charges:
      t.extra_charges && t.extra_charges.length
        ? t.extra_charges
        : t.extra_charges_gbp
          ? [{ id: crypto.randomUUID(), amount_gbp: t.extra_charges_gbp, note: t.extra_charges_note ?? "" }]
          : [],
    charge_session_ids: t.charge_session_ids ?? [],
    updated_at: t.updated_at ?? nowIso(),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toLocal: (r: any): WorkTrip => ({
    id: r.local_id ?? r.id,
    trip_date: r.trip_date,
    description: r.description ?? "",
    miles: Number(r.miles) || 0,
    rate_pence_per_mile: Number(r.rate_pence_per_mile) || 15,
    extra_charges: Array.isArray(r.extra_charges) ? r.extra_charges : [],
    charge_session_ids: Array.isArray(r.charge_session_ids) ? r.charge_session_ids : [],
    updated_at: r.updated_at,
  }),
});

export function getDefaultRate(): number {
  return readNumber(RATE_KEY, 15);
}

export function setDefaultRate(rate: number) {
  writeString(RATE_KEY, String(rate));
}

export function loadTrips(): WorkTrip[] {
  const rows = readJSON<WorkTrip[]>(STORAGE_KEY, [], (v) => Array.isArray(v));
  return rows.filter((t): t is WorkTrip => !!t && typeof t === "object" && typeof t.id === "string");
}

export function saveTrips(trips: WorkTrip[]) {
  writeJSON(STORAGE_KEY, trips);
}

export function addTrip(trip: Omit<WorkTrip, "id">): WorkTrip[] {
  const trips = loadTrips();
  trips.push({ ...trip, id: crypto.randomUUID(), updated_at: nowIso() });
  trips.sort((a, b) => b.trip_date.localeCompare(a.trip_date));
  saveTrips(trips);
  markDirty();
  return trips;
}

export function updateTrip(id: string, updates: Partial<Omit<WorkTrip, "id">>): WorkTrip[] {
  const trips = loadTrips().map((t) => (t.id === id ? { ...t, ...updates, updated_at: nowIso() } : t));
  trips.sort((a, b) => b.trip_date.localeCompare(a.trip_date));
  saveTrips(trips);
  markDirty();
  return trips;
}

export function deleteTrip(id: string): WorkTrip[] {
  const trips = loadTrips().filter((t) => t.id !== id);
  saveTrips(trips);
  recordTombstone(STORAGE_KEY, id);
  markDirty();
  return trips;
}

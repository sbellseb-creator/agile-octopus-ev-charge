import { readJSON, readNumber, writeJSON, writeString } from "@/lib/safe-storage";

export interface WorkTrip {
  id: string;
  trip_date: string; // YYYY-MM-DD
  description: string;
  miles: number;
  rate_pence_per_mile: number; // claim rate
  extra_charges?: WorkExtraCharge[]; // multiple manually-entered public/supercharger costs
  extra_charges_gbp?: number; // ad-hoc costs incurred (e.g. Tesla Supercharger)
  extra_charges_note?: string;
  /** Optional linked home charge session IDs that powered this trip. */
  charge_session_ids?: string[];
}

export interface WorkExtraCharge {
  id: string;
  amount_gbp: number;
  note?: string;
}

const STORAGE_KEY = "work-trips";
const RATE_KEY = "work-default-rate";

/** HMRC AER for fully electric company cars (Sep 2025): 7p. Personal car AMAP: 45p first 10k.
 *  User-specified reimbursement: 15p/mile. */
export const SUGGESTED_RATES: { label: string; value: number; detail: string }[] = [
  { label: "User claim rate", value: 15, detail: "Your employer's rate (15p/mi)" },
  { label: "HMRC AER (EV)", value: 7, detail: "Advisory Electricity Rate – company car" },
  { label: "AMAP first 10k", value: 45, detail: "HMRC personal car ≤10,000 mi/yr" },
  { label: "AMAP after 10k", value: 25, detail: "HMRC personal car >10,000 mi/yr" },
];

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
  trips.push({ ...trip, id: crypto.randomUUID() });
  trips.sort((a, b) => b.trip_date.localeCompare(a.trip_date));
  saveTrips(trips);
  return trips;
}

export function updateTrip(id: string, updates: Partial<Omit<WorkTrip, "id">>): WorkTrip[] {
  const trips = loadTrips().map((t) => (t.id === id ? { ...t, ...updates } : t));
  trips.sort((a, b) => b.trip_date.localeCompare(a.trip_date));
  saveTrips(trips);
  return trips;
}

export function deleteTrip(id: string): WorkTrip[] {
  const trips = loadTrips().filter((t) => t.id !== id);
  saveTrips(trips);
  return trips;
}

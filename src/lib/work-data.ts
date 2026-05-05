export interface WorkTrip {
  id: string;
  trip_date: string; // YYYY-MM-DD
  description: string;
  miles: number;
  rate_pence_per_mile: number; // claim rate
  extra_charges_gbp?: number; // ad-hoc costs incurred (e.g. Tesla Supercharger)
  extra_charges_note?: string;
  /** Optional linked home charge session IDs that powered this trip. */
  charge_session_ids?: string[];
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
  const raw = localStorage.getItem(RATE_KEY);
  const n = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(n) ? n : 15;
}

export function setDefaultRate(rate: number) {
  localStorage.setItem(RATE_KEY, String(rate));
}

export function loadTrips(): WorkTrip[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as WorkTrip[];
  } catch {
    return [];
  }
}

export function saveTrips(trips: WorkTrip[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
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

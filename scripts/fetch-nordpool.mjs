// Server-side snapshot of Nord Pool N2EX day-ahead prices for the Crystal Ball.
// Browsers on GitHub Pages can be blocked from calling Nord Pool directly (CORS / "Failed to fetch"),
// so CI writes public/data/nordpool.json, which the app reads as a same-origin fallback.
import { mkdir, readFile, writeFile } from "node:fs/promises";

const API = "https://dataportal-api.nordpoolgroup.com/api/DayAheadPrices";
const OUT = "public/data/nordpool.json";
const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_HOUR_MS = 30 * 60 * 1000;

const ukDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
const addDays = (key, n) => new Date(Date.parse(`${key}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

async function fetchDate(date) {
  const qs = new URLSearchParams({ date, market: "DayAhead", deliveryArea: "UK", currency: "GBP" });
  const res = await fetch(`${API}?${qs}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${date}: HTTP ${res.status}`);
  const json = await res.json();
  const out = [];
  for (const e of json?.multiAreaEntries ?? []) {
    const price = e?.entryPerArea?.UK;
    const t0 = new Date(e?.deliveryStart).getTime();
    const t1 = new Date(e?.deliveryEnd).getTime();
    if (typeof price !== "number" || !Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) continue;
    for (let t = t0; t < t1; t += HALF_HOUR_MS) out.push({ start: new Date(t).toISOString(), pricePerMwh: price });
  }
  return out;
}

let existing = { days: {} };
try { existing = JSON.parse(await readFile(OUT, "utf8")); } catch { /* first run */ }

const today = ukDate(new Date());
const days = {};
for (const date of [addDays(today, -1), today, addDays(today, 1)]) {
  try {
    const main = await fetchDate(date);
    const next = await fetchDate(addDays(date, 1)).catch(() => []);
    const points = [...main, ...next];
    if (points.length) days[date] = points;
  } catch (e) {
    console.warn(`Nord Pool fetch failed for ${date}: ${e.message}`);
    if (existing.days?.[date]) days[date] = existing.days[date];
  }
}

if (!Object.keys(days).length) {
  console.warn("No Nord Pool data fetched; leaving snapshot unchanged.");
} else {
  await mkdir("public/data", { recursive: true });
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), days }));
  console.log(`Wrote ${OUT} for: ${Object.keys(days).join(", ")}`);
}

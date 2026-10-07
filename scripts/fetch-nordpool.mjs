// Server-side Nord Pool GB half-hour (UK, GBP) fetch. Writes static JSON into public/data for GitHub Pages.
import { mkdirSync, writeFileSync } from "node:fs";

const API = "https://dataportal-api.nordpoolgroup.com/api/DayAheadPrices";
const MARKETS = ["DayAhead", "N2EX_DayAhead"];
const OUT = "public/data";

const ukDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
const today = new Date();
const dates = [ukDate(today), ukDate(new Date(today.getTime() + 24 * 3600 * 1000))];

async function fetchDate(date) {
  for (const market of MARKETS) {
    const qs = new URLSearchParams({ date, market, deliveryArea: "UK", currency: "GBP" });
    try {
      const res = await fetch(`${API}?${qs}`, { headers: { Accept: "application/json" } });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = JSON.parse(text);
      const n = (payload.multiAreaEntries ?? []).filter((e) => e?.entryPerArea?.UK != null).length;
      if (n > 0) return { date, market, payload };
      console.log(`${date} ${market}: no UK entries`);
    } catch (e) {
      console.log(`${date} ${market}: ${e.message}`);
    }
  }
  return null;
}

mkdirSync(OUT, { recursive: true });
let latest = null;
for (const date of dates) {
  const result = await fetchDate(date);
  if (!result) continue;
  writeFileSync(`${OUT}/nordpool-gb-${date}.json`, JSON.stringify(result));
  latest = result;
  console.log(`${date}: wrote ${result.payload.multiAreaEntries.length} entries`);
}
if (latest) writeFileSync(`${OUT}/nordpool-gb-latest.json`, JSON.stringify(latest));
else console.log("No Nord Pool data fetched; leaving existing files untouched.");

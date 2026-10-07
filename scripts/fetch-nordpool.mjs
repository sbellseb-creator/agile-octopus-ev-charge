// Server-side Nord Pool GB half-hour (UK, GBP) fetch. Writes static JSON into public/data for GitHub Pages.
// A file is only written when the payload covers the COMPLETE UK day (48 slots, 46/50 on clock-change days).
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HOST = "https://dataportal-api.nordpoolgroup.com";
const SLOT_MS = 30 * 60 * 1000;
const OUT = "public/data";
const HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://data.nordpoolgroup.com",
  Referer: "https://data.nordpoolgroup.com/",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

/** Candidate endpoints/markets, tried in order (the website's data portal API, GB half-hour auction, UK area, GBP). */
export const candidateUrls = (date) => [
  ...["N2EX_DayAhead", "DayAhead"].map(
    (market) => `${HOST}/api/DayAheadPrices?${new URLSearchParams({ date, market, deliveryArea: "UK", currency: "GBP" })}`,
  ),
  `${HOST}/api/v2/Auction/Prices/ByAreas?${new URLSearchParams({ deliveryDate: date, market: "N2EX_DayAhead", deliveryAreas: "UK", currency: "GBP" })}`,
];

const ukDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
const ukOffsetMs = (ms) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
};

/** UTC ms of 00:00 Europe/London on the given date key. */
export function ukMidnightMs(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return guess - ukOffsetMs(guess - ukOffsetMs(guess));
}

const addDays = (dateKey, n) => new Date(Date.parse(`${dateKey}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Number of half-hour slots a UK day should have: 48, or 46/50 on clock-change days. */
export const expectedSlots = (dateKey) => Math.round((ukMidnightMs(addDays(dateKey, 1)) - ukMidnightMs(dateKey)) / SLOT_MS);

/** Count distinct priced half-hour slots inside the UK day. */
export function countDaySlots(dateKey, payload) {
  const from = ukMidnightMs(dateKey);
  const to = ukMidnightMs(addDays(dateKey, 1));
  const seen = new Set();
  for (const e of Array.isArray(payload?.multiAreaEntries) ? payload.multiAreaEntries : []) {
    const price = e?.entryPerArea?.UK;
    const t0 = Date.parse(e?.deliveryStart);
    const t1 = Date.parse(e?.deliveryEnd);
    if (price == null || !Number.isFinite(Number(price)) || !Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) continue;
    for (let t = t0; t < t1; t += SLOT_MS) if (t >= from && t < to) seen.add(t);
  }
  return seen.size;
}

export const isCompleteDayPayload = (dateKey, payload) => countDaySlots(dateKey, payload) === expectedSlots(dateKey);

async function fetchDate(date) {
  for (const url of candidateUrls(date)) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      const type = res.headers.get("content-type") ?? "";
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!/json/i.test(type)) throw new Error(`not JSON (${type})`);
      const payload = JSON.parse(text);
      const n = countDaySlots(date, payload);
      if (n === expectedSlots(date)) return { date, source: url, fetchedAt: new Date().toISOString(), payload };
      console.log(`${date} ${url}: partial day (${n}/${expectedSlots(date)} slots) - not written`);
    } catch (e) {
      console.log(`${date} ${url}: ${e.message}`);
    }
  }
  return null;
}

async function main() {
  const today = new Date();
  const dates = [ukDate(today), ukDate(new Date(today.getTime() + 24 * 3600 * 1000))];
  mkdirSync(OUT, { recursive: true });
  let latest = null;
  for (const date of dates) {
    const result = await fetchDate(date);
    if (!result) continue;
    writeFileSync(`${OUT}/nordpool-gb-${date}.json`, JSON.stringify(result));
    latest = result;
    console.log(`${date}: wrote complete day (${expectedSlots(date)} slots)`);
  }
  if (latest) writeFileSync(`${OUT}/nordpool-gb-latest.json`, JSON.stringify(latest));
  else console.log("No complete Nord Pool day fetched; nothing written.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

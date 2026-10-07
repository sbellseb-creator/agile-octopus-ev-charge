import { describe, it, expect } from "vitest";
import { parseNesoN2ex } from "../../supabase/functions/_shared/wholesale-parsers";
import { parseEdgeWholesale } from "@/lib/agileForecastApi";
import { buildEstimate, isCompleteDay } from "@/lib/agileForecast";

// TEST FIXTURES ONLY (synthetic payloads shaped like CKAN datastore_search records; not real prices).
const pad = (n: number) => String(n).padStart(2, "0");
const hourlyUtc = (dateUtc: string, hours: number, price = (h: number) => 100 + h) =>
  Array.from({ length: hours }, (_, h) => ({ DATETIME_GMT: `${dateUtc}T${pad(h)}:00:00`, PRICE: price(h) }));
const F_TIME = ["_id", "DATETIME_GMT", "PRICE"];

describe("parseNesoN2ex", () => {
  it("expands hourly prices to both half-hours and converts GBP/MWh to p/kWh", () => {
    const slots = parseNesoN2ex(hourlyUtc("2026-01-15", 24), F_TIME, "2026-01-15");
    expect(slots).toHaveLength(48);
    expect(slots[0].valid_from).toBe("2026-01-15T00:00:00.000Z");
    expect(slots[0].pence_per_kwh).toBeCloseTo(10, 6);
    expect(slots[1].pence_per_kwh).toBeCloseTo(10, 6);
    expect(slots[2].pence_per_kwh).toBeCloseTo(10.1, 6);
    expect(slots[47].valid_to).toBe("2026-01-16T00:00:00.000Z");
  });

  it("handles BST: UK day 2026-07-15 starts at 23:00Z the day before", () => {
    const recs = hourlyUtc("2026-07-14", 24).slice(23).concat(hourlyUtc("2026-07-15", 24).slice(0, 23));
    const slots = parseNesoN2ex(recs, F_TIME, "2026-07-15");
    expect(slots).toHaveLength(48);
    expect(slots[0].valid_from).toBe("2026-07-14T23:00:00.000Z");
  });

  it("gives 46 slots on spring-forward day and 50 on autumn-back day", () => {
    const hours = (startIso: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ DATETIME_GMT: new Date(Date.parse(startIso) + i * 3600_000).toISOString().slice(0, 19), PRICE: 50 }));
    expect(parseNesoN2ex(hours("2026-03-29T00:00:00Z", 23), F_TIME, "2026-03-29")).toHaveLength(46);
    expect(parseNesoN2ex(hours("2026-10-24T23:00:00Z", 25), F_TIME, "2026-10-25")).toHaveLength(50);
  });

  it("supports date + settlement period layouts (hourly periods, DST aware)", () => {
    const f = ["settlement_date", "settlement_period", "price"];
    const recs = Array.from({ length: 23 }, (_, i) => ({ settlement_date: "2026-03-29", settlement_period: i + 1, price: 80 }));
    const slots = parseNesoN2ex(recs, f, "2026-03-29");
    expect(slots).toHaveLength(46);
    expect(slots[0].valid_from).toBe("2026-03-29T00:00:00.000Z");
    expect(slots[45].valid_to).toBe("2026-03-29T23:00:00.000Z");
  });

  it("only returns the requested UK day and [] when it is not published", () => {
    expect(parseNesoN2ex(hourlyUtc("2026-01-15", 24), F_TIME, "2026-01-16")).toEqual([]);
  });

  it("rejects zone-less timestamps with unknown zone and unrecognised schemas instead of guessing", () => {
    expect(parseNesoN2ex([{ datetime: "2026-01-15T00:00:00", price: 1 }], ["datetime", "price"], "2026-01-15")).toEqual([]);
    expect(() => parseNesoN2ex([], ["a", "b"], "2026-01-15")).toThrow(/Unrecognised/);
  });

  it("a partial day yields fewer than 48 slots (the provider rejects it as incomplete)", () => {
    expect(parseNesoN2ex(hourlyUtc("2026-01-15", 12), F_TIME, "2026-01-15")).toHaveLength(24);
  });
});

describe("Edge Function wholesale -> Crystal Ball slots", () => {
  it("round-trips p/kWh to £/MWh and produces a complete priced day", () => {
    const wholesale = parseNesoN2ex(hourlyUtc("2026-01-15", 24), F_TIME, "2026-01-15");
    const points = parseEdgeWholesale({ wholesale });
    expect(points[0].pricePerMwh).toBeCloseTo(100, 6);
    const slots = buildEstimate("2026-01-15", points);
    expect(isCompleteDay("2026-01-15", slots)).toBe(true);
    expect(slots[0].price).toBeCloseTo(10 * 2.2 * 1.05, 6);
  });

  it("ignores malformed bodies", () => {
    expect(parseEdgeWholesale({ status: "error" })).toEqual([]);
  });
});

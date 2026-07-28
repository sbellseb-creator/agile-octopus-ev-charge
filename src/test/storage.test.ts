import { describe, expect, it, beforeEach } from "vitest";
import { loadSessions, saveSessions, addSession } from "@/lib/charge-data";
import { loadTrips, saveTrips } from "@/lib/work-data";
import { readJSON, readNumber, writeJSON } from "@/lib/safe-storage";

describe("storage resilience", () => {
  beforeEach(() => localStorage.clear());

  it("returns an empty list when nothing is stored", () => {
    expect(loadSessions()).toEqual([]);
    expect(loadTrips()).toEqual([]);
  });

  it("survives malformed session JSON instead of throwing", () => {
    localStorage.setItem("charge-sessions", "{not json");
    expect(() => loadSessions()).not.toThrow();
    expect(loadSessions()).toEqual([]);
    // corrupt value is quarantined, not silently destroyed
    expect(localStorage.getItem("charge-sessions.corrupt")).toBe("{not json");
  });

  it("rejects a stored value of the wrong shape", () => {
    localStorage.setItem("work-trips", JSON.stringify({ oops: true }));
    expect(loadTrips()).toEqual([]);
  });

  it("filters out individual malformed rows", () => {
    localStorage.setItem("charge-sessions", JSON.stringify([null, 5, { id: "a", session_date: "2026-01-01" }]));
    expect(loadSessions()).toHaveLength(1);
  });

  it("round-trips valid session data", () => {
    saveSessions([]);
    const rows = addSession({
      session_date: "2026-01-01",
      vehicle_id: "v1",
      vehicle_name: "Car",
      charge_mode: "immediate",
      start_soc: 20,
      end_soc: 80,
      energy_added_kwh: 30,
      grid_kwh: 33,
      total_cost_gbp: 5,
      avg_pence_per_kwh: 15,
      num_slots: 10,
      tariff_code: "AGILE",
      notes: "",
    });
    expect(rows).toHaveLength(1);
    expect(loadSessions()[0].id).toBe(rows[0].id);
  });

  it("falls back for malformed numbers and JSON helpers", () => {
    localStorage.setItem("n", "not-a-number");
    expect(readNumber("n", 15)).toBe(15);
    expect(readJSON("missing", { a: 1 })).toEqual({ a: 1 });
    expect(writeJSON("ok", { a: 1 })).toBe(true);
    expect(readJSON("ok", null)).toEqual({ a: 1 });
  });

  it("does not throw when saving trips with cyclic data", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    // @ts-expect-error deliberately invalid payload
    expect(() => saveTrips(cyclic)).not.toThrow();
  });
});

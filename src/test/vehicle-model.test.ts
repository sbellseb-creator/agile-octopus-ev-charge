import { describe, it, expect } from "vitest";
import { vehicleModelLine } from "@/lib/vehicle-data";

const base = { make: "", model: "", car_type: "" };

describe("vehicleModelLine", () => {
  it("renders a clean Tesla model line from a raw car_type", () => {
    expect(vehicleModelLine(base, { car_type: "modely", trim_badging: "74" })).toBe("Tesla Model Y");
  });

  it("adds a trim only when explicitly confirmed", () => {
    expect(vehicleModelLine(base, { car_type: "modely", trim_badging: "Long Range" })).toBe(
      "Tesla Model Y Long Range",
    );
  });

  it("never exposes raw identifiers or numeric fragments", () => {
    const line = vehicleModelLine({ ...base, car_type: "modely", model: "Model Y LR" });
    expect(line).toBe("Tesla Model Y");
    expect(line).not.toMatch(/modely|74|LR/);
  });

  it("falls back to manual make and model", () => {
    expect(vehicleModelLine({ make: "Polestar", model: "2", car_type: "" })).toBe("Polestar 2");
  });
});

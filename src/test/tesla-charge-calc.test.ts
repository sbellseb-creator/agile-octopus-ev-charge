import { describe, expect, it } from "vitest";
import { calculateChargeFromPower } from "@/lib/tesla-charge-calc";

describe("Tesla charge calculation", () => {
  it("uses observed charger power rather than Tesla's time estimate", () => {
    const result = calculateChargeFromPower(50, 80, 75, 6.9);

    expect(result.estimatedHours).toBe(3.75);
    expect(result.averagePowerKw).toBe(6.9);
  });

  it("marks a zero-power estimate as low confidence", () => {
    const result = calculateChargeFromPower(50, 80, 75, 0);

    expect(result.confidence).toBe(0.1);
    expect(result.confidenceReason).toBe("No observed charger power");
  });
});

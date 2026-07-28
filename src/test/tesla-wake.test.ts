import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { listTeslaVehicles } from "@/lib/tesla";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "x" } } }) },
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

describe("Tesla wake behaviour", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { connected: true, vehicles: [] }, error: null });
  });
  afterEach(() => localStorage.clear());

  it("never requests a wake on automatic loads (default call)", async () => {
    await listTeslaVehicles();
    expect(invoke.mock.calls[0][1].body.wake).toBe(false);
  });

  it("sends wake=false when explicitly passed false", async () => {
    await listTeslaVehicles(false);
    expect(invoke.mock.calls[0][1].body.wake).toBe(false);
  });

  it("only sends wake=true for an explicit manual refresh", async () => {
    await listTeslaVehicles(true);
    expect(invoke.mock.calls[0][1].body.wake).toBe(true);
  });

  it("coerces truthy non-boolean values to false so wake is never implied", async () => {
    // @ts-expect-error deliberately passing a wrong type
    await listTeslaVehicles("yes");
    expect(invoke.mock.calls[0][1].body.wake).toBe(false);
  });
});

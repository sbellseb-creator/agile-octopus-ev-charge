import { describe, expect, it } from "vitest";
import {
  advanceChargeMonitor,
  initialChargeMonitorState,
} from "@/lib/tesla-charge-monitor";

describe("Tesla charging monitor", () => {
  it("does not treat plugging in as charging", () => {
    const result = advanceChargeMonitor(
      initialChargeMonitorState(),
      {
        observedAt: "2026-08-06T20:00:00Z",
        chargingState: "Stopped",
        batteryLevel: 30,
        chargerPowerKw: 0,
      },
    );

    expect(result.event).toBe("plugged_in");
    expect(result.state.phase).toBe("plugged_waiting");
    expect(result.state.session?.actualStart).toBeUndefined();
  });

  it("starts the session only when charging actually starts", () => {
    const waiting = advanceChargeMonitor(
      initialChargeMonitorState(),
      {
        observedAt: "2026-08-06T20:00:00Z",
        chargingState: "Stopped",
        batteryLevel: 30,
        chargerPowerKw: 0,
      },
    );

    const charging = advanceChargeMonitor(waiting.state, {
      observedAt: "2026-08-07T01:00:00Z",
      chargingState: "Charging",
      batteryLevel: 31,
      chargerPowerKw: 6.9,
    });

    expect(charging.event).toBe("charge_started");
    expect(charging.state.phase).toBe("charging");
    expect(charging.state.session?.actualStart).toBe(
      "2026-08-07T01:00:00Z",
    );
    expect(charging.state.session?.startSoc).toBe(31);
  });

  it("continues the same session after a short pause", () => {
    const started = advanceChargeMonitor(
      initialChargeMonitorState(),
      {
        observedAt: "2026-08-07T01:00:00Z",
        chargingState: "Charging",
        batteryLevel: 31,
        chargerPowerKw: 6.9,
      },
    );

    const paused = advanceChargeMonitor(started.state, {
      observedAt: "2026-08-07T02:00:00Z",
      chargingState: "Stopped",
      batteryLevel: 50,
      chargerPowerKw: 0,
    });

    const resumed = advanceChargeMonitor(paused.state, {
      observedAt: "2026-08-07T02:10:00Z",
      chargingState: "Charging",
      batteryLevel: 50,
      chargerPowerKw: 6.8,
    });

    expect(paused.event).toBe("charge_paused");
    expect(resumed.event).toBe("charge_resumed");
    expect(resumed.state.session?.actualStart).toBe(
      "2026-08-07T01:00:00Z",
    );
  });

  it("keeps a stopped-but-plugged session open for less than 60 minutes", () => {
    const started = advanceChargeMonitor(
      initialChargeMonitorState(),
      {
        observedAt: "2026-08-07T01:00:00Z",
        chargingState: "Charging",
        batteryLevel: 31,
        chargerPowerKw: 6.9,
      },
    );

    const paused = advanceChargeMonitor(started.state, {
      observedAt: "2026-08-07T03:00:00Z",
      chargingState: "Stopped",
      batteryLevel: 80,
      chargerPowerKw: 0,
    });

    const stillPaused = advanceChargeMonitor(paused.state, {
      observedAt: "2026-08-07T03:30:00Z",
      chargingState: "Stopped",
      batteryLevel: 80,
      chargerPowerKw: 0,
    });

    expect(stillPaused.event).toBe("none");
    expect(stillPaused.state.phase).toBe("paused");
    expect(stillPaused.closedSession).toBeUndefined();
  });

  it("closes a stopped-but-plugged session after 60 minutes", () => {
    const started = advanceChargeMonitor(
      initialChargeMonitorState(),
      {
        observedAt: "2026-08-07T01:00:00Z",
        chargingState: "Charging",
        batteryLevel: 31,
        chargerPowerKw: 6.9,
      },
    );

    const paused = advanceChargeMonitor(started.state, {
      observedAt: "2026-08-07T03:00:00Z",
      chargingState: "Stopped",
      batteryLevel: 80,
      chargerPowerKw: 0,
    });

    const completed = advanceChargeMonitor(paused.state, {
      observedAt: "2026-08-07T04:01:00Z",
      chargingState: "Stopped",
      batteryLevel: 80,
      chargerPowerKw: 0,
    });

    expect(completed.event).toBe("charge_completed");
    expect(completed.closedSession?.actualFinish).toBe(
      "2026-08-07T03:00:00Z",
    );
    expect(completed.closedSession?.endSoc).toBe(80);
  });

  it("closes immediately when Tesla reports Complete", () => {
    const started = advanceChargeMonitor(
      initialChargeMonitorState(),
      {
        observedAt: "2026-08-07T01:00:00Z",
        chargingState: "Charging",
        batteryLevel: 31,
        chargerPowerKw: 6.9,
      },
    );

    const paused = advanceChargeMonitor(started.state, {
      observedAt: "2026-08-07T03:00:00Z",
      chargingState: "Stopped",
      batteryLevel: 80,
      chargerPowerKw: 0,
    });

    const completed = advanceChargeMonitor(paused.state, {
      observedAt: "2026-08-07T03:01:00Z",
      chargingState: "Complete",
      batteryLevel: 80,
      chargerPowerKw: 0,
      chargeEnergyAddedKwh: 36.2,
    });

    expect(completed.event).toBe("charge_completed");
    expect(completed.closedSession?.actualEnergyKwh).toBe(36.2);
  });
});

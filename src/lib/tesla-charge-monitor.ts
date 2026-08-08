export type TeslaChargingState =
  | "Disconnected"
  | "Stopped"
  | "NoPower"
  | "Starting"
  | "Charging"
  | "Complete"
  | "Unknown";

export type ChargeMonitorPhase =
  | "idle"
  | "plugged_waiting"
  | "charging"
  | "paused"
  | "completed";

export interface TeslaChargeObservation {
  observedAt: string;
  chargingState: TeslaChargingState | string | null;
  batteryLevel: number | null;
  chargerPowerKw: number | null;
  chargeEnergyAddedKwh?: number | null;
}

export interface AutomaticChargeSessionDraft {
  sessionDate: string;
  pluggedInAt?: string;
  actualStart?: string;
  actualFinish?: string;
  startSoc?: number;
  endSoc?: number;
  observedChargerKw?: number;
  actualEnergyKwh?: number;
}

export interface ChargeMonitorState {
  phase: ChargeMonitorPhase;
  lastObservedAt: string | null;
  pauseStartedAt: string | null;
  session: AutomaticChargeSessionDraft | null;
}

export interface ChargeMonitorResult {
  state: ChargeMonitorState;
  event:
    | "none"
    | "plugged_in"
    | "charge_started"
    | "charge_paused"
    | "charge_resumed"
    | "charge_completed"
    | "unplugged";
  closedSession?: AutomaticChargeSessionDraft;
}

export const CHARGE_PAUSE_GRACE_MS = 60 * 60 * 1000;

export const initialChargeMonitorState = (): ChargeMonitorState => ({
  phase: "idle",
  lastObservedAt: null,
  pauseStartedAt: null,
  session: null,
});

function isCharging(state: string | null): boolean {
  return state === "Charging" || state === "Starting";
}

function isPluggedButNotCharging(state: string | null): boolean {
  return (
    state === "Stopped" ||
    state === "NoPower" ||
    state === "Complete"
  );
}

function isDisconnected(state: string | null): boolean {
  return state === "Disconnected";
}

function ukDateFromIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function updateSessionFromObservation(
  session: AutomaticChargeSessionDraft,
  observation: TeslaChargeObservation,
): AutomaticChargeSessionDraft {
  const chargerPower = finiteNumber(observation.chargerPowerKw);
  const energy = finiteNumber(observation.chargeEnergyAddedKwh);
  const battery = finiteNumber(observation.batteryLevel);

  return {
    ...session,
    endSoc: battery ?? session.endSoc,
    observedChargerKw:
      chargerPower !== undefined && chargerPower > 0
        ? Math.max(session.observedChargerKw ?? 0, chargerPower)
        : session.observedChargerKw,
    actualEnergyKwh: energy ?? session.actualEnergyKwh,
  };
}

export function advanceChargeMonitor(
  current: ChargeMonitorState,
  observation: TeslaChargeObservation,
  pauseGraceMs = CHARGE_PAUSE_GRACE_MS,
): ChargeMonitorResult {
  const observedMs = new Date(observation.observedAt).getTime();

  if (!Number.isFinite(observedMs)) {
    throw new Error("Observation has an invalid observedAt timestamp.");
  }

  const chargingState = observation.chargingState ?? "Unknown";
  const baseState: ChargeMonitorState = {
    ...current,
    lastObservedAt: observation.observedAt,
  };

  if (isDisconnected(chargingState)) {
    if (
      current.session &&
      (current.phase === "charging" || current.phase === "paused")
    ) {
      const closedSession = {
        ...updateSessionFromObservation(current.session, observation),
        actualFinish: observation.observedAt,
      };

      return {
        state: initialChargeMonitorState(),
        event: "unplugged",
        closedSession,
      };
    }

    return {
      state: initialChargeMonitorState(),
      event: current.phase === "idle" ? "none" : "unplugged",
    };
  }

  if (isCharging(chargingState)) {
    const battery = finiteNumber(observation.batteryLevel);
    const chargerPower = finiteNumber(observation.chargerPowerKw);
    const energy = finiteNumber(observation.chargeEnergyAddedKwh);

    if (
      !current.session ||
      current.phase === "plugged_waiting" ||
      current.phase === "completed"
    ) {
      return {
        state: {
          phase: "charging",
          lastObservedAt: observation.observedAt,
          pauseStartedAt: null,
          session: {
            ...(current.session ?? {}),
            sessionDate: ukDateFromIso(observation.observedAt),
            actualStart: observation.observedAt,
            startSoc: battery,
            endSoc: battery,
            observedChargerKw: chargerPower,
            actualEnergyKwh: energy,
          },
        },
        event: "charge_started",
      };
    }

    const resumed = current.phase === "paused";

    return {
      state: {
        ...baseState,
        phase: "charging",
        pauseStartedAt: null,
        session: updateSessionFromObservation(
          current.session,
          observation,
        ),
      },
      event: resumed ? "charge_resumed" : "none",
    };
  }

  if (isPluggedButNotCharging(chargingState)) {
    if (!current.session) {
      return {
        state: {
          phase:
            chargingState === "Complete"
              ? "completed"
              : "plugged_waiting",
          lastObservedAt: observation.observedAt,
          pauseStartedAt: null,
          session: {
            sessionDate: ukDateFromIso(observation.observedAt),
            pluggedInAt: observation.observedAt,
            endSoc: finiteNumber(observation.batteryLevel),
          },
        },
        event: "plugged_in",
      };
    }

    if (current.phase === "charging") {
      return {
        state: {
          ...baseState,
          phase: "paused",
          pauseStartedAt: observation.observedAt,
          session: updateSessionFromObservation(
            current.session,
            observation,
          ),
        },
        event: "charge_paused",
      };
    }

    if (current.phase === "paused" && current.pauseStartedAt) {
      const pauseMs =
        observedMs - new Date(current.pauseStartedAt).getTime();

      if (
        chargingState === "Complete" ||
        pauseMs >= pauseGraceMs
      ) {
        const closedSession = {
          ...updateSessionFromObservation(
            current.session,
            observation,
          ),
          actualFinish: current.pauseStartedAt,
        };

        return {
          state: {
            phase: "completed",
            lastObservedAt: observation.observedAt,
            pauseStartedAt: null,
            session: closedSession,
          },
          event: "charge_completed",
          closedSession,
        };
      }
    }

    return {
      state: {
        ...baseState,
        phase: current.phase,
        session: updateSessionFromObservation(
          current.session,
          observation,
        ),
      },
      event: "none",
    };
  }

  return {
    state: baseState,
    event: "none",
  };
}

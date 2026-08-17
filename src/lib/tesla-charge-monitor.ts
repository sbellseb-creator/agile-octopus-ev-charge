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
  /** Tesla's cumulative counter when this app first observed the session. */
  energyBaselineKwh?: number;
  energyLatestKwh?: number;
  firstChargingObservedAt?: string;
  lastChargingObservedAt?: string;
  startObservationGapMinutes?: number;
  finishObservationGapMinutes?: number;
  observationCount?: number;
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

export const CHARGE_PAUSE_GRACE_MS = 10 * 60 * 1000;

export const initialChargeMonitorState = (): ChargeMonitorState => ({
  phase: "idle",
  lastObservedAt: null,
  pauseStartedAt: null,
  session: null,
});

function isCharging(state: string | null): boolean {
  const normal = state?.toLowerCase();
  return normal === "charging" || normal === "starting";
}

function isPluggedButNotCharging(state: string | null): boolean {
  const normal = state?.toLowerCase();
  return (
    normal === "stopped" ||
    normal === "nopower" ||
    normal === "complete"
  );
}

function isDisconnected(state: string | null): boolean {
  return state?.toLowerCase() === "disconnected";
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
  const baseline = finiteNumber(session.energyBaselineKwh);
  const sessionEnergy = energy === undefined
    ? session.actualEnergyKwh
    : baseline === undefined
      ? session.actualEnergyKwh
      : Math.max(0, energy >= baseline ? energy - baseline : energy);

  return {
    ...session,
    endSoc: battery ?? session.endSoc,
    observedChargerKw:
      chargerPower !== undefined && chargerPower > 0
        ? Math.max(session.observedChargerKw ?? 0, chargerPower)
        : session.observedChargerKw,
    // Older persisted monitor states did not store a baseline. The first
    // counter seen after upgrading becomes the baseline instead of being
    // misreported as energy delivered by this session.
    energyBaselineKwh: baseline ?? energy,
    energyLatestKwh: energy ?? session.energyLatestKwh,
    actualEnergyKwh: sessionEnergy,
    observationCount: (session.observationCount ?? 0) + 1,
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
      const previousObservedMs = current.lastObservedAt
        ? new Date(current.lastObservedAt).getTime()
        : Number.NaN;
      const startGapMinutes = Number.isFinite(previousObservedMs)
        ? Math.max(0, (observedMs - previousObservedMs) / 60_000)
        : undefined;
      const baseline = finiteNumber(current.session?.energyBaselineKwh) ?? energy;
      return {
        state: {
          phase: "charging",
          lastObservedAt: observation.observedAt,
          pauseStartedAt: null,
          session: {
            ...(current.session ?? {}),
            sessionDate: ukDateFromIso(observation.observedAt),
            actualStart: observation.observedAt,
            // If Home observed the car waiting after plug-in, retain that SoC.
            // Replacing it with the first later charging observation can create
            // an impossible short SoC range paired with a much larger energy value.
            startSoc:
              current.session?.startSoc ??
              current.session?.endSoc ??
              battery,
            endSoc: battery,
            observedChargerKw: chargerPower,
            energyBaselineKwh: baseline,
            energyLatestKwh: energy,
            actualEnergyKwh:
              energy !== undefined && baseline !== undefined
                ? Math.max(0, energy >= baseline ? energy - baseline : energy)
                : undefined,
            firstChargingObservedAt: observation.observedAt,
            lastChargingObservedAt: observation.observedAt,
            startObservationGapMinutes: startGapMinutes,
            observationCount: 1,
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
        session: {
          ...updateSessionFromObservation(current.session, observation),
          lastChargingObservedAt: observation.observedAt,
        },
      },
      event: resumed ? "charge_resumed" : "none",
    };
  }

  if (isPluggedButNotCharging(chargingState)) {
    if (!current.session) {
      return {
        state: {
          phase:
            chargingState.toLowerCase() === "complete"
              ? "completed"
              : "plugged_waiting",
          lastObservedAt: observation.observedAt,
          pauseStartedAt: null,
          session: {
            sessionDate: ukDateFromIso(observation.observedAt),
            pluggedInAt: observation.observedAt,
            endSoc: finiteNumber(observation.batteryLevel),
            energyBaselineKwh: finiteNumber(observation.chargeEnergyAddedKwh),
            energyLatestKwh: finiteNumber(observation.chargeEnergyAddedKwh),
            observationCount: 1,
          },
        },
        event: "plugged_in",
      };
    }

    if (current.phase === "charging") {
      const lastChargingMs = current.session.lastChargingObservedAt
        ? new Date(current.session.lastChargingObservedAt).getTime()
        : Number.NaN;
      return {
        state: {
          ...baseState,
          phase: "paused",
          pauseStartedAt: observation.observedAt,
          session: {
            ...updateSessionFromObservation(current.session, observation),
            finishObservationGapMinutes: Number.isFinite(lastChargingMs)
              ? Math.max(0, (observedMs - lastChargingMs) / 60_000)
              : undefined,
          },
        },
        event: "charge_paused",
      };
    }

    if (current.phase === "paused" && current.pauseStartedAt) {
      const pauseMs =
        observedMs - new Date(current.pauseStartedAt).getTime();

      if (
        chargingState.toLowerCase() === "complete" ||
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

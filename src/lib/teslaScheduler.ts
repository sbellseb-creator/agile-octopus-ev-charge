import type { Vehicle } from "./vehicle-data";

export interface PlannerSlot {
  valid_from: string;
  valid_to: string;
  value_inc_vat: number;
}

export interface TeslaSchedule {
  vehicleId: string;
  vehicleName: string;

  startTime: string;
  endTime: string;

  latitude: number;
  longitude: number;

  chargerPowerKw: number;
  chargerCurrentA: number;

  slots: PlannerSlot[];

  estimatedCost: number;
  estimatedEnergyKwh: number;
}

export interface HomeLocation {
  latitude: number;
  longitude: number;
}

export const HOME_CHARGER = {
  powerKw: 6.9,
  currentA: 30,
} as const;

export function buildTeslaSchedule(args: {
  vehicle: Vehicle;
  slots: PlannerSlot[];
  home: HomeLocation;
  estimatedCost: number;
  estimatedEnergyKwh: number;
}): TeslaSchedule {
  const { vehicle, slots, home, estimatedCost, estimatedEnergyKwh } = args;

  if (slots.length === 0) {
    throw new Error("No charging slots selected.");
  }

  return {
    vehicleId: vehicle.id,
    vehicleName: vehicle.name,

    startTime: slots[0].valid_from,
    endTime: slots[slots.length - 1].valid_to,

    latitude: home.latitude,
    longitude: home.longitude,

    chargerPowerKw: HOME_CHARGER.powerKw,
    chargerCurrentA: HOME_CHARGER.currentA,

    slots,

    estimatedCost,
    estimatedEnergyKwh,
  };
}
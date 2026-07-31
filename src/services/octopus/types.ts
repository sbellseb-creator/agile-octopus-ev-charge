export interface PriceSlot {
  validFrom: string;
  validTo: string;
  valueIncVat: number;
}

export interface TariffInfo {
  code: string;
  region: string;
  type: "AGILE" | "GO" | "TRACKER" | "COSY" | "FLUX" | "UNKNOWN";
}

export interface OctopusConnection {
  apiKey: string;
  accountNumber?: string;
  tariff?: TariffInfo;
}

export interface Meter {
  serialNumber: string;
}

export interface ElectricityMeterPoint {
  mpan: string;
  meters: Meter[];
}

export interface Property {
  id: string;
  address: string;
  electricityMeterPoints: ElectricityMeterPoint[];
}
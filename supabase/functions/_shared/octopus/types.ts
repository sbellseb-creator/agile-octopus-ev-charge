export const REGION_NAMES = {
  A: "Eastern England",
  B: "East Midlands",
  C: "London",
  D: "Merseyside and North Wales",
  E: "West Midlands",
  F: "North East England",
  G: "North West England",
  H: "Southern Scotland",
  J: "South East England",
  K: "Southern England",
  L: "South Wales",
  M: "Yorkshire",
  N: "Southern Scotland",
  P: "Northern Scotland",
} as const;

export type RegionCode = keyof typeof REGION_NAMES;

export type TariffType =
  | "AGILE"
  | "TRACKER"
  | "GO"
  | "INTELLIGENT"
  | "COSY"
  | "FLUX"
  | "STANDARD"
  | "UNKNOWN";

export interface OctopusAgreement {
  tariff_code: string;
  valid_from: string;
  valid_to: string | null;
}

export interface OctopusMeter {
  serial_number: string;
}

export interface OctopusMeterPoint {
  mpan: string;
  profile_class?: number;
  consumption_standard?: number;
  meters?: OctopusMeter[];
  agreements?: OctopusAgreement[];
}

export interface OctopusProperty {
  id: number;
  moved_in_at?: string;
  moved_out_at?: string | null;
  address_line_1?: string;
  address_line_2?: string;
  address_line_3?: string;
  town?: string;
  county?: string;
  postcode?: string;
  electricity_meter_points?: OctopusMeterPoint[];
}

export interface OctopusAccount {
  number: string;
  properties: OctopusProperty[];
}

export interface OctopusRate {
  value_exc_vat: number;
  value_inc_vat: number;
  valid_from: string;
  valid_to: string;
  payment_method?: string | null;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface DiscoveredSupply {
  propertyId: number;
  address: string;
  postcode: string;
  mpan: string;
  meterSerials: string[];
  tariffCode: string;
  productCode: string;
  regionCode: RegionCode;
  regionName: string;
  tariffType: TariffType;
  agreementValidFrom: string;
  agreementValidTo: string | null;
}

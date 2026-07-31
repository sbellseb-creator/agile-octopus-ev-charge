export const REGIONS = {
  A: { code: "A", name: "Eastern England" },
  B: { code: "B", name: "East Midlands" },
  C: { code: "C", name: "London" },
  D: { code: "D", name: "Merseyside & North Wales" },
  E: { code: "E", name: "West Midlands" },
  F: { code: "F", name: "North East England" },
  G: { code: "G", name: "North West England" },
  H: { code: "H", name: "South Scotland" },
  J: { code: "J", name: "South East England" },
  K: { code: "K", name: "Southern England" },
  L: { code: "L", name: "South Wales" },
  M: { code: "M", name: "Yorkshire" },
  N: { code: "N", name: "Southern Scotland" },
  P: { code: "P", name: "Northern Scotland" },
} as const;

export type RegionCode = keyof typeof REGIONS;

export function getRegion(code: string) {
  return REGIONS[code as RegionCode] ?? null;
}

export function isValidRegion(code: string): boolean {
  return code in REGIONS;
}
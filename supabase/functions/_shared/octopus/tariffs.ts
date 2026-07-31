import {
  REGION_NAMES,
  type RegionCode,
  type TariffType,
} from "./types.ts";

export function classifyTariff(code: string): TariffType {
  const value = code.toUpperCase();

  if (value.includes("AGILE")) return "AGILE";
  if (value.includes("INTELLIGENT")) return "INTELLIGENT";
  if (value.includes("TRACKER") || value.includes("SILVER")) return "TRACKER";
  if (value.includes("COSY")) return "COSY";
  if (value.includes("FLUX")) return "FLUX";
  if (value.includes("GO")) return "GO";
  if (value.length > 0) return "STANDARD";

  return "UNKNOWN";
}

/**
 * Octopus electricity tariff codes normally follow:
 * E-1R-{PRODUCT_CODE}-{REGION}
 *
 * Example:
 * E-1R-AGILE-FLEX-22-11-25-F
 */
export function parseElectricityTariffCode(tariffCode: string): {
  tariffCode: string;
  productCode: string;
  regionCode: RegionCode;
} {
  const normalised = tariffCode.trim().toUpperCase();
  const match = normalised.match(/^E-\dR-(.+)-([A-P])$/);

  if (!match) {
    throw new Error(`Unsupported electricity tariff code: ${tariffCode}`);
  }

  const productCode = match[1];
  const regionCode = match[2] as RegionCode;

  if (!(regionCode in REGION_NAMES)) {
    throw new Error(`Unknown Octopus region code: ${regionCode}`);
  }

  return {
    tariffCode: normalised,
    productCode,
    regionCode,
  };
}

export function buildElectricityTariffCode(
  productCode: string,
  regionCode: RegionCode,
): string {
  return `E-1R-${productCode.toUpperCase()}-${regionCode}`;
}

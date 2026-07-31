import type {
  DiscoveredSupply,
  OctopusAccount,
  OctopusAgreement,
} from "./types.ts";
import { REGION_NAMES } from "./types.ts";
import {
  classifyTariff,
  parseElectricityTariffCode,
} from "./tariffs.ts";

function joinAddress(parts: Array<string | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

function agreementIsActive(
  agreement: OctopusAgreement,
  at = new Date(),
): boolean {
  const validFrom = new Date(agreement.valid_from);

  if (Number.isNaN(validFrom.getTime()) || validFrom > at) {
    return false;
  }

  if (!agreement.valid_to) {
    return true;
  }

  const validTo = new Date(agreement.valid_to);
  return !Number.isNaN(validTo.getTime()) && validTo > at;
}

function selectAgreement(
  agreements: OctopusAgreement[],
): OctopusAgreement | null {
  const active = agreements
    .filter((agreement) => agreementIsActive(agreement))
    .sort(
      (left, right) =>
        new Date(right.valid_from).getTime() -
        new Date(left.valid_from).getTime(),
    );

  if (active.length > 0) return active[0];

  const historical = [...agreements].sort(
    (left, right) =>
      new Date(right.valid_from).getTime() -
      new Date(left.valid_from).getTime(),
  );

  return historical[0] ?? null;
}

export function discoverElectricitySupplies(
  account: OctopusAccount,
): DiscoveredSupply[] {
  const supplies: DiscoveredSupply[] = [];

  for (const property of account.properties ?? []) {
    for (const meterPoint of property.electricity_meter_points ?? []) {
      const agreement = selectAgreement(meterPoint.agreements ?? []);

      if (!agreement) continue;

      let parsed;

      try {
        parsed = parseElectricityTariffCode(agreement.tariff_code);
      } catch {
        // Ignore gas, export or unsupported meter-point tariff formats.
        continue;
      }

      supplies.push({
        propertyId: property.id,
        address: joinAddress([
          property.address_line_1,
          property.address_line_2,
          property.address_line_3,
          property.town,
          property.county,
        ]),
        postcode: property.postcode?.trim() ?? "",
        mpan: meterPoint.mpan,
        meterSerials: (meterPoint.meters ?? [])
          .map((meter) => meter.serial_number)
          .filter(Boolean),
        tariffCode: parsed.tariffCode,
        productCode: parsed.productCode,
        regionCode: parsed.regionCode,
        regionName: REGION_NAMES[parsed.regionCode],
        tariffType: classifyTariff(parsed.productCode),
        agreementValidFrom: agreement.valid_from,
        agreementValidTo: agreement.valid_to,
      });
    }
  }

  return supplies;
}

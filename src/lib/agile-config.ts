/**
 * Single source of truth for the Agile region used across the app.
 * Region F = North Eastern England (GSP group `_F`).
 * Official Octopus tariff codes end in `-F`, e.g. `E-1R-AGILE-24-10-01-F`.
 */
export const AGILE_REGION = "F";
export const AGILE_GSP_GROUP = `_${AGILE_REGION}`;
export const AGILE_PRODUCT_CODE = "AGILE-24-10-01";
export const AGILE_TARIFF_CODE = `E-1R-${AGILE_PRODUCT_CODE}-${AGILE_REGION}`;

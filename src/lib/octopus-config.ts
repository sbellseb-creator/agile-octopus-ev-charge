export interface OctopusConfig {
  apiKey?: string;
  accountNumber?: string;

  productCode: string;
  tariffCode?: string;
  region: string;

  propertyId?: string;
  propertyAddress?: string;
  postcode?: string;

  mpan?: string;
  meterSerial?: string;

  connected: boolean;
  verifiedAt?: string;
}

const STORAGE_PREFIX = "octopus-";

const DEFAULT_CONFIG: OctopusConfig = {
  productCode: "AGILE-24-10-01",
  region: "F",
  connected: false,
};

function storageKey(
  key: keyof OctopusConfig,
): string {
  return `${STORAGE_PREFIX}${String(key).replace(
    /[A-Z]/g,
    (letter) => `-${letter.toLowerCase()}`,
  )}`;
}

function readOptional(
  key: keyof OctopusConfig,
): string | undefined {
  const value = localStorage.getItem(storageKey(key));

  return value && value.trim()
    ? value
    : undefined;
}

export function getOctopusConfig(): OctopusConfig {
  return {
    apiKey: readOptional("apiKey"),
    accountNumber: readOptional("accountNumber"),

    productCode:
      readOptional("productCode") ??
      DEFAULT_CONFIG.productCode,

    tariffCode: readOptional("tariffCode"),

    region:
      readOptional("region") ??
      localStorage.getItem("agile-region") ??
      DEFAULT_CONFIG.region,

    propertyId: readOptional("propertyId"),
    propertyAddress: readOptional("propertyAddress"),
    postcode: readOptional("postcode"),

    mpan: readOptional("mpan"),
    meterSerial: readOptional("meterSerial"),

    connected:
      localStorage.getItem(storageKey("connected")) === "true",

    verifiedAt: readOptional("verifiedAt"),
  };
}

export function saveOctopusConfig(
  config: Partial<OctopusConfig>,
): OctopusConfig {
  for (const [rawKey, value] of Object.entries(config)) {
    const key = rawKey as keyof OctopusConfig;
    const keyName = storageKey(key);

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      localStorage.removeItem(keyName);
      continue;
    }

    localStorage.setItem(keyName, String(value));
  }

  const updated = getOctopusConfig();

  window.dispatchEvent(
    new CustomEvent("octopus-config-changed", {
      detail: updated,
    }),
  );

  return updated;
}

export function clearOctopusConfig(): OctopusConfig {
  for (const key of Object.keys(
    DEFAULT_CONFIG,
  ) as Array<keyof OctopusConfig>) {
    localStorage.removeItem(storageKey(key));
  }

  const optionalKeys: Array<keyof OctopusConfig> = [
    "apiKey",
    "accountNumber",
    "tariffCode",
    "propertyId",
    "propertyAddress",
    "postcode",
    "mpan",
    "meterSerial",
    "verifiedAt",
  ];

  for (const key of optionalKeys) {
    localStorage.removeItem(storageKey(key));
  }

  localStorage.removeItem("agile-region");

  const reset = getOctopusConfig();

  window.dispatchEvent(
    new CustomEvent("octopus-config-changed", {
      detail: reset,
    }),
  );

  return reset;
}

export function hasOctopusConnection(): boolean {
  const config = getOctopusConfig();

  return Boolean(
    config.connected &&
      config.apiKey &&
      config.accountNumber &&
      config.productCode &&
      config.region,
  );
}
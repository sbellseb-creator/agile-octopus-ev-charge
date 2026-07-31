export interface OctopusConfig {
  apiKey?: string;
  accountNumber?: string;
  productCode: string;
  region: string;
}

const DEFAULT_CONFIG: OctopusConfig = {
  productCode: "AGILE-24-10-01",
  region: "F",
};

export function getOctopusConfig(): OctopusConfig {
  return {
    apiKey: localStorage.getItem("octopus-api-key") ?? undefined,
    accountNumber: localStorage.getItem("octopus-account-number") ?? undefined,
    productCode:
      localStorage.getItem("octopus-product-code") ??
      DEFAULT_CONFIG.productCode,
    region:
      localStorage.getItem("octopus-region") ??
      localStorage.getItem("agile-region") ??
      DEFAULT_CONFIG.region,
  };
}

export function saveOctopusConfig(config: Partial<OctopusConfig>) {
  Object.entries(config).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    localStorage.setItem(
      `octopus-${key.replace(/[A-Z]/g, m => "-" + m.toLowerCase())}`,
      String(value),
    );
  });
}
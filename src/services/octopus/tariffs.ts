export type TariffType =
  | "AGILE"
  | "GO"
  | "INTELLIGENT"
  | "TRACKER"
  | "COSY"
  | "FLUX"
  | "STANDARD"
  | "UNKNOWN";

export function classifyTariff(code: string): TariffType {
  const value = code.toUpperCase();

  if (value.includes("AGILE")) return "AGILE";
  if (value.includes("INTELLIGENT")) return "INTELLIGENT";
  if (value.includes("GO")) return "GO";
  if (value.includes("TRACKER")) return "TRACKER";
  if (value.includes("COSY")) return "COSY";
  if (value.includes("FLUX")) return "FLUX";

  return "UNKNOWN";
}
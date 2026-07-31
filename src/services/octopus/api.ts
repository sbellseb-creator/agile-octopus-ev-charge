const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function call(body: unknown) {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/octopus-energy`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error ?? "Octopus request failed");
  }

  return json;
}

export async function verifyAccount(
  apiKey: string,
  accountNumber: string,
) {
  return call({
    action: "verify-account",
    apiKey,
    accountNumber,
  });
}

export async function getRates(
  productCode: string,
  region: string,
  periodFrom?: string,
  periodTo?: string,
) {
  return call({
    action: "rates",
    productCode,
    region,
    periodFrom,
    periodTo,
  });
}

export async function getRegions() {
  return call({
    action: "regions",
  });
}
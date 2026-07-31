import { getRates, verifyAccount } from "./api";

export class OctopusClient {
  async verifyAccount(apiKey: string, accountNumber: string) {
    return verifyAccount(apiKey, accountNumber);
  }

  async getStandardUnitRates(
    productCode: string,
    regionCode: string,
    periodFrom?: string,
    periodTo?: string,
  ) {
    return getRates(
      productCode,
      regionCode,
      periodFrom,
      periodTo,
    );
  }
}

export const octopusClient = new OctopusClient();
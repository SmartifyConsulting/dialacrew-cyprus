export type AssetLine = { dailyFee: number; days: number };

/** Total a service provider earns on a job: day rate × days plus every selected asset fee × its days. */
export function providerTotal(crewRate: number, days: number, assets: AssetLine[]) {
  return crewRate * days + assets.reduce((a, x) => a + x.dailyFee * x.days, 0);
}

export function assetsTotal(assets: AssetLine[]) {
  return assets.reduce((a, x) => a + x.dailyFee * x.days, 0);
}

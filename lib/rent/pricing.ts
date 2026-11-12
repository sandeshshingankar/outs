const HOUR_IN_MS = 60 * 60 * 1000;

export function getBillableRentalDays(durationMs: number): number | null {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;

  const billableHours = Math.ceil(durationMs / HOUR_IN_MS);
  const days = Math.ceil(billableHours / 24);
  return Number.isSafeInteger(days) ? days : null;
}

export function getRentalEstimatePaise(dailyPricePaise: number, days: number): number | null {
  const estimate = dailyPricePaise * days;
  return Number.isSafeInteger(dailyPricePaise) && dailyPricePaise > 0 &&
    Number.isSafeInteger(days) && days > 0 &&
    Number.isSafeInteger(estimate)
    ? estimate
    : null;
}

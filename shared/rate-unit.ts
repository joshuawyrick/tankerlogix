/**
 * Returns the rate unit label for a given load type.
 * Crude oil is priced per barrel; everything else (diesel, gasoline, etc.) per gallon.
 */
export function getRateUnit(loadType: string | undefined | null): "barrel" | "gallon" {
  return loadType === "crude" ? "barrel" : "gallon";
}

/**
 * Formats a rate-per-unit string, e.g. "$1.23/barrel" or "$0.95/gallon".
 */
export function formatRatePerUnit(
  ratePerUnit: number,
  loadType: string | undefined | null,
): string {
  return `$${ratePerUnit.toFixed(2)}/${getRateUnit(loadType)}`;
}

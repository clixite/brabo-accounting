/**
 * Shared monetary / numeric formatting (fr-BE locale).
 * Kept dependency-free and deterministic across the platform.
 */

const moneyFormatter = new Intl.NumberFormat('fr-BE', {
  style: 'currency',
  currency: 'EUR',
});

const amountFormatter = new Intl.NumberFormat('fr-BE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `1 234,56 €` */
export function formatMoney(value: number): string {
  return moneyFormatter.format(Number.isFinite(value) ? value : 0);
}

/** `1 234,56` (no currency symbol). */
export function formatAmount(value: number): string {
  return amountFormatter.format(Number.isFinite(value) ? value : 0);
}

/** `+1 234,56 €` / `−1 234,56 €` with an explicit sign. */
export function formatSignedMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe > 0 ? '+' : safe < 0 ? '−' : '';
  return `${sign}${moneyFormatter.format(Math.abs(safe))}`;
}

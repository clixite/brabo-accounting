/**
 * Minimal classname combiner for the UI primitives.
 * Joins truthy values and flattens nested arrays — no dependency needed.
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}

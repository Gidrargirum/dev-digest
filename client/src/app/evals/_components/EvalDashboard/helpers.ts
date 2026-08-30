export function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

/** Whole-percent integer for the recall sparkline / bar cells (null → 0, kept
 *  out of the trend rather than breaking the line). */
export function pctValue(v: number | null): number {
  return v == null ? 0 : Math.round(v * 100);
}

export function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

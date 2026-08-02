/** "$0.014" style cost, or an em dash when no cost data exists (never "$0.00"). */
export function formatCost(costUsd: number | null): string {
  if (costUsd == null) return "—";
  return `$${costUsd.toFixed(3)}`;
}

/** Compact token summary for the badge's detailed variant, e.g. "8.2K→1.3K". */
export function formatTokensCompact(tokensIn: number, tokensOut: number): string {
  const k = (n: number) => `${(n / 1000).toFixed(1)}K`;
  return `${k(tokensIn)}→${k(tokensOut)}`;
}

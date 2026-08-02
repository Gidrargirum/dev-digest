/* RunCostBadge — USD cost of one agent run (+ optional token summary).
   Two variants: "compact" (PR-list COST column) and "detailed" (verdict-card
   line, cost + tokens). Null cost always renders as "—", never "$0.00". */
import React from "react";
import { formatCost, formatTokensCompact } from "./helpers";

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
}: {
  costUsd: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: "compact" | "detailed";
}) {
  const cost = formatCost(costUsd);
  const showTokens = variant === "detailed" && costUsd != null && tokensIn != null && tokensOut != null;
  return (
    <span className="mono" style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
      {cost}
      {showTokens ? ` · ${formatTokensCompact(tokensIn!, tokensOut!)}` : ""}
    </span>
  );
}

export default RunCostBadge;

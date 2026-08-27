import type { RiskLevel } from "@/lib/types";

/** Risk-level palette + icon. Colour AND a non-colour cue (icon + text label
 *  in the component) so the level reads without colour perception (AC-26).
 *  The lookup is TOTAL — `RISK_LEVEL[value] ?? RISK_LEVEL.low` — because the
 *  contract is not parsed on the client and a drifted value must not crash
 *  rendering (client insight, 2026-08-19). */
export const RISK_LEVEL: Record<
  RiskLevel,
  { color: string; bg: string; icon: "AlertTriangle" | "Info" }
> = {
  high: { color: "var(--crit)", bg: "var(--crit-bg)", icon: "AlertTriangle" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)", icon: "AlertTriangle" },
  low: { color: "var(--sugg)", bg: "var(--sugg-bg)", icon: "Info" },
};

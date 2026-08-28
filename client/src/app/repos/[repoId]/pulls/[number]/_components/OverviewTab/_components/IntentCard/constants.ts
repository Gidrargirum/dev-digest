import type { RiskAreaKind } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Total mapping from the wire risk enum to the UI kit icon registry. */
export const RISK_KIND_ICON: Record<RiskAreaKind, IconName> = {
  security: "Shield",
  dependency: "Boxes",
  performance: "Zap",
  data: "Database",
  api_change: "Workflow",
  other: "AlertTriangle",
};

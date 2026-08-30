/* EvalsTab — the agent editor's "Evals" tab (AC-10/AC-11). Thin wrapper over
   the shared `EvalsPanel` (promoted to `src/components/` once the skill
   detail view became a second consumer — Amendment A). */
"use client";

import type { Agent } from "@devdigest/shared";
import { EvalsPanel } from "@/components/evals-panel";

export function EvalsTab({ agent }: { agent: Agent }) {
  return <EvalsPanel ownerKind="agent" ownerId={agent.id} />;
}

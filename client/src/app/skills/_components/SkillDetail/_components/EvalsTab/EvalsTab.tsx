/* EvalsTab — the skill detail view's "Evals" tab (AC-55, Amendment A).
   Renders the same shared EvalsPanel the agent editor uses (AC-10/AC-11's
   rules, unchanged), scoped to this skill's cases. */
"use client";

import type { Skill } from "@devdigest/shared";
import { EvalsPanel } from "@/components/evals-panel";
import { useSkillEvalCases } from "@/lib/hooks/eval";
import { suggestedBaselineAgentId } from "./helpers";
import { s } from "./styles";

export function EvalsTab({ skill }: { skill: Skill }) {
  // Read once here (in addition to EvalsPanel's own fetch of the same query
  // key — React Query dedupes identical keys, so this costs no extra
  // request) only to derive a sensible default for a NEW case's baseline
  // agent selector (AC-38 — still user-chosen, never silently inferred).
  const { data: cases } = useSkillEvalCases(skill.id);

  return (
    <div style={s.wrap}>
      <EvalsPanel
        ownerKind="skill"
        ownerId={skill.id}
        baselineAgentId={suggestedBaselineAgentId(cases)}
        skillName={skill.name}
      />
    </div>
  );
}

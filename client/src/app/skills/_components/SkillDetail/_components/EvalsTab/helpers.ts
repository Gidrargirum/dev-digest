import type { EvalCase } from "@devdigest/shared";

/**
 * Suggests the baseline agent for a NEW skill-owned case (AC-38's field is
 * still user-chosen, editable and never auto-inferred silently — this only
 * pre-selects the value the user most likely wants). Picks the baseline of
 * the skill's most recently created case that recorded one; `undefined`
 * when the skill has no cases yet, so the selector's own placeholder shows.
 */
export function suggestedBaselineAgentId(cases: EvalCase[] | undefined): string | undefined {
  if (!cases || cases.length === 0) return undefined;
  const withBaseline = cases.find((c) => !!c.baseline_agent_id);
  return withBaseline?.baseline_agent_id ?? undefined;
}

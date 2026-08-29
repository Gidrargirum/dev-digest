/**
 * Constants genuinely shared across module boundaries — see
 * `.dependency-cruiser.cjs`'s `no-cross-module-imports` rule, which exempts
 * `modules/_shared/` precisely for cases like this one.
 */

/** Only `agent`-owned eval cases are supported (Non-goal: `owner_kind='skill'`).
 *  Mirrors the `eval_cases.owner_kind` enum in `db/schema/eval.ts`. Read by
 *  `modules/eval/**` (case CRUD) AND `modules/agents/repository.ts` (cascade
 *  delete of an agent's eval cases) — neither module may import the other
 *  directly, so the value lives here instead of being duplicated as a literal. */
export const EVAL_CASE_OWNER_KIND = 'agent' as const;

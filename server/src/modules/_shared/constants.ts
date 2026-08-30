/**
 * Constants genuinely shared across module boundaries — see
 * `.dependency-cruiser.cjs`'s `no-cross-module-imports` rule, which exempts
 * `modules/_shared/` precisely for cases like this one.
 */

/** The two `eval_cases.owner_kind` values (Amendment A, AC-36 — `'skill'` is
 *  now a supported owner, not rejected). Mirrors the enum in
 *  `db/schema/eval.ts`. Read by `modules/eval/**` (case CRUD) AND
 *  `modules/agents/repository.ts` / `modules/skills/repository.ts` (cascade
 *  delete of an owner's eval cases) — none of those modules may import each
 *  other directly, so the values live here instead of being duplicated as
 *  literals. */
export const EVAL_CASE_OWNER_KIND_AGENT = 'agent' as const;
export const EVAL_CASE_OWNER_KIND_SKILL = 'skill' as const;

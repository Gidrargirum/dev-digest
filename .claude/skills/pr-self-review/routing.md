# Routing — changed path → skills

Deterministic. **Not** first-match-wins: every matching row contributes, and a
file routinely lands in several slices. A `repository.ts` is both
`server-backend` and `db`, so it gets `onion-architecture` *and*
`drizzle-orm-patterns`.

## The matrix

| Glob | Slice | Skills to run |
|---|---|---|
| `client/src/app/**/*.tsx` | client-ui | `frontend-architecture`, `next-best-practices`, `react-best-practices` |
| `client/src/app/**/_components/**`, `client/src/components/**` | client-ui | `frontend-architecture`, `react-best-practices` |
| `client/src/lib/hooks/**`, `client/src/lib/api.ts` | client-ui | `frontend-architecture`, `react-best-practices` |
| `client/**/*.test.tsx`, `client/**/*.test.ts` | tests | `react-testing-library` |
| `client/src/vendor/ui/**` | forbidden | — → rule **B6** on sight, except a `NAV`/`SHORTCUTS` entry in `nav.ts` (see B6's carve-out) |
| `server/src/modules/**/routes.ts`, `server/src/app.ts`, `server/src/plugins/**` | server-backend | `onion-architecture`, `fastify-best-practices` |
| `server/src/modules/**/service.ts` | server-backend | `onion-architecture` |
| `server/src/modules/**/repository*.ts` | server-backend, db | `onion-architecture`, `drizzle-orm-patterns` |
| `server/src/db/schema/**`, `server/src/db/schema.ts` | db | `postgresql-table-design`, `drizzle-orm-patterns` |
| `server/src/db/**` (rest) | server-backend, db | `onion-architecture`, `drizzle-orm-patterns` |
| `server/src/adapters/**`, `server/src/platform/**`, `server/src/ports/**` | server-backend | `onion-architecture` |
| `server/test/**`, `server/**/*.test.ts` | tests | — → rules **B5**, **B9** |
| `reviewer-core/src/**` | domain | `onion-architecture` |
| `server/src/vendor/shared/**`, `client/src/vendor/shared/**` | contracts | `zod` (+ the vendor-parity gate) |
| any `**/*.ts` / `**/*.tsx` touching types, generics, or `tsconfig*.json` | — | `typescript-expert` |
| any changed source file | — | `security` — **always**, on every branch that touches code |
| `e2e/specs/*.flow.json`, `e2e/**` | e2e | — → rule **B9**, `e2e/AGENTS.md` |
| `.github/workflows/**` | config | — → rule **B10**, `TESTING.md` lanes |
| `.claude/skills/**`, `skills-lock.json` | config | — → `scripts/check-skills-lock.mjs` gate |
| `.claude/agents/**` | config | — → `.claude/agents/README.md` house style; no mechanical gate exists |
| `**/*.md`, `docs/**`, `specs/**`, `insights/**` | docs | — |

`security` has no glob because it has no boundary: an injection, a leaked key or
a missing authz check can live in a React component as easily as in a route
handler. It runs on the whole changed-source set as one slice.

`.claude/agents/**` lands in the `config` slice because it is harness
configuration, not documentation — a manual review checks it against the
house style in `.claude/agents/README.md`: frontmatter (`name` matches the
file name, `tools` listed explicitly, `skills` exist on disk), the fixed
output format, and a tool set that matches the declared role (a read-only
agent gets no `Write`/`Edit`).

## Deliberately unrouted

The phase-0 self-check compares this file against `.claude/skills/*/`. These
skills are absent from the matrix **on purpose** and must not be reported:

| Skill | Why |
|---|---|
| `engineering-insights` | authoring skill, runs at end of session — reviews nothing |
| `mermaid-diagram` | authoring skill for diagrams |
| `pr-self-review` | this skill |
| `api-contract-breaking-change` | product content for DevDigest's own Skills Lab, not a repo-diff-review skill — see `.claude/skills/README.md` |
| `api-contract-response-schema` | same as above |
| `api-contract-semver-discipline` | same as above |
| `api-contract-deprecation-policy` | same as above |

Anything else missing from the matrix is a real gap: report it HIGH. Keep this
list short — it is an exemption list, and every entry is a check that stopped
running.

## Docs-only fast path

If **every** changed path lands only in `docs` — verdict `PASS`, no gates, no
subagents, receipt written. A README typo does not deserve a testcontainers run.

A single non-docs file cancels the fast path for the whole branch.

## Hygiene

Applied in phase 1, before anything is routed.

**Untracked files are reviewed.** `git diff` cannot see them, and "new module,
never `git add`ed" is the single most common way a whole feature slips past a
diff-based gate. Collect them with `git ls-files --others --exclude-standard`
and route them as if they were `A`.

**Status matters:**

| Status | Treatment |
|---|---|
| `M`, `A`, untracked | full skill review |
| `R` with no content change | naming rules only (B5, e2e `NN-name.flow.json`) — not a full review |
| `R` with content change | treat as `M` on the new path |
| `D` | not reviewed — the file is gone. But the *deletion* is: a removed test, a removed migration, a removed `AGENTS.md` or `INSIGHTS.md` is a finding |
| `T` | typechange — file ↔ symlink. On a `CLAUDE.md` this is precisely rule **B10**; check the direction with `test -L` before judging, since the same status covers a symlink being *created* correctly |

**Listed but not reviewed** (mention in the report, route to nothing):

- `pnpm-lock.yaml`, `package-lock.json`
- `server/src/db/migrations/**` — generated by `drizzle-kit`, and excluded in
  `.dependency-cruiser.cjs` too. A *hand-edited* migration is a finding.
- `dist/**`, `server/clones/**`, `**/test-results/**`, binaries, images

**Scale limits.** Per slice: 40 files or 3000 changed lines. Over that, hand the
subagent the highest-signal files (source over test, `service.ts`/`routes.ts`
over helpers, largest hunks first) and put the exact shortfall in the report:

```
slice server-backend: reviewed 40/78 files, 38 skipped (over the 40-file cap)
```

Never round this off and never omit it. A truncated review that reads as
complete is worse than no review, because it is trusted.

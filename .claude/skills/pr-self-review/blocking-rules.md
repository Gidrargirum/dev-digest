# Blocking rules — what CRITICAL means here

CRITICAL is not "serious-looking". It is this closed list of ten. A finding
outside it is HIGH at most, however alarming it reads.

Each rule cites where it comes from, because a rule nobody can trace gets argued
away in the first PR that hits it.

---

### B1 — one-sided edit of the vendored contract

`@devdigest/shared` exists as two copies: `server/src/vendor/shared` (**canonical** —
`reviewer-core/tsconfig.json` resolves the alias to it) and
`client/src/vendor/shared` (mirror). There is no workspace to link them.

Blocking when `node scripts/sync-shared.mjs --check` exits non-zero. Absolute,
not a delta: the two copies are currently **in sync** and `guards.yml` keeps
them that way, so any divergence this branch introduces is new by definition.

> Each side type-checks fine on its own — that is exactly why the divergence is
> silent. The prose in the `AGENTS.md` files still says the copies "have already
> diverged"; that predates `scripts/sync-shared.mjs`, and the script is the
> authority. Source: `scripts/sync-shared.mjs` header,
> `.github/workflows/guards.yml`.

### B2 — a new onion-ring violation

`pnpm arch:check` exits non-zero. A service reaching into `db/schema`, a route
importing `repository.ts`, `reviewer-core` importing from `server/src`, Fastify
types past the edge.

> Layering here is enforced, not advisory. Source: `server/.dependency-cruiser.cjs`,
> `server/AGENTS.md`, skill `onion-architecture`.

### B3 — the arch baseline ratchet unwound

`pnpm arch:ratchet` exits non-zero: the live violation set is no longer a subset
of `.dependency-cruiser-known-violations.json`. Regenerating the baseline to
silence a red build is the exact move this catches — including a swap that keeps
the count identical.

> Source: `server/scripts/arch-ratchet.mjs`, skill `onion-architecture/enforcement.md`.

### B4 — a red gate in a touched package

`typecheck`, the test suite, or `client`'s `pnpm lint` failing. No nuance: if it
does not compile or does not pass, it does not open a PR.

> `client` runs `eslint --max-warnings 0` with **no suppression baseline** — a
> warning is a failure there by design. Source: `client/AGENTS.md`.

### B5 — an integration test in the unit lane

A test importing `server/test/helpers/pg.ts` that is not named `*.it.test.ts`.
It silently joins the unit lane, which runs without Docker in CI, and breaks it.

> The lane split lives in the CI *command*, not in a script, so nothing else
> catches this. Source: `server/AGENTS.md`, `TESTING.md`, `.github/workflows/server-unit.yml`.

### B6 — a do-not-touch path modified

- `client/src/vendor/ui/**` — vendored kit; build your own component instead.
- `server/clones/**` — runtime data.
- `**/test-results/**`, `dist/**` — artifacts.

> Source: `client/AGENTS.md`, `server/AGENTS.md`, root `AGENTS.md` "Do not touch".

### B7 — the domain stopped being pure

Any of:

- an import in `reviewer-core/src/**` that performs I/O (DB, network, `node:fs`,
  git, GitHub) — the injected `LLMProvider` is the only permitted side effect;
- `INJECTION_GUARD` weakened, made conditional, or supplemented with a denylist,
  regex or keyword scan of untrusted text;
- the step order in `src/review/run.ts` changed away from
  assemble → LLM → reduce → **ground**; grounding is always last and always runs;
- an identifier where a resolved string belongs (skill slugs instead of skill
  bodies, memory ids instead of memory texts).

> Source: `reviewer-core/AGENTS.md` "Non-default conventions" and "Do not touch".

### B8 — a secret in the diff

An API key, token, connection string with credentials, or private key added to
code, env files, fixtures or migrations. Also: a key added to `AppConfig` or to
the database.

> Secrets are read only through `SecretsProvider` → `~/.devdigest/secrets.json`
> (mode `0600`); `process.env` is a fallback, not a home. Source: root `AGENTS.md`
> "Gotchas", `server/AGENTS.md`, skill `security`.

### B9 — a non-deterministic e2e flow

In `e2e/specs/*.flow.json`: the AI `chat` command, a locator that is not
`--url` / `--text` / `find role|text|label`, anything that can trigger a model
call, a flow depending on data outside the seed (`acme/payments-api`, PR #482),
or an `.md` file added under `e2e/specs/`.

> Source: `e2e/AGENTS.md`.

### B10 — repo wiring broken

- a package `CLAUDE.md` symlink replaced with a regular file (status `T`, or
  `test -L` failing). On Windows this happens **at checkout**, not through
  anyone's edit: without `git config --global core.symlinks true` and Developer
  Mode, git materialises the link as a text file containing `AGENTS.md`. Say that
  when reporting it — the fix is the git config, not the author's diff. See the
  Architecture section of the root `README.md`;
- a new cross-package tsconfig alias without the matching `paths:` entry in the
  workflows that must now run;
- `test:unit` / `test:integration` scripts added to `server/package.json`
  without updating `server-unit.yml` and `server-integration.yml`, which inline
  the split on purpose;
- a `.claude/skills/**` change that makes `node scripts/check-skills-lock.mjs` fail.

> Source: root `AGENTS.md` "Do not touch", `server/AGENTS.md` "Gotchas",
> `.github/workflows/guards.yml`, `TESTING.md`.

---

## Not blocking

HIGH and MEDIUM go in the report, never in the verdict. The usual ones:

| Finding | Severity |
|---|---|
| `fetch` in a component instead of `lib/hooks/*` → `lib/api.ts` | HIGH |
| `src/components/` or `src/lib/` importing from `src/app/` | HIGH |
| a skill on disk with no rule in `routing.md` | HIGH |
| `page.tsx` holding feature state | HIGH |
| a cross-module import in `server/src/modules/` (depcruiser `warn`) | HIGH |
| component folder missing the fixed layout (`styles.ts`, `index.ts`, …) | MEDIUM |
| styles inlined in JSX instead of the sibling `styles.ts` | MEDIUM |
| an `AGENTS.md` over 100 lines, or gaining an `@import` | MEDIUM |
| a response type redeclared instead of taken from `vendor/shared` | MEDIUM |

## When a rule is genuinely wrong

Say so in the report instead of quietly downgrading the finding. A blocking rule
that fires on a legitimate change is a bug in this file — fix it here, in a
commit that can be reviewed, rather than by overriding the same finding every
week. The override exists for the one-off, not for the recurring.

# Routing

Route by which paths the session actually changed (or, for a pure research
session with no edits, by which module was read the most).

| Files touched | Target |
|---|---|
| `server/**` only | `server/insights/INSIGHTS.md` |
| `client/**` only | `client/insights/INSIGHTS.md` |
| `reviewer-core/**` only | `reviewer-core/insights/INSIGHTS.md` |
| `e2e/**` only | `e2e/insights/INSIGHTS.md` |
| more than one package, or root-level (`scripts/`, CI config, `docker-compose.yml`) | root `insights/INSIGHTS.md` |

## Edge cases

- **Changes span two packages, but the lesson is really about one of them**
  (e.g. a client bug whose fix was one server route change) — route to the
  package the lesson is *about*, not every package that got a diff.
- **The lesson is about the shared contract itself**
  (`server/src/vendor/shared` / `client/src/vendor/shared` drift, an API
  shape both sides depend on) — root `insights/INSIGHTS.md`, since no single
  package owns that knowledge.
- **Research-only session, nothing edited** — route to whichever package's
  code was read the most; if that's ambiguous, ask rather than guess.
- **A lesson genuinely applies to more than one package independently**
  (e.g. the same anti-pattern found separately in `server/` and `client/`) —
  write it twice, once per package, in your own words each time. Don't point
  one file at the other; a reader in `client/` shouldn't need to open
  `server/insights/INSIGHTS.md` to get the client-side version of the rule.

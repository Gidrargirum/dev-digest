# Severity and the finding schema

## The scale

The repo already has one — `react-best-practices/SKILL.md` defines it and
`frontend-architecture/anti-patterns.md` restates it in review terms. This skill
uses the same words so a finding means the same thing wherever it came from:

- **CRITICAL** — real coupling, correctness or security breakage. Blocks.
- **HIGH** — will not scale, or a performance/consistency problem. Reported.
- **MEDIUM** — maintainability and convention. Reported.

The one addition here: **CRITICAL is not a judgement call.** It is exactly the
ten rules in [blocking-rules.md](blocking-rules.md). A subagent may *propose*
CRITICAL, but a finding that does not map to B1–B10 is capped at HIGH during the
reduce phase, no matter how it was labelled.

A skill's own severity tags (`## State Management (HIGH)`) are input, not
verdict. `react-best-practices` calling a rule CRITICAL means "this will cause
bugs" — useful, but it is not one of the ten blocking rules, so it lands at HIGH.

## The finding schema

Every subagent returns a list of these, and nothing else — no prose preamble, no
proposed patch:

```json
{
  "file": "server/src/modules/agents/service.ts",
  "line": 41,
  "skill": "onion-architecture",
  "rule": "B2",
  "severity": "CRITICAL",
  "summary": "Service imports db/schema directly, bypassing the repository.",
  "evidence": "import { agents } from '../../db/schema'",
  "fix": "Move the query behind AgentRepository and inject it."
}
```

| Field | Notes |
|---|---|
| `file` | repo-relative, always |
| `line` | 1-indexed, the line the finding anchors to; `null` for file-level |
| `skill` | which skill produced it, or `gate` / `vendor-parity` / `routing` |
| `rule` | `B1`–`B10` if it maps to a blocking rule, else `null` |
| `severity` | `CRITICAL` \| `HIGH` \| `MEDIUM` |
| `summary` | one sentence, the defect itself — not its consequences |
| `evidence` | the actual line or command output; a finding without evidence is a guess |
| `fix` | one sentence, what to do; omit rather than invent |

`evidence` is what makes phase 5 possible. A refuter cannot check a claim that
points at nothing, so a finding that arrives without it is dropped, not verified.

## Deduplication

Key on `(file, line, rule)`. When two skills report the same line:

- same `rule` → merge, `skill` becomes both names joined by `+`;
- different `rule` → keep both, they are different defects on one line.

## Verification verdicts

Phase 5 refuters return:

```json
{ "refuted": true, "why": "The import is inside a *.test.ts file, which the depcruiser config excludes." }
```

`refuted: true` → the finding drops to HIGH and stops blocking, and `why` is
kept in the report so the demotion is visible. Uncertain counts as refuted:
the refuter is instructed to default that way on purpose.

## `--json` output

Written to `.claude/pr-self-review/findings.json` instead of a chat report:

```json
{
  "verdict": "BLOCKED",
  "baseBranch": "main",
  "base": "a1b2c3d",
  "head": "e4f5g6h",
  "worktreeHash": "4d5e6f…",
  "incomplete": false,
  "slices": { "server-backend": 6, "client-ui": 5, "contracts": 2, "docs": 1 },
  "truncated": [{ "slice": "server-backend", "reviewed": 40, "total": 78 }],
  "gates": [
    { "name": "server typecheck", "status": "pass" },
    { "name": "server arch:check", "status": "fail", "rule": "B2", "output": "…" },
    { "name": "server integration", "status": "skipped", "why": "Docker unavailable" }
  ],
  "counts": { "critical": 2, "high": 3, "medium": 4 },
  "findings": [ /* the schema above */ ]
}
```

Stable field names on purpose: this is the shape a CI step — or DevDigest
itself — would consume later, and renaming keys after the fact is how a contract
quietly breaks.

# modules/brief — PR Why + Risk Brief (L05)

Spec: `specs/2026-08-27-pr-why-risk-brief.md`.

One structured, cached, model-authored summary per PR state:
`what` · `why` · `risk_level` · `risks[]` · `review_focus[]`. Computed in the
background at import time (`GET /pulls/:id`) and after a review run derives an
intent; surfaced read-only on the Overview tab.

## Covered acceptance criteria

- Lifecycle: AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-8
- Inputs & grounding: AC-9, AC-10, AC-11, AC-12, AC-12a (inert stub), AC-13,
  AC-14, AC-15, AC-16, AC-36
- Degradation: AC-17, AC-18, AC-18a, AC-19
- API: AC-20, AC-21, AC-22, AC-23, AC-38

## Why a separate table (`pr_why_risk_brief`)

`pr_brief` holds a single opaque JSON column and no state key. This feature
caches on a `pr_state_key` (`head_sha` + diff-stats digest, AC-4), so it owns
its own table. The existing `PrBrief` contract and `pr_brief` table are left
untouched (AC-23).

## Blast is consume-only

`BlastService.getBlast` runs a BFS over `file_edges` on every call — triggering
that is exactly what AC-18a forbids. So `BriefComputeParams.blastSummary` is an
optional input the service never resolves itself. In this pass no caller
supplies it: `endpointSet` is always empty and no risk cites an endpoint
(the normal AC-18 path).

## Layering

`service.ts` (application ring) takes ports (`BriefDeps`, `BriefRepository`,
`BriefJobs`), never the `Container`. `platform/container.ts` is the only place
concrete classes are named and the only place `container.intent` is stitched
into `BriefDeps.intent`, keeping `no-cross-module-imports` intact.

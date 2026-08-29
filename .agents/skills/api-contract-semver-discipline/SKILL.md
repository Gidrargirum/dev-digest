---
name: api-contract-semver-discipline
description: "Evaluates whether a diff that ships a breaking change to a REST/HTTP API surface correctly reflects that under semantic versioning (major.minor.patch adapted to route/endpoint versioning — a /v1/ → /v2/ path bump or an API-Version response header). Use when a diff has already been found (or is independently observed) to break an existing endpoint's contract, and the question is whether the version story is honest: was a major bump / new version path introduced, or was the break merged silently under an unchanged version. Does NOT detect the breaking change itself — see api-contract-breaking-change (route/request/status-code breaks) and api-contract-response-schema (response body shape breaks) for detection. Does NOT cover deprecation windows before removal — see api-contract-deprecation-policy. Trigger terms: semver, semantic versioning, version bump, major version, /v2/, API-Version header, breaking change policy, version path, backward compatibility policy."
metadata:
  version: 1.0.0
  tags: api-contract, semver, versioning, release-policy, review-rubric
---

> Body below this line pastes directly into DevDigest → Skills Lab → Add Skill → Body field (type: custom, source: manual).

# API contract — semver discipline

This skill assumes a breaking change may already be present in the diff —
either found directly by inspection, or flagged by a sibling skill
(**api-contract-breaking-change** for route/request/status-code breaks,
**api-contract-response-schema** for response body shape breaks). Its job is
not to re-detect the break. It checks whether the diff's *version story* is
honest: does a breaking change carry a major bump / new version path/header,
or does it merge into an existing version as if nothing changed. Deprecation
windows ahead of removal are a separate concern — see
**api-contract-deprecation-policy**.

## Bump rules

| Change type | Requirement |
|---|---|
| Backward-incompatible change to an existing, already-released endpoint's contract (removed/renamed field, narrowed validation, changed status code, changed type) | MAJOR required — new version path (`/v2/`) or version header bump; merging it under the unchanged version is non-compliant |
| Purely additive change (new optional field, new endpoint, new optional query param) | MINOR-safe — no major bump needed |
| Bug fix that restores documented behavior, or an internal-only change with zero observable contract change | PATCH-safe — no major bump needed |

## Silent breaks

- Flag a breaking change (as found directly, or per api-contract-breaking-change /
  api-contract-response-schema) merged with no accompanying new version
  path/header and no deprecation window.
- Flag a breaking change applied in place to an existing versioned route
  (e.g. editing `/v1/orders` handler directly) instead of introducing the
  change under a new version.

## New-version correctness

- Flag a new `/v2/`-style route (or version-header value) introduced that is
  documented or described as a compatible replacement path but is not
  actually a strict superset-compatible replacement — i.e. it silently drops
  or narrows something the old version supported without calling that out.
- Flag a new version path that does not coexist with the old one at all when
  the PR claims backward compatibility is preserved.

## Bump hygiene

- Flag (SUGGESTION only, not a blocker) a version bump in name only — e.g. a
  route renamed to `/v2/` whose request/response contract is byte-identical
  to `/v1/` — this wastes a version bump and misleads consumers into
  expecting a change.
- Flag multiple unrelated breaking changes bundled into a single version bump
  without each one being called out individually in the PR
  description/changelog — reviewers and consumers should be able to see what
  actually changed under the new version, not just that "something" did.

## Exemptions

- Routes explicitly marked unstable/experimental (e.g. under a `/beta/`
  prefix, or gated behind an `x-experimental` header/flag) are exempt from
  strict semver discipline — breaking them without a version bump is
  allowed. Still flag as SUGGESTION if the PR gives no note at all about the
  break, since even experimental consumers benefit from a heads-up.
- Internal-only endpoints not exposed to external consumers may be exempted
  case-by-case. Recognize these by an internal routing prefix (e.g.
  `/internal/`, `/_internal/`), absence from any public SDK or published
  OpenAPI/contract document, or explicit code comments/route metadata marking
  the endpoint internal-only. When in doubt whether an endpoint is truly
  internal, do not assume exemption — treat it as public and apply the bump
  rules above.

## Examples

**Bad**
```
- DELETE-able field: `discountCode` removed from the response of
  `PATCH /api/orders/:id`
- Route path unchanged: still `/api/orders/:id`
- No API-Version header change, no /v2/ path
- PR description: "cleaned up unused order fields"
```
This is a MAJOR-worthy break (removed response field on a released endpoint)
shipped with zero version signal. Existing consumers reading `discountCode`
break with no warning and no migration path.

**Good**
```
- `discountCode` removed from the response, but only under the new route:
  `PATCH /api/v2/orders/:id`
- `PATCH /api/v1/orders/:id` unchanged, still returns `discountCode`
- PR description: "v2: drops deprecated discountCode field per
  api-contract-deprecation-policy notice from 2026-06-01"
```
The break exists only behind a new version path; the old version keeps
working for existing callers, and the changelog names the specific
breaking change instead of burying it in a generic bump.

## Findings discipline

- Cite the exact file:line of the changed route/handler/schema and, where
  applicable, the line introducing or omitting the version signal.
- Severity CRITICAL: a breaking change ships with no version signal at
  all (no new path, no header bump, no deprecation note).
- Severity WARNING: a version signal exists but is incomplete — e.g. a new
  version path was added but the old path was removed instead of kept
  alongside it, or the changelog bundles multiple breaks under one bump
  without itemizing them.
- Severity SUGGESTION: pure hygiene issues — an unnecessary/no-op version
  bump, or a version note that is undocumented but does not affect any
  actual break.

---
name: api-contract-breaking-change
description: "Detects breaking changes to a PUBLIC API's route/request/status-code contract — route path or method changes, required path/query param changes, request field removal or narrowing, validation tightening that would reject previously-valid input, and status-code or enum changes on existing endpoints. Use when reviewing a diff that touches an existing route handler, request schema, or path/query parameter definition, or when the question is whether an existing caller would break. Does NOT cover response body shape (see api-contract-response-schema), semver-bump policy (see api-contract-semver-discipline), or deprecation policy (see api-contract-deprecation-policy). Trigger terms: breaking change, backward compatibility, API contract, route signature, required parameter, request schema, status code change, enum removal, existing callers."
metadata:
  version: 1.0.0
  tags: api-contract, breaking-change, rest, versioning, review-rubric
---

> Body below this line pastes directly into DevDigest → Skills Lab → Add Skill → Body field (type: custom, source: manual).

# API contract — breaking change

Evaluate whether this diff changes the PUBLIC CONTRACT of an existing route
or exported API handler in a way that breaks an existing caller — specifically
the **route path/method, required parameters, request shape, and status
codes/enums**. This skill does NOT evaluate response body shape (that is
`api-contract-response-schema`), does NOT judge whether a change requires a
semver/version bump (that is `api-contract-semver-discipline`), and does NOT
judge whether an old route was deprecated correctly before removal (that is
`api-contract-deprecation-policy`). If a finding is purely about one of those
three, leave it to the sibling skill — don't duplicate it here.

## Route signature

- Flag any change to an existing route's path segment, HTTP method, or URL
  pattern (including a path param renamed, e.g. `:id` → `:userId`).
- Flag any change to the set of required path or query parameters on an
  existing route — an added required param, a removed param a caller may
  still send and expect to be accepted, or a renamed param.
- Flag a previously optional path or query parameter becoming required.
- Flag a route being removed or merged into another route without the old
  path continuing to resolve.

## Request shape

- Flag a request body field being removed on an existing endpoint —
  including via a Zod schema change (e.g. dropping a key from `z.object`).
- Flag a request body field being renamed (equivalent to remove + add from a
  caller's perspective).
- Flag a request field's required/optional status narrowing from optional to
  required on an existing endpoint (`z.string().optional()` →
  `z.string()`, or similar).
- Flag validation narrowing that would reject previously-valid input:
  stricter regex/format (e.g. `z.string()` → `z.string().email()`, a looser
  regex replaced by a stricter one), a smaller enum (a value removed from
  `z.enum([...])`), or tighter numeric bounds (`z.number().min(0)` →
  `z.number().min(1)`, a `.max()` lowered).
- Flag a request field's type narrowing (e.g. `z.union([z.string(),
  z.number()])` → `z.string()`) that would reject input previously accepted.

## Status codes & enums

- Flag a status code changing for an existing success or error condition on
  an existing endpoint (e.g. `200` → `201`, `404` → `400`, a handler that
  used to return `204` now returning `200` with a body).
- Flag an enum value being removed from a *request* field that existing
  callers may still send — this breaks callers even if the removed value was
  rarely used.
- Flag an error code/reason string being removed or renumbered when callers
  are known to branch on it (e.g. `error.code === 'RATE_LIMITED'` deleted).

## Exemptions

Purely additive changes are not breaking — do not flag them:
- A brand-new route.
- A new optional request field with no validation impact on existing
  payloads.
- A new enum value being *added* (not removing an existing one).
- A new optional query/path parameter with a default that preserves old
  behavior when omitted.

Changes gated behind an explicit version marker (a `/v2/` path segment, an
`API-Version` header, a `version` field in the request) are not breaking **on
their own merit** — but verify the old route or unversioned path still exists
and behaves exactly as before. If the diff removes or silently changes the
old version's behavior while adding the new one, that removal is still a
breaking change and should be flagged under the sections above.

## Examples

**Bad** — narrows an existing field from optional to required with no
version bump, breaking every caller who omits it:

```ts
// routes/users.ts — PATCH /users/:id
const bodySchema = z.object({
  name: z.string().optional(),
- email: z.string().email().optional(),
+ email: z.string().email(), // now required
});
```
This is breaking: any existing caller that sends a `PATCH /users/:id` body
without `email` will start failing validation with no migration path.

**Good** — same kind of tightening, but introduced under a new version while
the old route is untouched:

```ts
// routes/users.ts — PATCH /users/:id (unchanged, still optional email)
const bodySchemaV1 = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
});

// routes/v2/users.ts — PATCH /v2/users/:id (new route, email required)
const bodySchemaV2 = z.object({
  name: z.string().optional(),
  email: z.string().email(),
});
```
Not breaking: existing callers keep hitting the unversioned route with the
old, looser contract; the stricter requirement only applies to callers who
explicitly opt into `/v2/`.

## Findings discipline

- Cite the exact `file:line` of the changed schema, route decorator, or
  handler — not just the module name.
- Use severity **CRITICAL** when an existing caller would break immediately
  with no migration path (removed/renamed field, narrowed required param,
  changed status code on a live endpoint, no version marker).
- Use severity **WARNING** when the narrowing is real but low-probability
  (e.g. an enum value with no known callers, a bound tightened in a way
  unlikely to be hit) or when a version bump is present but its rollout
  hasn't been verified to leave the old path fully intact.

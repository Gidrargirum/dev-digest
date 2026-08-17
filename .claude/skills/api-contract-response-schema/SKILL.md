---
name: api-contract-response-schema
description: "Detects changes to the SHAPE of an API response body — field removal/rename, type changes, required/optional (nullability) flips, array-vs-object flips, enum narrowing, nested structure changes, pagination envelope changes, error-response shape changes, and date/number format changes. Use when reviewing a diff that touches a response DTO, serializer, response schema, or the return type of a route handler. Scoped to RESPONSE body shape only — does not cover route/request/status-code contract or semver/deprecation policy. Trigger terms: response schema, response shape, DTO change, serializer change, field removed, field renamed, breaking response change, nullability change, pagination envelope, error response shape."
metadata:
  version: 1.0.0
  tags: api-contract, response-schema, rest, json, review-rubric
---

> Body below this line pastes directly into DevDigest → Skills Lab → Add Skill → Body field (type: custom, source: manual).

# API contract — response schema

Evaluate whether this diff changes the SHAPE of an existing API response body
in a way that breaks existing callers. Scope is response body shape only.

This skill does **not** cover the route path, HTTP method, request body,
query/path parameters, or status codes — that's `api-contract-breaking-change`.
It does **not** cover whether a breaking change requires a semver/version bump
— that's `api-contract-semver-discipline`. It does **not** cover how long an
old shape must stay supported before removal — that's
`api-contract-deprecation-policy`. Don't duplicate those rubrics here; only
judge the shape of the response payload itself.

## Field removal and rename

- Flag any response field being removed from an existing endpoint's payload.
- Flag any response field being renamed — this is indistinguishable from a
  removal-plus-addition to a caller reading the old name.
- Flag a field moving from the top level into a nested object (or vice versa)
  under a new or different key — callers keying off the old path break even
  though the value still exists somewhere in the payload.

## Type changes

- Flag a response field's type changing (e.g. `string` → `number`,
  `boolean` → `string`, `number` → `string`).
- Flag a scalar field becoming an object or array, or an object/array field
  becoming a scalar (e.g. `tags: string` → `tags: string[]`, or
  `address: Address` → `address: string`).
- Flag a previously single-object field becoming an array of that object, or
  an array field collapsing to a single object — both break callers that
  assume the old cardinality (`.map()` on a value that's no longer an array,
  or direct property access on a value that's now an array).

## Nullability and optionality

- Flag a nullable/optional response field becoming non-nullable/required, or
  the reverse, where existing callers may branch on `null`/`undefined` (e.g.
  a null-check that becomes dead code, or a consumer that never expected
  `null` and now receives it).
- Flag a field that was always present becoming conditionally omitted
  (`undefined`) based on new server-side logic — strict/typed clients that
  assume the field always exists will fail to deserialize.
- Flag a previously optional response field being marked as always present
  going forward if any existing code path can still omit it — the type
  promise and the runtime behavior must match.

## Enums and constrained values

- Flag an enum value being removed from a response field that existing
  callers may already be switching/mapping on (narrowing the value space is
  breaking even though it looks like "fewer cases to handle").
- Flag an enum field's value casing or format changing (e.g. `"ACTIVE"` →
  `"active"`) — string comparisons in calling code will silently stop
  matching.

## Nested structure changes

- Flag a nested object's internal structure being flattened, restructured, or
  having a sub-field relocated to a different parent (e.g.
  `user.address.city` → `user.city`, or `user: { name, email }` → separate
  `userName`/`userEmail` top-level fields).
- Flag a previously flat set of fields being wrapped in a new nested object
  with no corresponding top-level fallback.

## Pagination and envelope changes

- Flag a paginated response's wrapper/envelope key changing (e.g.
  `items` → `data`, `results` → `records`) — this breaks every consumer
  unwrapping the old key.
- Flag the cursor or pagination-token format changing (e.g. an offset integer
  becoming an opaque base64 cursor, or a `nextPage` number becoming a
  `nextCursor` string) — clients that persist or construct these values break.
- Flag the total-count or has-more-pages field being removed, renamed, or
  changed from a boolean to a different signal.

## Error-response shape

- Flag an error response's shape changing — a field on the error object
  being renamed or removed (e.g. `error.message` → `error.detail`,
  `error.code` disappearing) — error-handling code that reads specific
  fields for user-facing messages or programmatic branching breaks silently.
- Flag the overall error envelope changing (e.g. a bare error object becoming
  wrapped in `{ error: {...} }`, or vice versa).

## Date and number format changes

- Flag a date/timestamp field's format changing (e.g. ISO 8601 string →
  Unix epoch number, or seconds-since-epoch → milliseconds-since-epoch)
  without an additive compatibility field — typed clients that parse the
  old format will throw or silently produce `Invalid Date`/`NaN`.
- Flag a numeric field's precision or units changing (e.g. cents → dollars,
  integer → float) without a rename that makes the new unit unambiguous.

## Exemptions

- A new field being purely ADDED to an existing response is not a breaking
  change — do not flag additive fields, even if they change the response's
  overall size or nesting depth, as long as every previously-existing field
  keeps its name, type, and nullability.
- A field being added to an error response purely for extra debugging/context
  (with existing error fields untouched) is not a breaking change.
- A shape change gated behind a version marker (e.g. a route under `/v2/`) or
  behind content negotiation (a different `Accept` header or a
  `Content-Type` variant) is not breaking on its own merit — the old shape
  must still be reachable through the old route/negotiation path unchanged.

## Examples

**Bad**

```diff
 interface OrderResponse {
   id: string;
-  createdAt: string; // ISO 8601, e.g. "2026-08-14T10:00:00Z"
+  createdAt: number; // unix epoch ms
   total: number;
 }
```

The field name and type promise are unchanged from the caller's point of
view (`createdAt` was always a JS "date"), but the wire format silently
flips from an ISO string to an epoch number. Any client calling `new
Date(createdAt)` on the old format now gets a nonsensical date, and strict
JSON-schema/typed deserializers that pinned `string` will fail outright with
no version marker to signal the change.

**Good**

```diff
 interface OrderResponse {
   id: string;
   createdAt: string; // ISO 8601, unchanged
+  createdAtEpoch: number; // unix epoch ms, new field for clients that want it
   total: number;
 }
```

The existing `createdAt` field keeps its name, type, and format, so no
existing caller breaks. Clients that want the epoch format can adopt the new
`createdAtEpoch` field at their own pace — this is a pure additive change.

## Findings discipline

Cite the exact `file:line` of the changed response type, serializer, or
schema. Use severity **CRITICAL** when a typed or strict client would fail to
deserialize the new shape or would silently misinterpret it (wrong type,
wrong format, renamed/removed field with no fallback). Use severity
**WARNING** when the change is real but only affects an edge case, an
undocumented/internal field, or loosely-typed consumers that read the
payload dynamically without a schema.

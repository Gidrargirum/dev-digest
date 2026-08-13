---
name: api-contract-deprecation-policy
description: "Detects whether a PUBLIC API element (route, field, enum value, header, param) being removed or scheduled for removal in this diff was properly deprecated first — marked, announced, given a migration path and a sunset window — instead of being silently removed or silently changed. Use when reviewing a diff that removes, replaces, or changes behavior of a previously-public route/field/enum-value/header/param, or when the diff introduces a new `@deprecated` marker, `Deprecation`/`Sunset` header, or changelog deprecation entry. Judges the DEPRECATION PROCESS only — not whether the change is technically breaking (see api-contract-breaking-change), not response body shape (see api-contract-response-schema), not major-version bump policy (see api-contract-semver-discipline). Trigger terms: deprecation, deprecated, sunset, sunset window, migration path, removal notice, breaking removal, silent removal, deprecation header, changelog entry, @deprecated."
metadata:
  version: 1.0.0
  tags: api-contract, deprecation, sunset, migration, review-rubric
---

> Body below this line pastes directly into DevDigest → Skills Lab → Add Skill → Body field (type: custom, source: manual).

# API contract — deprecation policy

Evaluate whether a PUBLIC API element being removed, replaced, or changed in
this diff went through a proper deprecation cycle — or whether it was
silently removed with no warning trail.

## Scope

This skill judges **process**, not mechanics: was the removal/change of a
route, field, enum value, header, or param preceded by a deprecation
marker, an announced replacement, and a sunset window — or is a new
deprecation being introduced correctly. It does not judge whether the
underlying change is technically breaking (that's
`api-contract-breaking-change`), whether a response body's shape changed
(that's `api-contract-response-schema`), or whether the package/API version
was bumped correctly (that's `api-contract-semver-discipline`). Assume the
change under review already qualifies as a removal or behavior change of a
public element — this skill only asks: was it deprecated first?

## What counts as a deprecation marker

Treat any of the following, found anywhere in the diff or the linked
changelog/migration guide, as valid evidence of prior deprecation:

- An `@deprecated` JSDoc/docstring tag that states a reason and points to the
  replacement.
- A `Deprecation` or `Sunset` HTTP response header (RFC 8594) present on the
  endpoint.
- An explicit entry in a CHANGELOG or migration guide announcing the
  deprecation.
- A runtime warning surfaced to callers — a deprecation log line or a
  warning field in the response body.

Absence of all four is absence of a deprecation trail.

## Flag missing deprecation trail on removal

- Flag any route, field, enum value, header, or param being REMOVED in this
  diff when the diff and the linked changelog show no evidence it was
  previously marked deprecated by any of the markers above.
- Flag a removal that references "deprecated" in a commit message or PR
  description only, with no marker actually present in a prior release's
  code, headers, or changelog — talk is not a deprecation trail.

## Flag incomplete new deprecations

- Flag a NEW deprecation being introduced in this diff (a route, field, or
  param newly marked `@deprecated`, or a new `Deprecation` header) that has
  no replacement or migration pointer explaining what callers should use
  instead.
- Flag a deprecation marker with no sunset date or target version at all —
  open-ended deprecation with no removal target is a smell, not a blocker;
  file it as SUGGESTION severity, not CRITICAL/WARNING.

## Flag behavior changes to already-deprecated elements

- Flag any silent behavior change (new validation, different response
  shape, changed default) to something already marked deprecated in a prior
  release. Deprecated elements should be frozen except for security fixes —
  changing them resets the clock and confuses callers who are mid-migration.

## Flag early removal

- Flag a removal happening sooner than the sunset window the deprecation
  itself stated — e.g. marked deprecated with "removal in v3" but actually
  removed in this diff while the package is still on v2.

## Exemptions

- Removing something that was NEVER released publicly (still pre-release,
  beta, or internal-only, or added and removed within the same unreleased
  version) does not need a deprecation cycle — do not flag it.
- Security-critical removals (e.g. an endpoint tied to an active
  vulnerability) may bypass the normal sunset window. Still flag these, but
  at SUGGESTION severity, to confirm the exception is documented and
  affected callers are notified out-of-band.

## Examples

**Bad**
```
- app.delete('/api/users/:id/legacy-profile', legacyProfileHandler)
```
The route `/api/users/:id/legacy-profile` is deleted outright in this diff.
No `@deprecated` marker, `Deprecation`/`Sunset` header, or changelog entry
exists anywhere in the repo history for this route — callers had zero
warning. Flag as CRITICAL.

**Good**
```
// v1.4.0 (prior release):
/**
 * @deprecated since v1.4.0, removed in v2.0.0. Use GET /api/users/:id?include=profile instead.
 */
app.get('/api/users/:id/legacy-profile', legacyProfileHandler, {
  headers: { Deprecation: 'true', Sunset: 'Wed, 01 Jan 2026 00:00:00 GMT' },
})

// this diff (v2.0.0, after the sunset date):
- app.get('/api/users/:id/legacy-profile', legacyProfileHandler, { ... })
+ // CHANGELOG.md: "Removed /legacy-profile per the v1.4.0 deprecation notice."
```
The route was marked deprecated two releases ago with a stated replacement
and sunset date, and this diff removes it only after that date has passed,
with a changelog entry documenting the removal. No flag.

## Findings discipline

- Cite the exact file:line of the removal or the new deprecation marker.
- Severity CRITICAL: a public element removed or changed with zero
  deprecation trail and no exemption applies.
- Severity WARNING: a deprecation trail exists but is incomplete — missing a
  replacement pointer, or removal happening before the stated sunset window.
- Severity SUGGESTION: hygiene issues only — an open-ended deprecation with
  no sunset date, or an early/undocumented removal that qualifies under an
  exemption but should still be recorded.

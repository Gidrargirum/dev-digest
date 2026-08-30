import type {
  EvalExpectedFinding,
  EvalRunRecord,
  EvalSkillActualOutput,
  EvalPassResult,
  EvalMarginalEffect,
} from "@devdigest/shared";

/**
 * Plain `JSON.parse` — the client imports only TYPES from `@devdigest/shared`
 * (client/insights 2026-08-19), so `expected_output` is never re-validated
 * against the Zod contract here; the server rejects a malformed shape with
 * `422` on save (AC-7). This only gates the Save/Run buttons on "is this an
 * array of plain objects" (AC-8) — not a full shape check, just enough to
 * catch `[404]`/`["x"]` before they round-trip to the server for a generic
 * "Request validation failed".
 */
export function parseExpectedOutput(text: string): { value: EvalExpectedFinding[] | null; valid: boolean } {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return { value: null, valid: false };
    if (!parsed.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))) {
      return { value: null, valid: false };
    }
    return { value: parsed as EvalExpectedFinding[], valid: true };
  } catch {
    return { value: null, valid: false };
  }
}

/** Pretty-print an expected_output array back into the textarea's JSON text. */
export function stringifyExpectedOutput(value: EvalExpectedFinding[]): string {
  return JSON.stringify(value, null, 2);
}

interface PrMeta {
  title?: string;
  body?: string;
}

export function readPrMeta(inputMeta: unknown): PrMeta {
  if (inputMeta && typeof inputMeta === "object") {
    const m = inputMeta as Record<string, unknown>;
    return {
      title: typeof m.title === "string" ? m.title : "",
      body: typeof m.body === "string" ? m.body : "",
    };
  }
  return { title: "", body: "" };
}

/**
 * Render the server's 422 validation `details` (an array of
 * `{ instancePath?, message }`-shaped issues from `app.ts`'s error handler)
 * into one readable line, e.g. "expected_output/0: Expected object, received
 * number" — so a rejected save says WHY, not just "Request validation
 * failed". Defensive: the shape isn't a shared contract, so every field is
 * read as `unknown` and a malformed entry is simply skipped.
 */
export function validationDetailText(details: unknown): string | null {
  if (!Array.isArray(details) || details.length === 0) return null;
  const lines = details
    .map((d) => {
      if (typeof d !== "object" || d === null) return null;
      const rec = d as Record<string, unknown>;
      const message = typeof rec.message === "string" ? rec.message : null;
      if (!message) return null;
      const path = typeof rec.instancePath === "string" && rec.instancePath ? rec.instancePath.replace(/^\//, "") : null;
      return path ? `${path}: ${message}` : message;
    })
    .filter((line): line is string => line !== null);
  return lines.length > 0 ? lines.join("; ") : null;
}

/** "recall X% · precision Y% · citation Z% · Ns" — `null` metrics render as "—". */
export function resultSummaryValues(result: EvalRunRecord) {
  const pct = (v: number | null) => (v == null ? "—" : Math.round(v * 100));
  return {
    recall: pct(result.recall),
    precision: pct(result.precision),
    citation: pct(result.citation_accuracy),
    duration: result.duration_ms != null ? (result.duration_ms / 1000).toFixed(1) : "—",
  };
}

// ---- Amendment A — skill-owned run output (AC-53/AC-56/AC-57) --------------

function isPassResult(v: unknown): v is EvalPassResult {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return Array.isArray(r.findings) && typeof r.pass === "boolean";
}

function isMarginalEffect(v: unknown): v is EvalMarginalEffect {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return "recall" in r && "precision" in r && "citation_accuracy" in r;
}

/**
 * `EvalRunRecord.actual_output` is typed `z.unknown()` on the wire (AC-53's
 * obligation lives at the contract level, not the type). The client imports
 * only TYPES from `@devdigest/shared` (client/insights 2026-08-19) — no
 * `.parse()` — so this reads the wire value totally with plain runtime
 * checks and returns `null` for anything that doesn't match, rather than
 * trusting the cast.
 */
export function readSkillActualOutput(actualOutput: unknown): EvalSkillActualOutput | null {
  if (!actualOutput || typeof actualOutput !== "object") return null;
  const r = actualOutput as Record<string, unknown>;
  if (!isMarginalEffect(r.marginal)) return null;
  const withPass = r.with === null ? null : isPassResult(r.with) ? r.with : undefined;
  const withoutPass = r.without === null ? null : isPassResult(r.without) ? r.without : undefined;
  if (withPass === undefined || withoutPass === undefined) return null;
  return { with: withPass, without: withoutPass, marginal: r.marginal };
}

/**
 * Signed marginal-effect text (AC-50/AC-51/AC-57) — the sign is always in
 * the TEXT, never conveyed by colour alone. `null` (either side unmeasured,
 * AC-22) renders as "—"; an exact-zero delta (AC-51 — "the skill changed
 * nothing on this input") renders as the digit "0", never as "—".
 */
export function formatMarginal(v: number | null): string {
  if (v == null) return "—";
  if (v === 0) return "0";
  const sign = v > 0 ? "+" : "−"; // proper minus sign, matches the spec's own "−0.15"
  return `${sign}${Math.abs(v).toFixed(2)}`;
}

/** `<skill-name>-gate-` name suggestion (AC-59) — a convention only, never
 *  validated; the user may edit or replace it freely. */
export function skillGatePrefix(skillName: string): string {
  const slug = skillName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${slug}-gate-` : "";
}

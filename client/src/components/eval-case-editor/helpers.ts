import type { EvalExpectedFinding, EvalRun } from "@devdigest/shared";

/**
 * Plain `JSON.parse` — the client imports only TYPES from `@devdigest/shared`
 * (client/insights 2026-08-19), so `expected_output` is never re-validated
 * against the Zod contract here; the server rejects a malformed shape with
 * `400` on save (AC-7). This only gates the Save/Run buttons on "is this
 * even JSON" (AC-8).
 */
export function parseExpectedOutput(text: string): { value: EvalExpectedFinding[] | null; valid: boolean } {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return { value: null, valid: false };
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

/** "recall X% · precision Y% · citation Z% · Ns" — `null` metrics render as "—". */
export function resultSummaryValues(result: EvalRun) {
  const pct = (v: number | null) => (v == null ? "—" : Math.round(v * 100));
  return {
    recall: pct(result.recall),
    precision: pct(result.precision),
    citation: pct(result.citation_accuracy),
    duration: result.duration_ms != null ? (result.duration_ms / 1000).toFixed(1) : "—",
  };
}

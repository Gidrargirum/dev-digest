import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseEditor. */
export const s = {
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  body: { padding: 24 } satisfies CSSProperties,
  tabsBar: { display: "flex", gap: 4, marginBottom: 12 } satisfies CSSProperties,
  jsonHint: (valid: boolean): CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    color: valid ? "var(--ok)" : "var(--crit)",
  }),
  actualOutputBox: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: 12,
    background: "var(--bg-elevated)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  resultSummary: { fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  runOnSaveRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  footerSpacer: { flex: 1 } satisfies CSSProperties,
  lockedHint: { fontSize: 12, color: "var(--text-muted)", marginTop: -12, marginBottom: 20 } satisfies CSSProperties,
  prMetaColumn: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  // Matches vendor/ui Textarea's inline style exactly — used only where an
  // `aria-label` is required, since the vendored Textarea does not forward
  // extra props to the underlying <textarea> (client/src/vendor/ui is do-not-touch).
  expectedOutputTextarea: {
    width: "100%",
    resize: "vertical",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 14,
    lineHeight: 1.55,
    outline: "none",
  } satisfies CSSProperties,
} as const;

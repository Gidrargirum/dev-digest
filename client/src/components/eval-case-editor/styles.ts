import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseEditor. */
export const s = {
  footerColumn: { display: "flex", flexDirection: "column", width: "100%" } satisfies CSSProperties,
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
  runBanner: (pass: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 7,
    border: `1px solid ${pass ? "var(--ok)" : "var(--crit)"}`,
    background: pass ? "color-mix(in srgb, var(--ok) 12%, transparent)" : "color-mix(in srgb, var(--crit) 12%, transparent)",
    color: pass ? "var(--ok)" : "var(--crit)",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 16,
  }),
  runBannerDetail: { color: "var(--text-secondary)", fontWeight: 400 } satisfies CSSProperties,
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
  // Amendment A — `with` / `without` comparison (AC-56): two labelled columns,
  // never collapsed into one block; the label text (not colour) is what
  // distinguishes them.
  passGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } satisfies CSSProperties,
  passColumn: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: 10,
  } satisfies CSSProperties,
  passLabel: { fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  passSummary: { fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 6 } satisfies CSSProperties,
  marginalRow: { fontSize: 12.5, color: "var(--text-secondary)", marginTop: 10 } satisfies CSSProperties,
  costWarning: {
    fontSize: 12.5,
    color: "var(--warn)",
    marginBottom: 4,
  } satisfies CSSProperties,
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

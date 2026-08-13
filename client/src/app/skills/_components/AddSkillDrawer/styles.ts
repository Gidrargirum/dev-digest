import type { CSSProperties } from "react";

/** Co-located styles for AddSkillDrawer. */
export const s = {
  section: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  dropzone: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "28px 16px",
    borderRadius: 9,
    border: "1px dashed var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 13,
  } satisfies CSSProperties,
  previewCard: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 16,
  } satisfies CSSProperties,
  ignoredFiles: { fontSize: 12, color: "var(--text-muted)", marginTop: 10 } satisfies CSSProperties,
  errorText: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  chipsRow: { display: "flex", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  resultCard: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    cursor: "pointer",
  } satisfies CSSProperties,
  resultHeader: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  resultName: { fontSize: 14, fontWeight: 600, flex: 1 } satisfies CSSProperties,
  resultMeta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  resultDesc: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;

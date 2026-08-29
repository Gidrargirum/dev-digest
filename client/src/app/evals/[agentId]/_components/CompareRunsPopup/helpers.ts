export interface DiffLine {
  type: "same" | "add" | "del";
  text: string;
}

/** Minimal LCS line diff — small system prompts, fine as O(n*m). */
export function diffLines(a: string, b: string): DiffLine[] {
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = la.length;
  const m = lb.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = la[i] === lb[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (la[i] === lb[j]) {
      out.push({ type: "same", text: la[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ type: "del", text: la[i]! });
      i++;
    } else {
      out.push({ type: "add", text: lb[j]! });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: la[i++]! });
  while (j < m) out.push({ type: "add", text: lb[j++]! });
  return out;
}

/** Signed delta text — never colour alone (Non-functional: Accessibility). */
export function signedDelta(a: number | null, b: number | null, asPercent = true): string {
  if (a == null || b == null) return "—";
  const raw = b - a;
  const value = asPercent ? Math.round(raw * 100) : Number(raw.toFixed(4));
  const sign = value > 0 ? "+" : value < 0 ? "" : "±";
  return `${sign}${value}${asPercent ? "%" : ""}`;
}

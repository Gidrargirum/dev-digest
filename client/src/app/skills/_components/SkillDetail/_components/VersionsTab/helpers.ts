export interface DiffLine {
  text: string;
  kind: "same" | "added" | "removed";
}

/** Naive positional (non-LCS) line diff — good enough for an eyeball compare
    between two skill-body versions. Walks both files index-by-index. */
export function diffLines(oldBody: string, newBody: string): DiffLine[] {
  const a = oldBody.split("\n");
  const b = newBody.split("\n");
  const len = Math.max(a.length, b.length);
  const lines: DiffLine[] = [];
  for (let i = 0; i < len; i++) {
    const oldLine = a[i];
    const newLine = b[i];
    if (oldLine === newLine) {
      if (oldLine !== undefined) lines.push({ text: oldLine, kind: "same" });
    } else {
      if (oldLine !== undefined) lines.push({ text: oldLine, kind: "removed" });
      if (newLine !== undefined) lines.push({ text: newLine, kind: "added" });
    }
  }
  return lines;
}

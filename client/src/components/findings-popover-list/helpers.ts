/** "45-52" for a range, "12" for a single line — same label the finding cards use. */
export function lineLabel(startLine: number, endLine: number): string {
  return endLine > startLine ? `${startLine}-${endLine}` : `${startLine}`;
}

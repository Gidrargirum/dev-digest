/** Pure helpers for the Why + Risk Brief card. */

/** `path:line` reference for a Review Focus entry, or `null` when unusable. */
export function focusRef(path: string, line: number): string {
  return `${path}:${line}`;
}

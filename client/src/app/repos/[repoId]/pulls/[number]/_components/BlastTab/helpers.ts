import { githubBlobUrl } from "@/lib/github-urls";

/** Builds a GitHub blob deep-link for a caller's `file:line`, mirroring the
 *  same compromise `FindingCard` makes: `undefined` when the PR's repo/head
 *  sha isn't known yet, so `MonoLink` falls back to inert text instead of a
 *  broken link. There is no in-app viewer for files outside the diff. */
export function callerHref(
  repoFullName: string | null | undefined,
  headSha: string | null | undefined,
  file: string,
  line: number,
): string | undefined {
  return repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, file, line) : undefined;
}

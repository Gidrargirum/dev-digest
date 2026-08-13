import { CHARS_PER_TOKEN } from "./constants";

/** Rough token estimate for a prompt body (chars/4), mirroring the Skill
 *  config tab. Copied rather than imported: it is local to that folder and
 *  feature folders don't reach into each other. */
export function estimateTokens(body: string): number {
  return Math.ceil(body.length / CHARS_PER_TOKEN);
}

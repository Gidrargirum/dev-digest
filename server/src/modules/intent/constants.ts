/**
 * Intent module constants.
 */

/** Linked-issue references parsed from the PR body — in-repo + cross-repo combined. */
export const MAX_LINKED_ISSUES = 3;

/** Ceiling on the intent LLM call — cheap structured output, should return fast. */
export const INTENT_TIMEOUT_MS = 20_000;

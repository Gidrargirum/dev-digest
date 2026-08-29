# `--fix` — the closed list

BLOCKED with no way forward is how a gate earns its reputation. Some blocking
rules have exactly one correct repair, mechanically derivable from the rule
itself. `--fix` applies those and nothing else.

The test for membership is narrow: **is there exactly one right answer, and does
a repo script already know it?** If the fix requires choosing, it is not here.

## Allowed

| Rule | Fix | Why it is safe |
|---|---|---|
| **B1** contracts out of sync, server-side edited | `node scripts/sync-shared.mjs` | Copies canonical server → client mirror. This is the script's whole job. |
| **B5** integration test misnamed | `git mv foo.test.ts foo.it.test.ts` | The name is the only thing carrying lane membership. |
| **B10** `CLAUDE.md` replaced by a regular file | delete it, `ln -s AGENTS.md CLAUDE.md` | The canonical state is documented in root `AGENTS.md`. |
| **B6** artifact committed (`dist/**`, `test-results/**`, `clones/**`) | `git rm --cached` the path | It was never meant to be tracked. |

## Refused, explicitly

| Rule | Why not |
|---|---|
| **B1 client-side edit** | The server copy is canonical, so syncing would **delete** the client edit. Report it and let the author re-apply it to the server copy deliberately. This asymmetry is the whole reason B1 is not fully automatable. |
| **B2 / B3** ring violations | Where the code belongs is a design decision. Moving an import to silence depcruiser usually just relocates the coupling. |
| **B4** red typecheck / tests / lint | If the fix were mechanical, the compiler would have applied it. |
| **B7** domain purity, `INJECTION_GUARD` | Never touched automatically, under any circumstance. |
| **B8** secrets | Removing the line does not unpublish the secret; it needs rotation and a human. Report only. |
| **B9** e2e determinism | Replacing an AI `chat` step needs a real locator, which needs the page. |
| MEDIUM `AGENTS.md` over 100 lines | Cutting prose is editing, not repairing. |

## After fixing

1. Apply the fixes.
2. **Re-run the gates from scratch** — not the cached results. A sync can
   introduce a type error the previous run never saw.
3. A fix whose gate is still red gets reverted (`git checkout -- <path>`, or
   `git mv` back) and its finding stays CRITICAL. A half-applied repair is worse
   than none: it hides the original symptom behind a new one.
4. Report what was changed, file by file, in the verdict block. `--fix` writes
   to the working tree; that is never allowed to be a surprise.

## Never

- Do not `git add`, `git commit`, `git push`, or amend anything. `--fix` leaves
  the changes unstaged for the author to inspect.
- Do not fix anything not on the allowed list because it "looks obvious".
- Do not touch a file that the diff did not already touch, except where the rule
  is *about* the missing counterpart (B1's mirror, B10's symlink).

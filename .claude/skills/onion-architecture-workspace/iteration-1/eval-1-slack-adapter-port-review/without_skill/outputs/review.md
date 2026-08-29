# Architecture Review — Slack adapter for `server/`

Verdict: **Rejected.** The change is wired as a direct dependency on a third-party
SDK that reaches from the infrastructure ring all the way into the contracts ring
and into the application service. Several inward-pointing dependency rules are
broken.

---

## 1. The port is defined in terms of the Slack SDK's own types

**What:** `adapters.additions.ts` (appended to `vendor/shared/adapters.ts`, the
contracts ring) imports `ChatPostMessageArguments`, `ChatPostMessageResponse` and
`ConversationsListResponse` from `@slack/web-api` and uses them as the parameter
and return types of every `SlackClient` method.

**Rule broken:** Dependencies point inward only. The contracts/domain ring must
not depend on an infrastructure library. A port is owned by the domain and
expressed in domain terms; here the "port" is just a re-export of the vendor
SDK's call surface, so every consumer of `SlackClient` (including the domain)
transitively compiles against `@slack/web-api`. This is a leaky abstraction — the
adapter is not adapting anything.

**Fix:** Define a domain-owned notification port with your own DTOs, e.g.

```ts
export interface ReviewNotifier {
  reviewFinished(input: { title: string; findingCount: number }): Promise<void>;
}
```

No `@slack/web-api` import in the port. Channel routing, message formatting and
the Slack response shape stay entirely inside the adapter.

## 2. The port mirrors the adapter's API instead of the application's need

**What:** `SlackClient` exposes `chatPostMessage(args)` and
`conversationsList(cursor)`. The service only ever needs "announce that a review
finished". `conversationsList` is not called anywhere in the excerpt.

**Rule broken:** Ports express what the application requires, not what the
provider offers (interface segregation / ports belong to the domain). A
Slack-shaped port forces the abstraction to leak and adds unused surface.

**Fix:** Collapse to the single domain operation the caller needs (see #1). Drop
`conversationsList` until something actually requires it.

## 3. A server-only, Slack-specific port is placed in `vendor/shared`

**What:** The interface is appended to `server/src/vendor/shared/adapters.ts`.

**Rules broken:**
- `vendor/shared` is the cross-package contract surface (Zod schemas, shared
  ports). A Slack notification port used only by `server/` does not belong
  there — it belongs in the server's domain/application ring
  (e.g. `server/src/modules/reviews/ports/` or the server's `core`/`domain`
  ports location).
- Per the repo map, `vendor/shared` is **vendored as two diverging copies**
  (`server/…` and `client/…`). Editing only the server copy silently breaks the
  invariant that the copies match.

**Fix:** Move the port into the server's own inner ring next to the reviews
module. Leave `vendor/shared` untouched.

## 4. `ReviewsService` instantiates the concrete adapter directly

**What:** `service.ts` does `import { SlackWebApiClient } from
'../../adapters/slack/slack-adapter.js'` and `const slack = new
SlackWebApiClient()` inside `announceFinished`.

**Rules broken:**
- Dependency rule: the application ring (`modules/reviews/service.ts`) imports
  from the infrastructure ring (`adapters/slack/**`). Dependencies must point
  inward.
- Composition root: concrete adapters are constructed and wired only by the DI
  container. `new SlackWebApiClient()` in a service bypasses it, making the
  service impossible to unit-test without a real Slack token and coupling it to a
  transport choice.

**Fix:** Inject the port through the constructor alongside `repo`, `github`,
`llm`:

```ts
constructor(private readonly deps: { repo: …; github: …; llm: …; notifier: ReviewNotifier }) {}
```

Call `this.deps.notifier.reviewFinished(...)`. Register `SlackWebApiClient` as the
`ReviewNotifier` binding in the DI container.

## 5. The adapter self-configures from `process.env`

**What:** `new WebClient(process.env.SLACK_BOT_TOKEN)` in the constructor.

**Rules broken:** Adapters receive their configuration from the composition root;
they do not reach into ambient globals. Per this repo, secrets come from
`SecretsProvider` (`~/.devdigest/secrets.json`), with `process.env` only as a
fallback — the adapter should not know that.

**Fix:** Take the token (or a configured `WebClient`) as a constructor
parameter; the DI container resolves it via `SecretsProvider` and passes it in.

## 6. `REVIEW_CHANNEL_ID` lives in the reviews module

**What:** `service.ts` imports a hard-coded Slack channel id from
`./constants.js` and passes it on every call.

**Rule broken:** A deployment/routing detail of the Slack transport is leaking
into the application layer. The domain should not know Slack channels exist.

**Fix:** The channel is adapter configuration — pass it into `SlackWebApiClient`
from the composition root (same place as the token). The service just calls
`notifier.reviewFinished(...)`.

## 7. Adapter return types re-expose vendor objects

**What:** `chatPostMessage` and `conversationsList` return
`ChatPostMessageResponse` / `ConversationsListResponse` — raw Slack SDK objects —
through the port.

**Rule broken:** Same as #1, on the return path. Callers of the port now depend
on Slack's response shape.

**Fix:** With the port from #1 the operation returns `Promise<void>` (or a small
domain result type). The Slack response is consumed/logged inside the adapter and
never crosses the boundary.

---

## Summary of required changes

1. Replace `SlackClient` with a domain-owned `ReviewNotifier` port, no
   `@slack/web-api` import, own DTOs, `Promise<void>` return.
2. Put that port in the server's inner ring, not `vendor/shared`.
3. `ReviewsService` depends on `ReviewNotifier` via constructor injection; remove
   the `adapters/slack` import and the `new SlackWebApiClient()` call.
4. Wire `SlackWebApiClient` → `ReviewNotifier` in the DI container, passing it the
   bot token (via `SecretsProvider`) and the channel id.
5. Delete `REVIEW_CHANNEL_ID` from the reviews module; it becomes adapter config.

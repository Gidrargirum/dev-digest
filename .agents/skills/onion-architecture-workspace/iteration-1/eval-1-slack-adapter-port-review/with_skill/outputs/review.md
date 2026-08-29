# Architecture review — Slack adapter for `server/`

Verdict: **changes requested.** The adapter itself is in the right ring, but the
port, the wiring, and the call site all break ports-and-adapters boundaries. Five
problems, ordered by severity.

---

## 1. `SlackClient` is a wrapper, not a port (CRITICAL)

**What.** `adapters.additions.ts` defines the interface in Slack's own
vocabulary: it imports `ChatPostMessageArguments`, `ChatPostMessageResponse` and
`ConversationsListResponse` from `@slack/web-api`, and the methods
(`chatPostMessage`, `conversationsList`) are one-to-one re-exports of the SDK
surface.

**Rule broken.** Rule 2 (Inversion) and anti-pattern 5 ("a wrapper masquerading
as a port"). decision-tree.md: *"If the interface mentions the vendor, it is not
a port, it is a wrapper."* The core is still coupled to `@slack/web-api`, just
indirectly — the inversion buys nothing, and swapping the vendor (or unit-testing
the service) still drags Slack's types in.

**Fix.** Express the port in domain terms and return domain types:

```ts
export interface ReviewNotifier {
  announceRunFinished(channelId: string, summary: RunSummary): Promise<void>;
}
```

No `@slack/web-api` import in the interface. `conversationsList` has no consumer
in this PR — drop it (YAGNI); add a domain-named method only when a use case
needs it.

---

## 2. Port is in the wrong file — `vendor/shared/adapters.ts` (HIGH)

**What.** The interface is appended to `server/src/vendor/shared/adapters.ts`.

**Rule broken.** Rule 2 corollary / stack-rules.md: `vendor/shared` is vendored
into the **browser bundle's type surface**. A port the client has no use for
belongs in `server/src/ports/`. A Slack notification triggered when a server-side
run finishes is server-only; putting it in `vendor/shared` needlessly pushes
`@slack/web-api`'s type graph toward the client.

Also anti-pattern 10: `server/src/vendor/shared` and `client/src/vendor/shared`
are two diverged copies. Editing only the server copy silently breaks types on
the client side — but here the right move is not to touch either copy.

**Fix.** Put `ReviewNotifier` in `server/src/ports/`. Same ring, same rules, no
browser-bundle cost.

---

## 3. Service imports and news-up the concrete adapter (CRITICAL)

**What.** `service-excerpt.ts`:

```ts
import { SlackWebApiClient } from '../../adapters/slack/slack-adapter.js';
...
const slack = new SlackWebApiClient();
```

**Rule broken.** Rule 1 (Direction) — the import-legality table forbids
`service.ts → adapters`. Rule 4 (One composition root) — *"only the container
names concrete classes… If you find yourself writing `new OctokitGitHubClient()`
outside the container, the inversion is broken."* The application ring now
depends outward on infrastructure, and `announceFinished` cannot be unit-tested
without a real Slack token.

**Fix.** Inject the port through the constructor alongside the existing
`repo, github, llm`, and depend only on `ReviewNotifier`:

```ts
constructor(
  private readonly repo: ReviewRepository,
  private readonly github: GitHubClient,
  private readonly llm: LLMProvider,
  private readonly notifier: ReviewNotifier,
) {}
```

The `if (!run || run.status !== 'succeeded') return;` guard is correctly placed —
that decision belongs in the service. Keep it.

---

## 4. No composition-root wiring, no `ContainerOverrides` entry (HIGH)

**What.** `SlackWebApiClient` is never registered in `platform/container.ts`, and
there is no matching field in `ContainerOverrides`.

**Rule broken.** Rule 4 and the anti-patterns review checklist: *"Every new
adapter has a port in the contracts ring **and** an entry in `ContainerOverrides`."*
Without the override entry the service method is untestable by substitution;
tests would have to mock the module.

**Fix.** Construct `SlackWebApiClient` lazily in `container.ts`, expose it as
`ReviewNotifier`, and add a `notifier?: ReviewNotifier` field to
`ContainerOverrides`.

---

## 5. Adapter reads the secret from `process.env` directly (MEDIUM)

**What.** `slack-adapter.ts` constructor: `new WebClient(process.env.SLACK_BOT_TOKEN)`.

**Rule broken.** stack-rules.md, DI container section: *"Adapters are constructed
lazily and resolved through `SecretsProvider`. Secrets are never read from
`AppConfig` or the DB."* CLAUDE.md gotcha: secrets come from `SecretsProvider`
(`~/.devdigest/secrets.json`), with `process.env` only as a fallback — that
fallback logic lives in `SecretsProvider`, not scattered in each adapter.

**Fix.** Take the token as a constructor argument
(`constructor(token: string)`); the container resolves it via `SecretsProvider`
when it lazily builds the adapter.

---

## What is fine

- `SlackWebApiClient` in `src/adapters/slack/` — correct ring; the `@slack/web-api`
  SDK is contained to this one file.
- The `status !== 'succeeded'` decision living in the service.
- `implements SlackClient` on the adapter (the pattern is right once the port is
  fixed and moved).

# Anti-patterns — backend PR review checklist

Each entry: the smell, why it costs, the fix. Ordered by how often it shows up here.

---

## 1. Anemic ring — the service is a pass-through

```ts
// ❌ nothing happens here; the ring exists only as a folder
async getReview(id: string) { return this.repo.findReview(id); }
```

Not automatically wrong for a genuine read-through. It **is** wrong when the
business rule that should live here has drifted into the route or the repository
instead. Check where the `if` went.

**Fix:** if the rule is in the route, move it down. If the ring is truly empty for
this operation, leave it — but do not let the next rule land in `routes.ts`.

---

## 2. `Container` as a constructor parameter

```ts
// ❌ application ring depends on the composition root
constructor(private readonly container: Container) {}
```

**Cost:** the dependency points outward, the true dependencies are invisible in the
signature, and every unit test must build the whole app. It only becomes a *cycle*
when the container also constructs the service — which is how `repo-intel`
produced four `no-circular` violations on its own.

**Fix:** list the ports the service actually uses. The container assembles them —
that is its job. `repo-intel` is the worked example: `RepoIntelDeps` in
`modules/repo-intel/types.ts` names the six ports the service reaches for, the
container passes them plus a repository, and the two tests that used to fake a
whole `Container` now hand over a six-line object.

`repos`, `agents` and `reviews` still take `Container`. They are constructed in
`routes.ts` rather than the container, so they produce no cycle — the debt there
is testability and honesty of the signature, not a broken ring.

---

## 3. A Drizzle row in an application signature

```ts
// ❌ storage shape leaking upward
async listRuns(): Promise<RunRow[]>
```

**Cost:** a column rename becomes a change to the service, the route, and the
client contract. The repository stops being replaceable.

**Fix:** map to a domain type inside the repository. `rows.ts` types stay in
infrastructure.

---

## 4. Business logic inside a repository

```ts
// ❌ policy in the persistence ring
async createRun(input) {
  if (input.files.length > MAX_FILES) throw new AppError('too large');
  ...
}
```

**Cost:** the rule is now untestable without Postgres, and invisible to anyone
reading the service.

**Fix:** decision in the service, query in the repository.

---

## 5. A wrapper masquerading as a port

```ts
// ❌ the interface speaks Octokit, so swapping the vendor changes the core
interface GitHubClient { octokitRequest(route: string, opts: object): Promise<any>; }
```

**Cost:** the port leaks the vendor's vocabulary, so the inversion buys nothing —
the core is still coupled to Octokit, just indirectly.

**Fix:** name the port in domain terms — `getPullDiff(repo, number)`. The test for
a good port: could a completely different vendor implement it without the name
looking absurd?

---

## 6. Validating in the handler

```ts
// ❌ duplicate source of truth; the schema is already there
const body = RunRequest.parse(req.body);
```

**Fix:** `schema.body` on the route. One Zod schema does validation *and*
serialization via `fastify-type-provider-zod`.

---

## 7. Cross-module reach-in

```ts
// ❌ modules/repos importing modules/repo-intel
import { INDEX_TTL } from '../repo-intel/constants.js';
```

**Cost:** the two modules can no longer be deleted, moved or tested independently;
the "module" boundary becomes decorative.

**Fix:** the shared part goes to `modules/_shared/`, `vendor/shared/` or
`platform/`. Composition happens in the container, one ring out. Currently 1
violation in the baseline.

---

## 8. Fixing `arch:check` by regenerating the baseline

The most expensive one, because it is invisible in review unless someone opens the
JSON.

**Fix:** a baseline diff may contain removals only. See
[enforcement.md](enforcement.md).

---

## 9. I/O sneaking into `reviewer-core`

Any `fs`, `fetch`, DB or env read in the domain ring — including "just reading a
config file once at import".

**Cost:** breaks hermetic tests, which run with no keys and no network, and makes
the engine unusable outside `server/`.

**Fix:** add a field to `ReviewInput`; the caller resolves it. Inputs are resolved
strings, not identifiers.

---

## 10. Editing one vendored `shared` copy

`server/src/vendor/shared` and `client/src/vendor/shared` are two copies that have
**already diverged**. Changing one alone breaks types on the other side silently —
there is no build step to catch it.

**Fix:** both, in the same commit, deliberately.

---

## Quick review pass

- [ ] `pnpm arch:check` green, and the baseline diff has no additions
- [ ] No new file imports `fastify` outside `routes.ts`
- [ ] No `db/schema` import outside a repository
- [ ] New services take ports, not `Container`
- [ ] Every new adapter has a port in `vendor/shared/adapters.ts` **and** an entry
      in `ContainerOverrides`
- [ ] Repository methods return domain types
- [ ] New integration tests are named `*.it.test.ts`
- [ ] Contract changes touch **both** vendored `shared` copies

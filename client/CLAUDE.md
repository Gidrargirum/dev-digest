# client/ — Next.js 15 studio

The UI: repos, pull requests, reviews, agents, settings. No business logic here —
the client only renders what the API on `:3001` returns.

## Stack

Next.js 15 (App Router) · React 19 · TanStack Query 5 · next-intl 3 ·
Tailwind 4 · recharts · mermaid · react-markdown · vitest 2 + jsdom +
Testing Library.

## Commands

```sh
pnpm dev          # :3000
pnpm test         # vitest + jsdom, fetch mocked — no API needed
pnpm typecheck
pnpm build
```

## Map

- `src/app/**/page.tsx` — routes; pages stay thin.
- `src/app/**/_components/<Name>/` — a feature colocated with the page using it.
- `src/components/<name>/` — components shared across routes.
- `src/lib/api.ts` — the single fetch client; normalizes failures into `ApiError`.
- `src/lib/hooks/*` — every React Query hook; barrel in `hooks/index.ts`.
- `src/vendor/ui/` — vendored primitives, shell, kit, charts.
- `src/vendor/shared/` — vendored Zod contracts (API response types).
- `messages/<locale>/` — next-intl strings.

## Read when

Read [README.md](./README.md) when you need the layer overview or the route map.
Read [docs/](./docs/README.md) when digging into a mechanism: data layer, SSE log, component anatomy, i18n.
Read [specs/](./specs/README.md) when adding a screen or changing loading/empty/error behaviour.
Read [insights/](./insights/README.md) when optimizing rendering or caching — it has been measured already.
Read [../server/README.md](../server/README.md) when you need the shape of a route's response.

## Non-default conventions

- Fetch data only through `lib/hooks/*` → `lib/api.ts`. A bare `fetch` in a
  component is forbidden: it bypasses error normalization and the cache.
- Component folder layout is fixed: `Name.tsx` · `styles.ts` · `constants.ts` ·
  `helpers.ts` · `index.ts` · `Name.test.tsx`. Nested features go in `_components/`.
- API response types come from `vendor/shared`; never redeclare them.
- Styles live in the sibling `styles.ts`, not inlined across the JSX.
- `page.tsx` holds no feature state: it composes components and passes params.

## Gotchas

- An `ApiError` with `status: 0` is not a backend failure — the API is
  unreachable (`NEXT_PUBLIC_API_BASE`, default `http://localhost:3001`).
- Body-less POSTs used to fail with "Body cannot be empty…"; `apiFetch` now sets
  `content-type` only when a body exists. Don't add it back by hand.
- Tests deliberately cannot see the API: `fetch` is mocked. Don't stand up a
  server for `pnpm test` — that is what `e2e/` is for.

## Do not touch

- `src/vendor/ui/` — vendored UI kit. Don't bend it to one screen; if you need a
  variation, build it in your own component.
- `src/vendor/shared/` — a contract whose second copy lives in the server
  (`server/src/vendor/shared/`) and has already diverged from it. One-sided edits
  break types silently.

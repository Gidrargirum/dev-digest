# Development Plan — Project Context Folder (`specs/2026-08-26-project-context-folder.md`)

## Execution mode

- **Multi-agent** (рішення користувача). Порядок передачі: `implementer` (сервер) → `api-test-writer` → `implementer` (клієнт) → `ui-test-writer` → `architecture-reviewer` → `pr-self-review`.
- Кожна група кроків має поле `agent:` — це і є межа передачі. Агент, що приймає план, отримує ЛИШЕ свої кроки плюс секції *Constraints*, *Skills the implementer must invoke* і *Verification gates*.

## Scope

- Пакети: `server/` (порт + адаптер + новий модуль `context` + БД/міграція + run-executor), `client/` (сторінка Project Context, Context-таб агента, секція у скіла, Trace, хуки, nav, i18n), `reviewer-core/` (**лише тести** — код уже задовольняє AC-12/13/14).
- Поза скоупом (з *Non-goals* специфікації): автоселектор релевантних документів за вмістом PR, семантичний пошук/чанкінг/pgvector, створення/редагування/аплоад `.md` з UI (сторінка read-only; `Edit`-таб та `+`/folder/upload-іконки з des1 не робимо), версіювання та синк з git-історією, вплив на `score`/`verdict`/категорії findings, серверні ліміти обсягу, індикатор «COVERAGE».
- **Поза скоупом за рішенням користувача: AC-17 і весь пакет `e2e/`.** Гіпотеза «чи впливає письмова специфікація на поведінку рев'юера» перевіряється вручну в інфраструктурі, поза цим планом. Нового флоу `11-project-context.flow.json` немає; `server/src/db/seed.ts` не змінюється (клієнтські тести працюють на замоканому `fetch`, сидована фікстура їм не потрібна).
- Також поза скоупом: рефакторинг наявних сервісів, що приймають `Container` (`repos`/`agents`/`reviews`) — це задокументований борг, не наша задача.

## Recommendations

- **Не розширювати наявний `SpecFile`** (`server/src/vendor/shared/contracts/platform.ts:289`), а додати новий файл контракту `contracts/project-context.ts`. Барель `vendor/shared/index.ts` прямо каже «feature agents EXTEND with new files, they do not edit existing ones», а `SpecFile` не має ні `source`, ні токенів, ні `used_by_agents`. Прийнято.
- **`vendor/shared` — не дві ручні правки.** Всупереч тексту `AGENTS.md`, копії зараз ідентичні й синхронізуються механічно: `server/src/vendor/shared` канонічний, `node scripts/sync-shared.mjs` копіює в клієнт, `--check` — гейт (`insights/INSIGHTS.md`, 2026-08-13). Планую саме так: правка серверної копії + запуск скрипта одним кроком. Прийнято.
- **Сервіс контексту приймає бандл портів, а не `Container`.** Оскільки контейнер його *конструює* (щоб run-executor не робив крос-модульного імпорту), прийом `Container` створив би цикл — рівно те, що `repo-intel` уже виправляв через `RepoIntelDeps` (`server/insights/INSIGHTS.md`, 2026-08-13). Прийнято — чисте покращення без зміни поведінки.
- **Reviewer-core коду не чіпаємо.** `assemblePrompt` уже рендерить `## Project context` через `wrapUntrusted` і омітить секцію на порожньому масиві. AC-13 закривається на боці сервера: резолвлений рядок починається зі шляху, що узгоджено з «Inputs are resolved strings» (`reviewer-core/AGENTS.md`). Альтернатива (шлях як label у `wrapUntrusted`) вимагала б зміни сигнатури `PromptParts.specs` — відхилено як дорожче без вигоди.

## Constraints

- `specs/2026-08-26-project-context-folder.md` — AC-2: корені пошуку = `.devdigest/{specs,docs,insights}/**/*.md` **власної папки інструмента**, не `specs/`/`docs/`/`insights/` репозиторію. AC-16: читання лише за шляхом, присутнім у каталозі, побудованому ридером у момент рану; абсолютний шлях, `..`, вихід за корені, не-`.md`, симлінк назовні — відхиляти **без** звернення до диска. AC-14: порожній список → промпт побайтово ідентичний. AC-15: жодного додаткового виклику LLM.
- `specs/2026-08-26-project-context-folder.md` («Untrusted inputs») — жодних денилістів, регексів чи keyword-скану над текстом документів; захист — рівно один спільний `INJECTION_GUARD`.
- **Модель доступу (підтверджено користувачем):** у системі один рівень доступу в межах воркспейсу — всі бачать усе. Тому `GET /repos/:repoId/context/docs/content` не потребує додаткової авторизації понад перевірку шляху за каталогом (AC-16). Це рішення, а не недогляд; жодної роботи з авторизації в цьому плані немає.
- `reviewer-core/AGENTS.md` — «Prompt-injection defense is exactly one `INJECTION_GUARD`», «`INJECTION_GUARD` — do not touch», «optional slot not passed → not rendered». Це прямо забороняє «покращувати» захист під цю фічу.
- `server/AGENTS.md` — новий модуль = папка `modules/<name>/` + один імпорт у `modules/index.ts` (автолоада немає); зовнішній світ лише через порт контейнера; валідація через `schema.body`/`schema.params`, не `.parse()` у хендлері; інтеграційний тест **мусить** зватися `*.it.test.ts`; секрети — лише через `SecretsProvider`.
- `server/AGENTS.md` + `.dependency-cruiser.cjs` — `service.ts` не імпортує `db/schema`, `db/client` чи конкретний адаптер (`service-not-in-db` = error); `routes.ts` не імпортує `repository.ts`; Fastify-типи не виходять за `routes.ts`; `adapters/**` не імпортує з `modules/**`.
- `onion-architecture` (skill) — порт, який клієнту не потрібен, живе в `server/src/ports/`, не у `vendor/shared/adapters.ts` (бо `vendor/shared` вендориться у браузерний тайп-серфейс). Реалізація — у `src/adapters/**`, зв'язування — лише в `platform/container.ts`.
- `server/insights/INSIGHTS.md` (2026-08-19) — у `RunLogger` **немає** `warn`, а `.step()` для best-effort стадії неправильний: на throw він емітить `error` і ре-throw'ить, через що Live Log малює весь ран як провалений. Best-effort резолв документів обгортати власним try/catch + `runLog.info(...)`.
- `server/insights/INSIGHTS.md` (2026-08-13) — `pnpm db:generate` стає **інтерактивним**, якщо в одній генерації таблиця і набуває, і втрачає колонки. У нас лише нові таблиці, тож ризик нульовий, але міграцію не редагувати руками (рукописна міграція — сама по собі findings).
- `server/insights/INSIGHTS.md` (2026-08-13) — `MockGitClient.readFile` повертає `''` на невідомий шлях замість throw. «Файл відсутній» визначати за відсутністю у каталозі, а не за винятком.
- `client/AGENTS.md` — дані лише через `lib/hooks/*` → `lib/api.ts` (голий `fetch` заборонений); фіксований layout папки компонента (`Name.tsx` · `styles.ts` · `constants.ts` · `helpers.ts` · `index.ts` · `Name.test.tsx`); типи відповідей — з `vendor/shared`, не переоголошувати; стилі в `styles.ts`; `page.tsx` не тримає стану фічі; `src/vendor/ui/` — do-not-touch.
- `client/insights/INSIGHTS.md` (2026-08-19) — клієнт може імпортувати з `@devdigest/shared` **тільки типи**: рантайм-імпорт тягне `vendor/shared/index.ts` у бандл і Next не резолвить `./contracts/*.js`. Отже жодного `ContextDoc.parse()` на клієнті; `.default()` контракту тут не спрацює — робити тотальні лукапи (`TABLE[v] ?? fallback`).
- `client/insights/INSIGHTS.md` (2026-08-02) — `@testing-library/user-event` **не** є залежністю `client/`; взаємодії драйвити через `fireEvent` з `@testing-library/react`. Це переважає загальну пораду скіла `react-testing-library`.
- `insights/INSIGHTS.md` (2026-08-13) — додавання екрана в сайдбар неминуче потребує правки `client/src/vendor/ui/nav.ts`; у `routing.md` для цього вже є явний виняток із B6 («except a `NAV`/`SHORTCUTS` entry in `nav.ts`»). Правити **тільки** масиви `NAV`/`SHORTCUTS`.
- Root `CLAUDE.md` — `docker compose down -v` заборонено; `server/clones/**` не чіпати; перед правкою `server/package.json` перевірити `git ls-files -v package.json`.

## Skills the implementer must invoke

Таблиця — **прогноз**. Виконавець переролює фактично змінені шляхи (`git status --porcelain`) і повідомляє про розходження.

| Files that will change | Skills (per `routing.md`) |
|---|---|
| `server/src/vendor/shared/contracts/project-context.ts`, `server/src/vendor/shared/index.ts`, `client/src/vendor/shared/**` (генерується скриптом) | `zod`, vendor-parity gate, `security`, `typescript-expert` |
| `server/src/ports/index.ts` | `onion-architecture`, `security`, `typescript-expert` |
| `server/src/adapters/context-docs/**`, `server/src/adapters/mocks.ts` | `onion-architecture`, `security` |
| `server/src/platform/container.ts`, `server/src/platform/config.ts` | `onion-architecture`, `security` |
| `server/src/db/schema/project-context.ts`, `server/src/db/schema.ts` | `postgresql-table-design`, `drizzle-orm-patterns`, `security` |
| `server/src/db/migrations/**` | — (генерується `drizzle-kit`; listed, not reviewed — рукописна правка = finding) |
| `server/src/modules/context/routes.ts` | `onion-architecture`, `fastify-best-practices`, `security` |
| `server/src/modules/context/service.ts` | `onion-architecture`, `security` |
| `server/src/modules/context/repository.ts` | `onion-architecture`, `drizzle-orm-patterns`, `security` |
| `server/src/modules/context/{constants,helpers}.ts`, `server/src/modules/index.ts` | `onion-architecture`, `security` |
| `server/src/modules/reviews/run-executor.ts` | `onion-architecture`, `security` |
| `server/**/*.test.ts`, `server/**/*.it.test.ts` | — → rules **B5**, **B9** |
| `reviewer-core/src/prompt.test.ts` (тільки тест) | `onion-architecture`, — B5/B9 |
| `client/src/lib/hooks/context.ts`, `client/src/lib/hooks/index.ts` | `frontend-architecture`, `react-best-practices`, `security` |
| `client/src/app/repos/[repoId]/context/page.tsx` | `frontend-architecture`, `next-best-practices`, `react-best-practices`, `security` |
| `client/src/app/repos/[repoId]/context/_components/**` | `frontend-architecture`, `react-best-practices`, `security` |
| `client/src/app/agents/[id]/_components/AgentEditor/**` | `frontend-architecture`, `react-best-practices`, `security` |
| `client/src/app/skills/_components/SkillDetail/**` | `frontend-architecture`, `react-best-practices`, `security` |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/**` | `frontend-architecture`, `react-best-practices`, `security` |
| `client/src/vendor/ui/nav.ts` | **B6 carve-out** — дозволено лише запис у `NAV`/`SHORTCUTS`; будь-яка інша правка = CRITICAL |
| `client/messages/en/*.json` | — |
| `client/**/*.test.tsx` | `react-testing-library` |
| `specs/README.md`, `server/src/modules/context/README.md` | — (docs) |

`e2e/**` у матриці відсутній навмисно: пакет у цьому плані не зачіпається.

---

## Steps

### Група A — сервер: контракт, порт, сховище — agent: `implementer`

#### A1. Контракт `ContextDoc` + синхронізація двох копій `vendor/shared` — package: server/ (+client/ похідно)
- Files: `server/src/vendor/shared/contracts/project-context.ts` (new), `server/src/vendor/shared/index.ts` (edit — один рядок `export * from './contracts/project-context.js';`), `client/src/vendor/shared/**` (генерується скриптом — **не правити руками**)
- Skills: `zod`, `typescript-expert`, `security`
- What to do: Zod-схеми `ContextDocSource = z.enum(['specs','docs','insights'])`; `ContextDoc = { path, name, source, size_bytes, tokens, used_by_agents }` (`used_by_agents` — `z.number().int()`, AC-23); `ContextAttachment = { path, order, broken: z.boolean() }` (AC-21); `SetContextBody = { repo_id: z.string().uuid(), paths: z.array(z.string()) }`. Наявний `SpecFile` не чіпати. Далі виконати `node scripts/sync-shared.mjs` з кореня репозиторію.
- Done when: `node scripts/sync-shared.mjs --check` виходить з 0; `cd server && pnpm typecheck` і `cd client && pnpm typecheck` зелені.
- Tests: власних немає — контракт покривається тестами C1/C2.

#### A2. Порт `ContextDocsReader` + fs-адаптер + конфіг коренів пошуку — package: server/
- Files: `server/src/ports/index.ts` (edit), `server/src/adapters/context-docs/index.ts` (new), `server/src/adapters/mocks.ts` (edit), `server/src/platform/config.ts` (edit), `server/src/platform/container.ts` (edit)
- Skills: `onion-architecture`, `security`, `typescript-expert`
- What to do:
  - У `src/ports/index.ts`: `interface ContextDocEntry { path: string; sizeBytes: number }` та `interface ContextDocsReader { list(root: string, searchRoots: string[]): Promise<ContextDocEntry[]>; read(root: string, relPath: string): Promise<string> }`. Порт саме тут, а не у `vendor/shared/adapters.ts`: клієнт ним не користується (`server/AGENTS.md`, `onion-architecture`).
  - Адаптер `FsContextDocsReader`: рекурсивний обхід кожного з `searchRoots` під `root`, фільтр `.md`, шляхи нормалізовані до forward-slash і **репо-відносні**. Ніколи не кидає — на будь-якій помилці повертає `[]` («repo-intel degrades instead of throwing»). За зразок узяти `server/src/modules/repo-intel/pipeline/walk.ts`, але **не імпортувати** з модуля (`infra-does-not-import-modules` = error).
  - `read()`: `resolve` + `realpath` і перевірка, що результат лежить під `root/<searchRoot>`; інакше — throw. Це друга лінія; перша — верифікація за каталогом у сервісі (AC-16).
  - `config.ts`: `CONTEXT_SEARCH_ROOTS` (кома-розділений) → `contextSearchRoots: string[]`, дефолт `['.devdigest/specs', '.devdigest/docs', '.devdigest/insights']` (AC-2). Секретів сюди не додавати.
  - `container.ts`: гетер `get contextDocs(): ContextDocsReader` + `ContainerOverrides.contextDocs`; у `mocks.ts` — `MockContextDocsReader` з in-memory мапою, який на невідомий шлях **кидає** (інакше повториться пастка `MockGitClient.readFile`).
- Done when: `pnpm typecheck` + `pnpm arch:check` + `pnpm arch:ratchet` зелені; кількість записів у `.dependency-cruiser-known-violations.json` **не зросла**.
- Tests: unit `server/src/adapters/context-docs/index.test.ts` — обхід, фільтр `.md`, відхилення виходу за корені / `..` / абсолютного шляху / симлінка назовні, помилка ФС → `[]`.

#### A3. Схема БД + міграція — package: server/
- Files: `server/src/db/schema/project-context.ts` (new), `server/src/db/schema.ts` (edit: `export *` + import + запис в об'єкт `schema`), `server/src/db/migrations/**` (generated)
- Skills: `postgresql-table-design`, `drizzle-orm-patterns`, `security`
- What to do: дві симетричні таблиці (скоуп `(agent, repository)` і `(skill, repository)` — рішення користувача):
  - `agent_context_docs`: `agent_id uuid FK→agents ON DELETE CASCADE`, `repo_id uuid FK→repos ON DELETE CASCADE`, `path text NOT NULL`, `order integer NOT NULL DEFAULT 0`, `created_at` (через `now()` з `./_shared`); PK `(agent_id, repo_id, path)`.
  - `skill_context_docs`: те саме з `skill_id uuid FK→skills`; PK `(skill_id, repo_id, path)`.
  - Явні індекси на `repo_id` в обох (Postgres не індексує FK автоматично) — це шлях запиту для AC-23. Ідентичність документа = повний шлях, ніколи ім'я файлу (edge case специфікації).
  - Згенерувати `pnpm db:generate`, застосувати `pnpm db:migrate`. Файл міграції не редагувати.
- Done when: `pnpm typecheck` зелений; `pnpm db:migrate` застосовує міграцію без помилок; обидві таблиці присутні і в `export *`, і в об'єкті `schema`.
- Tests: покриваються інтеграційним тестом C2.

### Група B — сервер: модуль `context`, run-executor — agent: `implementer`

#### B1. Модуль `modules/context/` — package: server/
- Files: `server/src/modules/context/routes.ts`, `service.ts`, `repository.ts`, `constants.ts`, `helpers.ts`, `README.md` (усе new), `server/src/modules/index.ts` (edit), `server/src/platform/container.ts` (edit)
- Skills: `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `security`
- What to do:
  - **routes.ts** (entry ring; валідація через `schema.params`/`schema.body`/`schema.querystring`, не `.parse()` у хендлері):
    - `GET /repos/:repoId/context/docs` → каталог (AC-1, AC-23)
    - `GET /repos/:repoId/context/docs/content` (`?path=`) → прев'ю (AC-4); шлях верифікується за каталогом (AC-16), інакше `NotFoundError`. Додаткової авторизації немає — див. *Constraints*, модель доступу.
    - `GET /agents/:id/context?repo_id=` / `PUT /agents/:id/context` (body `SetContextBody`) — AC-6, AC-8, AC-9
    - `GET /skills/:id/context?repo_id=` / `PUT /skills/:id/context` — AC-10, скоуп `(skill, repository)`
    - `PUT` зберігає **лише шлях і порядок**, ніколи текст (AC-8); порядок = позиція у масиві `paths`.
  - **service.ts** (application ring): конструктор `(repo: ContextRepository, reader: ContextDocsReader, tokenizer: Tokenizer)` — **не `Container`**; жодного імпорту `db/schema`, `db/client` чи конкретного адаптера.
    - `catalog(repoId)`: `clonePath` репозиторію → `reader.list` → для кожного `tokenizer.count(content)`; source-тег виводиться зі шляху (`.devdigest/specs/…` → `specs`). AC-1/AC-2/AC-3, детерміновано, без LLM.
    - `resolveForRun(agentId, repoId)`: злиття документів агента + документів **enabled** скілів агента, дедуп за repo-relative path, позиція агента виграє (AC-11; вимкнений скіл не успадковується).
    - `usageCounts(repoId)`: скільки агентів мають документ прямо або через enabled-скіл (AC-23).
  - **repository.ts** (infrastructure): Drizzle-запити; `PUT` — транзакцією `delete` + `insert` набору (last save wins, edge case специфікації).
  - **helpers.ts**: чисті функції — `sourceTagFor(path)`, `mergeAttachments(agentDocs, skillDocs)` (саме її покриває unit-тест на AC-11), `formatSpecsReadEntry(path, tokens)` → `` `${path} · ≈${tokens} tokens` `` (рішення користувача щодо `specs_read`).
  - `modules/index.ts`: один імпорт + один запис `context`.
  - `container.ts`: гетер `get projectContext()`, який конструює сервіс із портів (**бандл залежностей, не `Container`** — інакше цикл) + `ContainerOverrides.projectContext`.
- Done when: `pnpm typecheck`, `pnpm arch:check`, `pnpm arch:ratchet` зелені; `GET /repos/:repoId/context/docs` відповідає на живому інстансі; жодного нового запису в baseline порушень.
- Tests: unit `server/src/modules/context/helpers.test.ts` — merge/dedup (AC-11), source-тег, формат `specs_read`.

#### B2. Резолв контексту в run-executor + трейс — package: server/
- Files: `server/src/modules/reviews/run-executor.ts` (edit)
- Skills: `onion-architecture`, `security`
- What to do:
  - Приватний `buildProjectContext(agentId, repoId, runLog)`: `container.projectContext.resolveForRun(...)` → читання вмісту через ридер; **власний try/catch**, а не `runLog.step()` (той емітить `error` і ре-throw'ить — Live Log показав би ран як провалений). Нечитабельний/зниклий документ: пропустити, `runLog.info(...)`, ран триває (AC-21).
  - Резолвлений рядок кожного документа починається з рядка з repo-relative шляхом, далі текст (AC-13). Передача: `...(specs.length > 0 ? { specs } : {})` — той самий omit-when-empty контракт, що вже застосований до `callers`/`repoMap`/`skills` (AC-14).
  - `trace.specs_read` — рядки `` `${path} · ≈${tokens} tokens` `` у порядку вставки; пропущені документи окремим видимим записом (напр. `` `${path} · skipped (unreadable)` ``), AC-18 + AC-21. Гілку `traceFromBuffer` (fail/cancel) не міняти — там `specs_read: []` коректно.
  - Каталог і підрахунок токенів викликаються **один раз на ран** (нефункціональна вимога «Performance»).
  - Жодного додаткового виклику LLM, жодного впливу на `score`/`verdict`/категорії (AC-15).
- Done when: `pnpm typecheck` + `pnpm arch:check` зелені; unit-лейн сервера зелений; агент без вкладень дає `specs_read: []` і `prompt_assembly.specs === null`.
- Tests: покривається групою C.

### Група C — серверні та доменні тести — agent: `api-test-writer`

#### C1. Unit-лейн сервера — package: server/
- Files: `server/src/modules/context/service.test.ts`, `server/src/modules/reviews/run-executor.context.test.ts` (new)
- Skills: — (rules B5, B9)
- What to do: підстановка через `ContainerOverrides` (`contextDocs`, `tokenizer`, `projectContext`) — **ніколи** мокання модулів (`server/AGENTS.md`). Покрити: AC-2 (корені з конфігу), AC-3 (детермінований підрахунок без LLM), AC-11 (злиття агент+enabled-скіли, дедуп, пріоритет агента, вимкнений скіл не успадковується), AC-15 (нуль викликів LLM понад сам ревʼю), AC-16 (шлях поза каталогом — абсолютний, з `..`, не-`.md`, симлінк назовні — відхилено **без** звернення до диска: мок-ридер має провалити тест, якщо `read` узагалі викликали).
- Done when: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` зелений.
- Tests: це і є тести; лейн — unit (без Docker), імена **без** `.it.`.

#### C2. Інтеграційний лейн — package: server/
- Files: `server/src/modules/context/routes.it.test.ts` (new)
- Skills: — (rules B5, B9)
- What to do: назва файлу **мусить** містити `.it.test.ts`, інакше тест мовчки поїде в unit-лейн. Покрити: AC-1 (каталог із `path`/`name`/`source`/`size_bytes`/`tokens`), AC-8 (зберігаються лише шлях і порядок — жодного тексту в БД), AC-9 (реордер персиститься і визначає порядок блоків), AC-18 (`specs_read` непорожній після рану), AC-21 (зниклий файл → ран триває, пропуск видно в трейсі, вкладення лишається у списку з `broken: true` і не зникає після наступного скану каталогу), AC-23 (лічильник «Used by N agents», включно з успадкуванням через enabled-скіл). Якщо тест підіймає застосунок і підмінює `repoIntel` — заглушити також `registerIndexJobHandlers` як no-op, інакше падає весь `buildApp`.
- Done when: `cd server && pnpm exec vitest run .it.test` зелений (потрібен Docker; без Docker результат — `SKIPPED`, і це **не** пас).
- Tests: інтеграційний лейн (testcontainers).

#### C3. Доменні тести промпту — package: reviewer-core/
- Files: `reviewer-core/src/prompt.test.ts` (edit або new — код `src/**` **не** змінюється)
- Skills: `onion-architecture`
- What to do: AC-12 (секція під канонічним заголовком `## Project context`, кожен документ — окремий блок у наявному untrusted-делімітері), AC-13 (repo-relative шлях присутній усередині блока), AC-14 (`specs` не передано → `user` побайтово ідентичний виклику без фічі), плюс перевірка, що спроба документа закрити делімітер зсередини нейтралізується наявним екрануванням (`</untrusted>` → `<\/untrusted>`). Мережі й ключів у цих тестах немає і бути не може.
- Done when: `cd reviewer-core && npm run typecheck && npm test` зелені; `git diff --stat reviewer-core/src` показує зміни лише у тестовому файлі.
- Tests: це і є тести.

### Група D — клієнт — agent: `implementer`

#### D1. Хуки даних — package: client/
- Files: `client/src/lib/hooks/context.ts` (new), `client/src/lib/hooks/index.ts` (edit)
- Skills: `frontend-architecture`, `react-best-practices`, `security`
- What to do: `useContextDocs(repoId)`, `useContextDocContent(repoId, path)`, `useAgentContext(agentId, repoId)`, `useSetAgentContext()`, `useSkillContext(skillId, repoId)`, `useSetSkillContext()` — усе через `api` з `lib/api.ts`, жодного голого `fetch`. Типи — **лише як типи** з `@devdigest/shared` (рантайм-імпорт ламає Next-бандл), тому жодного `.parse()`. Мутації інвалідують відповідні ключі.
- Done when: `cd client && pnpm typecheck && pnpm lint` зелені.
- Tests: покриваються через компоненти (група E).

#### D2. Сторінка Project Context + запис у nav — package: client/
- Files: `client/src/app/repos/[repoId]/context/page.tsx` (new), `client/src/app/repos/[repoId]/context/_components/ProjectContextView/{ProjectContextView.tsx,styles.ts,constants.ts,helpers.ts,index.ts}` (new), `.../_components/DocPreview/{…}` (new), `client/src/vendor/ui/nav.ts` (edit — **лише** запис у `NAV`, за потреби у `SHORTCUTS`), `client/messages/en/context.json` (edit)
- Skills: `frontend-architecture`, `next-best-practices`, `react-best-practices`, `security` (+ **B6 carve-out** на `nav.ts`)
- What to do: таблиця документів (шлях, source-тег, розмір, `≈ N tokens`, бейдж «Used by N agents» — AC-1/AC-23), клієнтський пошук, вибір рядка → **Preview** (read-only markdown через наявний `react-markdown`) — AC-4. Порожній стан із причиною: «немає `.md` під коренями» vs «репозиторій ще не клоновано» — окремі повідомлення, не порожній список (AC-5). Сторінка **read-only**: жодних `+`/upload/`Edit` — наявні ключі `mode.edit` та `editor.*` у `context.json` не використовувати. `page.tsx` лише композиція + `params`; стилі в `styles.ts`; markdown рендериться екранованим (жодного `dangerouslySetInnerHTML` над вмістом документа). У `nav.ts` — один запис у секції `SKILLS LAB` за зразком `/repos/:repoId/conventions`; **нічого іншого у файлі не чіпати**.
- Done when: `pnpm typecheck`, `pnpm lint`, `pnpm build` зелені; сторінка відкривається з сайдбару; `git diff client/src/vendor/ui/nav.ts` містить лише доданий елемент масиву.
- Tests: група E.

#### D3. Context-таб агента і секція у скіла — package: client/
- Files: `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` (edit — новий таб `context`), `.../AgentEditor/AgentEditor.tsx` (edit — гілка рендеру), `.../AgentEditor/_components/ContextTab/{…}` (new), `client/src/app/skills/_components/SkillDetail/_components/ProjectContextSection/{…}` (new), `client/messages/en/{agents,skills}.json` (edit)
- Skills: `frontend-architecture`, `react-best-practices`, `security`
- What to do: чекбокс-перемикання документа зі збереженням і лічильником «N of M attached» (AC-6); сумарна оцінка `≈ N tokens`, поки прикріплено хоча б один (AC-7); те саме в секції **Project context to use** скіла (AC-10) — саме лічильник токенів, не лише блок `SERIALIZES AS`. Реордер із **не-drag альтернативою** (кнопки вгору/вниз з `aria-label`) — нефункціональна вимога A11y; таблиця керується з клавіатури. Документи, успадковані від скілів, показувати окремим read-only рядком із тегом «from skill X» (proposal #2 специфікації — **підтверджено користувачем, лишається в скоупі**). Зламане вкладення — видимий маркер «broken» + кнопка відкріпити; автоматично не видаляти (AC-21). Жодних жорстких лімітів на кількість/розмір — лише видима вартість (AC-22).
- Done when: `pnpm typecheck` + `pnpm lint` зелені; цикл attach → reorder → reload у браузері зберігає стан.
- Tests: група E.

#### D4. Трейс: `Specs read` + untrusted-блок — package: client/
- Files: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx` (edit за потреби), `client/messages/en/runs.json` (edit)
- Skills: `frontend-architecture`, `react-best-practices`, `security`
- What to do: рядок `Specs read` у **Configuration** уже рендерить `trace.specs_read` — переконатися, що кожен запис показується цілим рядком `path · ≈N tokens` (AC-19: пошляховий шлях **і** свої токени, окремо від агрегованих `Tokens` у Stats). Змінити значення ключа `trace.prompt.specs` з «Project context (dynamic)» на `Project context — attached specs (untrusted)` (AC-19). Розгортання блока показує повний текст **із делімітерами**, без обрізання й переформатування (AC-20) — перевірити, що `PromptBlock` не тримає прихованого truncate.
- Done when: `pnpm typecheck` + `pnpm test` (клієнт) зелені.
- Tests: група E.

### Група E — клієнтські тести — agent: `ui-test-writer`

#### E1. Тести компонентів — package: client/
- Files: `ProjectContextView.test.tsx`, `ContextTab.test.tsx`, `ProjectContextSection.test.tsx` (new), `RunTraceDrawer.test.tsx` (edit)
- Skills: `react-testing-library`
- What to do: 1–3 тести на компонент, кожен — цілий користувацький потік. Покрити AC-4 (вибір документа → Preview), AC-5 (обидва порожні стани з причиною), AC-6/AC-7 (перемикання → лічильник «N of M» + сумарні токени), AC-10 (те саме у скіла), AC-19/AC-20 (`Specs read` з пошляховими токенами; розгорнутий untrusted-блок містить делімітери — на замоканій відповіді трейсу з непорожнім `specs_read` і `prompt_assembly.specs`). `fetch` у клієнтських тестах замокано за замовчуванням — API не піднімати, сид не потрібен. Взаємодії — через `fireEvent` з `@testing-library/react`: `@testing-library/user-event` у `client/` **не встановлено**, тому порада скіла «завжди userEvent» тут не діє.
- Done when: `cd client && pnpm test` зелений.
- Tests: це і є тести; лейн — vitest + jsdom.

### Група F — рев'ю та пре-PR — agent: `architecture-reviewer`, далі `pr-self-review`

#### F1. Архітектурний огляд — package: server/, client/
- Files: діф груп A–B (сервер) і D (клієнт)
- Skills: `onion-architecture`, `frontend-architecture`
- What to do: перевірити кільця — порт у `src/ports/` (не у `vendor/shared/adapters.ts`), `service.ts` без `db/schema`/`db/client`/конкретного адаптера, `routes.ts` без `repository.ts`, відсутність нового циклу через конструювання сервісу в контейнері, відсутність крос-модульного імпорту `reviews → context` (має йти через `container.projectContext`), reviewer-core без нового I/O. На клієнті — напрямок `shared → app`, відсутність голого `fetch`, layout папки компонента, `vendor/ui` не змінено поза carve-out.
- Done when: `pnpm arch:check` + `pnpm arch:ratchet` зелені і baseline порушень не зріс; вердикт рев'ю без CRITICAL.
- Tests: —

#### F2. Пре-PR гейт — package: усі
- Files: весь діф
- Skills: `pr-self-review`
- What to do: повний прогін скіла — переролювання фактичних шляхів, механічні гейти для зачеплених пакетів, фан-аут, вердикт, квитанція. У тілі PR **явно** зазначити, що AC-17 у цьому PR не автоматизовано і перевіряється вручну поза репозиторієм.
- Done when: вердикт `PASS`, квитанція з `--fingerprint`.
- Tests: —

---

## Verification gates

Джерело — `.claude/skills/pr-self-review/gates.md`. Перед запуском гейта звірити кеш `.claude/pr-self-review/gates-receipt.json` за поточним фінгерпринтом; після реального прогону — перезаписати файл цілком.

- [ ] `node scripts/sync-shared.mjs --check` (repo root) — **перший**, бо B1 знецінює всі подальші типпомилки
- [ ] `cd server && pnpm typecheck`
- [ ] `cd client && pnpm typecheck`
- [ ] `cd reviewer-core && npm run typecheck`
- [ ] `cd server && pnpm arch:check`
- [ ] `cd server && pnpm arch:ratchet`
- [ ] `cd client && pnpm lint`
- [ ] `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- [ ] `cd server && pnpm exec vitest run .it.test` — обов'язковий, бо зачеплено `server/src/db/**` і додано `*.it.test.ts`; потребує Docker. Без Docker — `SKIPPED`, і ран вважається **неповним**, не зеленим
- [ ] `cd reviewer-core && npm test`
- [ ] `cd client && pnpm test`
- [ ] `cd server && pnpm db:migrate` — після A3, до будь-якого інтеграційного лейна

E2E-гейта (`./scripts/e2e.sh`) немає: пакет `e2e/` цим планом не зачіпається. Пакетні менеджери різні і це важливо: `server`/`client` — **pnpm 10**, `reviewer-core` — **npm**; виклик не того менеджера створює другий lockfile і сам є findings.

## Risks

- **AC-17 не покрито жодним автоматичним тестом** → свідоме рішення користувача: гіпотеза перевіряється вручну поза репозиторієм. Мітигація — обов'язкова згадка в тілі PR (крок F2), щоб зелений набір гейтів не читався як «специфікацію виконано повністю».
- **Крос-модульний доступ `reviews → context`** → йти через `container.projectContext`; сервіс приймає бандл портів, не `Container`, інакше контейнер, який його конструює, замикає цикл і `no-circular` (severity error) валить `arch:check`. Прецедент і механіка — `RepoIntelDeps`.
- **`client/src/vendor/ui/nav.ts` — do-not-touch B6** → правити виключно масиви `NAV`/`SHORTCUTS` під наявний carve-out у `routing.md`. Будь-яка інша правка цього файлу = CRITICAL і блокує PR.
- **Інтеграційний лейн без Docker** → `SKIPPED`, а не `PASS`; AC-8/9/18/21/23 залишаються неперевіреними. Це має бути явно записано у звіті пре-PR, не замовчано.
- **Модель доступу до вмісту документів** → `GET .../context/docs/content` віддає текст будь-якому запиту в межах воркспейсу; єдиний контроль — перевірка шляху за каталогом (AC-16). Прийнято: у системі один рівень доступу, всі бачать усе (підтверджено користувачем). Якщо колись з'явиться рольова модель, цей ендпоінт — перше місце, яке доведеться закрити.
- **Токен-оцінка на великому каталозі** → `TiktokenTokenizer` рахує весь текст кожного `.md`; на репозиторії з десятками документів каталог може відчутно просісти. Мітигація: рахувати рівно раз на запит каталогу і раз на ран, ніколи в циклі рендеру. Кешу немає — специфікація його не вимагає.
- **Дуже великий або порожній `.md`** → вставляється цілком / порожнім блоком без обрізання (AC-22, edge cases). Ризик вартості рану свідомо перекладено на видиму оцінку токенів у UI.
- **`specs_read` як рядок із «≈N tokens»** → клієнт не парсить цей рядок, лише показує; якщо колись знадобиться машинне читання, доведеться змінювати контракт. Прийнято за рішенням користувача.
- **Нові шляхи без правила в `routing.md`** → усі заплановані шляхи мають рядок у матриці; нових нерозмічених директорій план не створює.

## Open questions

- **Ліміти на наступну ітерацію.** Перша ітерація свідомо без серверних лімітів (AC-22). Якщо великий згенерований changelog у `.devdigest/docs/` реально роздує промпт, наступна ітерація потребуватиме або ліміту, або обрізання — це зміна прийнятного критерію специфікації, тобто рішення людини, а не наслідок цього плану. На виконання поточного плану **не впливає**; занотовано, щоб не було відкрито заново як «баг».

Решта питань закрито: режим виконання (multi-agent), формат `specs_read` (рядкове кодування), скоуп attachment для скіла (`(skill, repository)`), доля AC-17 (поза скоупом, вручну), «from skill X» (у скоупі), авторизація прев'ю (не потрібна).

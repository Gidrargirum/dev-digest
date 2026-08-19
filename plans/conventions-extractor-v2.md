# Development Plan — Conventions Extractor v2

Multi-skill · прив'язка до агентів · ширше семплювання · конвенції з git-історії ·
API Contract Reviewer до повного комплекту.

Статус: **затверджено** (2026-08-18) — усі чотири рішення нижче підтверджені
замовником. Крок 1 (калібрування) виконано до написання плану — його
результати вбудовані нижче.

## Scope

- Пакети: `server/`, `client/`, `e2e/` (лише регресія flow 09), `specs/`, `insights/`.
- Поза скоупом: `reviewer-core/`; CI-експорт, memory, multi-agent, cost badge
  (пізніші уроки за `CLAUDE.md`); `client/src/vendor/ui/**`; `docker compose down -v`.
- Verification gate НЕ переписуємо — спека вимагає його незнімності.

## Крок 0 — калібрування (ВИКОНАНО)

Скан `d988ec0d` на цьому ж репозиторії: `sample_files=12`, `candidates_raw=22`,
`candidates_kept=8`, `done`, без помилок. Гейт відсіяв 64% — працює.

| conf | support/viol | category | правило | вердикт |
|---|---|---|---|---|
| 1.00 | 382/0 | imports | named destructuring imports | шум, універсальне |
| 1.00 | 407/0 | naming | relative imports з `./` або `../` | шум + хибна категорія |
| 1.00 | 13/0 | naming | schema barrel re-exports з domain-підпапок | **цінне** |
| 1.00 | 15/0 | naming | `pgTable` camelCase = множинна таблиця | **цінне** |
| 1.00 | 500/0 | structure | client hooks починаються з `'use client'` | шум, support уперся в стелю |
| 0.92 | 71/6 | error-handling | async/await замість `.then()` | **цінне**, категорія мала б бути `async` |
| 0.62 | 24/15 | api | api-обʼєкт з `get`/`post`/`put` | слабке |
| 0.11 | 2/17 | api | помилки загорнуті в `ApiError` | відхилити |

Сигнал/шум ≈ 3/8. Діагноз причин:

1. **Семпл не репрезентативний.** 312 проіндексованих файлів → беремо 12 (3.8%).
   Топ-12 за pagerank — це `db/schema/*`, `constants.ts`, `styles.ts`, `api.ts`.
   Жодного route handler, сервісу, React-компонента, тесту (`isJunkPath` викидає
   тести взагалі). Evidence зібралась лише з 3 різних файлів.
   Розподіл індексу: `client/src` 172, `server/src` 95, `server/test` 24, решта — одиниці.
2. **`confidence` не розрізняє.** 5 із 8 = рівно 1.00. `support/(support+violations)`
   не карає тривіальність: універсальне правило дає 400/0 і виглядає найкращим.
3. **`support` насичується** на `MAX_GREP_MATCHES=500`.
4. **Категорії пливуть** — imports-правило потрапляє в `naming`.

**`findings` у БД: 8** (при 27 reviews). Замало для узагальнення в правила →
джерело «історія код-рев'ю» відкладається, git-історія лишається (крок 6).

## Constraints

- `@devdigest/shared` вендорено ДВОМА копіями; серверна канонічна,
  розповсюдження — `node scripts/sync-shared.mjs`, guard — `--check`.
- Спека `specs/conventions-extractor.md` зараз вимагає ОДИН merged скіл — крок 4
  її переписує. Без цього код і спека суперечать одне одному.
- `server/AGENTS.md`: зовнішній світ лише через порти контейнера; валідація через
  `schema.body`/`schema.params`; інтеграційний тест — `*.it.test.ts`; repo-intel
  деградує в `[]`, не кидає; `pnpm db:migrate` не виконується на бутi;
  `pnpm arch:check` — baseline-ратчет, дописувати відомі порушення заборонено.
- `client/AGENTS.md`: дані лише через `lib/hooks/*` → `lib/api.ts`; типи лише з
  `vendor/shared`; фіксований layout теки компонента; `pnpm lint --max-warnings 0`;
  `vendor/ui` не чіпати.
- `e2e/AGENTS.md`: flows не тригерять модель; flow 09 асертить рядки
  `Conventions in` / `No scan yet` / `Re-scan` — не перейменовувати.
- Перевірено в коді: `conventions.origin` — `text` без CHECK
  (`migrations/0012_*.sql:26`) → розширення enum НЕ потребує SQL-міграції.
- Перевірено в коді: `git.log(repo, path?)` і `git.diff(repo, base, head)` уже є
  в `GitClient` — крок 6 не потребує нового порту.
- `pnpm db:seed` ідемпотентний (insert лише коли `!existing`, лінки
  `onConflictDoNothing()`).

## Steps

### 1. Multi-skill: контракт + бекенд (адитивно, старі роути живі) — server/

Файли: `server/src/vendor/shared/contracts/knowledge.ts` → `sync-shared.mjs`;
`conventions/{helpers,service,routes,README.md}`;
`server/test/conventions-helpers.test.ts`, `server/test/conventions.it.test.ts`.

Скіли: `zod`, `onion-architecture`, `fastify-best-practices`, `typescript-expert`, `security`.

- Контракт: `category: ConventionCategory.nullable()` у `ConventionSkillDraft`
  (адитивно, старий singular-роут лишається валідним); `ConventionSkillDraftSet`;
  `ConventionSkillsResult`.
- `helpers.ts`: `skillNameFor(repoName, category?)` → `<repo>-<category>-conventions`
  (через наявний `slugify`), при `category == null` — старий `<repo>-conventions`;
  `buildSkillDrafts(repoName, accepted)` групує за `category`, сортує групи за
  спаданням максимальної `confidence`. `buildSkillMarkdown` перевикористати.
- `service.ts`: `skillDrafts(...)`, `createSkills(...)`. `createSkills` спершу
  резолвить ОБ'ЄДНАНИЙ набір `convention_ids` одним `listByIds` і відмовляє
  цілком, якщо резолвиться не все (вимога спеки). Прив'язка до агентів — один раз
  після створення всіх скілів, з перевіркою тенантності через `agentsRepo.getById`.
- `routes.ts`: `POST /repos/:id/conventions/skills/preview`, `POST /repos/:id/conventions/skills`
  → `201 { skills: [...] }`. Валідація виключно через `schema.body`.

Done when: `typecheck` + `arch:check` + обидва vitest-лейни зелені;
`sync-shared.mjs --check` мовчить; старі роути працюють без змін.

Tests:
- server-unit: групування — три категорії → три драфти з правильними іменами;
  одна категорія → один драфт; порожній вхід → `[]`; кожен драфт містить лише свої id.
- server-integration (`*.it.test.ts`, Docker): `POST …/skills` створює N скілів,
  усі конвенції штампуються `skill_id`, повторний скан їх не пропонує;
  частковий/чужий id → 404 і ЖОДНОГО створеного скіла.

### 2. Клієнт: модалка показує кілька драфтів — client/

Файли: `lib/hooks/conventions.ts`; `CreateSkillModal/{CreateSkillModal.tsx,helpers.ts,constants.ts,styles.ts,CreateSkillModal.test.tsx}`;
новий підкомпонент `CreateSkillModal/SkillDraftFields/` за фіксованим layout;
`client/messages/en/conventions.json`.

Скіли: `frontend-architecture`, `react-best-practices`, `react-testing-library`,
`typescript-expert`, `security`.

- Хуки: `useConventionSkillDrafts`, `useCreateConventionSkills`; в `onSuccess`
  інвалідувати `["conventions", repoId]` і `["skills"]`.
- Стан форми стає масивом драфтів; наявний прапорець `touched` зберігає захист
  від затирання правок фоновим рефетчем. `canSubmit` рахується під час рендеру,
  не копіюється в стан.
- Після успіху: один скіл → `router.push('/skills/<id>?tab=config')`; кілька →
  `/skills`. Помилка лишається в модалці (`role="alert"`).
- i18n: нові ключі додавати, наявні `No scan yet` / `Re-scan` / `Conventions in`
  НЕ перейменовувати (тримають e2e flow 09).

Done when: `typecheck` + `lint` + `test` зелені; на змішаному наборі видно N секцій;
створення виконує один POST на `…/skills`.

Tests: client vitest+RTL — потоковий тест (дві категорії → дві секції → правка body
другої → сабміт з двома елементами і відредагованим body) + стан помилки API.

### 3. Прив'язка до агентів із UI — client/

Файли: `CreateSkillModal/{CreateSkillModal.tsx,constants.ts,styles.ts,CreateSkillModal.test.tsx}`,
`client/messages/en/conventions.json`.

Скіли: `frontend-architecture`, `react-best-practices`, `react-testing-library`, `security`.

Мультиселект агентів на базі наявного `useAgents()`; вибрані id → `agent_ids`
єдиного POST з кроку 2 (бекенд це вже вміє). Компоненти зі `@devdigest/ui`, без
правок `vendor/ui`. Порожній вибір = поле не надсилається. Поки `useAgents`
вантажиться — `Skeleton`, сабміт не блокується.

Done when: гейти клієнта зелені; створений скіл видно на сторінці обраного агента
(перевірка вручну на піднятому стеку).

Tests: розширити happy-path кроку 2 — у тілі запиту присутній `agent_ids`.

### 4. Прибрати legacy singular-роути + оновити спеку — server/, specs/

Файли: `conventions/{routes,service,helpers}.ts`, обидві копії `knowledge.ts`,
`client/src/lib/hooks/conventions.ts`, `specs/conventions-extractor.md`,
`conventions/README.md`, `server/test/conventions.it.test.ts`.

Скіли: `onion-architecture`, `fastify-best-practices`, `zod`, `frontend-architecture`, `security`.

Видалити `POST …/conventions/skill{,/preview}`, `service.skillDraft`,
`helpers.buildSkillDraft`, мертві клієнтські хуки. У спеці переписати «Skill
assembly»: один merged скіл → по одному скілу на `category`. Незмінними лишаються
вимоги: тіло збирається детерміністично в коді (не моделлю); `type: 'convention'`,
`source: 'extracted'`; штамп `skill_id`; частковий набір відмовляється; цитується
ВІДРЕМОНТОВАНА `file:line`. В «Acceptance» додати: три кандидати двох категорій →
рівно два скіли, re-scan не пропонує жодного з трьох.

Done when: `rg 'conventions/skill\b'` порожній; усі гейти зелені; спека й код
не суперечать.

Tests: server-integration — оновити на нові шляхи; старий шлях → 404.

### 5. Стратифіковане семплювання замість плоского top-12 — server/

Файли: `repo-intel/{service.ts,types.ts,helpers,README.md}`,
`conventions/{constants.ts,service.ts}`, новий `server/test/repo-intel-strata.test.ts`.

Скіли: `onion-architecture`, `typescript-expert`, `security`.

- `getConventionSamples` перестає бути аліасом `getTopFilesByRank`: набирає файли
  ПО СТРАТАХ (директорія 1–2 рівня + роль файлу: `routes` / `service` /
  `repository` / `component` / `hook` / інше), беручи з кожної страти top-k за
  rank, доки не набереться `n`. Реалізація — чистий код над наявним
  `repo.getRankedPaths`; жодного модельного виклику при виборі файлів (вимога
  спеки), жодного нового I/O-порту.
- Сигнатуру порту розширити опційним `opts?: { strata?: number }`, деградація в `[]`.
- `SAMPLE_FILE_LIMIT` 12 → 24 з перерахунком бюджету: `EXTRACTION_BATCH_SIZE=4`
  → 6 батчів; батчі йдуть паралельно через `Promise.allSettled`, стеля =
  `EXTRACTION_TIMEOUT_MS` (45s) + `SELECTION_TIMEOUT_MS` (25s) < `SCAN_BUDGET_MS`
  (100s). `SCAN_BUDGET_MS` НЕ чіпати — він навмисне менший за 120s таймаут JobRunner'а.
- Функцію розбиття на страти винести в `repo-intel/helpers` і тестувати юнітом.

Done when: гейти зелені; повторний прогін на тому ж репо дає БІЛЬШЕ kept-кандидатів
і покриває ≥3 різні страти проти базової таблиці кроку 0; друге вимірювання
дописане у scratchpad і, за наявності висновку, — в `server/insights/INSIGHTS.md`.

Tests: server-unit — 100 шляхів у 5 директоріях, `n=24` → представлені всі 5 страт,
junk відфільтровано, `n<=0` → `[]`, вимкнений `repoIntelEnabled` → `[]`.

### 6. Конвенції з git-історії: новий `origin: 'history'` — server/ (+ обидві копії shared)

Файли: обидві копії `knowledge.ts`, `server/src/db/schema/knowledge.ts`,
`conventions/{service,helpers,constants,README.md}`, `specs/conventions-extractor.md`,
`server/test/conventions-helpers.test.ts`, `server/test/conventions.it.test.ts`.

Скіли: `zod`, `onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`,
`typescript-expert`, `security`.

- `ConventionOrigin` → `['config', 'model', 'history']` в обох копіях + TS-enum
  колонки. Міграція НЕ очікується (колонка — `text` без CHECK); implementer
  зобов'язаний це підтвердити через `pnpm db:generate` і, якщо файл усе ж
  згенеровано, застосувати `pnpm db:migrate` без ручних правок SQL.
- Джерело: приватний крок у `runExtract` — `container.git.log(repoRef)` бере
  останні `HISTORY_COMMIT_LIMIT` (орієнтир 200) комітів, для файлів зі
  стратифікованої вибірки рахує повторювані патерни в дифах через
  `container.git.diff`. Модель викликається ЛИШЕ для формулювання правила з уже
  зібраних дифів; вибір, які дифи дивитись, лишається чистим кодом.
- Кандидати `history` проходять ТОЙ САМИЙ gate: evidence у клоні,
  whitespace-insensitive multiline match із ремонтом рядка, виміряна confidence
  через ripgrep, `MIN_SUPPORT`, `ruleHash`-dedup, `capPerCategory`, `isSafePattern`
  / `isSafeRepoPath`.
- Бюджет: виконується ПІСЛЯ модельного і лише якщо `!outOfTime()`; окремий
  `HISTORY_TIMEOUT_MS`; провал джерела не валить скан; кожен drop логується в run bus.

Done when: гейти + `sync-shared --check` зелені; на реальному прогоні з'являються
кандидати з `origin: 'history'`, і жоден не має confidence, отриманої інакше ніж
вимірюванням; спека описує третій origin.

Tests:
- server-unit: витяг патернів з набору дифів (повторюваний у ≥2 комітах проходить,
  одиничний відсікається); `ConventionOrigin` приймає `'history'`, відхиляє невідоме.
- server-integration (Docker): скан із підставленим mock-`git` через
  `ContainerOverrides` (не мок модулів) записує кандидата `origin: 'history'`, він
  виживає gate; при кинутому `git.log` скан усе одно завершується `done`.

### 7. API Contract Reviewer до повного комплекту — server/

Файли: `server/src/db/seed-skills.ts`, `server/src/db/seed.ts`, новий
`server/test/seed-skills.test.ts`.

Скіли: `onion-architecture`, `drizzle-orm-patterns`, `security`.

- Перенести тіла з `.claude/skills/api-contract-{response-schema,semver-discipline,deprecation-policy}/SKILL.md`
  у `seed-skills.ts`. Копіювати ТІЛЬКИ текст під рядком-маркером
  `> Body below this line pastes directly into DevDigest → …`; YAML-frontmatter і
  сам маркер у продуктове тіло не потрапляють.
- Три записи в `SEED_SKILLS` (`type: 'custom'`, `source: 'manual'`, `enabled: true`).
- Три лінки в `agentSkillLinks`: `API Contract Reviewer` × нові скіли, `order: 2,3,4`
  (0 і 1 зайняті `api-contract-breaking-change` і `pr-quality-rubric`).
- `cd server && pnpm db:seed` на живій БД (ідемпотентний).
- Перевірка доїзду в промпт: прогнати агента на реальному PR з API-змінами →
  `GET /runs/:id/trace` → `prompt_assembly.skills` містить усі п'ять тіл.

Done when: `db:seed` проходить; у Skills Lab п'ять скілів у агента;
`prompt_assembly.skills` містить фрагменти всіх трьох нових тіл; `typecheck` зелений.

Tests: server-unit (Docker не потрібен) — `SEED_SKILLS` містить чотири
`api-contract-*` записи, всі `body` непорожні і не містять `---` чи
`pastes directly`; кожен `agentSkillLinks` посилається на існуюче ім'я.

## Verification gates

- [ ] cd server && pnpm typecheck
- [ ] cd server && pnpm arch:check
- [ ] cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'
- [ ] cd server && pnpm exec vitest run .it.test            (потрібен Docker)
- [ ] cd server && pnpm db:generate — має не породити файлу (крок 6)
- [ ] cd server && pnpm db:seed                              (крок 7)
- [ ] cd client && pnpm typecheck && pnpm lint && pnpm test
- [ ] node scripts/sync-shared.mjs --check                   (кроки 1, 4, 6)
- [ ] ./scripts/e2e.sh                                       (після кроків 2–4)
- [ ] cd e2e && pnpm typecheck

## Risks

- **Розсинхрон двох копій `vendor/shared`** — ловиться лише guard'ом. → Редагувати
  серверну копію, одразу ганяти `sync-shared.mjs`, `--check` у чек-листі кроків 1, 4, 6.
- **Ламання e2e flow 09 через i18n** — flow асертить рендерені рядки. → Нові ключі
  додавати, наявні не перейменовувати; після кроку 3 прогнати `./scripts/e2e.sh`.
- **`client/messages/en/conventions.json` не покривається routing-матрицею** —
  зміни в i18n не перевіряються жодним скілом. → Прийнято; страховка — RTL-тести
  через `getByRole`/`getByText` і e2e flow 09.
- **Бюджет скану на ширшій вибірці (крок 5)** — перевищення повертає UI до вічного
  `running`. → Ліміт піднімати лише разом із перерахунком батчів; `SCAN_BUDGET_MS` не чіпати.
- **Вартість прогонів** — кроки 5, 6, 7 роблять реальні платні виклики. → По одному
  прогону, результати зберігати.
- **`git log`/`git diff` на великому репо (крок 6)** — сотні комітів × дифи з'їдять
  бюджет. → Жорсткий `HISTORY_COMMIT_LIMIT`, окремий таймаут, запуск лише після
  `!outOfTime()`, провал не валить скан.
- **Дублі `history` × `model`** — `ruleHash` працює на нормалізованому тексті, два
  джерела сформулюють ту саму думку по-різному. → Прийнято; `MAX_CANDIDATES_PER_CATEGORY=3`
  і сортування за виміряною confidence обмежують шум.
- **Крок 4 видаляє публічні роути** — справжня ламка контракту, але споживач один і
  він у цьому ж репо. → Прийнято за умови, що крок 4 йде строго після кроків 2–3.

## Рішення по відкритих питаннях — ЗАТВЕРДЖЕНО

1. **Findings як джерело.** У БД 8 findings при 27 reviews → замало.
   **ЗАТВЕРДЖЕНО: не реалізовувати**, лишити git-історію (крок 6). Переглянути, коли
   findings накопичаться до сотень.
2. **Стеля кількості скілів на репо.** `<repo>-<category>-conventions` дає до 9
   скілів. **ЗАТВЕРДЖЕНО: категорія отримує власний скіл лише при ≥2
   accepted-кандидатах, решта зливається у `<repo>-conventions`** (загальний). Впливає на `buildSkillDrafts`
   (крок 1) і на текст спеки (крок 4).
3. **`SAMPLE_FILE_LIMIT`.** **ЗАТВЕРДЖЕНО: 24**, з перерахунком батчів.
4. **CHECK-констрейнт на `origin`.** **ЗАТВЕРДЖЕНО: лишити як є** (`text` без CHECK),
   обмеження живе в TS — інакше кожен новий origin коштує міграції.

## Що НЕ входить у план, але варто обговорити окремо

Калібрування показало, що головна вада — не гейт, а **метрика**: `confidence`
1.00 у тривіального правила і 1.00 у цінного. Кандидати на наступну ітерацію:
- **specificity score** — правило, підтверджене лише репо-специфічними
  ідентифікаторами (`pgTable`, `ApiError`, власні типи), важить більше за правило
  з ключових слів мови;
- **нормалізований support** — частка ФАЙЛІВ, де правило виконується, замість
  абсолютних grep-хітів (усуває насичення на `MAX_GREP_MATCHES`);
- **автокорекція категорії** кодом за формою правила (imports-правило не має
  лишатись у `naming`).

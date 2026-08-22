# Development Plan — Intent Layer

> **Статус:** затверджений план, не реалізований. Самодостатній документ —
> розрахований на передачу в нову сесію без попереднього контексту.
> **Дата складання:** 2026-08-18 · **Гілка на момент планування:** `feat/custom-subagents`

---

## 0. Про що фіча

Перед основним код-рев'ю окремий LLM-виклик визначає **мотивацію** pull request'а
і зберігає структурований intent: одне речення наміру, `in_scope[]`,
`out_of_scope[]`, `risk_areas[]`, `confidence`, перелік використаних джерел.
Intent передається в промпт рев'ю разом з дифом і показується карткою INTENT на
вкладці Overview.

**Макет картки:** курсивна цитата наміру → дві колонки `✓ IN SCOPE` /
`✗ OUT OF SCOPE` зі списками → знизу секція `⚠ RISK AREAS` чипами → бейдж
confidence.

### Фіча НЕ greenfield

У репозиторії вже є часткові скафолди саме під неї — це критично для розуміння
обсягу робіт:

| Що вже є | Де | Чого бракує |
|---|---|---|
| Слот `review_intent` у `FeatureModelId` | `server/src/vendor/shared/contracts/platform.ts:15-21` | — |
| Реєстровий запис із дефолтом `openai/gpt-4.1` | `platform.ts:52-58` | дефолт треба **прибрати** (див. рішення №4) |
| Контракт `Intent { intent, in_scope[], out_of_scope[] }` | `contracts/brief.ts:8-14` | немає `confidence`, `risk_areas`, `sources` |
| `PrIntentRecord = Intent.extend({ pr_id })` | `contracts/review-api.ts:59-61` | немає `head_sha`, `computed_at` |
| Таблиця `prIntent` (PK по `prId`) | `server/src/db/schema/reviews.ts:48-55` | немає 4 колонок |
| `INJECTION_GUARD` уже перелічує "derived intent/scope" | `reviewer-core/src/prompt.ts:16-28` | **не чіпати** |
| Docstring «Loads the diff + intent once» | `server/src/modules/reviews/run-executor.ts:39,63` | самого виклику intent немає |

**Найближчий шаблон для копіювання** — модуль `server/src/modules/conventions/`:
`service.ts:473-484` (`resolveModel` через `FEATURE_MODELS.find`),
`service.ts:528-614` (дешевий LLM-виклик зі своїми Zod-схемами),
`routes.ts:55-176` (набір роутів модуля).

---

## 1. Затверджені рішення (не переглядати без користувача)

| # | Рішення | Наслідок |
|---|---|---|
| 1 | **Джерела:** тільки PR (title, body, branch, змінені файли) + GitHub issues, на які лінкує PR | Jira/YouTrack/Linear — поза скоупом |
| 2 | **Тригер:** на старті review run, кеш за `(pr_id, head_sha)` | окремого POST-роуту для перерахунку немає |
| 3 | **Вплив:** intent іде в prompt builder **лише як контекст** | ніякої категорії findings `scope-creep`, ніякого впливу на `score`/`verdict` |
| 4 | **Модель:** за замовчуванням успадковує модель рев'ю; у Settings є явний dropdown для слоту `review_intent` | захардкоджений `openai/gpt-4.1` замінюється на `inheritsFrom: 'review_agent'` |
| 5 | **Крок 9 (in-repo spec/plan файли): НЕ вмикати.** Код пишеться за флагом `INTENT_READ_PLAN_FILES`, дефолт `false` | рівень `high` досяжний через лінкований issue; менша поверхня path traversal |
| 6 | **Крос-репо issues `owner/repo#123`:** розпізнавати, але **пропускати** | у `sources[]` лишається мітка `owner/repo#123 (skipped)`; токен може не мати доступу до чужого репо |

### Поза скоупом

`e2e/` (e2e-стек іде без ключа моделі — intent там ніколи не обчислиться);
зовнішні трекери; PR BRIEF та BLAST RADIUS із макета (їх у стартер-шаблоні
немає — це пізніші уроки, `CLAUDE.md`: «не будувати преемптивно»);
зміна `resolveLinkedIssue` в `server/src/adapters/github/octokit.ts:126`
(він живить `PrDetail.linked_issue`, і його зміна була б зміною публічного
контракту без потреби).

---

## 2. Джерела даних

Збираються **тільки** з того, що вже є в системі. Кожне джерело деградує окремо.

| Джерело | Звідки | Деградація |
|---|---|---|
| `title` | `pullRequests.title` (`server/src/db/schema/pulls.ts:16`) | завжди присутній (`notNull`) |
| `body` | `pullRequests.body`, пишеться в `modules/pulls/routes.ts:273` | `null` → блок опису не додається в intent-промпт |
| назва гілки | `pullRequests.branch` (`pulls.ts:18`) | завжди присутня |
| список змінених файлів | вже завантажений `UnifiedDiff` із `loadDiff` (`run-executor.ts:~98`) — **не** новий виклик GitHub | падіння diff валить весь run ще до intent (наявна поведінка `failAll`) |
| лінковані GitHub issues | номери парсяться з `body` новим чистим хелпером; тіло — `container.github().getIssue(repo, n)` (порт `vendor/shared/adapters.ts:164`) | try/catch **на кожен issue** — один впав, решта працює |
| *(крок 9, вимкнено)* in-repo spec/plan файл | `container.git.readFile` (`adapters.ts:226`) | флаг `false` за замовчуванням |

### Rubric для `confidence` — визначає КОД, не модель

Самозаявлена впевненість LLM емпірично погано калібрується, тому модель
`confidence` **не повертає взагалі**:

- лише `title` + гілка + список файлів → `low`
- додатково непорожній `body` → `medium`
- додатково хоча б один успішно прочитаний issue *(або spec-файл, коли крок 9 увімкнено)* → `high`

`sources[]` — фактичний перелік того, що потрапило в промпт:
`"pr_title"`, `"pr_branch"`, `"pr_files"`, `"pr_body"`, `"issue#123"`,
`"owner/repo#45 (skipped)"`, `"spec:specs/foo.md"`.

**Інваріант:** `confidence` мусить бути обчислюваним із `sources` і нічого
більше. Це і є захист від ін'єкції — текст у body не може підняти собі довіру.

Усі зібрані тексти — **untrusted**: ідуть у промпт intent-виклику через
`wrapUntrusted` (`reviewer-core/src/prompt.ts:30`), як `prDescription`.

---

## 3. Послідовність викликів

```
POST /pulls/:id/review
  └─ ReviewService → ReviewRunExecutor.executeRuns(workspaceId, pull, repo, jobs)
       1. loadDiff (існує, ~run-executor.ts:98)            ← падіння = failAll (без змін)
       2. NEW: intent = await resolveIntent(...)           ← ОДИН раз на набір runs
            a. repo.findIntent(pull.id)
                 └─ рядок є && row.headSha === pull.headSha → CACHE HIT, LLM не викликається
            b. CACHE MISS:
                 - зібрати джерела (розділ 2)
                 - модель: getFeatureModelOverride(container, ws, 'review_intent')
                            ?? { provider: jobs[0].agent.provider, model: jobs[0].agent.model }
                 - llm = await container.llm(provider)
                 - llm.completeStructured({ schema: IntentLlmSchema, temperature: 0, timeoutMs })
                 - confidence = rubric(sources)   ← код, не модель
                 - repo.upsertIntent({ prId, headSha, ... })
            c. БУДЬ-ЯКА помилка на кроці (b) → catch:
                 runLog.warn("Intent step failed: …"); intent = undefined;
                 РЕВ'Ю ПРОДОВЖУЄТЬСЯ. Нічого не персиститься, кеш не отруюється.
       3. for (const { agent, runId } of jobs)              ← існуючий цикл
            reviewPullRequest({ …, ...(intentBlock ? { intent: intentBlock } : {}) })
```

- **Кеш-ключ** — `(pr_id, head_sha)`. PK таблиці — `pr_id`, тому новий SHA
  перезаписує рядок (`onConflictDoUpdate`); історія intent'ів не зберігається
  (свідомо).
- **Fallback:** intent ніколи не є блокуючою залежністю. Єдиний шлях, яким він
  впливає на рев'ю при збої — його немає: вимкнена секція промпту, точно як
  `callers`/`repoMap` (`reviewer-core/AGENTS.md`: «An optional prompt slot that
  isn't passed simply isn't rendered»).
- GitHub-виклики обгорнуті try/catch **на кожен issue** — за конвенцією
  `server/AGENTS.md`: «wrap prompt enrichment in try/catch and simply omit the
  section».

---

## 4. Зміни схеми БД

Наявна `prIntent` (`server/src/db/schema/reviews.ts:48-55`) покриває лише
`intent`, `in_scope`, `out_of_scope`. Додаються 4 колонки + `computed_at`:

```ts
export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id').primaryKey().references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope:    jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  // NEW:
  riskAreas:  jsonb('risk_areas').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  sources:    jsonb('sources').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  confidence: text('confidence').notNull().default('low'),   // 'low' | 'medium' | 'high'
  headSha:    text('head_sha').notNull().default(''),        // ключ кешу
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Обґрунтування:

- `confidence` — `text` + валідація Zod на межі, **не** PG enum: набір значень
  продуктовий і може змінитись.
- **Без `CHECK`-констрейнта:** drizzle-kit його не згенерує сам, а рукописна
  міграція в цьому репо = review finding. Валідація лишається на Zod.
- Індексів не додаємо — доступ завжди по PK.
- `headSha` з `default('')` — щоб міграція не переписувала таблицю, а старі
  (порожні) рядки автоматично рахувались як cache miss.
- Міграція **генерується**: `cd server && pnpm db:generate`, потім
  `pnpm db:migrate`. Файл руками не редагується.

> ⚠️ `server/insights/INSIGHTS.md` (2026-08-13): `pnpm db:generate` стає
> інтерактивним, коли таблиця в одній генерації і набуває, і втрачає колонки.
> Тут лише додавання — має пройти без промптів. Якщо drizzle-kit спитає
> «created or renamed» — це сигнал, що в тій самій генерації зачепили щось ще;
> розділити на два проходи.

---

## 5. Зміни контрактів і API

> **Обидві vendor-копії редагуються як одна дія.** Канонічна —
> `server/src/vendor/shared/**` (так каже заголовок `scripts/sync-shared.mjs`).
> Далі `node scripts/sync-shared.mjs` копіює в клієнт; `--check` — це CI-гейт
> (`TESTING.md`, suite `guards`). **Ручне редагування клієнтської копії
> заборонено.**

1. `contracts/brief.ts:8-14` — розширити `Intent` **лише полями з `.default()`**,
   щоб уже наявний `PrBrief` продовжував парситись:

   ```ts
   export const IntentConfidence = z.enum(['low', 'medium', 'high']);
   export const Intent = z.object({
     intent: z.string(),
     in_scope: z.array(z.string()),
     out_of_scope: z.array(z.string()),
     risk_areas: z.array(z.string()).default([]),
     confidence: IntentConfidence.default('low'),
     sources: z.array(z.string()).default([]),
   });
   ```

2. `contracts/review-api.ts:59-61` —
   `PrIntentRecord = Intent.extend({ pr_id, head_sha, computed_at })`;
   новий `PrIntentResponse = z.object({ intent: PrIntentRecord.nullable() })`.

3. `contracts/trace.ts:39-53` — додати в `PromptAssembly` слот
   `intent: z.string().nullish()` (патерн «null коли відсутнє», як `callers`,
   `repo_map`, `pr_description`).

4. `contracts/platform.ts:52-58` — прибрати захардкоджений `openai/gpt-4.1`:
   - у `FeatureModelDef` зробити `defaultProvider?`/`defaultModel?` опційними,
     додати `inheritsFrom?: 'review_agent'`;
   - запис `review_intent`: `{ id, label, description, inheritsFrom: 'review_agent' }`.

5. `server/src/modules/settings/feature-models.ts:21-57` — `DEFAULTS` будується
   лише з записів, що мають обидва поля
   (`Partial<Record<FeatureModelId, FeatureModelChoice>>`); `defaultFeatureModel(id)`
   і `resolveFeatureModel(...)` повертають `FeatureModelChoice | undefined`.

   > Це безпечно: поза самим файлом ці функції зараз **не мають жодного
   > споживача** (перевірено grep'ом) — intent-сервіс буде першим. Він викликає
   > `getFeatureModelOverride(...) ?? { provider: agent.provider, model: agent.model }`
   > — рівно той сценарій, який описує докстрінг «Callers that keep their own
   > dynamic default use this directly».

### Новий роут

```
GET /pulls/:id/intent  →  200 PrIntentResponse   // { intent: null } коли не обчислено
```

- Валідація через `schema.params: IdParams`, **не** `.parse()` у хендлері
  (`server/AGENTS.md`).
- `{ intent: null }` замість 404 — щоб клієнтський `apiFetch` не нормалізував
  «ще не рахували» в `ApiError`.
- POST-роуту для ручного перерахунку **немає** (рішення №2).

---

## 6. Prompt builder (reviewer-core)

- `reviewer-core/src/review/run.ts:44-93` — в `ReviewInput` додати
  `intent?: string` — **резольвлений рядок**, не id і не об'єкт
  (`reviewer-core/AGENTS.md`: «Inputs are resolved strings»). Серіалізацію
  intent'а в текст робить сервер (`renderIntentForPrompt`).
- `reviewer-core/src/prompt.ts:39-73` — в `PromptParts` додати `intent?: string`;
  у `assemblePrompt` секція рендериться **лише** коли непорожня:

  ```ts
  if (parts.intent && parts.intent.trim().length > 0) {
    userSections.push(`## Derived PR intent\n${wrapUntrusted('intent', parts.intent)}`);
  }
  ```

  Позиція — одразу після `## PR description` і перед `## Skills / rules`.
- `assembly.intent = parts.intent ?? null`.

### Гарантія байт-ідентичності (контракт пакета)

Коли `intent` не передано: `userSections` не змінюється, `system` не
змінюється → `messages` і `user` байт-у-байт ті самі. Перевіряється тестом
(крок 3).

> **`INJECTION_GUARD` не чіпати взагалі** — він уже перелічує "derived
> intent/scope" як untrusted-категорію (`prompt.ts:16-28`), і
> `reviewer-core/AGENTS.md` має його в «Do not touch».
> Жодних regex/denylist над intent-текстом — заборонено конвенцією пакета.

---

## 7. UI

### Картка INTENT (Overview)

Зараз `OverviewTab.tsx:11-22` рендерить лише `prBody`; `page.tsx:137` передає
`prBody={pr.body}`.

- Новий хук `usePrIntent(prId)` у `client/src/lib/hooks/reviews.ts` — єдиний
  дозволений шлях до даних (`lib/hooks/*` → `lib/api.ts`, `client/AGENTS.md`).
- Новий компонент `OverviewTab/_components/IntentCard/` за фіксованим лейаутом:
  `IntentCard.tsx` · `styles.ts` · `index.ts` · `IntentCard.test.tsx`.
- Вміст: курсивна цитата `intent`; дві колонки `✓ IN SCOPE` / `✗ OUT OF SCOPE`;
  знизу `⚠ RISK AREAS` чипами; бейдж `confidence`.
- `intent === null` → картка **не рендериться взагалі** (порожній стан =
  відсутність картки, як `prBody &&` вище). Порожній `risk_areas` → секція не
  рендериться.
- Стилі — у сусідньому `styles.ts`, не інлайн. Примітиви — з `@devdigest/ui`;
  **`client/src/vendor/ui/**` не редагувати** (`client/AGENTS.md` «Do not touch»);
  потрібна варіація — робимо у власному компоненті.
- Рядки — через `next-intl`, у `client/messages/<locale>/`.

> **Про макет:** «ліворуч від BLAST RADIUS, під PR BRIEF» реалізуємо як
> **одну секцію Overview над описом** — PR BRIEF і BLAST RADIUS у стартер-шаблоні
> відсутні (пізніші уроки). Двоколонковий грід **усередині** картки (IN/OUT
> SCOPE) робимо; двоколонковий грід сторінки — ні.

### Settings

`SettingsModels.tsx` **уже автоматично** рендерить дропдаун для кожного запису
`FEATURE_MODELS`, тобто для `review_intent` він уже є. Робота — в дефолтному стані:

- `client/src/lib/feature-models.ts:1-49` — оновити запис `review_intent`: без
  `defaultProvider`/`defaultModel`, з `inheritsFrom: "review_agent"`.
- `SettingsModels.tsx`: `const current = chosen[f.id]?.model ?? f.defaultModel`
  ламається на `undefined`. Для записів з `inheritsFrom` показувати плейсхолдер
  «Inherit from review agent» замість `usingDefault`; вибір моделі — як зараз.

> ⚠️ Клієнтський реєстр — **окрема копія**, не імпорт із `vendor/shared` (webpack
> не резолвить `vendor/shared/index.ts`). Дефолти для `conventions` **уже
> розійшлися** (`openrouter/deepseek-v4-flash` на сервері vs `openai/gpt-5.4` на
> клієнті). Це відомий баг — **не виправляємо в цьому PR** (поза скоупом), але й
> не повторюємо для `review_intent`.

---

## 8. Логування, observability, вартість

**Live log.** Intent-крок іде через наявний фан-аут `RunLogger`
(`run-executor.ts:60-66`), який пише в буфер **кожного** queued run — тобто крок
видно в усіх агентських логах, як і `Loading PR diff`:

- `runLog.step('Deriving PR intent', …, { kind: 'tool' })`
- кеш-хіт → `runLog.info('Intent reused from cache (head <sha7>)')`, без LLM
- помилка → `runLog.warn(...)`, run іде далі

**Trace.** `prompt_assembly.intent` — той самий рядок, що пішов у промпт (або
`null`). Плюс один запис у `tool_calls` для **кожного** run:
`{ tool: 'intent', args: '<provider>/<model>', meta: 'computed' | 'cached' | 'failed', ms }`
— щоб із трейсу будь-якого агента було видно, що сталося.

**Вартість — явне рішення (не подвоювати і не губити).** Intent рахується один
раз на набір runs, а `RunStats` — на run. Правило:

> `tokensIn`/`tokensOut`/`costUsd` intent-виклику додаються до `completeAgentRun`
> **лише першого job'а** (`jobs[0].runId`) і **лише при cache miss**. Кеш-хіт і
> решта агентів отримують нуль.

`estimateCost` повертає `null` для невідомого slug
(`server/src/adapters/llm/pricing.ts:10-35`) — тоді до `costUsd` нічого не
додається, а в `tool_calls.meta` пишемо `cost:unknown`, щоб втрата була
**видима, а не мовчазна**.

Ніяких секретів у логах; тіла issue та `body` у лог не пишемо — лише кількість
джерел і їх мітки.

---

## 9. Constraints (звідки взято)

- `CLAUDE.md` — стартер-шаблон, «missing» фіча = пізніший урок → PR BRIEF /
  BLAST RADIUS / cost badge не добудовуємо.
- `CLAUDE.md` + `server/AGENTS.md` — `@devdigest/shared` вендорено двома копіями;
  редагуємо серверну, синхронізуємо скриптом.
- `server/AGENTS.md` — новий модуль = папка `modules/<name>/` + один імпорт у
  `modules/index.ts`; автолоадингу немає.
- `server/AGENTS.md` — зовнішній світ лише через порт контейнера; у тестах
  підміна через `ContainerOverrides`.
- `server/AGENTS.md` — валідація схемою роуту, не `.parse()` у хендлері.
- `server/AGENTS.md` / `TESTING.md` — інтеграційний тест мусить називатись
  `*.it.test.ts`, інакше мовчки піде в unit-лейн.
- `server/AGENTS.md` — `pnpm db:migrate` не виконується на бут.
- `.dependency-cruiser.cjs:99,107` — модуль не може імпортувати інший модуль
  (крім `_shared`/`platform`); `platform/container.ts` виведений з-під правила як
  композиційний корінь → крос-модульний доступ до `IntentService` іде **через
  контейнер**.
- `server/insights/INSIGHTS.md` — «service takes `Container`» ≠ цикл; цикл
  виникає, коли контейнер ще й конструює сервіс. Оскільки контейнер
  конструюватиме `IntentService`, той **мусить** приймати явний bundle портів
  (`IntentDeps`), як `RepoIntelDeps` (`modules/repo-intel/types.ts:151`), а не
  `Container`.
- `server/insights/INSIGHTS.md` — `MockGitClient.readFile` повертає `''` для
  невідомого шляху, а не кидає.
- `reviewer-core/AGENTS.md` — нуль I/O; входи — резольвлені рядки; невідданий
  опційний слот не рендериться (контракт); `INJECTION_GUARD` не чіпати; порядок
  кроків у `run.ts` не міняти.
- `client/AGENTS.md` — дані лише через `lib/hooks/*` → `lib/api.ts`; фіксований
  лейаут папки компонента; типи відповіді з `vendor/shared`; `vendor/ui` не
  редагувати.
- `client/insights/INSIGHTS.md` — `@testing-library/user-event` **не** є
  залежністю клієнта; інтеракції драйвити `fireEvent`.
- `TESTING.md` — типологічне покриття, не рядкове; гейт `guards` ловить дрейф
  vendor-копій.
- `specs/README.md` — приймальні критерії фічі уроку належать у `specs/`.

---

## 10. Скіли, які implementer має викликати

Прогноз за `.claude/skills/pr-self-review/routing.md`. Після реалізації
implementer перемарштрутизовує реально змінені шляхи (`git status --porcelain`)
і повідомляє розбіжності.

| Файли | Скіли |
|---|---|
| `server/src/vendor/shared/contracts/{brief,review-api,trace,platform}.ts` + дзеркала | `zod`, `typescript-expert`, `security` |
| `server/src/db/schema/reviews.ts` | `postgresql-table-design`, `drizzle-orm-patterns`, `security` |
| `server/src/db/migrations/**` (згенеровані) | — (перелічити у звіті, не рев'ювити) |
| `server/src/modules/intent/routes.ts` | `onion-architecture`, `fastify-best-practices`, `typescript-expert`, `security` |
| `server/src/modules/intent/service.ts` | `onion-architecture`, `typescript-expert`, `security` |
| `server/src/modules/intent/repository.ts` | `onion-architecture`, `drizzle-orm-patterns`, `security` |
| `server/src/modules/intent/{types,helpers,constants}.ts` | `typescript-expert`, `security` |
| `server/src/platform/container.ts` | `onion-architecture`, `typescript-expert`, `security` |
| `server/src/modules/index.ts` | `security` (див. Ризики) |
| `server/src/modules/reviews/run-executor.ts` | `security`, `typescript-expert` + **вручну `onion-architecture`** (див. Ризики) |
| `server/src/modules/settings/feature-models.ts` | `security`, `typescript-expert` (див. Ризики) |
| `reviewer-core/src/{prompt.ts,review/run.ts,index.ts}` | `onion-architecture`, `typescript-expert`, `security` |
| `reviewer-core/**/*.test.ts`, `server/**/*.test.ts` | правила **B5**, **B9** |
| `client/.../OverviewTab/**` (в т.ч. `IntentCard/**`) | `frontend-architecture`, `react-best-practices`, `security` |
| `client/.../pulls/[number]/page.tsx` | `frontend-architecture`, `next-best-practices`, `react-best-practices`, `security` |
| `client/src/lib/hooks/reviews.ts` | `frontend-architecture`, `react-best-practices`, `security` |
| `client/.../SettingsModels/SettingsModels.tsx` | `frontend-architecture`, `react-best-practices`, `security` |
| `client/src/lib/feature-models.ts` | `security`, `typescript-expert` (див. Ризики) |
| `client/**/*.test.tsx` | `react-testing-library` |
| `client/messages/<locale>/*.json`, `specs/pr-intent-layer.md` | — |

---

## 11. Кроки реалізації

### Крок 1 — Контракти в обох vendor-копіях · `server/` + `client/`

- **Файли:** `server/src/vendor/shared/contracts/{brief,review-api,trace,platform}.ts` (edit);
  `client/src/vendor/shared/**` — **не редагувати руками**, отримати через
  `node scripts/sync-shared.mjs`.
- **Скіли:** `zod`, `typescript-expert`, `security`.
- **Що зробити:** пункти 1–4 розділу 5. Нові поля `Intent` — тільки з
  `.default()`. Експортувати `IntentConfidence`, `PrIntentResponse` з
  `contracts/index` там, де експортуються сусіди.
- **Done when:** `cd server && pnpm typecheck` і `cd client && pnpm typecheck`
  зелені; `node scripts/sync-shared.mjs --check` виходить з 0.
- **Тести:** окремих немає — контракти покриваються типами + гейтом `guards`.

### Крок 2 — Схема БД + міграція · `server/`

- **Файли:** `server/src/db/schema/reviews.ts` (edit);
  `server/src/db/migrations/00NN_*.sql` + `meta/**` (generated).
- **Скіли:** `postgresql-table-design`, `drizzle-orm-patterns`, `security`.
- **Що зробити:** додати колонки з розділу 4. Далі `cd server && pnpm db:generate`,
  потім `pnpm db:migrate`. Згенерований SQL **не редагувати**.
- **Done when:** міграція застосована; `pnpm typecheck` зелений; `git diff` по
  `migrations/` містить лише згенерований файл зі `--> statement-breakpoint` і
  оновлений снапшот.
- **Тести:** покривається інтеграційним тестом кроку 6.

### Крок 3 — Слот `intent` у reviewer-core · `reviewer-core/`

- **Файли:** `src/prompt.ts` (edit), `src/review/run.ts` (edit), `src/index.ts`
  (edit, якщо типи реекспортуються), `src/prompt.test.ts` (edit/new).
- **Скіли:** `onion-architecture`, `typescript-expert`, `security`.
- **Що зробити:** розділ 6. `INJECTION_GUARD` і порядок кроків не чіпати.
- **Done when:** `cd reviewer-core && pnpm typecheck && npm test` зелені.
- **Тести (лейн: reviewer-core unit):** два тести в `prompt.test.ts` —
  (a) **байт-ідентичність:** `assemblePrompt(parts)` без `intent` дає рівно ті
  самі `messages[0].content` і `messages[1].content`, що й виклик без нового поля
  (порівнювати з результатом виклику, **не** зі снапшотом);
  (b) з `intent` — секція присутня, обгорнута `<untrusted source="intent">`,
  стоїть після `## PR description` і перед `## Skills / rules`,
  `assembly.intent` дорівнює вхідному рядку.

### Крок 4 — Модуль `intent` на сервері · `server/`

- **Файли (усі new, крім двох останніх):** `modules/intent/types.ts`,
  `constants.ts`, `helpers.ts`, `repository.ts`, `service.ts`, `routes.ts`,
  `README.md`; `platform/container.ts` (edit), `modules/index.ts` (edit).
- **Скіли:** `onion-architecture`, `fastify-best-practices`,
  `drizzle-orm-patterns`, `zod`, `typescript-expert`, `security`.
- **Що зробити:**
  - `types.ts` — `IntentPort` (`resolveForRun(...)`, `get(prId)`) та `IntentDeps`
    (явні порти: репозиторій, `github`, `llm`-фабрика, читач `settings`).
    **Без `Container`** — інакше контейнер, який конструює сервіс, замикає цикл.
  - `helpers.ts` — чистий
    `parseLinkedIssueRefs(body): { owner?, repo?, number }[]`: усі 9 GitHub
    closing-keywords (`close/closes/closed`, `fix/fixes/fixed`,
    `resolve/resolves/resolved`), голий `#123`, крос-репо `owner/repo#123`, через
    `matchAll`, дедуплікація, ліміт `MAX_LINKED_ISSUES = 3`. Крос-репо
    посилання **розпізнаються, але пропускаються** (рішення №6) — лишаються в
    `sources` як `owner/repo#123 (skipped)`.
    **`octokit.ts:126` не чіпаємо.**
  - `helpers.ts` — `confidenceFromSources(sources): IntentConfidence` (rubric
    розділу 2) + `renderIntentForPrompt(intent): string`.
  - `repository.ts` — `findIntent(prId)`, `upsertIntent(row)` через
    `onConflictDoUpdate` по `prId`.
  - `service.ts` — послідовність розділу 3. Модель повертає `intent`,
    `in_scope[]`, `out_of_scope[]`, `risk_areas[]` — **без** `confidence`.
    Шаблон: `modules/conventions/service.ts:528-614`.
  - `routes.ts` — `GET /pulls/:id/intent` зі `schema.params: IdParams`.
  - `container.ts` — гетер `intent` + поле в `ContainerOverrides`.
  - `modules/index.ts` — один імпорт/реєстрація.
- **Done when:** `pnpm typecheck` + `pnpm arch:check` + `pnpm arch:ratchet`
  зелені; baseline `.dependency-cruiser-known-violations.json` **не зріс**
  (перевірити діф файлу явно — додані записи = розкручування рачета).
- **Тести (лейн: server unit, hermetic):** `modules/intent/helpers.test.ts` —
  `parseLinkedIssueRefs` на 9 keywords / голому `#` / крос-репо / дублікатах /
  порожньому body; `confidenceFromSources` на трьох рівнях rubric.

### Крок 5 — Вплітання в run-executor · `server/`

- **Файли:** `server/src/modules/reviews/run-executor.ts` (edit).
- **Скіли:** `security`, `typescript-expert` + **вручну `onion-architecture`**.
- **Що зробити:** розділ 3, крок 2 — після `loadDiff` і **до** циклу
  `for (const { agent, runId } of jobs)`; try/catch навколо всього intent-кроку
  (`intent = undefined` при помилці, run продовжується); проброс
  `...(intentBlock ? { intent: intentBlock } : {})` у `reviewPullRequest` поруч із
  наявними `callers`/`repoMap`/`prDescription`; логування і облік вартості за
  розділом 8; `tool_calls` запис у трейс кожного run.
- **Done when:** `pnpm typecheck` +
  `pnpm exec vitest run --exclude '**/*.it.test.ts'` зелені; наявні тести
  run-executor'а не змінили очікувань.
- **Тести:** покривається кроком 6.

### Крок 6 — Інтеграційний тест сервера · `server/`

- **Файли:** `server/test/intent.it.test.ts` (new) — **назва обов'язково
  `*.it.test.ts`**.
- **Скіли:** правила **B5**, **B9**.
- **Що зробити:** реальний Postgres через testcontainers + `buildApp`,
  `ContainerOverrides` з `MockLLMProvider` і моком GitHub. Сценарії:
  - (a) запуск рев'ю на PR з body+issue → рядок у `pr_intent` з
    `confidence: 'high'`, `GET /pulls/:id/intent` віддає його;
  - (b) повторний запуск на тому ж `head_sha` → LLM для intent **не
    викликається** (лічильник викликів мока), рядок незмінний;
  - (c) LLM для intent кидає → run завершується `done`,
    `GET …/intent` віддає `{ intent: null }`.
- **Done when:** `cd server && pnpm exec vitest run .it.test` зелений. Без
  Docker — зафіксувати гейт як **SKIPPED**, не як пройдений.

### Крок 7 — UI: картка INTENT · `client/`

- **Файли:** `src/lib/hooks/reviews.ts` (edit — `usePrIntent`);
  `.../OverviewTab/_components/IntentCard/{IntentCard.tsx,styles.ts,index.ts,IntentCard.test.tsx}`
  (new); `.../OverviewTab/OverviewTab.tsx` (edit); `.../OverviewTab/styles.ts`
  (edit); `.../pulls/[number]/page.tsx` (edit — передати `prId`);
  `client/messages/<locale>/*.json` (edit).
- **Скіли:** `frontend-architecture`, `react-best-practices`,
  `next-best-practices`, `react-testing-library`, `security`.
- **Що зробити:** розділ 7, частина «картка». Дані **лише** через хук; типи — з
  `vendor/shared`, не перевизначати; стилі — в `styles.ts`; жодного `fetch` у
  компоненті; жодних правок `vendor/ui`.
- **Done when:** `cd client && pnpm typecheck && pnpm lint && pnpm test` зелені.
- **Тести (лейн: client, jsdom, `fetch` мокнутий):**
  `IntentCard.test.tsx` — (a) з повним intent рендеряться цитата, обидві колонки
  зі списками, чипи risk areas; (b) `risk_areas: []` → секція відсутня.
  `OverviewTab.test.tsx` — `intent: null` → картки немає, опис PR рендериться як
  раніше. Інтеракції — `fireEvent`, **не** `user-event`.

### Крок 8 — Settings: «успадкувати від рев'ю» · `client/`

- **Файли:** `src/lib/feature-models.ts` (edit);
  `.../SettingsModels/SettingsModels.tsx` (edit); `.../SettingsModels/styles.ts`
  (edit за потреби); `client/messages/<locale>/*.json` (edit).
- **Скіли:** `frontend-architecture`, `react-best-practices`,
  `typescript-expert`, `security`.
- **Що зробити:** розділ 7, частина «Settings». `conventions` **не** правити.
- **Done when:** `cd client && pnpm typecheck && pnpm lint && pnpm test` зелені;
  у Settings біля «PR Review · Intent» видно стан «успадковано», і вибір моделі
  зберігається в `settings.feature_models.review_intent`.
- **Тести (лейн: client):** запис із `inheritsFrom` рендериться без падіння на
  `undefined` дефолті й показує плейсхолдер; після вибору моделі викликається
  мутація з правильним `feature_models`.

### Крок 9 — ⚙️ ВИМКНЕНО ЗА РІШЕННЯМ №5 — читання in-repo spec/plan файлу

> **Рішення користувача: НЕ вмикати.** Крок самодостатній — його можна викинути
> цілком, не змінюючи жодного іншого кроку. Значення `'high'` у rubric досяжне і
> без нього (через лінкований issue), а мітка `spec:<path>` у `sources[]` просто
> не з'являється. Описано тут на випадок, якщо рішення зміниться.

- **Файли:** `modules/intent/helpers.ts` (edit — `parsePlanFileRefs(body)`),
  `service.ts` (edit), `constants.ts` (edit — флаг `INTENT_READ_PLAN_FILES`,
  дефолт `false`), `helpers.test.ts` (edit).
- **Скіли:** `onion-architecture`, `security`, `typescript-expert`.
- **Що зробити:** з тіла PR витягти посилання на `specs/*.md` / `docs/*.md`,
  **жорстко** відфільтрувати: тільки ці два префікси, тільки `.md`, заборонити
  `..`, абсолютні шляхи та символи поза `[A-Za-z0-9._/-]`, ліміт кількості файлів
  і байтів. Читати через `container.git.readFile(repoRef, path)`.
  **Порожній вміст трактувати як «файлу немає»** — `MockGitClient.readFile`
  повертає `''` замість кидати, тож try/catch тут не спрацює. Вміст іде в промпт
  через `wrapUntrusted`, мітка `spec:<path>` — у `sources[]`.
- **Done when:** флаг `false` → поведінка кроків 1–8 не змінюється жодним байтом
  (жодних додаткових I/O-викликів); флаг `true` → `sources` містить `spec:…`,
  `confidence: 'high'`.
- **Тести (лейн: server unit):** `parsePlanFileRefs` приймає `specs/a.md`,
  `docs/b.md`; відхиляє `../../etc/passwd`, `/etc/passwd`, `server/src/x.ts`,
  `specs/a.md?x=1`.

### Крок 10 — Специфікація · repo-wide docs

- **Файли:** `specs/pr-intent-layer.md` (new), `specs/README.md` (edit — рядок у
  таблиці).
- **Що зробити:** нормативний опис: джерела та їх деградація, rubric
  `confidence`, ключ кешу `(pr_id, head_sha)`, інваріант «падіння intent не
  валить рев'ю», інваріант «intent не впливає на score/verdict і не породжує
  findings», контракт байт-ідентичності промпту, правило атрибуції вартості
  (перший run, лише cache miss), контракт `GET /pulls/:id/intent`.
- **Done when:** файл є, індекс у `specs/README.md` оновлено, скоуп фічі описаний
  нормативним голосом.

---

## 12. Верифікаційні гейти

- [ ] `node scripts/sync-shared.mjs --check`
- [ ] `node scripts/check-skills-lock.mjs`
- [ ] `cd server && pnpm typecheck`
- [ ] `cd server && pnpm arch:check`
- [ ] `cd server && pnpm arch:ratchet` (+ візуальна перевірка, що
      `.dependency-cruiser-known-violations.json` не зріс)
- [ ] `cd server && pnpm db:migrate`
- [ ] `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- [ ] `cd server && pnpm exec vitest run .it.test` (потрібен Docker; недоступний
      Docker = `SKIPPED`, **не** «зелено»)
- [ ] `cd reviewer-core && pnpm typecheck`
- [ ] `cd reviewer-core && npm test`
- [ ] `cd client && pnpm typecheck`
- [ ] `cd client && pnpm lint`
- [ ] `cd client && pnpm test`

---

## 13. Ризики

| Ризик | Мітигація |
|---|---|
| **П'ять шляхів не покриваються жодним рядком `routing.md`** — `modules/index.ts`, `reviews/run-executor.ts`, `settings/feature-models.ts`, `client/src/lib/feature-models.ts`, `client/messages/**`. Матриця має рядки для `modules/**/routes.ts`, `service.ts`, `repository*.ts`, але не для інших файлів модуля і не для `client/src/lib/*` поза `hooks/`+`api.ts` | Пройдуть лише через `security` (+`typescript-expert`). `run-executor.ts` — найризикованіший (уся оркестрація й облік вартості) → implementer явно просить `onion-architecture` на ньому **вручну** |
| Розширення `Intent` могло б зламати `PrBrief` | Усі нові поля з `.default()` — старі payload'и парсяться без змін |
| `resolveFeatureModel`/`defaultFeatureModel` міняють сигнатуру на `\| undefined` | Поза `feature-models.ts` споживачів немає (перевірено grep'ом). Якщо `typecheck` покаже споживача — це сигнал, що дослідження застаріло, і крок 1 треба **переглянути**, а не «підклеїти» `!` |
| `pnpm db:generate` може стати інтерактивним і підвісити non-TTY | У цій генерації лише додавання колонок. Якщо промпт «created or renamed» з'явився — розділити на два проходи |
| Подвійний облік або втрата вартості intent | Правило «перший run + тільки cache miss» зафіксоване в `specs/pr-intent-layer.md` і перевіряється інтеграційним тестом (b) |
| **Ін'єкція через тіло PR та тіло issue** — untrusted-текст годує ще один LLM-виклик | `wrapUntrusted` на кожен блок, `temperature: 0`, structured output зі строгою Zod-схемою; жодних denylist/regex. Головне: модель **не повертає `confidence`** — його визначає код, тож інжектнутий текст не може підняти собі довіру |
| Path traversal у кроці 9 | Крок вимкнено рішенням №5. При вмиканні — allowlist префіксів + заборона `..`/абсолютних шляхів, тестується юнітом |
| **Клієнтський реєстр `FEATURE_MODELS` уже розійшовся із серверним** (`conventions`) і жоден гейт цього не ловить (`sync-shared.mjs` покриває `vendor/shared`, а не `lib/feature-models.ts`) | **Прийнято.** Виправлення `conventions` поза скоупом. Для `review_intent` ризик знімається тим, що після цього PR у нього взагалі немає дефолтної моделі, яка могла б розійтись |
| e2e не покриває картку INTENT | **Прийнято.** e2e-стек іде без ключа моделі, intent там ніколи не обчислиться. Покриття на client-компонентному та server-інтеграційному рівнях |

---

## 14. Що лишилось відкритим

1. **Ліміт лінкованих issues** — план закладає `MAX_LINKED_ISSUES = 3`. Впливає
   на латентність і вартість intent-виклику, не на структуру коду. Змінюється
   однією константою.
2. **Розходження `conventions` між серверним і клієнтським реєстром** — виправити
   окремим PR чи лишити? План лишає як є.
3. **Позиція картки INTENT на Overview**, поки немає PR BRIEF / BLAST RADIUS:
   план ставить її **над** блоком «Description». Якщо треба інакше — це одна
   зміна порядку в `OverviewTab.tsx`.

---

## 15. Як користуватись цим планом у новій сесії

```
Реалізуй план з plans/intent-layer.md.
Крок 9 вимкнений — не реалізовувати.
Після завершення прогнати всі гейти з розділу 12.
```

Далі — `plan-verifier` проти цього ж файлу (перевірка покриття вимог,
не якості коду), потім `pr-self-review` перед відкриттям PR.

# Development Plan — Smart Diff (вкладка Files changed)

Варіант **А** (клієнтський розрахунок) — обрано замовником.
Статус: на узгодженні. Токенів: **нуль**, нових роутів: **нуль**.

## Scope

- Пакети: `client/` (основне), `e2e/` (новий flow + регресія 05).
- Поза скоупом: `server/`, `reviewer-core/`, будь-яка зміна БД чи міграція,
  будь-яка зміна контракту `vendor/shared`, `client/src/vendor/ui/**`,
  Conventions Extractor (`plans/conventions-extractor-v2.md`).

## Архітектурне рішення: чисто клієнтський Smart Diff

| Критерій | (А) клієнт | (Б) роут `GET /pulls/:id/smart-diff` |
|---|---|---|
| «без токенів» | тривіально: нуль запитів | виконана, але доводиться кодом |
| Дані вже є? | так — `PrDetail.files` + `ReviewRecord.findings` уже в React Query кеші | ті самі дані читаються вдруге на сервері |
| Вимога 4 | потребує клієнтського роутингу в будь-якому разі | так само |
| Обсяг | 1 пакет, 0 роутів, 0 міграцій | +модуль, +роут, +репозиторій, +`*.it.test.ts` |

Вирішальний аргумент: `pseudocode_summary` без моделі заповнити **нічим** —
детермінований «псевдокод» з диффа це або порожній рядок, або переказ шляху,
тобто фейк. Бекенд-роут не наблизив би до повного контракту, лише переніс би
ту саму детерміновану класифікацію далі від споживача.

### Що робимо з невикористаними полями контракту

1. Контракт **не змінюємо**; `sync-shared.mjs --check` лишається зеленим.
2. Клієнтська модель **не типізується як `SmartDiff`**. У
   `SmartDiffView/helpers.ts` — локальний view-тип, який **переюзує
   `SmartDiffRole` з `@devdigest/shared`** (щоб три категорії не роз'їхалися) і
   не вдає, що має `pseudocode_summary`/`split_suggestion`. Це не порушує
   правило «типи відповідей з vendor/shared» — тут немає відповіді API.
3. У шапці `helpers.ts` — коментар: контракт `SmartDiff` описує серверну
   (майбутню, модельну) версію; клієнт свідомо реалізує детерміновану
   підмножину, тому два поля не заповнює НІХТО і це навмисно.
4. Додатковий доказ, що (Б) — пізніший урок: `repo-intel/repository.ts:439`
   має `getPercentiles` з коментарем «(smart-diff / run-executor)», але
   клієнту цей percentile недоступний (роуту немає) → у класифікації **не
   використовується**; це свідома відмова, не недогляд.

## Перевірені факти (не припущення)

- Вкладка Files у URL — **`tab=diff`**, не `files` (`page.tsx:171`).
- `setParam(key, val)` будує `URLSearchParams` зі снапшота `search` поточного
  рендера → два послідовні виклики в одному хендлері **перетирають один
  одного**. Перехід «tab + finding» потребує батчевого `setParams`.
- Сідований PR #482 має **`patch = NULL` у всіх 4 файлах** (`seed.ts:126-131`,
  підтверджено запитом до БД). Тобто в e2e DiffViewer показує «No diff text
  available», і знахідка на `src/config.ts:12` **не має відрендереного рядка**.
  Наслідок: потрібен fallback-блок «неприв'язані знахідки» (за зразком
  наявного `OutdatedComments`), інакше вимога 4 не покривається e2e взагалі.
- Звичайний режим справді не показує знахідок: `DiffViewer → FileCard →
  CodeLine` не імпортують `FindingRecord` і не згадують findings у 709 рядках.
  Отже вимога 1 має справжню різницю між режимами.
- `client/insights/INSIGHTS.md` (2026-08-02): **`@testing-library/user-event`
  не є залежністю `client/`** — імпорт валить vitest. Усі взаємодії в тестах —
  через `fireEvent`.

## Класифікація core / wiring / boilerplate — детерміновано, без моделі

Чиста функція `classify(path)`, правила згори вниз, перший збіг виграє.
Патерни — у `constants.ts`.

**1. `boilerplate`** (першим — це шум): lock-файли; `**/migrations/**`,
`dist/**`, `build/**`, `*.min.js`, `*.generated.*`, `*.snap`; `*.test.ts(x)`,
`*.it.test.ts`, `**/__fixtures__/**`, `**/test/**`, `e2e/specs/*.flow.json`;
`*.config.*`, `tsconfig*.json`, `package.json`, `.eslintrc*`,
`.github/workflows/**`, `Dockerfile`, `docker-compose.yml`, `.env*`; барелі за
іменем — `index.ts`, `styles.ts`, `constants.ts`; `*.md`, зображення,
`**/messages/**/*.json`.

**2. `wiring`**: `**/routes.ts`, `**/app.ts`, `**/platform/container.ts`,
`server/src/modules/index.ts`; `**/page.tsx`, `**/layout.tsx`,
`**/providers*.tsx`, `**/middleware.ts`; `client/src/lib/hooks/**`,
`client/src/lib/api.ts`; `*.d.ts`.

**3. `core`**: усе решта — `service.ts`, `repository.ts`, `helpers.ts`,
компоненти `*.tsx`, `db/schema/**`, `reviewer-core/src/**`.

Свідомо НЕ використовуємо: repo-intel percentile (недоступний клієнту),
розмір файлу (окремий сигнал — вимога 3), наявність знахідок.

**Взаємодія вимог 1 і 5.** `Boilerplate` завжди згорнута → знахідка в ньому
стане невидимою. Класифікацію через це НЕ ламаємо (не «підвищуємо» файл із
знахідкою до core — це зробило б групування непередбачуваним). Натомість
заголовок кожної групи несе лічильник знахідок, і згорнутий Boilerplate з
ненульовим лічильником показує його **текстом + іконкою**.

## «Перевищує певну кількість рядків»

- `LARGE_FILE_LINES = 300`, метрика `additions + deletions`. Живе в
  `diff-viewer/constants.ts` поруч із наявною `AUTO_EXPAND_MAX_LINES = 200`.
- Підсвітка в шапці `FileCard`: бейдж із **текстом** `LARGE · 412 lines` +
  `Icon.AlertTriangle` + акцентна ліва межа. Колір — вторинний носій
  (конвенція WCAG AA з `specs/findings-severity-breakdown.md:42` і
  `specs/conventions-extractor.md:113`).
- Бейдж показується **лише** в Smart Diff, щоб звичайний режим лишився
  байт-у-байт як зараз.

## Steps

### 1. Чисті функції класифікації та групування — client/

Файли (new): `_components/DiffTab/_components/SmartDiffView/{constants.ts,helpers.ts,SmartDiffView.test.tsx}`.

Скіли: `frontend-architecture`, `typescript-expert`, `security`.

`classify(path): SmartDiffRole`; `groupFiles(files)`; `findingsByPath(reviews)`
→ `Map<string, FindingMark[]>` де `FindingMark = { id, runId, startLine,
endLine, severity, title }`; `isLargeFile(file, threshold)`;
`affectedFilesCount(files)`. Порядок груп фіксований `core → wiring →
boilerplate`, усередині — за `additions+deletions` спадно. `SmartDiffRole`
**імпортується** з shared, не оголошується заново.

Done when: `typecheck` + `test` зелені; тести покривають lock-файл →
boilerplate, `routes.ts` → wiring, `service.ts` → core, `index.ts` →
boilerplate, `*.test.ts` → boilerplate, невідоме розширення → core, порожній
список → три порожні групи (не викидає).

Tests: **client vitest** (юніт, без рендера).

### 2. Anti-corruption шар анотацій у diff-viewer — client/

Файли: `diff-viewer/annotations.ts` (new), `diff-viewer/FindingMarks/` (new),
`CodeLine/CodeLine.tsx`, `FileCard/FileCard.tsx`, `DiffViewer/DiffViewer.tsx`,
`diff-viewer/{constants.ts,styles.ts,index.ts}`,
`DiffViewer/DiffViewer.test.tsx` (new), `client/messages/en/shell.json`.

Скіли: `frontend-architecture`, `react-best-practices`, `typescript-expert`, `security`.

- `DiffAnnotationApi { marksByPath, onOpenFinding, largeFileLines }` — точно
  повторює наявний патерн необов'язкового `commenting?: DiffCommentApi`:
  `undefined` = поведінка не змінюється.
- `FindingMarks` — чипи під рядком коду, кожен `<button>` з `aria-label`,
  `onClick → onOpenFinding(id)` і **нічого більше**: без popup, без
  `window.open`, без посилань на GitHub.
- `FileCard` — бейдж великого файлу + **блок «unanchored findings»** для
  знахідок, чий рядок не відрендерився (порожній `patch` або рядок поза
  hunk-ами). Це критично: саме цей блок робить e2e можливим.
- `vendor/ui` не чіпати.

Done when: гейти зелені; тест доводить (а) **без** `annotations` у DOM немає
жодного заголовка знахідки — регресія на вимогу 1; (б) з `annotations` і
непорожнім `patch` знахідка під потрібним рядком, з порожнім — у блоці
unanchored. Взаємодії через `fireEvent`, **не** `user-event`.

Tests: **client vitest + RTL**.

### 3. Deep-link «знахідка → її карточка» — client/  ← ВИМОГА 4

Робиться ДО Smart Diff UI, щоб перевірятись самостійно, просто відкривши
`?tab=findings&finding=<id>`.

Файли: `pulls/[number]/page.tsx`, `FindingsTab/FindingsTab.tsx`,
`ReviewRunAccordion/ReviewRunAccordion.tsx`, `FindingsPanel/FindingsPanel.tsx`,
`FindingCard/FindingCard.tsx` + відповідні `.test.tsx`.

Скіли: `frontend-architecture`, `next-best-practices`, `react-best-practices`,
`typescript-expert`, `security`.

- `page.tsx`: додати `setParams(entries)` — **один** `URLSearchParams`, **один**
  `router.replace`; наявний `setParam` реалізувати через нього. Прочитати
  `search.get("finding")` → `targetFindingId` у `FindingsTab`.
- `FindingsTab`: знайти review, чий `findings` містить id; виставити наявний
  `target = { runId, n }` (перевикористання вже працюючого механізму
  акордеона) і прокинути `targetFindingId` + nonce.
- `FindingsPanel`: при зміні `targetNonce` — якщо знахідка відфільтрована
  тумблером `hideLow`, зняти його; знайти індекс і **виставити наявний
  `focusIdx`** (не додавати другий механізм підсвітки), потім
  `scrollIntoView({behavior:'smooth', block:'center'})`. j/k-навігація не
  ламається саме тому, що deep-link рухає той самий індекс.
- `FindingCard`: необов'язковий `expandSignal?: number` розкриває карточку.
  `data-finding-id` уже є — не чіпати.
- Жодних popup, жодного `window.location` — лише `router.replace`.
- `scrollIntoView` не існує в jsdom → застабити в тесті
  (`Element.prototype.scrollIntoView = vi.fn()`), **не** прибирати скрол із
  продакшн-коду.

Done when: вручну `?tab=findings&finding=<id>` відкриває акордеон, розкриває
карточку, підсвічує; RTL-тест доводить фокус-стиль і виклик `scrollIntoView`;
наявні тести не зламані.

Tests: **client vitest + RTL**.

### 4. Перемикач Smart Diff і SmartDiffView — client/

Файли: `SmartDiffView/{SmartDiffView.tsx,styles.ts,index.ts}` (new),
`DiffTab/DiffTab.tsx`, `DiffTab/{styles.ts,constants.ts,helpers.ts,index.ts}`,
`pulls/[number]/page.tsx`, `DiffTab/DiffTab.test.tsx` (new),
`SmartDiffView.test.tsx`, `client/messages/en/shell.json`.

Скіли: `frontend-architecture`, `react-best-practices`, `next-best-practices`,
`typescript-expert`, `security`.

- Три згортні секції `Core logic` / `Wiring` / `Boilerplate`, кожна з
  `N files · +A −D · M findings`; `core` і `wiring` розгорнуті, `boilerplate`
  **завжди** згорнута за замовчуванням.
- Перемикач режиму в `right` наявного `SectionLabel`; режим у URL
  (`?tab=diff&diffMode=smart`), щоб повернення з вкладки Agent runs зберігало
  його. За замовчуванням — **Normal** (інакше e2e flow 05 і сенс перемикача
  розмиваються).
- Рядок зверху `Files changed · N files` у smart-режимі доповнюється кількістю
  зачеплених файлів і сумарними `+/−` (вимога 2).
- `onOpenFinding={(id) => setParams([["tab","findings"],["finding",id],["diffMode",null]])}`
  — **один** replace, усі параметри разом.
- Групування — у `React.useMemo` від `files`/`reviews`. Нових запитів нуль.

Done when: гейти зелені; RTL доводить: (а) у Normal знахідок у DOM немає, після
кліку по перемикачу — з'являються; (б) заголовок показує кількість зачеплених
файлів; (в) `Boilerplate` згорнута при першому рендері навіть коли має
знахідки, і її заголовок несе лічильник; (г) файл на 400 рядків має текстовий
бейдж `LARGE`; (д) **клік по знахідці викликає `onOpenFinding` рівно з її id і
не відкриває жодного popup чи зовнішнього посилання** — тест на вимогу 4.

Tests: **client vitest + RTL**.

### 5. E2E flow і регресія — e2e/

Файл: `e2e/specs/10-smart-diff.flow.json` (new). Правило **B9** + `e2e/AGENTS.md`.

Кроки: `{BASE}/` → `wait --url /pulls` → `wait --text "Add rate limiting to
public API endpoints"` → клік → `wait --url /pulls/482` → `wait --load
networkidle` → `find role button click --name "Files changed"` → `wait --url
tab=diff` → `find role button click --name "Smart Diff"` → `wait --url
diffMode=smart` → `wait --text "Core logic"` → `wait --text "Boilerplate"` →
клік по знахідці → `wait --url tab=findings` → `wait --url finding=` →
`wait --text "sk_live_"` (текст rationale з карточки — доводить, що ми на
розгорнутій карточці, а не просто на вкладці).

**Обов'язково:** сідовані `pr_files` не мають `patch`, тому знахідка буде в
блоці **unanchored** у `FileCard` `src/config.ts`, а не на рядку 12. Той самий
клік, той самий обробник; але без fallback-блоку з кроку 2 цей flow неможливо
написати взагалі. `--text` матчить **відрендерений** текст: якщо назви груп
стилізовані uppercase — асертити `CORE LOGIC`.

Done when: `./scripts/e2e.sh` проходить усі flow, включно з новим 10 **і**
незміненим `05-pr-diff.flow.json` (за замовчуванням Normal — має лишитись
зеленим без правок).

Tests: **e2e web**. Жодного звернення до моделі.

### 6. Фіксація рішення в insights — client/

`client/insights/INSIGHTS.md` (append-only, через скіл `engineering-insights`):
(1) `SmartDiff` у shared описує серверну модельну версію; клієнт свідомо
реалізує детерміновану підмножину — це не дрейф контракту; (2) `setParam` не
батчить, для мультипараметрної навігації є `setParams`.

## Verification gates

- [ ] cd client && pnpm typecheck
- [ ] cd client && pnpm lint          (--max-warnings 0)
- [ ] cd client && pnpm test
- [ ] node scripts/sync-shared.mjs --check    (доказ, що контракт не зачеплено)
- [ ] node scripts/check-skills-lock.mjs
- [ ] ./scripts/e2e.sh                        (Docker; ізольований стек, НЕ dev-БД)
- [ ] /pr-self-review перед PR

**Не запускаємо:** серверні лейни, `db:migrate`, `reviewer-core` — жоден
серверний файл не змінюється. Якщо implementer виявить, що чіпає `server/` —
це розходження з планом: зупинитись і повідомити, а не «просто додати гейт».

## Risks

- **`client/messages/en/*.json` не збігається з жодним рядком routing.md** →
  зміни i18n не перегляне жоден скіл. Приймається (рядкові дані), але
  `pr-self-review` має явно назвати цей шлях як unrouted, а не змовчати.
- **Знахідки в згорнутій `Boilerplate` невидимі** → лічильник у заголовку
  текстом + іконкою. Вимога 5 лишається виконаною буквально.
- **`scrollIntoView` немає в jsdom** → тести кроку 3 впадуть не на логіці.
  Застабити; НЕ «лагодити», прибираючи скрол із продакшн-коду.
- **Порожній `patch` у сідованих даних** → без блоку unanchored вимога 4
  непокрита e2e. Найімовірніша точка провалу; крок 2 має бути завершений
  повністю до кроку 5.
- **Евристика класифікації помилятиметься** (`helpers.ts` у тестовій папці;
  `index.ts`, що містить логіку) → приймається: правила детерміновані,
  задокументовані константами, покриті юнітами; це UI-групування, не гейт.
- **`focusIdx` тепер має два джерела** (j/k і deep-link) → deep-link рухає
  індекс ЛИШЕ при зміні `targetNonce`, ніколи в залежності від `shown`.
- **Зростання кількості query-параметрів** → будь-який новий двопараметричний
  перехід має йти через `setParams`.

## Open questions

1. **Поріг великого файлу — 300 рядків (`additions+deletions`)?** Продуктове
   рішення, не технічне. Інша метрика (лише `additions`; відсоток від розміру
   PR) змінює лише константу.
2. **Режим у URL чи локальний стан вкладки?** План обирає URL (переживає
   перехід на Agent runs і назад, робить e2e-асерт можливим). Якщо небажано —
   `useState` одним рядком, але крок e2e `wait --url diffMode=smart` треба
   замінити на `wait --text`.
3. **Чи потрібна власна спека в `specs/`** (як у conventions/intent)? Якщо ця
   фіча вважається уроковою — спеку замовити окремо, і саме вона має
   зафіксувати правила класифікації як інваріант, а не мої константи.
4. **Клік по лічильнику знахідок у заголовку згорнутої `Boilerplate`** — чи
   має він автоматично її розгортати? +1 маленька поведінка, треба підтвердити.

# Ресерч: архітектура та організація коду в Next.js (App Router)

Доповнення до [research-react.md](./research-react.md) — те саме питання «де що тримати», але з урахуванням
специфіки Next.js App Router. Зібрано 2026-08-13. Версія документації Next.js на момент збору — 16.3.

Фокус — **організація**, а не перформанс: структура папок, межі модулів, розміщення логіки,
констант, конфігів, змінних середовища.

> Наявний скіл `next-best-practices` покриває механіку фреймворку (RSC boundaries, data patterns,
> route handlers, metadata, bundling). Тут — рівень вище: **як розкласти код по проєкту**.

---

## 0. Головна теза Next.js

> «Folders are not just organization — **they define your routes, your layouts, and your loading
> and error boundaries. The structure is the architecture.**»

Тому в Next.js рішення «де покласти файл» має два незалежні виміри:
1. **Роутинг** — що визначається структурою `app/`;
2. **Модульність** — що визначається межами фіч і напрямком залежностей.

Змішування цих вимірів — джерело більшості проблем.

Джерело: [dharmsy — Next.js 16 App Router Folder Structure](https://www.dharmsy.com/blog/nextjs-16-app-router-folder-structure)

---

## 1. Офіційна позиція: механізми, а не структура

Next.js **неопінійований** щодо організації, але дає інструменти:

| Механізм | Синтаксис | Для чого |
|---|---|---|
| Колокація за замовчуванням | — | роут не публічний, доки немає `page.js`/`route.js` → будь-які файли можна класти в сегмент роуту |
| Private folders | `_folder` | виводить папку і всю вкладеність з роутингу |
| Route groups | `(folder)` | групування без впливу на URL; різні layout'и; кілька root layout'ів; точковий `loading.tsx` |
| `src/` | `src/` | відділяє код застосунку від конфігів у корені |

**Три офіційні стратегії:**
1. усі файли **поза** `app/` → `app/` лишається суто роутингом;
2. усі файли у top-level папках **усередині** `app/`;
3. **split by feature/route** — глобальне в корені `app/`, специфічне — у сегменті роуту.

> «Choose a strategy that works for you and your team and **be consistent** across the project.»
> Назви `components`/`lib` — плейсхолдери, для фреймворку вони нічого не значать.

Навіщо private folders, якщо колокація і так безпечна: відділення UI-логіки від роутингу,
однакова організація по проєкту, сортування у редакторі, **уникнення конфліктів із майбутніми
конвенціями фреймворку**.

Джерело: [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure)

---

## 2. Межа Server / Client — головна архітектурна межа

Це те, чого немає в звичайному React, і саме вона диктує розкладку модулів.

### 2.1 Правила перетину межі

- `'use client'` малює **межу в module graph**, а не позначає окремий компонент.
- **Код** перетинає межу через **імпорти**: усе, що імпортує клієнтський компонент, потрапляє в
  клієнтський бандл. Директиву достатньо поставити на вході в клієнтське піддерево — не на кожному файлі.
- **Дані** перетинають межу через **props** і мають бути серіалізовними: функцію (`onClick`) передати
  не можна; Server Function з `'use server'` передається як референс.
- Відрендерений React-елемент серіалізовний → **Server Component можна вкласти в Client Component
  через `children`**, і його код не потрапить у клієнтський граф.
  - Розрізнення owner/parent: `Page` володіє `<Modal><Cart/></Modal>`, тому `Cart` рендериться на
    сервері; `Modal` — лише parent, отримує результат, а не код.
- TypeScript-плагін дозволяє функцію в пропсах клієнтського компонента, лише якщо проп зветься
  `action` або закінчується на `Action` — інше позначає як помилку.
- **Compound components** ламаються на межі: `Menu.Item` стане `undefined`, якщо Server Component
  імпортує клієнтський compound. Виносити частини як **named exports**, а не статичні властивості.

Джерела:
- [Next.js — The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary)
- [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)

### 2.2 Таблиця рішення (офіційна)

**Client Component, коли потрібно:** стан і обробники подій; lifecycle-логіка (`useEffect`);
browser-only API (`localStorage`, `window`); кастомні хуки.

**Server Component, коли потрібно:** фетчити дані ближче до джерела; використати API-ключі/секрети
без експозиції; зменшити JS у браузері; покращити FCP і стримити контент.

Окремо: багато інтерактивності дає сам браузер без Client Component — `<details>`, `<form action>`
із Server Function, `<video controls>`. Client Component потрібен, коли є **стан, що змінюється
в часі** (контрольований інпут, живий фільтр, drag handle).

### 2.3 Структурні наслідки

- **Штовхати `'use client'` вниз по дереву**: тримати фетчинг і важку логіку в Server Components,
  а директиву ставити на маленькі листові інтерактивні компоненти. Типова помилка — `'use client'`
  надто високо.
- **Providers рендерити якнайглибше**: `ThemeProvider` має обгортати `{children}`, а не весь
  `<html>` — інакше Next.js гірше оптимізує статичні частини.
- **Сторонні бібліотеки без `'use client'`** обгортати власним клієнтським компонентом
  (`app/carousel.tsx` з `'use client'` + реекспорт).
- Щоб не міняти спільний компонент, робити **клієнтську обгортку** — межа стає ближчою до коду
  застосунку, і не треба ліпити директиву на кожен спільний компонент із `useState`.

---

## 3. Де живуть дані: Data Access Layer

Офіційна рекомендація Next.js — **три підходи, і їх не можна змішувати** (щоб і розробникам,
і аудиторам безпеки було зрозуміло, чого очікувати):

| Підхід | Для кого |
|---|---|
| **External HTTP APIs** | наявні великі застосунки й організації з окремими бекенд-командами (Zero Trust) |
| **Data Access Layer (DAL)** | **нові проєкти — рекомендований** |
| **Component-level data access** | прототипи й навчання |

### DAL — правила

Внутрішня бібліотека, що контролює, як і коли фетчаться дані та що потрапляє в render context. Вона:

- **виконується лише на сервері**;
- робить **перевірки авторизації**;
- повертає **безпечні мінімальні DTO**.

> «Secret keys should be stored in environment variables, but **only the Data Access Layer should
> access `process.env`**. This keeps secrets from being exposed to other parts of the application.»

Практика з офіційного прикладу:
- `data/auth.ts` — `getCurrentUser` обгорнутий у `cache()` з React: однакове значення в багатьох
  місцях без ручного прокидання (це прямо описано як спосіб **зменшити ризик** випадкової передачі
  об'єкта в Client Component);
- `data/user-dto.tsx` — `import 'server-only'` + функції-предикати (`canSeeUsername`,
  `canSeePhoneNumber`) → повертається лише те, що дозволено;
- використовувати класи для доменних об'єктів, щоб випадково не серіалізувати весь об'єкт на клієнт
  (функції й класи не проходять через межу за замовчуванням).

**Той самий DAL — і для мутацій**: `'use server'`-екшени лишаються тонкими й делегують у
`server-only` модуль, де живуть auth + authz + доступ до БД.

### `server-only` / `client-only`

- `import 'server-only'` у модулі → **build-time помилка**, якщо його імпортують у клієнтське оточення.
  Так «пропрієтарний код або внутрішня бізнес-логіка лишається на сервері».
- Дзеркальний `client-only` — для модулів із `window` тощо.
- Встановлювати npm-пакети опційно (Next.js обробляє імпорти внутрішньо), але варто — щоб лінтер
  не лаявся на extraneous dependencies.

### Tainting (додатковий шар)

`experimental_taintObjectReference` / `experimental_taintUniqueValue` + `experimental.taint` у
`next.config.js`. Офіційно — **додатковий** шар: фільтрувати й санітизувати дані все одно треба в DAL.

Джерела:
- [Next.js — How to think about data security](https://nextjs.org/docs/app/guides/data-security)
- [Next.js — Preventing environment poisoning](https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning)
- [npm — server-only](https://www.npmjs.com/package/server-only)

### Чек-лист аудиту структури (офіційний)

Прямо з документації — добра основа для правил рев'ю у скілі:

- **DAL**: чи є ізольований шар? чи не імпортуються пакети БД і `process.env` **поза** ним?
- **`"use client"` файли**: чи не очікують пропси приватних даних? чи не надто широкі типи?
- **`"use server"` файли**: чи валідуються аргументи? чи ре-авторизується користувач усередині екшена?
  чи перевіряється **власність ресурсу** (authz, не лише authn)? чи фільтруються значення, що
  повертаються? чи делегується доступ до БД у `server-only` DAL?
- **`/[param]/`**: папки з дужками — це користувацький ввід; чи валідуються `params`?
- **`proxy.ts` і `route.ts`**: мають багато влади — аудитувати окремо.

---

## 4. Мутації: Server Actions vs Route Handlers

**Правило вибору (найчіткіше формулювання зі спільноти):**
> If a **human** triggers it from your UI → **Server Action**. If a **machine** triggers it →
> **Route Handler**.

- **Server Actions** — мутації з інтерфейсу самого застосунку; менше коду, кращі loading-стани,
  без клієнтського fetch-бойлерплейту.
- **Route Handlers** — єдиний варіант, коли викликає не твій React-застосунок: вебхуки, мобільні
  застосунки, сторонні інтеграції; а також read-heavy публічні API з кешуванням.
- **Не змішувати**: класти Server Actions в `api/`-роути — джерело плутанини.
- Дефолт: Server Actions для внутрішніх мутацій, рефактор у Route Handler лише коли з'явився
  зовнішній споживач.

**Безпека, що впливає на розкладку:** експортований Server Action доступний прямим POST-запитом,
навіть якщо ніде не імпортований. Next.js дає secure action IDs і dead code elimination, але
**auth/authz треба перевіряти всередині кожного екшена** — перевірка на рівні сторінки на екшен
**не поширюється**.

Джерела:
- [Makerkit — Server Actions vs Route Handlers](https://makerkit.dev/blog/tutorials/server-actions-vs-route-handlers)
- [Wisp — Route Handler vs Server Action in production](https://www.wisp.blog/blog/route-handler-vs-server-action-in-production-for-nextjs)
- [John Kavanagh — Server Actions vs API Routes](https://johnkavanagh.co.uk/articles/when-to-use-server-actions-vs-api-routes-in-nextjs/)
- [vercel/next.js Discussion #72919 — Server Actions замість Route Handlers для фетчингу?](https://github.com/vercel/next.js/discussions/72919)
- [DEV — Server Actions vs Route Handlers (I got this wrong for 3 months)](https://dev.to/whoffagents/nextjs-15-server-actions-vs-route-handlers-when-to-use-each-i-got-this-wrong-for-3-months-49hm)
- [Next.js — Data security: Server Actions](https://nextjs.org/docs/app/guides/data-security)

---

## 5. Практична розкладка: колокація в сегменті роуту

Найконкретніший робочий приклад (Makerkit, продакшн-стартер):

```
app/[locale]/(internal)/boards/
├── page.tsx                  # вхід у роут — тонкий
├── layout.tsx
├── loading.tsx
├── _components/              # компоненти лише цього роуту
│   ├── board-list.tsx
│   ├── create-board-dialog.tsx
│   └── delete-board-dialog.tsx
├── _lib/                     # логіка лише цього роуту
│   ├── boards.loader.ts      # фетчинг
│   ├── boards.actions.ts     # Server Actions (тонкі)
│   ├── boards.service.ts     # бізнес-логіка (без залежностей від Next.js)
│   ├── boards.schema.ts      # Zod-валідація
│   └── boards.service.test.ts
└── [boardId]/
```

Мотивація прямою мовою:
> «In early versions, we placed all Server Actions in a central `lib/actions/`» — стало некерованим.
> Колокація за фічею вирішує проблему discoverability.

**Правило розміщення компонента:**

| Тип коду | Місце | Коли |
|---|---|---|
| компонент одного роуту | `_components/` у папці роуту | використовується в одному роуті |
| компонент застосунку | `components/` у корені застосунку | спільний для кількох роутів |
| компонент кількох застосунків | `packages/ui/` | монорепо, кілька застосунків |

**Server Actions тонкі, логіка — у сервісах:**
- екшен: 1) валідація вводу → 2) виклик сервісу → 3) `revalidatePath`;
- **> ~20 рядків в екшені → виносити в сервіс**;
- причина: «Server Actions are hard to unit test (they depend on Next.js internals). Services are
  pure functions you can test with Vitest». Тестувати **сервіси**, а не екшени.

**Серверний код позначати структурно:** окремі `lib/server/` директорії та/або розширення `.server.ts`,
плюс `server-only`.

**Монорепо, правило експортів:** ніколи не змішувати серверний і клієнтський код в одному експорті —
окремі entry points `./server`, `./components`, `./hooks`, `./schemas`.

**DON'T-лист (звідти ж):** не змішувати server/client експорти; не класти бізнес-логіку прямо в
Server Actions; не хардкодити конфіг у пакетах; не імпортувати серверний код у Client Components;
не тримати пласку структуру (розсипається на 50+ файлах); не звалювати всі екшени в централізований
`lib/actions/`.

Джерело: [Makerkit — Next.js 16 App Router Project Structure: The Definitive Guide](https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure)

---

## 6. Конфіг, константи, змінні середовища

### 6.1 Конфіг — валідувати Zod'ом на етапі білду

Рекомендація: `config/` директорія, схеми Zod, `z.coerce` для приведення рядків до чисел/булевих,
**падати на білді, а не в рантаймі**.

```ts
const AppConfigSchema = z.object({
  maxUploadSize: z.coerce.number().min(1_000_000),
  darkMode: z.coerce.boolean().default(false),
})
export const appConfig = AppConfigSchema.parse({ /* … */ })
```

Джерело: [Makerkit — App Router project structure](https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure)

### 6.2 Змінні середовища — офіційні правила

- **За замовчуванням env-змінні доступні лише на сервері.** Клієнту віддається лише те, що має
  префікс `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_*` **інлайняться в бандл під час `next build`** → після білду застосунок **не реагує**
  на зміну цих змінних. Один Docker-образ на кілька середовищ із різними значеннями так не працює;
  потрібен власний API або читання на сервері під час динамічного рендеру (`await connection()`).
- **Динамічні звернення не інлайняться**: `process.env[varName]` і `const env = process.env` — не
  спрацюють; лише прямий `process.env.NEXT_PUBLIC_X`.
- Непрефіксовані змінні в клієнтському бандлі замінюються **порожнім рядком** — тобто серверна
  функція, імпортована на клієнт, «мовчки» зламається (звідси й потреба в `server-only`).
- **Порядок пошуку** (зупиняється на першому знайденому):
  `process.env` → `.env.$(NODE_ENV).local` → `.env.local` (крім `test`) → `.env.$(NODE_ENV)` → `.env`.
- `.env.test` **комітиться**, `.env*.local` — ні; у `test` `.env.local` не завантажується навмисне,
  щоб тести давали однаковий результат у всіх.
- При використанні `src/` — `.env*` лишаються **в корені проєкту**, а не в `src/`.
- Поза рантаймом Next.js (конфіги ORM, тест-раннери) вантажити через `@next/env` → `loadEnvConfig`.
- Змінні можуть посилатись одна на одну через `$VAR`.

Джерело: [Next.js — Environment Variables](https://nextjs.org/docs/app/guides/environment-variables)

### 6.3 Наслідок для констант

Виходить трирівнева розкладка (узгоджується з promotion rule із [research-react.md](./research-react.md)):

1. **Локальна константа** — у файлі компонента/сервісу, де використовується;
2. **Константи фічі/роуту** — у `_lib/*.constants.ts` поруч;
3. **Глобальні** — `config/` з Zod-валідацією; секрети — **лише** через DAL і `process.env` у ньому.

---

## 7. Feature folders + App Router: як поєднати

Ключова практична проблема: `app/` вже задає ієрархію, і фіче-папки з неї «вивалюються».
Три робочі варіанти, що зустрічаються в джерелах:

| Варіант | Як | Плюси / мінуси |
|---|---|---|
| **A. `app/` = лише роутинг** | увесь код у `src/features/*`, `page.tsx` — тонкий адаптер, що імпортує з фічі | чисті межі фіч, легко енфорсити лінтером; мінус — «стрибки» між `app/` і `features/` |
| **B. Колокація в сегменті** | `_components/`, `_lib/` усередині папки роуту | усе поруч, максимальна discoverability; мінус — код, спільний для двох роутів, треба піднімати |
| **C. Гібрид (найпоширеніший)** | специфічне для роуту — в `_components`/`_lib`; спільне для кількох роутів — у `features/` або `components/`+`lib/` | практичний компроміс; вимагає дисципліни щодо promotion rule |

Оглядові джерела 2026 сходяться на: `app/`, `components/`, `lib/`, `hooks/`, `actions/`, `types/`,
`styles/`; для великих SaaS — додатково `features/` і `server/`.

Джерела:
- [Next.js — Project structure (три офіційні стратегії)](https://nextjs.org/docs/app/getting-started/project-structure)
- [groovyweb — Next.js Folder Structure: Best Practices for 2026](https://www.groovyweb.co/blog/nextjs-project-structure-full-stack)
- [dharmsy — Next.js 16 App Router Folder Structure](https://www.dharmsy.com/blog/nextjs-16-app-router-folder-structure)
- [Medium (Aritra Paul) — How to organize your Next.js app with the App Router](https://medium.com/@aritrapaulpc/how-to-organize-your-next-js-app-with-the-app-router-best-practices-folder-structures-4bba816df061)
- [TheKitBase — Next.js App Router Best Practices in 2026](https://thekitbase.app/blog/nextjs-app-router-best-practices-2026)
- [javascriptdoctor — Next.js App Router Best Practices for Production (2026)](https://www.javascriptdoctor.blog/2026/07/nextjs-app-router-best-practices-for.html)
- [Medium (Thiraphat) — Mastering Next.js App Router: structuring your application](https://thiraphat-ps-dev.medium.com/mastering-next-js-app-router-best-practices-for-structuring-your-application-3f8cf0c76580)
- [CodewithDev — Next.js 15/16 folder structure best practices](https://codewithdev.com/blog/nextjs-folder-struture-best-prctices)

---

## 8. Важкий варіант: Clean Architecture для Next.js

Коли бізнес-логіка справді складна. Референс — репозиторій Lazar Nikolov (Sentry).

```
src/
├── entities/            # моделі + кастомні помилки (домен)
├── application/         # use cases + інтерфейси репозиторіїв/сервісів
├── infrastructure/      # реалізації репозиторіїв і сервісів (БД, зовнішні API)
└── interface-adapters/  # контролери (валідація, авторизація, оркестрація use cases)
app/                     # Frameworks & Drivers: роути, Server Actions, компоненти
di/                      # dependency injection
tests/                   # дзеркалить src/
```

**Dependency rule:** шар залежить лише від шарів нижче, ніколи навпаки.

**Мапінг на Next.js:**

| Елемент Next.js | Шар | Що йому дозволено |
|---|---|---|
| Route Handlers | `app/` | викликати **лише контролери** |
| Server Actions | `app/` | викликати **лише контролери** |
| Контролери | `interface-adapters/` | валідація, авторизація, оркестрація use cases |
| Use cases | `application/` | бізнес-операції |
| Репозиторії | `infrastructure/` | запити до БД |
| Компоненти | `app/` | використовують моделі й помилки, **ніколи не use cases** |

Ключове обмеження: шар фреймворку **ніколи** не звертається напряму до use cases, репозиторіїв
чи сервісів — тільки до контролерів, моделей і помилок.

Джерела:
- [nikolovlazar/nextjs-clean-architecture — README](https://github.com/nikolovlazar/nextjs-clean-architecture/blob/main/README.md)
- [Sentry — Implementing Clean Architecture in Next.js](https://sentry.io/resources/clean-architecture-nextjs)
- [Medium — Clean Architecture with Next.js: insights from Lazar Nikolov](https://medium.com/@heinhtoo/clean-architecture-with-next-js-insights-from-lazar-nikolov-developer-advocate-at-sentry-abe1cb4c7ef3)
- [Medium — Clean Architecture in Next.js 14: A Practical Guide](https://medium.com/@entekumejeffrey/image-source-the-clean-code-blog-https-blog-cleancoder-com-uncle-bob-2012-08-13-the-clean-arch-c5fa5b84ca10) · [частина 2](https://medium.com/@entekumejeffrey/clean-architecture-in-next-js-14-a-practical-guide-part-two-3e5d8dbf5a7c)

**Легша версія — feature layer** (без повного Clean Architecture): фіча ділиться на data-шар
(mapper/DTO, repository) і domain-шар (entity, enums, repository interface, use case, params,
base failure). Аргумент: змішування бізнес-логіки з UI-кодом руйнує підтримуваність на масштабі.

Джерело: [DEV — Why Next.js apps struggle at scale and how feature layers solve it](https://dev.to/behnamrhp/why-nextjs-apps-struggle-at-scale-and-how-feature-layers-solve-it-3d9c)

---

## 9. Що додати у скіл (доповнення до розділу 12 в research-react.md)

1. **Двовимірне правило розміщення** для Next.js: спочатку питаємо «це роутинг чи модуль?»,
   і лише потім «feature чи shared?».
2. **Дерево рішень для нового коду:**
   - потрібен стан/браузерний API → Client Component, і **якнайнижче** в дереві;
   - читання даних → DAL (`server-only`, авторизація, DTO), не в компоненті;
   - мутація з UI → Server Action (тонкий) → сервіс; мутація ззовні → Route Handler;
   - логіка без залежностей від Next.js → сервіс/use case, тестований Vitest;
   - конфіг → `config/` з Zod; секрет → env, читається **лише** з DAL.
3. **Пороги-евристики**: Server Action > ~20 рядків → сервіс; пласка папка > 50 файлів → розбити;
   `'use client'` вище листового компонента → перевірити, чи можна опустити.
4. **Anti-patterns checklist** (готовий, з офіційного аудит-розділу): `process.env` поза DAL;
   передача сирого рядка БД у Client Component; широкі типи пропсів на межі; відсутність
   ре-авторизації в екшені; невалідовані `params`; централізований `lib/actions/`;
   провайдери, що обгортають весь `<html>`; compound components через межу.
5. **Явні трейд-офи**: колокація в `_lib` vs окремий `features/`; Clean Architecture vs
   оверінжиніринг для малого проєкту; `NEXT_PUBLIC_` build-time inline vs рантайм-конфіг.

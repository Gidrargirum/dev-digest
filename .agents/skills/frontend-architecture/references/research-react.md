# Ресерч: структура та організація коду у React-фронтенді

Матеріал-заготовка для майбутнього скіла (`react-project-structure` / `frontend-architecture`).
Зібрано 2026-08-12. Усі твердження мають посилання на першоджерела.

Специфіка Next.js (App Router, межа Server/Client, DAL, Server Actions, env) — в окремому файлі:
[research-nextjs.md](./research-nextjs.md).

Існуючий скіл `react-best-practices` покриває **як писати компоненти** (чистота, деривація стану,
хуки, перформанс). Цей ресерч покриває **де що лежить**: структура папок, межі модулів,
константи, utils/helpers/lib, розміщення бізнес-логіки, іменування.

---

## 1. Три канонічні школи структури

### 1.1 Офіційна позиція React — «не думай про це довго»

- Дві поширені схеми: **grouping by feature/route** і **grouping by file type**.
- «Unless you have a very compelling reason to use a deep folder structure, consider limiting
  yourself to a **maximum of three or four nested folders**.»
- «If you're just starting a project, **don't spend more than five minutes** on choosing a file
  structure» — вибір «правильної» на старті не критичний.
- Ключовий принцип: **колокація** — «keep files that often change together close to each other».

Джерело: [React docs (legacy) — File Structure FAQ](https://legacy.reactjs.org/docs/faq-structure.html)

### 1.2 Bulletproof React — feature-based, найпоширеніший практичний стандарт

Корінь `src/`:

| Папка | Що лежить |
|---|---|
| `app/` | шар застосунку: роути, головний компонент, провайдери, конфіг роутера |
| `assets/` | статика (зображення, шрифти) |
| `components/` | **лише** спільні (shared) компоненти |
| `config/` | глобальна конфігурація, експорт env-змінних |
| `features/` | основна маса коду — по фічах |
| `hooks/` | спільні хуки на весь застосунок |
| `lib/` | преконфігуровані реюзабельні бібліотеки (обгортки над axios, i18n тощо) |
| `stores/` | глобальні стори |
| `testing/` | тестові утиліти й моки |
| `types/` | спільні TS-типи |
| `utils/` | спільні утиліти |

Усередині `src/features/[feature-name]/` — **лише ті папки, що реально потрібні**:
`api/`, `assets/`, `components/`, `hooks/`, `stores/`, `types/`, `utils/`.

Три архітектурні правила:

1. **Односпрямований потік коду**: `shared → features → app`. Feature не імпортує з `app`.
2. **Заборона крос-фічевих імпортів**: фіча не імпортує з іншої фічі; композиція — лише на рівні `app`.
3. **Не використовувати barrel files** (`index.ts` з ре-експортами) — ламає tree-shaking у Vite,
   б'є по перформансу. Імпортувати файли напряму.

Енфорсити через ESLint `import/no-restricted-paths`.

Джерела:
- [bulletproof-react — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- [bulletproof-react — project-standards.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md)
- [bulletproof-react — components-and-styling.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/components-and-styling.md)
- [bulletproof-react — репозиторій](https://github.com/alan2207/bulletproof-react)
- [React Handbook — Project Structure](https://reacthandbook.dev/project-structure) (рекомендує bulletproof; каже: старт — плоско, рефактор після ~10 файлів; ця структура для SPA, а не для Next.js/Remix)
- [React Handbook — Project Standards](https://reacthandbook.dev/project-standards)

> ⚠️ Розбіжність джерел: bulletproof-react каже «уникайте barrel files», а
> [Sandro Roth](https://sandroroth.com/blog/project-structure/) і FSD навпаки вимагають `index.ts`
> як **public API** фічі. Це свідомий трейд-оф: інкапсуляція vs tree-shaking/швидкість збірки.
> У скілі це треба подати як явний вибір, а не як догму.

### 1.3 Feature-Sliced Design (FSD) — найсуворіша методологія

Три рівні: **Layers → Slices → Segments**.

**Layers** (згори вниз, максимум 7, частина опційна):

1. `app` — усе, що запускає застосунок: роутинг, entrypoints, глобальні стилі, провайдери
2. `processes` (deprecated) — складні міжсторінкові сценарії
3. `pages` — сторінки або великі частини сторінки при вкладеному роутингу
4. `widgets` — великі самодостатні шматки функціоналу/UI
5. `features` — реюзабельні фрагменти продуктового функціоналу, що дають бізнес-цінність
6. `entities` — бізнес-сутності домену (user, product, …)
7. `shared` — реюзабельний код, відв'язаний від специфіки проєкту

**Slices** — розбиття всередині шару за бізнес-доменом (`photo`, `post`, `comments`).
Шари `app` і `shared` слайсів не мають — лише сегменти.

**Segments** — розбиття слайса за технічним призначенням:

| Сегмент | Що лежить |
|---|---|
| `ui` | компоненти, форматери, стилі |
| `api` | запити до бекенду, типи даних, мапери |
| `model` | схеми даних, стори, **бізнес-логіка** |
| `lib` | утиліти, потрібні саме цьому слайсу |
| `config` | конфіг і фіче-флаги |

**Правила:**
- Import rule: модуль може імпортувати тільки з шарів **строго нижче**. Імпорти між слайсами
  одного шару заборонені → «high cohesion, low coupling».
- **Public API rule**: кожен слайс/сегмент має публічний API; ззовні можна звертатись лише до нього,
  не до внутрішньої структури файлів.
- Сегменти називати за **призначенням**, а не за суттю: не `components`/`hooks`, а `ui`/`model`.
- Slice groups: близькі слайси можна вкладати структурно, але **без спільного коду** всередині групи.

Джерела:
- [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview)
- [FSD — Slices and Segments (reference)](https://feature-sliced.design/docs/reference/slices-segments)
- [FSD — головна](https://feature-sliced.design/)
- [FSD — репозиторій документації](https://github.com/feature-sliced/documentation)
- [codecentric — Feature-Sliced Design and good frontend architecture](https://www.codecentric.de/en/knowledge-hub/blog/feature-sliced-design-and-good-frontend-architecture)
- [Godel Tech — FSD guide](https://www.godeltech.com/blog/feature-sliced-design-a-guide-to-scalable-frontend-architecture/)
- [DEV — FSD: The Best Frontend Architecture](https://dev.to/m_midas/feature-sliced-design-the-best-frontend-architecture-4noj)
- [Bits and Pieces — Developing Scalable Frontends with FSD](https://blog.bitsrc.io/developing-frontends-with-feature-sliced-design-a2e5aa33d02c)

### 1.4 Еволюція структури (як подавати новачкам)

Robin Wieruch описує 4 стадії: один файл → кілька файлів → технічні папки
(`components/`, `hooks/`, `context/`, `utils/`) → фіче-папки.

**Promotion rule (ключове правило перенесення):**
> «If exactly one feature uses a util, it lives inside that feature; once **two or more** features
> need it, it moves up to the shared layer.»

Джерело: [Robin Wieruch — React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/)

Додатково: [Sandro Roth — How to structure your React projects](https://sandroroth.com/blog/project-structure/)
— критика bulletproof (тісно зв'язані компоненти й хуки розкидані по типових папках; залежності
між фічами стають непрозорими, можливі цикли) і аргумент на користь FSD.

---

## 2. Колокація — фундаментальний принцип

Kent C. Dodds, «Colocation»:

- Головна теза: **«Place code as close to where it's relevant as possible»**.
- «Things that change together should be located as close as reasonable.»
- Три переваги: **maintainability** (синхронно оновлюється), **applicability** (видно наявні
  патерни), **ease of use** (менше когнітивного навантаження).
- Про utils окремо: **не** виносити функцію в глобальний `utils/` «бо раптом знадобиться» —
  так накопичуються осиротілі неперевірені утиліти. Виносити **лише коли реально потрібно в кількох місцях**.

Джерело: [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation)

Практичний наслідок (широко цитований): «if a helper function is only used by the `PaymentForm`
component, it belongs in the `PaymentForm` directory, not in a global `src/utils` folder».

---

## 3. Компоненти: де лежать і як ділити

### 3.1 Критерій розбиття — Single Responsibility

React docs, «Thinking in React», крок 1:
- «A component should ideally only be concerned with **one thing**.»
- Три способи вирішити, де межа компонента: **programming** (як вирішуєш, коли створити функцію/об'єкт),
  **CSS** (для чого б ти зробив class-селектор), **design** (як розкладені шари в макеті).
- «If your JSON is well-structured, you'll often find that it naturally maps to the component
  structure of your UI» — компонент відповідає шматку моделі даних.

Джерело: [React docs — Thinking in React](https://react.dev/learn/thinking-in-react)

### 3.2 Практичні евристики (bulletproof-react)

- **Колокація**: компоненти, функції, стилі, стан — максимально близько до місця використання.
- **Не робити вкладених render-функцій** усередині компонента — виносити в окремий компонент.
- **Забагато пропсів** → сигнал розбити компонент або застосувати композицію (`children`/слоти).
- Спільні компоненти — будувати абстракції **після** того, як побачив реальні повторення
  (уникати передчасної генералізації).
- **Обгортати сторонні компоненти** у власні, щоб адаптувати до потреб застосунку і мати змогу
  безболісно замінити бібліотеку.

Джерело: [bulletproof-react — components-and-styling.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/components-and-styling.md)

### 3.3 Межа shared vs feature

- `components/` — **тільки** реюзабельні UI-компоненти; усе інше йде у свою фіче-папку.
- Фіча може імпортувати глобальні UI-компоненти; глобальні UI-компоненти **ніколи** не імпортують
  фіче-специфічну логіку.
- Фіча має бути самодостатньою: **видалення папки фічі не повинно ламати решту застосунку**.

Джерела: [Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/),
[bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md),
[Codemzy — My React file/folder structure, 2025 changes](https://www.codemzy.com/blog/react-file-structure)

---

## 4. Де живе бізнес-логіка

### 4.1 Container/Presentational — застарілий у первісному вигляді

Dan Abramov (автор патерну, 2015) у 2019 додав до статті ремарку: **«I don't suggest splitting your
components like this anymore»** — кастомні хуки дають ту саму сепарацію без обгорток-компонентів.
Сама ідея «розділяти як воно виглядає і як воно працює» лишається чинною.

Джерела:
- [patterns.dev — Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/)
- [Medium (Nielsen tech) — Why you should stop using the container/presentational pattern](https://medium.com/nmc-techblog/why-you-should-stop-using-the-container-presentational-pattern-in-redux-29b112406128)
- [GreatFrontend — Presentational vs container](https://www.greatfrontend.com/questions/quiz/explain-the-presentational-vs-container-component-pattern-in-react)

### 4.2 Робочий поділ: application logic (хуки) vs business logic (чисті функції/сервіси)

- **Application logic** — стан, обробники подій, оркестрація → **кастомні хуки**.
- **Business logic** — умови, обчислення, витяг/форматування даних, валідація, виклики API →
  **чисті функції**, що приймають параметри й повертають результат (шар `services`/`model`/`lib`),
  тестуються без React.
- Після винесення логіки UI-компоненти лишаються суто презентаційними: отримують дані й колбеки.

Джерела:
- [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/)
- [Medium — Business vs application logic: how to separate and test your React code](https://antonyleme.medium.com/business-vs-application-logic-how-to-separate-and-test-your-reactjs-code-4291d0c983b1)
- [eMoosavi — Decoupling business logic from UI with custom React hooks](https://www.emoosavi.com/blog/decoupling-business-logic-from-ui-with-custom-react-hooks)
- [Medium — Why separating business logic from components matters](https://asrulkadir.medium.com/why-separating-business-logic-from-components-matters-in-react-applications-5dbe2c71a2ba)
- [DEV — Separating logic from UI in React: a comparison with Angular services](https://dev.to/rcrd/separating-logic-from-ui-in-react-a-comparison-with-angular-services-5en)

У FSD це формалізовано: бізнес-логіка → сегмент `model`, робота з бекендом → `api`.
([FSD reference](https://feature-sliced.design/docs/reference/slices-segments))

### 4.3 Коли виносити кастомний хук — офіційні правила

- **Виносити**, коли: дубльована Effect-логіка; ефект має конкретне реюзабельне призначення;
  треба поділитись stateful-логікою.
- **Не виносити**, коли: це просто маленький шматок дублювання («some duplication is fine»);
  функція не викликає жодного хука → це звичайна функція (`getSorted()`, а не `useSorted()`).
- Назва — `use` + велика літера; це гарантія, що видно, де ховаються стан/ефекти.
- **Custom Hooks let you share *stateful logic* but not *state itself*** — кожен виклик незалежний.
  Потрібен спільний стан → lift state up.
- Хуки мають бути **конкретними високорівневими сценаріями**: ✅ `useData(url)`, `useChatRoom(options)`,
  `useMediaQuery(query)`; 🔴 `useMount`, `useEffectOnce`, `useUpdateEffect` — обгортки над самим `useEffect`.
- «If you struggle to pick a clear name, it might mean that your Effect is too coupled … and is not
  yet ready to be extracted.»

Джерело: [React docs — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)

### 4.4 Стан: server state vs client state

- React Query — це **async state manager**; фронтенд не «володіє» цими даними, він показує знімок.
- **Не синхронізувати** серверні дані у власний стейт-менеджер; налаштувати `staleTime` замість цього.

Джерела:
- [TkDodo — React Query as a State Manager](https://tkdodo.eu/blog/react-query-as-a-state-manager)
- [TkDodo's Blog — індекс серії у документації TanStack Query](https://tanstack.com/query/v4/docs/framework/react/community/tkdodos-blog)
- [Приклад separate-server-and-client-state (CodeSandbox)](https://codesandbox.io/s/separate-server-and-client-state-rp3jx)

### 4.5 Принципи структури локального стану (офіційні)

1. **Group related state** — те, що завжди оновлюється разом, тримати в одній змінній.
2. **Avoid contradictions in state** — замість кількох булевих прапорців один `status`.
3. **Avoid redundant state** — те, що обчислюється з пропсів/стану, не зберігати.
4. **Avoid duplication in state** — зберігати `id`, а не копію об'єкта.
5. **Avoid deeply nested state** — нормалізувати «як у БД».

«Make your state as simple as it can be — but no simpler.»

Джерело: [React docs — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)

---

## 5. utils / helpers / lib / services — що куди

Термінологія в індустрії неусталена; найпоширеніший робочий поділ:

| Папка | Зміст | Критерій |
|---|---|---|
| `utils/` | маленькі generic stateless-функції: форматування дат, генерація id, парсинг URL | «просто допомагає організувати логіку» |
| `lib/` | «міні-пакети» всередині застосунку; інтеграції з зовнішніми системами, преконфігуровані бібліотеки | «говорить із зовнішнім світом»; важче, часто async |
| `helpers/` | те саме, що utils, але **специфічне саме для цього проєкту** (не має сенсу шерити між проєктами) | project-specific |
| `services/` | код, що виконує реальну роботу застосунку: фетчинг, надсилання, бізнес-операції | доменні дії |

Проста евристика: **if it talks to the outside world → `lib`; if it just helps organize logic → `utils`**.

Джерела:
- [indie-starter.dev — Lib vs Utils vs Services Folders](https://indie-starter.dev/blog/lib-vs-utils-vs-services-folders-simple-explanation-for-developers)
- [Medium — Libs vs Utils vs Services Folders](https://medium.com/@a.m.housen/libs-vs-utils-vs-services-folders-simple-explanation-for-developers-0ae961539a0f)
- [Medium — Role of libs and utils in a Next.js 15 project](https://khaisastudio.medium.com/understanding-the-role-of-libs-and-utils-in-a-next-js-15-project-b1c0368ef044)
- [stephencharlesweiss.com — utils vs helpers](https://stephencharlesweiss.com/utils-vs-helpers/)
- [GitHub issue — What's the difference between helpers and utils?](https://github.com/erikras/react-redux-universal-hot-example/issues/808)
- [DEV — Services vs Utils](https://dev.to/moshfiqrony/services-vs-utils-what-is-the-difference-between-services-and-utils-5fh6)

### Критика: `utils/` як «смітник»

Sergey Sova, «Why utils & helpers is a dump»:
- Назва нічого не каже про призначення → папка росте, з'являються дублікати.
- Це симптом архітектурної проблеми, а не легітимного реюзу.
- **Рекомендація**: замість generic-папки робити доменні міні-бібліотеки з описовими назвами
  (`lib/datetime`), з документацією й тестами, за потреби — під npm-скоупом (`@lib/datetime`).

Джерела:
- [DEV — Why utils & helpers is a dump](https://dev.to/sergeysova/why-utils-helpers-is-a-dump-45fo)
- [DEV — Are utils a code smell?](https://dev.to/noway/are-utils-folder-where-you-put-random-stuff-you-don-t-know-where-to-put-otherwise-a-code-smell-3054)

Те саме у FSD: сегмент називається `lib`, і документація прямо радить не називати сегменти за
«суттю» (`components`, `hooks`), а за призначенням.

---

## 6. Константи, магічні числа, enum

- **UPPER_SNAKE_CASE** для констант: `const MAX_LENGTH = 50`.
- **PascalCase** для назв enum, **UPPER_SNAKE_CASE** для його членів:
  `enum Colors { RED = 'red', DARK_BLUE = 'darkBlue' }`.
- Призначення enum/констант: прибрати магічні числа й рядки, дати єдине джерело правди для
  пов'язаних значень, зробити код самодокументованим і не дати потрапити невалідному значенню.
- Розміщення (за загальним принципом promotion rule + колокації): константа, що використовується
  лише в одному компоненті/фічі — поруч із ним; глобальні (env, роути, ключі query) — у `config/`
  (bulletproof) або у сегменті `config` (FSD).

Джерела:
- [Sufle — Naming Conventions in React for Clean & Scalable Code](https://www.sufle.io/blog/naming-conventions-in-react)
- [Better Stack — Understanding TypeScript Enums](https://betterstack.com/community/guides/scaling-nodejs/typescript-enums/)
- [devoreur2code — TypeScript Enums](https://www.devoreur2code.com/blog/typescript-enums)
- [DEV — Naming conventions: the foundation of clean code](https://dev.to/sathishskdev/part-1-naming-conventions-the-foundation-of-clean-code-51ng)
- [bulletproof-react — config folder](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

---

## 7. Іменування файлів і папок

**Дві школи:**

- **PascalCase для компонентів** (`Button.tsx`) — історична конвенція React/Vue, файл збігається
  з іменем компонента.
- **kebab-case для всього** (`button.tsx`, `use-online-status.ts`) — тренд 2025-26; уникає конфліктів
  на case-insensitive файлових системах (macOS/Windows), знімає decision fatigue.
- **Гібрид (найпоширеніший компроміс)**: файл — kebab-case, експортоване ім'я компонента — PascalCase.

Bulletproof-react: kebab-case для `.ts`/`.tsx` файлів і для **всіх** папок у `src/`
(окрім `__tests__`); енфорс через ESLint-плагін `check-file` з `ignoreMiddleExtensions`.

Robin Wieruch: файли — kebab-case; папки — в однині (`customer`, не `customers`);
файли-збірники — у множині (`types.ts`, `hooks.ts`).

Codemzy (2025), що змінилось у практиці:
| Було | Стало |
|---|---|
| мішанина PascalCase/camelCase/kebab-case | всюди kebab-case |
| `index.js` barrel у кожному компоненті | прибрано, імпорт напряму |
| default-експорти | named-експорти як стандарт |
| webpack-аліаси `@components` | відносні імпорти при пласкій структурі |
| немає `features/` | додано `features/` для нереюзабельного коду |

**Absolute imports**: аліас `@/*` → `./src/*`, щоб уникати `../../../component` і не ламати імпорти
при переміщенні файлів (bulletproof).

Джерела:
- [bulletproof-react — project-standards.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md)
- [Robin Wieruch — React Folder Structure](https://www.robinwieruch.de/react-folder-structure/)
- [Codemzy — My React file/folder structure 2025](https://www.codemzy.com/blog/react-file-structure)
- [Medium — PascalCase or kebab-case in file naming](https://medium.com/@sadeqshahmoradi76/pascalcase-or-kebab-case-best-or-bad-practice-in-file-naming-7382635d517e)
- [Piyush Gambhir — Next.js Naming Conventions](https://www.piyushgambhir.com/blogs/next-js-naming-conventions)
- [Medium — Naming conventions in React (Sufle)](https://medium.com/@sufleio/naming-conventions-in-react-for-clean-scalable-code-f6de31294452)

---

## 8. Barrel files (`index.ts`) — головний перформанс-компроміс

**Плюси:** коротші імпорти, приховування внутрішньої структури, публічний API модуля
(це і є механізм інкапсуляції у FSD і в підході Sandro Roth).

**Мінуси, підтверджені вимірами:**
- Імпорт одного експорту тягне завантаження всіх ре-експортованих модулів.
- Vercel: «it takes 200~800ms just to import them» для популярних React-пакетів, іноді — секунди;
  деякі icon-бібліотеки мають до 10 000 ре-експортів в одному barrel.
- Tree-shaking працює лише під час бандлінгу, тож у dev-режимі не рятує.
- Один незрозумілий side effect у ре-експортованому файлі → бандлер консервативно лишає весь barrel.
- Повільніші автокомпліт та статичний аналіз при глибоких ланцюжках ре-експортів; ризик циклічних
  залежностей.
- Приклад: сторінка Next.js, що імпортувала один хук, тягнула 552 kB client chunk → 64 kB після
  прибирання barrel.

**Рішення Next.js:** `modularizeImports` (ручне мапування) і `optimizePackageImports`
(автоматичне сканування entry-barrel). Результати: dev boot 15-70% швидше
(`@material-ui/icons`: 10.2s → 2.9s), продакшн-білд ~28% швидше, cold start до 40% краще.

Джерела:
- [Vercel — How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)
- [ReactUse — Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking, Next.js Dev Memory, and tsc (2026)](https://reactuse.com/blog/barrel-files-tree-shaking/)
- [Medium — Are TypeScript Barrel Files an Anti-pattern?](https://steven-lemon182.medium.com/are-typescript-barrel-files-an-anti-pattern-72a713004250)
- [next.js issue #12557 — Tree shaking doesn't work with TS barrel files](https://github.com/vercel/next.js/issues/12557)
- [webpack discussion #16863 — barrel files and tree-shaking/code-splitting](https://github.com/orgs/webpack/discussions/16863)
- [bulletproof-react — «Avoid barrel files»](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

---

## 9. Енфорс архітектури лінтером

- `import/no-restricted-paths` (eslint-plugin-import) — заборона крос-фічевих імпортів і
  односпрямований потік `shared → features → app` (рекомендація bulletproof-react).
- `eslint-plugin-boundaries` — опис архітектурних елементів і дозволених зв'язків між ними;
  правило `boundaries/entry-point` обмежує імпорти лише через публічний entry point.
- `no-restricted-imports` (вбудоване) — простіший варіант для заборони конкретних шляхів.
- Nx — вбудований tagging + `@nx/enforce-module-boundaries` для монорепо.
- Для FSD існує окремий лінтер архітектури (Steiger) — див. документацію FSD.

Джерела:
- [eslint-plugin-boundaries (npm)](https://www.npmjs.com/package/eslint-plugin-boundaries)
- [eslint-plugin-boundaries — README](https://github.com/javierbrea/eslint-plugin-boundaries/blob/master/README.md)
- [Tim Deschryver — Enforce module boundaries with no-restricted-imports](https://timdeschryver.dev/bits/enforce-module-boundaries-with-no-restricted-imports)
- [DEV — Enforcing layers and project boundaries with Nx](https://dev.to/this-is-learning/architects-delight-enforcing-layers-and-project-boundaries-with-nx-2d8o)
- [Steve Kinney — Architectural Linting exercise](https://stevekinney.com/courses/enterprise-ui/architectural-linting-exercise)

---

## 10. Next.js App Router — окремий випадок

Next.js **неопінійований** щодо організації, але дає механізми:

- **Колокація за замовчуванням**: роут не публічний, доки в сегменті немає `page.js`/`route.js`,
  тож будь-які файли можна безпечно класти поруч у `app/`.
- **Private folders** `_folder` — виводять папку і все вкладене з роутингу; корисні для відділення
  UI-логіки від роутингу та уникнення конфліктів із майбутніми конвенціями фреймворку.
- **Route groups** `(folder)` — групування без впливу на URL; дозволяють різні layout'и,
  кілька root layout'ів, точковий `loading.tsx`.
- **`src/`** — відділяє код застосунку від конфігів у корені.

Три офіційні стратегії організації:
1. усі файли поза `app/` (тоді `app/` — суто роутинг);
2. усі файли у top-level папках усередині `app/`;
3. split by feature/route: глобальне — в корені `app/`, специфічне — у сегменті роуту.

«Choose a strategy that works for you and your team and **be consistent**.»
Назви `components`/`lib` — плейсхолдери без спеціального значення для фреймворку.

Джерело: [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure)

---

## 11. Тренд 2026 (оглядові джерела, нижча достовірність)

Загальний наратив оглядових статей: відхід від технічних папок (`components/`, `hooks/`, `utils/`)
до доменних меж, явних контрактів даних і чіткого ownership; FSD/feature-driven — домінуючий підхід
для продакшн-застосунків.

- [Medium — The Best React.js Architecture for 2026: Domain-Driven + Feature-Sliced Design](https://medium.com/@albert_barsegyan/the-best-react-js-architecture-for-2026-domain-driven-feature-sliced-design-87f6e25d13fe)
- [Medium — How to Structure a Scalable React Project in 2026](https://medium.com/@chiragmehta900/how-to-structure-a-scalable-react-project-in-2026-folder-architecture-guide-5562a6280b1e)
- [dangz.dev — How to structure a React app in 2026](https://dangz.dev/blog/how-to-structure-a-react-app-in-2026)
- [adeptdev.io — React Folder Structure Best Practices in 2026](https://www.adeptdev.io/blogs/react-folder-structure-best-practices)
- [DEV — Recommended folder structure for React (2025)](https://dev.to/pramod_boda/recommended-folder-structure-for-react-2025-48mc)
- [DEV — A practical React project structure you can reuse](https://dev.to/fanebytes/a-practical-react-project-structure-you-can-reuse-332e)
- [Medium — React feature-based folder structure](https://medium.com/@Srinivas.A/react-feature-based-folder-structure-4665e39939e9)

---

## 12. Що варто винести у скіл (чернетка каркасу)

1. **Правила прийняття рішень**, а не готове дерево папок:
   - promotion rule (1 споживач → колокація; 2+ → shared);
   - «якщо видалення папки фічі ламає інше — межа проведена неправильно»;
   - напрямок залежностей і заборона крос-фічевих імпортів;
   - максимум 3-4 рівні вкладеності.
2. **Таблиця «що куди»**: компонент / хук / чиста функція / константа / тип / запит до API /
   стор — з критерієм вибору між feature-scope і shared.
3. **Розділення логіки**: UI ← хук (application logic) ← чиста функція (business logic);
   server state окремо від client state.
4. **Іменування**: один регістр на весь проєкт (рекомендація: kebab-case файли + PascalCase експорт),
   `use`-префікс, UPPER_SNAKE_CASE константи, PascalCase enum.
5. **Явні трейд-офи** з обома позиціями: barrel files (інкапсуляція vs білд),
   FSD (строгість vs оверхед для малих проєктів), `utils/` (зручність vs смітник).
6. **Енфорс**: приклад конфігу `import/no-restricted-paths` або `eslint-plugin-boundaries`.
7. **Anti-patterns checklist** для рев'ю — окремим файлом, як у `react-best-practices`.

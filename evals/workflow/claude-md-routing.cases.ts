import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts that the on-disk `CLAUDE.md` chain actually STEERS a
 * session: the root map, the nested per-package `AGENTS.md` (symlinked as `CLAUDE.md`), the
 * "Read when" pointer rows, and the "Session protocol" skill hooks.
 *
 * Only files that exist in this starter template are asserted on — the per-package `docs/`
 * here hold just an index `README.md`, so there is no `pipeline.md`/`api-contracts.md` to
 * route to yet (those arrive in later lessons).
 *
 * Trace mechanics: `filesRead` captures only explicit `Read` tool calls — the harness's
 * silent auto-load of a nested `CLAUDE.md` is invisible to it. Every prompt below therefore
 * asks the model to CONSULT the guidance, so the read shows up in the trace. Package
 * `CLAUDE.md` is a symlink to `AGENTS.md`; the resolved path is asserted.
 *
 * Budget: 6 Claude sessions total.
 *   - 4 × trace                                           = 4
 *   - 1 × activation pair (positive + near-miss negative) = 2
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): root CLAUDE.md -> nested server/AGENTS.md -> its "Read when" row ------
  {
    kind: "trace",
    name: "route-contract task chains root -> server/AGENTS.md -> server/specs",
    prompt:
      "Я хочу змінити контракт публічного роуту в server/. Пройди маршрутизацію настанов цього репо: " +
      "спершу настанови саме пакета server/, потім те, що вони наказують прочитати для зміни контракту " +
      "роуту. Прочитай ці документи, код поки не чіпай.",
    expectFilesRead: ["server/AGENTS.md", "server/specs/README.md"],
    maxTurns: 8,
  },

  // --- trace (1 session): working inside a package pulls that package's own CLAUDE.md ----------
  {
    kind: "trace",
    name: "work inside client/ reads the package's own AGENTS.md",
    prompt:
      "Я збираюся додавати новий компонент у client/. Перш ніж писати код — звірся з настановами саме " +
      "цього пакета (його AGENTS/CLAUDE) щодо розкладки папок і non-default конвенцій. Інші пакети не чіпай.",
    expectFilesRead: ["client/AGENTS.md"],
    maxTurns: 6,
  },

  // --- trace (1 session): root CLAUDE.md "Read when" routing for a cross-package contract ------
  {
    kind: "trace",
    name: "cross-package contract task follows root CLAUDE.md routing to specs/",
    prompt:
      "Мені треба змінити контракт, який перетинає межу між server і client. За настановами цього репо " +
      "(CLAUDE.md) — яку документацію треба прочитати перед такою зміною? Прочитай саме її, код не чіпай.",
    expectFilesRead: ["specs/README.md"],
    maxTurns: 6,
  },

  // --- trace (1 session): server/AGENTS.md "invoke the onion-architecture skill" ---------------
  {
    kind: "trace",
    name: "backend placement question engages onion-architecture via server/AGENTS.md",
    prompt:
      "У server/ мені треба додати код, що ходить у зовнішній GitHub API. У яке onion-кільце це покласти " +
      "і як саме під'єднати? Дій за настановами пакета server/.",
    expectSkills: ["onion-architecture"],
    expectFilesRead: ["server/AGENTS.md"],
    maxTurns: 6,
  },

  // --- activation pair (2 sessions): "Session protocol" -> pr-self-review ----------------------
  {
    kind: "activation",
    name: "pr-self-review activates before opening a PR",
    prompt:
      "Я закінчив зміни у server/ і готовий відкривати pull request. Зроби те, що за настановами цього " +
      "репо треба зробити безпосередньо перед цим.",
    skill: "pr-self-review",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining pr-self-review must NOT run it",
    prompt: "Поясни своїми словами, що робить скіл pr-self-review і коли він блокує мерж.",
    skill: "pr-self-review",
    shouldActivate: false,
    maxTurns: 3,
  },
];

import type { SkillCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// This skill's method IS the tooling: Glob every package.json, Read each, derive the internal
// graph from tsconfig paths, Grep src/ for unused/phantom deps. So the cases run WITH tools
// (Read/Grep/Glob — Bash is stripped by the loader, so `du` can't run) against the REAL repo,
// the way `skillTask` now allows. The one thing tools can't get in this sandbox — on-disk
// sizes — is handed in as a pre-collected fixture; the skill's own body says to treat supplied
// `du` output as measured.
//
// `tools` is left to the skill's `allowed-tools:` frontmatter (→ Read, Grep, Glob) for the repo
// cases; the last case pins `tools: []` to keep one fast, cheap content-only check of the report
// rubric in isolation.

const SIZES = fx("du-sizes.txt");

const FULL_PROMPT = `Run a full dependency check on this repository — the working directory is the repo root. Discover the packages yourself, read their package.json and tsconfig.json, and produce the full report: graph, size tables, classification findings, prioritized action list, summary.

${SIZES}`;

const INTERNAL_PROMPT = `Analyze this repo's dependencies, with particular attention to how the packages depend on each other internally. The working directory is the repo root — inspect the real files.

${SIZES}`;

const PRIORITIZE_PROMPT = `We think some dependencies are misplaced, unused, or duplicated across packages. Inspect the real repo (working directory = repo root) and tell us what to prioritize fixing first.

${SIZES}`;

// Synthetic, deliberately small, and shaped like the real repo (6 packages, no workspace,
// vendored @devdigest/shared). Used only for the content-only rubric case.
const SYNTHETIC_DATA = `Treat this as already collected — produce the report directly, do not ask for tool access.

Packages (no workspace; each has its own package.json + node_modules):
  server        deps: fastify@5.2.0, drizzle-orm@0.38.3, zod@3.25.76, dependency-cruiser@17.4.3, openai@4.104.0
                devDeps: vitest@2.1.9, typescript@5.9.3, drizzle-kit@0.30.1
  client        deps: next@15.1.3, react@19.0.0, zod@3.25.76, mermaid@11.15.0, lucide-react@0.469.0
                devDeps: vitest@2.1.9, typescript@5.9.3, tailwindcss@4.0.0
  reviewer-core deps: openai@4.104.0, zod@3.25.76        devDeps: typescript@5.9.3, vitest@2.1.9   (NO pnpm-lock.yaml)
  mcp           deps: @modelcontextprotocol/sdk@1.30.0, zod@3.25.76
  e2e           devDeps: typescript@5.9.3, tsx@4.23.12   (NO pnpm-lock.yaml)
  evals         deps: openai@4.104.0   devDeps: typescript@5.6.0, vitest@2.1.0

@devdigest/shared is vendored (copied into server/src/vendor/shared AND client/src/vendor/shared) — not an npm install.

Installed sizes (du -sk, KB):
  server/node_modules/typescript 23388, server/node_modules/js-tiktoken 22008, server/node_modules/dependency-cruiser 1568
  client/node_modules/next 155960, client/node_modules/mermaid 77116, client/node_modules/typescript 23388
  reviewer-core/node_modules/typescript 23396, mcp/node_modules/typescript 23396, e2e/node_modules/typescript 23396, evals/node_modules/typescript 23388

Imports crossing package boundaries (grep):
  server/src/adapters/github/octokit.ts imports "@devdigest/reviewer-core" (tsconfig path alias to ../reviewer-core/src)
  mcp/src/index.ts imports "@devdigest/shared" (tsconfig path alias to ../server/src/vendor/shared)
  grep found no import of "dependency-cruiser" anywhere under server/src — it is only invoked from the "arch:check" package.json script.`;

export const cases: SkillCase[] = [
  {
    name: "full report: discovers all 6 packages, draws a valid graph, and grounds findings in the real tree",
    kind: "quality",
    prompt: FULL_PROMPT,
    grounding: ["```mermaid"],
    practices: [
      "a Scope line (or section) names all six packages actually present — server, client, reviewer-core, mcp, e2e, evals",
      "the report contains a fenced ```mermaid block whose first content line is a valid declaration (`graph` or `flowchart` plus a direction such as TD or LR) and which contains at least one `-->` edge",
      "the two vendored `@devdigest/shared` copies (server/src/vendor/shared and client/src/vendor/shared) are shown as internal dependency edges and explicitly excluded from the size math",
      "there is a size table with a row per package showing a concrete node_modules total (e.g. server 235 MB, client 644 MB), not a single vague sentence about size",
      "findings are grouped under explicit priority tiers labelled P1/P2/P3/P4 (or an equivalent explicit ranking), not one flat unranked list",
      "every listed finding ends in a concrete action naming a verb — drop, replace with, move to devDependencies, dedupe to <version>, or keep — never a vague 'consider optimizing'",
      "the report ends with a Summary of 3-5 prioritized, actionable takeaways",
    ],
    threshold: 0.8,
    maxTurns: 40,
  },
  {
    name: "separates internal path-alias edges from npm dependencies and does not invent a workspace",
    kind: "quality",
    prompt: INTERNAL_PROMPT,
    practices: [
      "internal cross-package links (the tsconfig `@devdigest/*` path aliases, the vendored `@devdigest/shared` copies) are presented in their own graph or section, separate from the external npm-dependency tables — not merged into one flat dependency list",
      "the report treats today's layout as no-workspace / independent per-package installs (quotable phrasing such as 'no-workspace', 'each package has its own package.json / node_modules', 'duplicated across node_modules trees'); any mention of a pnpm workspace / `workspace:*` appears only as a future recommendation, never as how dependencies resolve now",
      "the two vendored `@devdigest/shared` copies under server/src/vendor/shared and client/src/vendor/shared are reported as PRESENT (the skill is expected to verify them on disk, not guess from tsconfig) — a claim that they are missing / phantom is a failure",
      "reviewer-core and e2e are flagged as missing a pnpm-lock.yaml (a reproducibility risk), distinct from the packages that have one",
    ],
    threshold: 0.75,
    maxTurns: 40,
  },
  {
    name: "prioritized findings are specific, tiered, and advisory — not executed",
    kind: "quality",
    prompt: PRIORITIZE_PROMPT,
    practices: [
      "every finding carries an explicit priority tier (P1/P2/P3/P4 or an equivalent explicit rank), none left unranked",
      "`dependency-cruiser` declared in server/package.json `dependencies` while only ever invoked from the `arch:check` script is called out as a misplaced dependency that belongs in devDependencies, naming the file",
      "the cross-package on-disk duplication (the same name+version installed in multiple node_modules trees, e.g. typescript in all six) is quantified as one headline number or size, not just mentioned",
      "any transitive / sub-tree saving from removing a package is labelled as an upper bound ('up to …'), never asserted as a certain figure",
      "removing or moving a dependency is phrased as a recommendation for the developer to confirm, not reported as an action the skill has taken",
    ],
    threshold: 0.8,
    maxTurns: 40,
  },
  {
    name: "content-only: report rubric holds when all data is pre-supplied",
    kind: "quality",
    prompt: `Run a dependency check. I want the full report: graph, sizes, prioritized findings, recommendations.\n\n${SYNTHETIC_DATA}`,
    tools: [],
    grounding: ["```mermaid"],
    practices: [
      "the report has the five sections the skill defines — a dependency graph, a size breakdown, classification findings, a prioritized action list, and a summary",
      "findings are labelled with explicit P1/P2/P3/P4 tiers rather than left unranked",
      "`dependency-cruiser`, declared in server but imported nowhere under server/src, is called out explicitly as a misplaced or unused dependency",
      "the declared version drift in evals (typescript ^5.6.0 / vitest ^2.1.0 vs the rest) is noted as version skew",
      "removing `dependency-cruiser` from `dependencies` is presented as a recommendation to confirm, not something already done",
    ],
    threshold: 0.7,
    maxTurns: 10,
  },
];

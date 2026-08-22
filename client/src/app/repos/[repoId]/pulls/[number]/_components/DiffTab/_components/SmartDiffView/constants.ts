/**
 * Path-glob patterns for the deterministic Smart Diff classification
 * (`classify()` in ./helpers.ts). Evaluated top-down, first match wins —
 * boilerplate is checked before wiring so config/lockfiles never leak into
 * the wiring bucket. See plans/smart-diff.md for the rationale.
 *
 * Glob syntax supported by `matchesAny()`: `**` = any path segment(s),
 * `*` = any characters within a segment, no `/` in the pattern = match the
 * basename at any depth.
 */
export const BOILERPLATE_PATTERNS: string[] = [
  // lock files
  "**/package-lock.json",
  "**/pnpm-lock.yaml",
  "**/yarn.lock",
  // generated / build output
  "**/migrations/**",
  "dist/**",
  "build/**",
  "*.min.js",
  "*.generated.*",
  "*.snap",
  // tests + fixtures
  "*.test.ts",
  "*.test.tsx",
  "*.it.test.ts",
  "**/__fixtures__/**",
  "**/test/**",
  "e2e/specs/*.flow.json",
  // tooling / infra config
  "*.config.*",
  "tsconfig*.json",
  "package.json",
  ".eslintrc*",
  ".github/workflows/**",
  "Dockerfile",
  "docker-compose.yml",
  ".env*",
  // barrels, by basename
  "index.ts",
  "styles.ts",
  "constants.ts",
  // docs, images, i18n strings
  "*.md",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.svg",
  "*.webp",
  "*.ico",
  "**/messages/**/*.json",
];

export const WIRING_PATTERNS: string[] = [
  "**/routes.ts",
  "**/app.ts",
  "**/platform/container.ts",
  "server/src/modules/index.ts",
  "**/page.tsx",
  "**/layout.tsx",
  "**/providers*.tsx",
  "**/middleware.ts",
  "client/src/lib/hooks/**",
  "client/src/lib/api.ts",
  "*.d.ts",
];

/** Fixed render order for Smart Diff groups — core first, boilerplate last
 *  (it's the noisiest and always collapsed by default). */
export const GROUP_ORDER = ["core", "wiring", "boilerplate"] as const;

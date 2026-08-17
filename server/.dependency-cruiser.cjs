/**
 * Onion Architecture boundaries for server/.
 *
 * Rings, innermost first:
 *   contracts   src/vendor/shared/**        Zod contracts + port interfaces
 *   domain      ../reviewer-core/src/**     pure review engine, zero I/O
 *   application src/modules/<m>/service.ts  use cases, orchestration
 *   infra       src/adapters/**, src/db/**, src/modules/<m>/repository*
 *   entry       src/modules/<m>/routes.ts, src/app.ts, src/platform/container.ts
 *
 * Dependencies point inward only. `severity: 'error'` fails `pnpm arch:check`;
 * `'warn'` marks a known leak that is being paid down, not a rule to ignore.
 *
 * See .claude/skills/onion-architecture/enforcement.md
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment:
        'reviewer-core is the domain ring: it may not reach into server. If it needs data, ' +
        'add a field to ReviewInput and let the caller resolve it.',
      severity: 'error',
      from: { path: '^../reviewer-core/src' },
      to: { path: '^src', pathNot: '^src/vendor/shared' },
    },
    {
      name: 'contracts-depend-on-nothing',
      comment:
        'vendor/shared holds contracts and port interfaces — the innermost ring. ' +
        'It may not import modules, adapters, db or platform.',
      severity: 'error',
      from: { path: '^src/vendor/shared' },
      to: { path: '^src/(modules|adapters|db|platform)' },
    },
    {
      name: 'service-not-in-db',
      comment:
        'An application service may not talk to Drizzle. Persistence lives behind ' +
        'repository.ts, which returns domain types rather than table rows.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/service\\.ts$' },
      to: { path: '^src/db/(schema|client)' },
    },
    {
      name: 'service-not-in-adapters',
      comment:
        'An application service reaches the outside world through a port from ' +
        'vendor/shared/adapters.ts, never through a concrete adapter implementation.',
      severity: 'warn',
      from: { path: 'src/modules/[^/]+/service\\.ts$' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'entry-not-in-repository',
      comment:
        'routes.ts is the presentation ring: it calls a service, never a repository. ' +
        'Skipping the service ring puts use-case logic in the HTTP handler.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/routes\\.ts$' },
      to: { path: 'src/modules/[^/]+/repository' },
    },
    {
      name: 'fastify-stays-at-the-edge',
      comment:
        'Fastify types stop at routes.ts / app.ts / platform. A service or repository ' +
        'that imports fastify has the framework leaking into an inner ring.',
      severity: 'error',
      from: {
        path: '^src/modules/',
        pathNot: 'src/modules/[^/]+/routes\\.ts$',
      },
      to: { dependencyTypes: ['npm'], path: '^fastify' },
    },
    {
      name: 'repository-owns-persistence',
      comment:
        'Only repositories, migrations and seeds touch the Drizzle schema. ' +
        'A route or service importing db/schema bypasses the persistence boundary.',
      severity: 'error',
      from: {
        path: '^src/modules/',
        pathNot: 'src/modules/[^/]+/repository',
      },
      to: { path: '^src/db/schema' },
    },
    {
      name: 'infra-does-not-import-modules',
      comment:
        'Adapters and platform are outside the application ring: they may not reach ' +
        'up into a module. What an adapter and a module genuinely share (scan scope, ' +
        'limits) belongs to neither — put it in platform/ and re-export it from the ' +
        "module's constants.ts.\n" +
        'platform/container.ts is exempt: it is the composition root — entry ring, ' +
        'not infrastructure — and naming concrete classes is precisely its job.',
      severity: 'error',
      from: {
        path: '^src/(adapters|platform)/',
        pathNot: '^src/platform/container\\.ts$',
      },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-cross-module-imports',
      comment:
        'Modules are siblings, not a hierarchy. Share through vendor/shared, ' +
        'modules/_shared or platform — composition happens in the container.',
      severity: 'warn',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/'],
      },
    },
    {
      name: 'no-circular',
      comment:
        'A dependency cycle means the ring boundary is drawn in the wrong place.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Unreachable module — dead code, or a missing wiring in the container.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: ['\\.d\\.ts$', '(^|/)tsconfig\\.json$', '(^|/)\\.[^/]+\\.(cjs|js|ts)$'],
      },
      to: {},
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|clones|src/db/migrations)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.ts'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};

// Re-export only — `platform/config.ts` stays the single source of truth for
// the default search roots. This module boundary exists so `service.ts`
// (application ring) never imports a `platform/*` value directly: importing
// the platform module's value would also execute its module body (including
// `import 'dotenv/config'`) inside an application-ring unit.
export { DEFAULT_CONTEXT_SEARCH_ROOTS } from '../../platform/config.js';

import { z } from 'zod';

/**
 * Process-level configuration, read once at module load (fail fast — an
 * invalid `DEVDIGEST_API_URL` throws immediately at process start, not on the
 * first tool call). No secrets/tokens here: the API is unauthenticated
 * (`LocalNoAuthProvider`); this package never reads an auth-shaped env var.
 */
const ConfigSchema = z.object({
  apiUrl: z.string().url(),
  requestTimeoutMs: z.number().int().positive(),
  runTimeoutMs: z.number().int().positive(),
  pollIntervalMs: z.number().int().positive(),
});

export type Config = z.infer<typeof ConfigSchema>;

function readConfig(): Config {
  const raw = {
    apiUrl: process.env.DEVDIGEST_API_URL ?? 'http://localhost:3001',
    requestTimeoutMs: Number(process.env.DEVDIGEST_REQUEST_TIMEOUT_MS ?? 15_000),
    runTimeoutMs: Number(process.env.DEVDIGEST_RUN_TIMEOUT_MS ?? 180_000),
    pollIntervalMs: Number(process.env.DEVDIGEST_POLL_INTERVAL_MS ?? 2_000),
  };

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid DevDigest MCP configuration — ${issues}`);
  }

  return parsed.data;
}

export const config = readConfig();

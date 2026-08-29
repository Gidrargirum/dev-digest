import { defineConfig } from "vitest/config";
import TrendReporter from "./src/trend-reporter.js";

export default defineConfig({
  test: {
    // *.eval.ts = model-backed evals; src/**/*.test.ts = the pure stats unit tests.
    include: ["**/*.eval.ts", "src/**/*.test.ts"],
    // Real Claude sessions (and a subagent dispatch) are slow — give them room.
    testTimeout: 240_000,
    hookTimeout: 240_000,
    // One session per test; a few files can run concurrently. Keep it modest to stay cheap.
    fileParallelism: true,
    // Model evals are probabilistic — a single bad roll shouldn't fail the suite. Allow ONE
    // retry (2 attempts max) so a solid case still costs 1 session and only a failure re-spends.
    // Bump deliberately (and mind the token cost) if you want a fuller stability signal;
    // `pnpm eval:repeat -n 2` is the tool for that.
    retry: 1,
    reporters: ["default", new TrendReporter()],
  },
});

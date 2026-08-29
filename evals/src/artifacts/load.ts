/**
 * Load a skill / agent artifact from disk as text, to inject as a system prompt. This is what
 * makes skillTask/agentTask measure the artifact's CONTENT in isolation.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SKILLS_DIR, AGENTS_DIR } from "./paths.js";

function stripFrontmatter(md: string): string {
  if (md.startsWith("---")) {
    const end = md.indexOf("\n---", 3);
    if (end !== -1) return md.slice(end + 4).replace(/^\n+/, "");
  }
  return md;
}

/** SKILL.md plus every references/*.md — the full payload the harness would assemble. */
export function skillContent(skillName: string): string {
  const dir = join(SKILLS_DIR, skillName);
  const skillMd = join(dir, "SKILL.md");
  if (!existsSync(skillMd)) throw new Error(`SKILL.md not found: ${skillMd}`);
  const parts = [readFileSync(skillMd, "utf8")];
  const refs = join(dir, "references");
  if (existsSync(refs)) {
    for (const f of readdirSync(refs).filter((f) => f.endsWith(".md")).sort()) {
      parts.push(`\n\n## Reference: ${f}\n\n${readFileSync(join(refs, f), "utf8")}`);
    }
  }
  return parts.join("\n");
}

/** An agent definition with its frontmatter stripped (the behavioral prompt only). */
export function agentContent(agentName: string): string {
  const f = join(AGENTS_DIR, `${agentName}.md`);
  if (!existsSync(f)) throw new Error(`agent not found: ${f}`);
  return stripFrontmatter(readFileSync(f, "utf8"));
}

// Tools the eval refuses to hand a subagent or a skill: evals run with bypassPermissions against
// the LIVE repo, so a mutating tool could take real actions. An artifact that declares these
// still runs — it just runs read-only, which is all an eval ever needs.
const MUTATING_TOOLS = new Set(["Write", "Edit", "NotebookEdit", "Bash"]);
const READONLY_FALLBACK = ["Read", "Grep", "Glob"];

/**
 * Parse a `tools:` / `allowed-tools:` frontmatter line into a safe read-only allow-list.
 * Returns null when the frontmatter declares neither key (genuine content-only artifact).
 * Mutating tools are stripped; a `*` / "All tools" grant collapses to the read-only fallback
 * rather than handing over Write/Bash on the live repo.
 */
function parseDeclaredTools(md: string): string[] | null {
  const fmEnd = md.startsWith("---") ? md.indexOf("\n---", 3) : -1;
  const frontmatter = fmEnd !== -1 ? md.slice(0, fmEnd) : "";
  const line = frontmatter.match(/^(?:tools|allowed-tools):\s*(.+)$/m);
  if (!line) return null;
  const raw = line[1].trim();
  if (raw === "*" || /all tools/i.test(raw)) return [...READONLY_FALLBACK];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !MUTATING_TOOLS.has(t));
}

/**
 * The tools an agent DECLARES in its frontmatter (`tools: Read, Glob, Grep`), so the eval can run
 * a tool-using agent the way production does instead of crippling it to content-only. Derived per
 * agent from its own declaration — no per-agent wiring. Returns [] when the agent declares no
 * tools (genuine content-only agent).
 */
export function agentTools(agentName: string): string[] {
  const f = join(AGENTS_DIR, `${agentName}.md`);
  if (!existsSync(f)) throw new Error(`agent not found: ${f}`);
  return parseDeclaredTools(readFileSync(f, "utf8")) ?? [];
}

/**
 * The tools a SKILL.md declares in its `allowed-tools:` frontmatter. A procedural skill (one whose
 * method is "run `du`, read every package.json, grep the imports") is meaningless measured
 * content-only, so the eval hands it exactly the read-only slice of what it declares and lets it
 * work the real repo. Returns [] when the skill declares none — the historical content-only
 * default, unchanged for every skill that does not opt in. Mutating tools (incl. `Bash`) are
 * stripped: a skill that needs `du` must degrade gracefully without it (see the skill body).
 */
export function skillTools(skillName: string): string[] {
  const f = join(SKILLS_DIR, skillName, "SKILL.md");
  if (!existsSync(f)) throw new Error(`SKILL.md not found: ${f}`);
  return parseDeclaredTools(readFileSync(f, "utf8")) ?? [];
}

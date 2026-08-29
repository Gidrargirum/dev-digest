# Report template

Emit exactly these sections, in this order. Keep tables scrollable — never wrap
prose around them. `--json` writes the same data as a structured file to the
scratchpad (`dependency-audit.json`) instead of prose, shape at the bottom.

---

```markdown
## Dependency Audit — <repo>, <date>

Scope: <all N packages | package `<name>`>   ·   Installed: <N/N packages have node_modules>
Partial: <yes — list uninstalled packages | no>

### 1. Dependency graph

#### Internal (local package → local package)

​```mermaid
graph LR
  client --> shared_client["@devdigest/shared (vendored copy)"]
  server --> shared_server["@devdigest/shared (vendored copy)"]
  server --> reviewer_core["reviewer-core (path alias)"]
  mcp --> server
  e2e -.->|http| server
  e2e -.->|http| client
  evals --> reviewer_core
​```

> Edges from `tsconfig.json` path aliases are solid; runtime-only / cross-process
> edges are dashed. The two vendored `@devdigest/shared` copies are drawn
> separately — they have already diverged.

#### External hubs (third-party packages many local packages pull)

​```mermaid
graph TD
  typescript["typescript ~X MB"] --> server & client & reviewer_core & mcp & e2e & evals
  vitest["vitest ~X MB"] --> server & client & reviewer_core
  <llm-sdk>["<llm sdk> ~X MB"] --> reviewer_core & server
​```

### 2. Size breakdown

#### Per package

| Package | Direct deps | Dev deps | node_modules total | Transitive packages | Installed? |
|---|--:|--:|--:|--:|:--:|
| server | | | X MB | | ✅ |
| client | | | X MB | | ✅ |
| … | | | | | |
| **Total** | | | **X MB** | | |

Duplicated on disk across packages (same name+version in ≥2 trees): **X MB**
— the standing cost of the no-workspace layout.

#### Heaviest installs (top 10 per package, or top 20 overall for a single-package run)

| Package | Dependency | Size | Type | Reason for existence |
|---|---|--:|---|---|
| client | next | X MB | build/runtime | App Router studio |
| … | | | | |

### 3. Classification findings

| Dependency | Package(s) | Size | Type | Flag | Note |
|---|---|--:|---|---|---|
| <name> | <pkg> | X MB | runtime | misplaced | in devDependencies but imported by `src/…` |
| … | | | | | |

### 4. Prioritized action list

#### P1 — do now (high impact · high ease)
1. **<name>** — <package> — <size> — <type>/<flag>
   - Why: <one line>
   - Action: <drop | replace with … | move to devDependencies | dedupe to vX>
   - Risk: <what to check first>

#### P2 — plan it (high impact · needs code/tests)
…

#### P3 — batch it (low-risk cleanup)
…

#### P4 — note only (no action unless the file is touched anyway)
…

### 5. Summary

- Reclaimable now (P1, certain bytes): **~X MB**
- Reclaimable with work (P2, "up to"): **~X MB**
- Version-skew risks found: <N>  ·  phantom deps: <N>  ·  unused: <N>
- One-sentence verdict.
```

---

## `--json` shape

```json
{
  "generatedAt": "<iso>",
  "scope": "all" | "<package>",
  "partial": ["<uninstalled package>"],
  "packages": [
    { "name": "server", "path": "server", "installed": true,
      "counts": { "dependencies": 0, "devDependencies": 0, "transitive": 0 },
      "nodeModulesBytes": 0,
      "topInstalls": [ { "name": "", "bytes": 0, "type": "", "reason": "" } ] }
  ],
  "graph": {
    "internal": [ { "from": "mcp", "to": "server", "kind": "alias|runtime|http" } ],
    "externalHubs": [ { "name": "typescript", "bytes": 0, "usedBy": ["server","client"] } ]
  },
  "duplicatedOnDiskBytes": 0,
  "findings": [
    { "name": "", "packages": [""], "bytes": 0, "type": "", "flags": [""],
      "why": "", "action": "", "risk": "", "priority": "P1|P2|P3|P4",
      "savingCertainBytes": 0, "savingUpToBytes": 0 }
  ],
  "summary": { "reclaimableNowBytes": 0, "reclaimableWithWorkBytes": 0,
               "phantom": 0, "unused": 0, "versionSkew": 0 }
}
```

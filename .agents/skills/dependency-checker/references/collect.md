# Collect — raw data per package

All commands assume you `cd` into the package directory first. Run them for every
package discovered in step 0. Keep the output in a scratch file per package —
`references/report-template.md` consumes it.

## 0. Discover the packages

```sh
find . -maxdepth 2 -name package.json -not -path '*/node_modules/*' -print
```

For each hit, note beside it:

```sh
d=$(dirname "$PKG")
test -d "$d/node_modules" && echo "installed" || echo "not installed"
test -f "$d/pnpm-lock.yaml" && echo "has lockfile" || echo "no lockfile (shares/uses parent or reviewer-core case)"
```

## 1. Declared dependencies

```sh
# names + ranges, one per line, tagged by bucket
node -e '
  const p = require("./package.json");
  for (const b of ["dependencies","devDependencies","peerDependencies","optionalDependencies"])
    for (const [k,v] of Object.entries(p[b]||{})) console.log(`${b}\t${k}\t${v}`);
'
```

## 2. Installed size of every top-level dependency

`du` on each direct child of `node_modules` (skip `.bin`, `.pnpm`, `.cache`,
scoped-package wrapper dirs are handled by the `*/` glob depth):

```sh
du -sk node_modules/*/ node_modules/@*/*/ 2>/dev/null | sort -rn | head -40
du -sk node_modules 2>/dev/null | tail -1          # whole-tree total
```

Sizes are in KB (`-k`). Convert to MB in the report. On macOS `du -sk` is fine;
do **not** pass `--apparent-size` (not portable).

## 3. Transitive fan-out

From the lockfile — total distinct packages pnpm resolved for this package:

```sh
grep -cE '^\s{2}/?[^:]+:' pnpm-lock.yaml 2>/dev/null            # rough package count
# better, if yq is available:
yq '.packages | keys | length' pnpm-lock.yaml 2>/dev/null
```

If neither works, count resolved dirs instead:

```sh
find node_modules/.pnpm -maxdepth 1 -type d 2>/dev/null | wc -l
```

## 4. Installed vs declared version

```sh
node -e '
  const decl = {...require("./package.json").dependencies, ...require("./package.json").devDependencies};
  for (const name of Object.keys(decl)) {
    try {
      const v = require(`${name}/package.json`).version;
      console.log(`${name}\tdeclared ${decl[name]}\tinstalled ${v}`);
    } catch { console.log(`${name}\tdeclared ${decl[name]}\tinstalled MISSING`); }
  }
'
```

## 5. Unused / phantom detection

- **Unused**: declared in `package.json`, zero import hits in source.
  ```sh
  rg -l --type ts --type tsx "from ['\"]<name>|require\(['\"]<name>" src || echo "UNUSED: <name>"
  ```
- **Phantom**: imported in source, absent from `package.json` (relies on hoisting).
  Diff the set of bare import specifiers in `src/` against declared names.
- Prefer `depcheck` if it is already installed in the package
  (`node_modules/.bin/depcheck`); otherwise do the `rg` sweep and label results
  "heuristic — verify before acting".

## 6. Internal graph edges

`package.json` rarely names local packages here — edges live in path aliases:

```sh
node -e 'const c=require("./tsconfig.json"); console.log(JSON.stringify(c.compilerOptions?.paths||{},null,2))'
```

Map each alias target path to the package that owns it. Also record the two
vendored `@devdigest/shared` copies as edges into `server/` and `client/`.

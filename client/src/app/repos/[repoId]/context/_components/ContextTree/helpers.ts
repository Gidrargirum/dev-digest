import type { ContextDoc, ContextFolder } from "@devdigest/shared";

/** One node in the document folder tree (AC-27/28). A document's identity is
    its full repo-relative path, never its file name. */
export interface TreeNode {
  /** Last path segment — the display label. */
  name: string;
  /** Full repo-relative path — the node's identity. */
  path: string;
  kind: "folder" | "doc";
  children: TreeNode[];
  /** Present on doc leaves only. */
  doc?: ContextDoc;
}

function folderAt(level: TreeNode[], segments: string[]): TreeNode | null {
  let current: TreeNode[] = level;
  let node: TreeNode | null = null;
  const acc: string[] = [];
  for (const seg of segments) {
    acc.push(seg);
    let child = current.find((c) => c.kind === "folder" && c.name === seg);
    if (!child) {
      child = { name: seg, path: acc.join("/"), kind: "folder", children: [] };
      current.push(child);
    }
    node = child;
    current = child.children;
  }
  return node;
}

/**
 * Assemble the folder tree from the document catalog plus any explicitly
 * registered empty folders (AC-27/30). Arbitrary nesting depth (AC-28);
 * folders sort before files, both alphabetical; a document's path is its
 * identity.
 */
export function buildTree(docs: ContextDoc[], folders: ContextFolder[]): TreeNode[] {
  const roots: TreeNode[] = [];

  for (const folder of folders) {
    const segs = folder.path.split("/").filter(Boolean);
    if (segs.length) folderAt(roots, segs);
  }

  for (const doc of docs) {
    const segs = doc.path.split("/").filter(Boolean);
    const fileName = segs.pop();
    if (!fileName) continue;
    const parent = segs.length ? folderAt(roots, segs) : null;
    const leaf: TreeNode = { name: fileName, path: doc.path, kind: "doc", children: [], doc };
    (parent ? parent.children : roots).push(leaf);
  }

  return sortLevel(roots);
}

function sortLevel(nodes: TreeNode[]): TreeNode[] {
  for (const n of nodes) if (n.kind === "folder") sortLevel(n.children);
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Case-insensitive filter over leaf paths; keeps every ancestor branch of a
    match so a matching document is never hidden behind a collapsed folder. */
export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const walk = (list: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const n of list) {
      if (n.kind === "doc") {
        if (`${n.path} ${n.name}`.toLowerCase().includes(q)) out.push(n);
        continue;
      }
      const kids = walk(n.children);
      if (kids.length || n.path.toLowerCase().includes(q)) out.push({ ...n, children: kids });
    }
    return out;
  };
  return walk(nodes);
}

/** Depth-first list of the currently visible rows (expanded branches only) —
    the model the keyboard navigation moves through. */
export function flattenVisible(
  nodes: TreeNode[],
  expanded: ReadonlySet<string>,
  depth = 0,
): { node: TreeNode; depth: number }[] {
  const out: { node: TreeNode; depth: number }[] = [];
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.kind === "folder" && expanded.has(node.path)) {
      out.push(...flattenVisible(node.children, expanded, depth + 1));
    }
  }
  return out;
}

/** Every folder path in the tree — the initial "all expanded" state. */
export function allFolderPaths(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.kind === "folder") {
        out.push(n.path);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

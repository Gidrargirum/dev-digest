/* ContextTree — the document catalog rendered as a keyboard-navigable folder
   tree (AC-27/28). Expand/collapse state is in-memory only, not persisted
   (product decision). A document's full path is its identity. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { allFolderPaths, flattenVisible, type TreeNode } from "./helpers";
import { s } from "./styles";

interface LevelProps {
  nodes: TreeNode[];
  depth: number;
  expanded: ReadonlySet<string>;
  active: string | null;
  selected: string | null;
  onSelect: (path: string) => void;
  onFocusNode: (path: string) => void;
  toggle: (path: string, collapse: boolean) => void;
  onKeyDown: (e: React.KeyboardEvent, node: TreeNode) => void;
}

function TreeLevel({
  nodes,
  depth,
  expanded,
  active,
  selected,
  onSelect,
  onFocusNode,
  toggle,
  onKeyDown,
}: LevelProps) {
  return (
    <>
      {nodes.map((node) => {
        const isFolder = node.kind === "folder";
        const isOpen = isFolder && expanded.has(node.path);
        const Twisty = isOpen ? Icon.ChevronDown : Icon.ChevronRight;
        const Leaf = isFolder ? Icon.Folder : Icon.FileText;
        const hasChildren = isFolder && node.children.length > 0;
        return (
          <React.Fragment key={node.path}>
            <div
              role="treeitem"
              aria-level={depth + 1}
              aria-expanded={isFolder ? isOpen : undefined}
              aria-selected={node.kind === "doc" ? selected === node.path : undefined}
              tabIndex={active === node.path ? 0 : -1}
              style={s.row(selected === node.path, depth)}
              onFocus={() => onFocusNode(node.path)}
              onClick={() => (isFolder ? toggle(node.path, isOpen) : onSelect(node.path))}
              onKeyDown={(e) => onKeyDown(e, node)}
            >
              <span style={s.twisty}>{isFolder ? <Twisty size={13} /> : null}</span>
              <Leaf size={13} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
              <span style={s.name}>{node.name}</span>
            </div>
            {isOpen && hasChildren ? (
              <div role="group">
                <TreeLevel
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  active={active}
                  selected={selected}
                  onSelect={onSelect}
                  onFocusNode={onFocusNode}
                  toggle={toggle}
                  onKeyDown={onKeyDown}
                />
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </>
  );
}

export function ContextTree({
  nodes,
  selected,
  onSelect,
}: {
  nodes: TreeNode[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("context");
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(new Set());

  const expanded = React.useMemo(() => {
    const set = new Set(allFolderPaths(nodes));
    for (const p of collapsed) set.delete(p);
    return set;
  }, [nodes, collapsed]);

  const visible = React.useMemo(() => flattenVisible(nodes, expanded), [nodes, expanded]);

  const [activePath, setActivePath] = React.useState<string | null>(null);
  const active =
    activePath && visible.some((v) => v.node.path === activePath)
      ? activePath
      : (visible[0]?.node.path ?? null);

  const toggle = React.useCallback((path: string, collapse: boolean) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (collapse) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  const move = (delta: number) => {
    const idx = visible.findIndex((v) => v.node.path === active);
    const nextIdx = Math.min(visible.length - 1, Math.max(0, idx + delta));
    const nextNode = visible[nextIdx]?.node;
    if (nextNode) setActivePath(nextNode.path);
  };

  const onKeyDown = (e: React.KeyboardEvent, node: TreeNode) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "ArrowRight":
        if (node.kind === "folder") {
          e.preventDefault();
          if (!expanded.has(node.path)) toggle(node.path, false);
          else move(1);
        }
        break;
      case "ArrowLeft":
        if (node.kind === "folder" && expanded.has(node.path)) {
          e.preventDefault();
          toggle(node.path, true);
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (node.kind === "doc") onSelect(node.path);
        else toggle(node.path, expanded.has(node.path));
        break;
    }
  };

  if (nodes.length === 0) {
    return (
      <div style={s.tree} role="tree" aria-label={t("tree.label")}>
        <p style={s.empty}>{t("emptyState.noDocs.body")}</p>
      </div>
    );
  }

  return (
    <div style={s.tree} role="tree" aria-label={t("tree.label")}>
      <TreeLevel
        nodes={nodes}
        depth={0}
        expanded={expanded}
        active={active}
        selected={selected}
        onSelect={onSelect}
        onFocusNode={setActivePath}
        toggle={toggle}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

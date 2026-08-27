/* ContextTab — attach/detach repository .md documents to an agent, reorder
   them by drag-and-drop (order is the ONLY thing a drag changes), see each
   document's token count, and preview any document's rendered content in the
   right-hand panel (AC-6/7/9). Documents inherited from an enabled skill are
   shown as a separate read-only list tagged "from skill X" (spec proposal #2,
   confirmed in scope) — never editable here, never silently merged into the
   agent's own attached list. A broken attachment (missing/unreadable at last
   resolution) stays attached with a visible marker until the user detaches it
   (AC-21) — it is never dropped automatically. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Checkbox,
  TextInput,
  IconBtn,
  Button,
  Badge,
  Skeleton,
  Icon,
  SelectInput,
  Markdown,
} from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useRepos } from "@/lib/hooks";
import { useSkills, useAgentSkills } from "@/lib/hooks/skills";
import {
  useContextDocs,
  useContextDocContent,
  useAgentContext,
  useSetAgentContext,
  useInheritedSkillContexts,
} from "@/lib/hooks/context";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { filterDocs, moveBefore, reorder, seedSequence, sumTokens } from "./helpers";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();

  const { data: repos } = useRepos();
  const [repoId, setRepoId] = React.useState<string>("");
  React.useEffect(() => {
    if (!repoId && repos && repos.length > 0) setRepoId(repos[0]!.id);
  }, [repoId, repos]);

  const { data: catalog, isLoading: catalogLoading } = useContextDocs(repoId || undefined);
  const { data: attachments, isLoading: attachmentsLoading } = useAgentContext(agent.id, repoId || undefined);
  const setContext = useSetAgentContext();

  const { data: skillLinks } = useAgentSkills(agent.id);
  const { data: allSkills } = useSkills();
  const enabledSkillIds = React.useMemo(
    () => (skillLinks ?? []).filter((l) => l.enabled).map((l) => l.skill_id),
    [skillLinks],
  );
  const inheritedQueries = useInheritedSkillContexts(repoId || undefined, enabledSkillIds);

  const [search, setSearch] = React.useState("");
  const [sequence, setSequence] = React.useState<string[]>([]);
  const [attached, setAttached] = React.useState<Set<string>>(new Set());
  const [brokenExtra, setBrokenExtra] = React.useState<string[]>([]);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = React.useState<string | null>(null);

  const catalogDocs = React.useMemo(() => catalog ?? [], [catalog]);

  // Both the catalog and the attachments load async — seed the local drag
  // sequence once per (agent, repo) as soon as both are in.
  const seededFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    const key = `${agent.id}:${repoId}`;
    if (!attachments || !catalog || !repoId || seededFor.current === key) return;
    seededFor.current = key;
    const sorted = [...attachments].sort((a, b) => a.order - b.order);
    const knownPaths = new Set(catalogDocs.map((d) => d.path));
    setSequence(seedSequence(catalogDocs, sorted.map((a) => a.path)));
    setAttached(new Set(sorted.map((a) => a.path)));
    setBrokenExtra(sorted.filter((a) => a.broken && !knownPaths.has(a.path)).map((a) => a.path));
    setPreviewPath(null);
  }, [agent.id, repoId, attachments, catalog, catalogDocs]);

  const orderedDocs = React.useMemo(() => {
    const byPath = new Map(catalogDocs.map((d) => [d.path, d]));
    return sequence.map((p) => byPath.get(p)).filter((d): d is NonNullable<typeof d> => !!d);
  }, [sequence, catalogDocs]);

  const filtered = filterDocs(orderedDocs, search);
  const attachedOrdered = React.useMemo(
    () => sequence.filter((p) => attached.has(p)),
    [sequence, attached],
  );
  const tokenTotal = sumTokens(attachedOrdered, catalogDocs);

  const preview = useContextDocContent(repoId || undefined, previewPath);

  const toggleAttach = (path: string, attach: boolean) => {
    setAttached((prev) => {
      const next = new Set(prev);
      if (attach) next.add(path);
      else next.delete(path);
      return next;
    });
  };

  const applyDrop = (target: string) => {
    if (dragPath && dragPath !== target) {
      setSequence((prev) => moveBefore(prev, dragPath, target));
    }
    setDragPath(null);
    setDragOverPath(null);
  };

  const moveByKey = (path: string, direction: -1 | 1) => {
    setSequence((prev) => reorder(prev, prev.indexOf(path), direction));
  };

  const save = () =>
    setContext.mutate(
      { agentId: agent.id, repoId, paths: attachedOrdered },
      { onSuccess: () => toast.success(t("context.savedToast")) },
    );

  // Inherited documents: every enabled skill's attachments, minus whatever the
  // agent already attaches directly — the agent's position wins (AC-11).
  const inherited = React.useMemo(() => {
    const rows: { path: string; skillName: string }[] = [];
    const seen = new Set<string>();
    enabledSkillIds.forEach((skillId, idx) => {
      const result = inheritedQueries[idx];
      const skillName = allSkills?.find((sk) => sk.id === skillId)?.name ?? skillId;
      for (const att of result?.data ?? []) {
        if (attached.has(att.path) || seen.has(att.path)) continue;
        seen.add(att.path);
        rows.push({ path: att.path, skillName });
      }
    });
    return rows;
  }, [enabledSkillIds, inheritedQueries, allSkills, attached]);

  const loading = catalogLoading || attachmentsLoading || !repoId;

  const pathPrefix = (fullPath: string) => {
    const slash = fullPath.lastIndexOf("/");
    return slash === -1 ? "" : fullPath.slice(0, slash + 1);
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <span style={s.count}>
          {t("context.attachedCount", { attached: attached.size, total: catalogDocs.length })}
        </span>
      </div>
      <p style={s.hint}>{t("context.hint")}</p>

      {repos && repos.length > 0 && (
        <div style={s.repoRow}>
          <SelectInput
            value={repoId}
            onChange={setRepoId}
            options={repos.map((r) => ({ value: r.id, label: r.full_name }))}
          />
        </div>
      )}

      {attached.size > 0 && (
        <div style={s.tokenEstimate}>{t("context.tokenEstimate", { count: tokenTotal })}</div>
      )}

      {loading ? (
        <div style={s.list}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={44} />
          ))}
        </div>
      ) : catalogDocs.length === 0 && brokenExtra.length === 0 ? (
        <div style={s.empty}>{t("context.emptyCatalog")}</div>
      ) : (
        <>
          <div style={s.filterRow}>
            <TextInput
              value={search}
              onChange={setSearch}
              placeholder={t("context.filterPlaceholder")}
              suffix={<Icon.Search size={13} style={{ color: "var(--text-muted)" }} />}
            />
          </div>

          <div style={{ ...s.split, ...(previewPath ? s.splitWithPanel : {}) }}>
            <div style={s.list} role="list">
              {filtered.map((doc) => {
                const isAttached = attached.has(doc.path);
                const isDragging = dragPath === doc.path;
                const isDragOver = dragOverPath === doc.path && dragPath !== doc.path;
                return (
                  <div
                    key={doc.path}
                    role="listitem"
                    style={{
                      ...s.row,
                      ...(isDragging ? s.rowDragging : {}),
                      ...(isDragOver ? s.rowDragOver : {}),
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverPath(doc.path);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      applyDrop(doc.path);
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={t("context.dragHandle", { name: doc.name })}
                      draggable
                      style={s.handle}
                      onDragStart={() => setDragPath(doc.path)}
                      onDragEnd={() => {
                        setDragPath(null);
                        setDragOverPath(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          moveByKey(doc.path, -1);
                        } else if (e.key === "ArrowDown") {
                          e.preventDefault();
                          moveByKey(doc.path, 1);
                        }
                      }}
                    >
                      <Icon.Menu size={13} />
                    </div>

                    <div style={s.rowMain}>
                      <Checkbox
                        checked={isAttached}
                        onChange={(v) => toggleAttach(doc.path, v)}
                        label={
                          <span style={s.rowMain}>
                            <span className="mono" style={s.name}>
                              {doc.name}
                            </span>
                            {pathPrefix(doc.path) && (
                              <span className="mono" style={s.pathPrefix}>
                                {pathPrefix(doc.path)}
                              </span>
                            )}
                          </span>
                        }
                      />
                    </div>

                    <div style={s.meta}>
                      {isAttached && <span style={s.order}>{attachedOrdered.indexOf(doc.path) + 1}</span>}
                      <Badge color="var(--text-secondary)">{doc.source}</Badge>
                      <span style={s.tokens}>{t("context.tokensShort", { count: doc.tokens })}</span>
                      <Button
                        kind={previewPath === doc.path ? "secondary" : "ghost"}
                        size="sm"
                        icon="Eye"
                        onClick={() =>
                          setPreviewPath((p) => (p === doc.path ? null : doc.path))
                        }
                      >
                        {t("context.preview")}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Attached paths missing from the live catalog entirely
                  (renamed/deleted) — still shown so the user can detach them
                  (AC-21), never dropped silently. */}
              {brokenExtra.map((path) => (
                <div key={path} style={{ ...s.row, ...s.rowBroken }} role="listitem">
                  <span className="mono" style={s.name}>
                    {path}
                  </span>
                  <Badge color="var(--crit)" bg="var(--crit-bg)">
                    {t("context.broken")}
                  </Badge>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => setBrokenExtra((prev) => prev.filter((p) => p !== path))}
                  >
                    {t("context.detach")}
                  </Button>
                </div>
              ))}
            </div>

            {previewPath && (
              <aside style={s.panel} aria-label={t("context.previewPanel")}>
                <div style={s.panelHead}>
                  <span className="mono" style={s.panelPath}>
                    {previewPath}
                  </span>
                  <IconBtn
                    icon="XCircle"
                    label={t("context.previewClose")}
                    size={24}
                    onClick={() => setPreviewPath(null)}
                  />
                </div>
                {preview.isLoading ? (
                  <Skeleton height={200} />
                ) : preview.isError ? (
                  <p style={s.panelState}>
                    {preview.error instanceof ApiError
                      ? preview.error.message
                      : t("context.previewError")}
                  </p>
                ) : (
                  <div style={s.panelBody}>
                    <Markdown>{preview.data?.content}</Markdown>
                  </div>
                )}
              </aside>
            )}
          </div>
        </>
      )}

      {inherited.length > 0 && (
        <div style={s.inheritedSection}>
          <div style={s.inheritedTitle}>{t("context.inheritedTitle")}</div>
          <div style={s.list}>
            {inherited.map((row) => (
              <div key={row.path} style={s.inheritedRow}>
                <span className="mono">{row.path}</span>
                <Badge color="var(--text-secondary)">
                  {t("context.fromSkill", { name: row.skillName })}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={setContext.isPending || loading}>
          {setContext.isPending ? t("context.saving") : t("context.save")}
        </Button>
        {setContext.isSuccess && <span style={s.savedNote}>{t("context.saved")}</span>}
      </div>
    </div>
  );
}

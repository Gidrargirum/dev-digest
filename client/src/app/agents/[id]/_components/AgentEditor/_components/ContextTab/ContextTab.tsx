/* ContextTab — attach/detach repository .md documents to an agent, set their
   order, and see the combined token estimate (AC-6/7/9). Documents inherited
   from an enabled skill are shown as a separate read-only list tagged "from
   skill X" (spec proposal #2, confirmed in scope) — never editable here,
   never silently merged into the agent's own attached list. A broken
   attachment (missing/unreadable at last resolution) stays attached with a
   visible marker until the user detaches it (AC-21) — it is never dropped
   automatically. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, TextInput, IconBtn, Button, Badge, Skeleton, Icon, SelectInput } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useRepos } from "@/lib/hooks";
import { useSkills, useAgentSkills } from "@/lib/hooks/skills";
import {
  useContextDocs,
  useAgentContext,
  useSetAgentContext,
  useInheritedSkillContexts,
} from "@/lib/hooks/context";
import { useToast } from "@/lib/toast";
import { filterDocs, reorder, sumTokens } from "./helpers";
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
  const [order, setOrder] = React.useState<string[]>([]);
  const [brokenPaths, setBrokenPaths] = React.useState<Set<string>>(new Set());

  // attachments load async (unlike agent) — seed local state once per (agent, repo).
  const seededFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    const key = `${agent.id}:${repoId}`;
    if (!attachments || !repoId || seededFor.current === key) return;
    seededFor.current = key;
    const sorted = [...attachments].sort((a, b) => a.order - b.order);
    setOrder(sorted.map((a) => a.path));
    setBrokenPaths(new Set(sorted.filter((a) => a.broken).map((a) => a.path)));
  }, [agent.id, repoId, attachments]);

  const catalogDocs = catalog ?? [];
  const filtered = filterDocs(catalogDocs, search);
  const tokenTotal = sumTokens(order, catalogDocs);

  const toggleAttach = (path: string, attach: boolean) => {
    setOrder((prev) => (attach ? [...prev, path] : prev.filter((p) => p !== path)));
    if (!attach) setBrokenPaths((prev) => new Set([...prev].filter((p) => p !== path)));
  };

  const move = (path: string, direction: -1 | 1) => {
    setOrder((prev) => reorder(prev, prev.indexOf(path), direction));
  };

  const save = () =>
    setContext.mutate(
      { agentId: agent.id, repoId, paths: order },
      { onSuccess: () => toast.success(t("context.savedToast")) },
    );

  // Inherited documents: every enabled skill's attachments, minus whatever the
  // agent already attaches directly — the agent's position wins (AC-11).
  const inherited = React.useMemo(() => {
    const ownPaths = new Set(order);
    const rows: { path: string; skillName: string }[] = [];
    const seen = new Set<string>();
    enabledSkillIds.forEach((skillId, idx) => {
      const result = inheritedQueries[idx];
      const skillName = allSkills?.find((sk) => sk.id === skillId)?.name ?? skillId;
      for (const att of result?.data ?? []) {
        if (ownPaths.has(att.path) || seen.has(att.path)) continue;
        seen.add(att.path);
        rows.push({ path: att.path, skillName });
      }
    });
    return rows;
  }, [enabledSkillIds, inheritedQueries, allSkills, order]);

  const loading = catalogLoading || attachmentsLoading || !repoId;
  const brokenPathsNotInCatalog = order.filter(
    (p) => brokenPaths.has(p) && !catalogDocs.some((d) => d.path === p),
  );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <span style={s.count}>
          {t("context.attachedCount", { attached: order.length, total: catalogDocs.length })}
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

      {order.length > 0 && (
        <div style={s.tokenEstimate}>{t("context.tokenEstimate", { count: tokenTotal })}</div>
      )}

      {loading ? (
        <div style={s.list}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={44} />
          ))}
        </div>
      ) : catalogDocs.length === 0 && brokenPathsNotInCatalog.length === 0 ? (
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
          <div style={s.list}>
            {filtered.map((doc) => {
              const idx = order.indexOf(doc.path);
              const attached = idx !== -1;
              const broken = brokenPaths.has(doc.path);
              return (
                <div key={doc.path} style={{ ...s.row, ...(broken ? s.rowBroken : {}) }}>
                  <div style={s.rowMain}>
                    <Checkbox
                      checked={attached}
                      onChange={(v) => toggleAttach(doc.path, v)}
                      label={
                        <span className="mono" style={s.name}>
                          {doc.path}
                        </span>
                      }
                    />
                    <Badge color="var(--text-secondary)">{doc.source}</Badge>
                    {broken && (
                      <Badge color="var(--crit)" bg="var(--crit-bg)">
                        {t("context.broken")}
                      </Badge>
                    )}
                  </div>
                  {attached && (
                    <div style={s.rowActions}>
                      <span style={s.order}>{idx + 1}</span>
                      <div style={s.reorderBtns}>
                        <span style={idx === 0 ? s.reorderDisabled : undefined}>
                          <IconBtn
                            icon="ArrowUp"
                            label={t("context.moveUp", { name: doc.name })}
                            size={20}
                            onClick={idx === 0 ? undefined : () => move(doc.path, -1)}
                          />
                        </span>
                        <span style={idx === order.length - 1 ? s.reorderDisabled : undefined}>
                          <IconBtn
                            icon="ArrowDown"
                            label={t("context.moveDown", { name: doc.name })}
                            size={20}
                            onClick={idx === order.length - 1 ? undefined : () => move(doc.path, 1)}
                          />
                        </span>
                      </div>
                      <Button kind="ghost" size="sm" onClick={() => toggleAttach(doc.path, false)}>
                        {t("context.detach")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            {/* Attached paths missing from the live catalog entirely (renamed/deleted) — still
                shown so the user can detach them (AC-21), never dropped silently. */}
            {brokenPathsNotInCatalog.map((path) => {
              const idx = order.indexOf(path);
              return (
                <div key={path} style={{ ...s.row, ...s.rowBroken }}>
                  <div style={s.rowMain}>
                    <span className="mono" style={s.name}>
                      {path}
                    </span>
                    <Badge color="var(--crit)" bg="var(--crit-bg)">
                      {t("context.broken")}
                    </Badge>
                  </div>
                  <div style={s.rowActions}>
                    <span style={s.order}>{idx + 1}</span>
                    <Button kind="ghost" size="sm" onClick={() => toggleAttach(path, false)}>
                      {t("context.detach")}
                    </Button>
                  </div>
                </div>
              );
            })}
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

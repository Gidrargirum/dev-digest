/* ProjectContextSection — "Project context to use" (AC-10): attach/detach
   repository .md documents to a skill, reorder them, and see the combined
   token estimate — the same treatment as an agent's Context tab (AC-7),
   not just the SERIALIZES AS block. A broken attachment stays attached with
   a visible marker until detached (AC-21). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, TextInput, IconBtn, Button, Badge, Skeleton, Icon, SelectInput } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRepos } from "@/lib/hooks";
import { useContextDocs, useSkillContext, useSetSkillContext } from "@/lib/hooks/context";
import { useToast } from "@/lib/toast";
import { filterDocs, reorder, sumTokens } from "./helpers";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

export function ProjectContextSection({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();

  const { data: repos } = useRepos();
  const [repoId, setRepoId] = React.useState<string>("");
  React.useEffect(() => {
    if (!repoId && repos && repos.length > 0) setRepoId(repos[0]!.id);
  }, [repoId, repos]);

  const { data: catalog, isLoading: catalogLoading } = useContextDocs(repoId || undefined);
  const { data: attachments, isLoading: attachmentsLoading } = useSkillContext(
    skill.id,
    repoId || undefined,
  );
  const setContext = useSetSkillContext();

  const [search, setSearch] = React.useState("");
  const [order, setOrder] = React.useState<string[]>([]);
  const [brokenPaths, setBrokenPaths] = React.useState<Set<string>>(new Set());

  const seededFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    const key = `${skill.id}:${repoId}`;
    if (!attachments || !repoId || seededFor.current === key) return;
    seededFor.current = key;
    const sorted = [...attachments].sort((a, b) => a.order - b.order);
    setOrder(sorted.map((a) => a.path));
    setBrokenPaths(new Set(sorted.filter((a) => a.broken).map((a) => a.path)));
  }, [skill.id, repoId, attachments]);

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
      { skillId: skill.id, repoId, paths: order },
      { onSuccess: () => toast.success(t("context.savedToast")) },
    );

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

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={setContext.isPending || loading}>
          {setContext.isPending ? t("context.saving") : t("context.save")}
        </Button>
        {setContext.isSuccess && <span style={s.savedNote}>{t("context.saved")}</span>}
      </div>
    </div>
  );
}

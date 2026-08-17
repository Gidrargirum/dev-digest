"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Checkbox, TextInput, Toggle, IconBtn, Button, Badge, Skeleton, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useSkills, useAgentSkills, useSetAgentSkills, useToggleAgentSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { filterSkills, reorder } from "./helpers";
import { s } from "./styles";

/** Skills tab — attach/detach skills to an agent, toggle each link's enabled
    state, and reorder them (order = order in the assembled review prompt). */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const router = useRouter();

  const { data: allSkills } = useSkills();
  const { data: links, isLoading } = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();
  const toggleLink = useToggleAgentSkill();

  const [search, setSearch] = React.useState("");
  const [order, setOrder] = React.useState<string[]>([]);
  const [linkEnabled, setLinkEnabled] = React.useState<Record<string, boolean>>({});

  // links loads async (unlike agent), so seed local state once it resolves —
  // gated on agent.id via a ref rather than depending on `links` itself: a
  // query refetch (e.g. after the enabled-toggle mutation invalidates the
  // cache) returns a NEW array reference on every render even when the data
  // is unchanged, which would re-run a `[agent.id, links]`-keyed effect on
  // every render and either clobber in-progress local reordering or, worse,
  // loop forever when `links` never becomes referentially stable (as in a
  // test double that returns a fresh literal per call).
  const seededFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!links || seededFor.current === agent.id) return;
    seededFor.current = agent.id;
    const sorted = [...links].sort((a, b) => a.order - b.order);
    setOrder(sorted.map((l) => l.skill_id));
    setLinkEnabled(Object.fromEntries(sorted.map((l) => [l.skill_id, l.enabled])));
  }, [agent.id, links]);

  const filtered = filterSkills(allSkills ?? [], search);
  const linkedCount = order.filter((id) => linkEnabled[id] !== false).length;

  const toggleAttach = (skillId: string, attach: boolean) => {
    setOrder((prev) => (attach ? [...prev, skillId] : prev.filter((id) => id !== skillId)));
    if (attach) setLinkEnabled((prev) => ({ ...prev, [skillId]: true }));
  };

  const move = (skillId: string, direction: -1 | 1) => {
    setOrder((prev) => reorder(prev, prev.indexOf(skillId), direction));
  };

  const save = () =>
    setSkills.mutate(
      { agentId: agent.id, skillIds: order },
      { onSuccess: () => toast.success(t("skills.savedToast")) },
    );

  const loading = isLoading || allSkills === undefined;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: linkedCount, total: allSkills?.length ?? 0 })}</span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {loading ? (
        <div style={s.list}>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : allSkills.length === 0 ? (
        <div style={s.empty}>
          {t("skills.emptyCatalog")}
          <div style={{ marginTop: 10 }}>
            <Button kind="secondary" size="sm" icon="Sparkles" onClick={() => router.push("/skills")}>
              {t("skills.goToSkills")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div style={s.filterRow}>
            <TextInput
              value={search}
              onChange={setSearch}
              placeholder={t("skills.filterPlaceholder")}
              suffix={<Icon.Search size={13} style={{ color: "var(--text-muted)" }} />}
            />
          </div>
          <div style={s.list}>
            {filtered.map((skill) => {
              const idx = order.indexOf(skill.id);
              const attached = idx !== -1;
              return (
                <div key={skill.id} style={s.row}>
                  <div style={s.rowMain}>
                    <Checkbox
                      checked={attached}
                      onChange={(v) => toggleAttach(skill.id, v)}
                      label={
                        <span className="mono" style={s.name}>
                          {skill.name}
                        </span>
                      }
                    />
                    <Badge color="var(--text-secondary)">{skill.type}</Badge>
                  </div>
                  {attached && (
                    <div style={s.rowActions}>
                      <span style={s.order}>{idx + 1}</span>
                      <div style={s.reorderBtns}>
                        <span style={idx === 0 ? s.reorderDisabled : undefined}>
                          <IconBtn
                            icon="ArrowUp"
                            label={t("skills.moveUp", { name: skill.name })}
                            size={20}
                            onClick={idx === 0 ? undefined : () => move(skill.id, -1)}
                          />
                        </span>
                        <span style={idx === order.length - 1 ? s.reorderDisabled : undefined}>
                          <IconBtn
                            icon="ArrowDown"
                            label={t("skills.moveDown", { name: skill.name })}
                            size={20}
                            onClick={idx === order.length - 1 ? undefined : () => move(skill.id, 1)}
                          />
                        </span>
                      </div>
                      <Toggle
                        on={linkEnabled[skill.id] ?? true}
                        onChange={(enabled) => {
                          setLinkEnabled((prev) => ({ ...prev, [skill.id]: enabled }));
                          toggleLink.mutate({ agentId: agent.id, skillId: skill.id, enabled });
                        }}
                        size={16}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={setSkills.isPending || loading}>
          {setSkills.isPending ? t("skills.saving") : t("skills.save")}
        </Button>
        {setSkills.isSuccess && <span style={s.savedNote}>{t("skills.saved")}</span>}
      </div>
    </div>
  );
}

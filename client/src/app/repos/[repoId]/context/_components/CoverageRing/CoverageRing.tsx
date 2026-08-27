/* CoverageRing — the "COVERAGE" indicator on an open document (AC-39/40):
   the share of the workspace's agents that have this exact document attached,
   directly or via an enabled skill. `percent: null` (no agents in the
   workspace) shows an explicit text state, never 0%. */
"use client";

import { useTranslations } from "next-intl";
import { CircularScore, Skeleton } from "@devdigest/ui";
import { useContextCoverage } from "@/lib/hooks";
import { s } from "./styles";

export function CoverageRing({ repoId, path }: { repoId: string; path: string }) {
  const t = useTranslations("context");
  const { data, isLoading } = useContextCoverage(repoId, path);

  if (isLoading || !data) return <Skeleton height={44} width={160} />;

  return (
    <div style={s.wrap}>
      {data.percent === null ? (
        <span style={s.noAgents}>{t("coverage.noAgents")}</span>
      ) : (
        <>
          <CircularScore score={Math.round(data.percent)} />
          <div style={s.meta}>
            <span style={s.label}>{t("coverage.label")}</span>
            <span style={s.caption}>
              {t("coverage.caption", {
                attached: data.attached_agents,
                total: data.total_agents,
              })}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

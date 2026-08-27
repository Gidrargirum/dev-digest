/* DocPreview — one selected document: a COVERAGE ring, a Preview/Edit tab
   pair (AC-33), and the content below. Preview renders through the escaped
   Markdown primitive — never dangerouslySetInnerHTML. Edit saves on demand
   (AC-34); Postgres is the source of truth, the on-disk file is derived. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown, Skeleton, ErrorState, Tabs } from "@devdigest/ui";
import { useContextDocContent } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { CoverageRing } from "../CoverageRing";
import { DocEditor } from "../DocEditor";
import { s } from "./styles";

export function DocPreview({ repoId, path }: { repoId: string; path: string | null }) {
  const t = useTranslations("context");
  const [tab, setTab] = React.useState<"preview" | "edit">("preview");
  const { data, isLoading, isError, error, refetch } = useContextDocContent(repoId, path);

  if (!path) {
    return <p style={s.placeholder}>{t("preview.select")}</p>;
  }

  return (
    <div>
      <div style={s.topBar}>
        <div className="mono" style={s.path}>
          {path}
        </div>
        <CoverageRing repoId={repoId} path={path} />
      </div>
      <p style={s.derivedNote}>{t("derivedNote")}</p>

      <Tabs
        pad="0"
        value={tab}
        onChange={(k) => setTab(k as "preview" | "edit")}
        tabs={[
          { key: "preview", label: t("mode.preview") },
          { key: "edit", label: t("mode.edit") },
        ]}
      />

      <div style={s.tabBody}>
        {isLoading ? (
          <Skeleton height={200} />
        ) : isError ? (
          <ErrorState
            title={t("preview.loadError")}
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : tab === "edit" ? (
          <DocEditor key={path} repoId={repoId} path={path} content={data?.content ?? ""} />
        ) : (
          <Markdown>{data?.content}</Markdown>
        )}
      </div>
    </div>
  );
}

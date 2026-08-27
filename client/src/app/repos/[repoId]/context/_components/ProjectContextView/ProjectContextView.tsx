/* ProjectContextView — the Project Context Folder screen for one repo
   (base spec AC-1..AC-5, AC-23; authoring spec AC-27..AC-41): browse the
   repository's .md documents as a folder tree, search, preview, edit, and
   author (create / upload / new folder). Postgres is the source of truth for
   authored content; the on-disk .devdigest/** file is a derived projection. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, IconBtn, Skeleton, TextInput } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import {
  useContextDocs,
  useContextFolders,
  useUploadContextDoc,
} from "@/lib/hooks";
import { DocPreview } from "../DocPreview";
import { ContextTree, buildTree, filterTree } from "../ContextTree";
import { CreateNodeModal } from "../CreateNodeModal";
import { SKELETON_ROWS, CONTEXT_SEARCH_ROOTS, MAX_UPLOAD_BYTES } from "./constants";
import { arrayBufferToBase64, folderChoices } from "./helpers";
import { s } from "./styles";

export function ProjectContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const { repos, reposLoaded } = useActiveRepo();
  const docsQuery = useContextDocs(repoId);
  const foldersQuery = useContextFolders(repoId);
  const upload = useUploadContextDoc();

  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [modal, setModal] = React.useState<"doc" | "folder" | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const repo = repos.find((r) => r.id === repoId) ?? null;
  const repoLabel = repo?.full_name ?? repoId;
  const notCloned = reposLoaded && repo != null && repo.clone_path === null;

  const docs = React.useMemo(() => docsQuery.data ?? [], [docsQuery.data]);
  const folders = React.useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const tree = React.useMemo(
    () => filterTree(buildTree(docs, folders), search),
    [docs, folders, search],
  );
  const folderOptions = React.useMemo(() => folderChoices(docs, folders), [docs, folders]);

  const crumb = [
    { label: t("page.crumbLab") },
    { label: repoLabel, mono: true },
    { label: t("title") },
  ];

  const refresh = () => {
    void docsQuery.refetch();
    void foldersQuery.refetch();
  };

  const onPickFile = async (file: File) => {
    setUploadError(null);
    if (!file.name.toLowerCase().endsWith(".md")) {
      setUploadError(t("upload.notMd"));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(t("upload.tooLarge"));
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const path = `${CONTEXT_SEARCH_ROOTS[1]}/${file.name}`;
      const doc = await upload.mutateAsync({
        repoId,
        path,
        contentBase64: arrayBufferToBase64(buf),
      });
      setSelected(doc.path);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : t("upload.failed"));
    }
  };

  const isLoading = docsQuery.isLoading;

  return (
    <AppShell crumb={crumb}>
      <div style={s.header}>
        <h1 style={s.h1}>{t("title")}</h1>
        <p style={s.subtitle}>{t("subtitle")}</p>
      </div>

      {isLoading ? (
        <div style={s.loadingStack}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={36} />
          ))}
        </div>
      ) : docsQuery.isError ? (
        <ErrorState
          title={t("loadError")}
          body={docsQuery.error instanceof ApiError ? docsQuery.error.message : undefined}
          onRetry={() => docsQuery.refetch()}
        />
      ) : notCloned ? (
        <EmptyState
          icon="FileText"
          title={t("emptyState.notCloned.title")}
          body={t("emptyState.notCloned.body")}
        />
      ) : (
        <>
          <div style={s.toolbar}>
            <IconBtn icon="Plus" label={t("tree.newDoc")} onClick={() => setModal("doc")} />
            <IconBtn icon="Folder" label={t("tree.newFolder")} onClick={() => setModal("folder")} />
            <IconBtn
              icon="Upload"
              label={t("tree.upload")}
              onClick={() => fileInput.current?.click()}
            />
            <span style={s.toolbarSpacer} />
            <IconBtn icon="RefreshCw" label={t("tree.refresh")} onClick={refresh} />
            <input
              ref={fileInput}
              type="file"
              accept=".md"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onPickFile(f);
              }}
            />
          </div>

          <div style={s.filterRow}>
            <TextInput
              value={search}
              onChange={setSearch}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              suffix={<Icon.Search size={13} style={{ color: "var(--text-muted)" }} />}
            />
          </div>

          {uploadError && (
            <p role="alert" style={s.uploadError}>
              {uploadError}
            </p>
          )}

          {docs.length === 0 && folders.length === 0 ? (
            <EmptyState
              icon="FileText"
              title={t("emptyState.noDocs.title")}
              body={t("emptyState.noDocs.body")}
            />
          ) : (
            <div style={s.layout}>
              <div style={s.treeCol}>
                <ContextTree nodes={tree} selected={selected} onSelect={setSelected} />
              </div>
              <div style={s.previewWrap}>
                <DocPreview repoId={repoId} path={selected} />
              </div>
            </div>
          )}
        </>
      )}

      {modal && (
        <CreateNodeModal
          repoId={repoId}
          mode={modal}
          folderOptions={folderOptions}
          onClose={() => setModal(null)}
          onCreated={(path) => {
            if (modal === "doc") setSelected(path);
          }}
        />
      )}
    </AppShell>
  );
}

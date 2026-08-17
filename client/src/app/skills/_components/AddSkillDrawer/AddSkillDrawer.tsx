/* AddSkillDrawer — "From file" (upload → preview → confirm) and "Community"
   (search → expand-to-preview → confirm) import flows. No "From URL" tab —
   out of scope per product decision. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, Tabs, Button, FormField, TextInput, SelectInput, Markdown, Chip, Icon, ErrorState, Skeleton } from "@devdigest/ui";
import type { SkillType, CommunitySkill } from "@devdigest/shared";
import { useImportPreview, useCreateSkill, useCommunitySkills } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { arrayBufferToBase64 } from "./helpers";
import { DRAWER_WIDTH } from "./constants";
import { s } from "./styles";

const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

function FileTab({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const preview = useImportPreview();
  const create = useCreateSkill();
  const [filename, setFilename] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState("");
  const [ignoredFiles, setIgnoredFiles] = React.useState<string[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setFilename(file.name);
    const buf = await file.arrayBuffer();
    const content_base64 = arrayBufferToBase64(buf);
    const draft = await preview.mutateAsync({ filename: file.name, content_base64 });
    setName(draft.name);
    setDescription(draft.description);
    setType(draft.type);
    setBody(draft.body);
    setIgnoredFiles(draft.ignored_files);
  };

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const confirmImport = async () => {
    await create.mutateAsync({
      name,
      description,
      type,
      body,
      source: "imported_url",
      enabled: false,
    });
    toast.success(t("file.success", { name }));
    onClose();
  };

  return (
    <div style={s.section}>
      <input
        ref={inputRef}
        type="file"
        accept=".md,.zip"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      <div style={s.dropzone} onClick={() => inputRef.current?.click()}>
        <Icon.Upload size={20} />
        {filename ?? t("file.dropzone")}
      </div>

      {preview.isPending && <Skeleton height={120} />}
      {preview.isError && <div style={s.errorText}>{t("drawer.importFailed")}</div>}

      {preview.isSuccess && (
        <div style={s.previewCard}>
          <FormField label={t("file.nameLabel")} hint={t("file.nameHint")}>
            <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} />
          </FormField>
          <FormField label={t("config.description")}>
            <TextInput value={description} onChange={setDescription} />
          </FormField>
          <FormField label={t("config.type")}>
            <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
          </FormField>
          <FormField label={t("file.bodyLabel")} hint={t("file.bodyHint")}>
            <Markdown>{body}</Markdown>
          </FormField>
          {ignoredFiles.length > 0 && (
            <div style={s.ignoredFiles}>{t("file.ignoredFiles", { files: ignoredFiles.join(", ") })}</div>
          )}
          <Button kind="primary" icon="Check" onClick={() => void confirmImport()} disabled={create.isPending}>
            {create.isPending ? t("file.importing") : t("file.import")}
          </Button>
        </div>
      )}
    </div>
  );
}

function CommunityTab({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [q, setQ] = React.useState("");
  const [lang, setLang] = React.useState("any");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const { data: results, isLoading, isError, refetch } = useCommunitySkills(q, lang);

  const languages = Array.from(new Set((results ?? []).map((r) => r.lang))).sort();

  const doImport = async (entry: CommunitySkill) => {
    await create.mutateAsync({
      name: entry.name,
      description: entry.desc,
      type: entry.type,
      body: entry.body,
      source: "community",
      enabled: false,
    });
    toast.success(t("file.success", { name: entry.name }));
    onClose();
  };

  return (
    <div style={s.section}>
      <TextInput value={q} onChange={setQ} placeholder={t("community.searchPlaceholder")} />
      <div style={s.chipsRow}>
        <Chip active={lang === "any"} onClick={() => setLang("any")}>
          {t("community.allLanguages")}
        </Chip>
        {languages.map((l) => (
          <Chip key={l} active={lang === l} onClick={() => setLang(l)}>
            {l}
          </Chip>
        ))}
      </div>

      {isLoading && <Skeleton height={120} />}
      {isError && <ErrorState body={t("community.loadError")} onRetry={() => refetch()} />}
      {!isLoading && !isError && (results ?? []).length === 0 && (
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("community.noMatch.body")}</div>
      )}
      {(results ?? []).map((entry) => {
        const expanded = expandedId === entry.id;
        return (
          <div
            key={entry.id}
            style={s.resultCard}
            onClick={() => setExpandedId(expanded ? null : entry.id)}
          >
            <div style={s.resultHeader}>
              <Icon.Sparkles size={14} />
              <span className="mono" style={s.resultName}>
                {entry.name}
              </span>
              <span style={s.resultMeta}>
                <Icon.Star size={11} /> {entry.stars}
              </span>
            </div>
            <div style={s.resultMeta}>{entry.repo}</div>
            <div style={s.resultDesc}>{entry.desc}</div>
            {expanded && (
              <>
                <Markdown>{entry.body}</Markdown>
                <Button
                  kind="primary"
                  icon="Check"
                  disabled={create.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    void doImport(entry);
                  }}
                >
                  {create.isPending ? t("community.importing") : t("community.import")}
                </Button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AddSkillDrawer({
  initialTab,
  onClose,
}: {
  initialTab: "file" | "community";
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const [tab, setTab] = React.useState<"file" | "community">(initialTab);

  return (
    <Drawer width={DRAWER_WIDTH} title={t("drawer.title")} subtitle={t("drawer.subtitle")} onClose={onClose}>
      <Tabs
        tabs={[
          { key: "file", label: t("drawer.tabs.file") },
          { key: "community", label: t("drawer.tabs.community") },
        ]}
        value={tab}
        onChange={(k) => setTab(k as "file" | "community")}
        pad="0 0 14px"
      />
      {tab === "file" ? <FileTab onClose={onClose} /> : <CommunityTab onClose={onClose} />}
    </Drawer>
  );
}

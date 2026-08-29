/* DocEditor — the Edit tab on an open document (AC-33/34/35). The textarea is
   seeded with the document's current content; "unsaved changes" is derived,
   not stored; Save is last-write-wins with no precondition.

   Mounted with `key={path}` by DocPreview, so switching documents remounts
   this component with a fresh draft. There is deliberately NO useEffect
   re-seeding `draft` from `content`: a background refetch of the same
   document (e.g. the cache invalidation that follows every save) would
   otherwise overwrite the user's unsaved edits. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Textarea, Button } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useSaveContextDoc } from "@/lib/hooks";
import { s } from "./styles";

export function DocEditor({
  repoId,
  path,
  content,
}: {
  repoId: string;
  path: string;
  content: string;
}) {
  const t = useTranslations("context");
  const save = useSaveContextDoc();
  const [draft, setDraft] = React.useState(content);
  const [savedTokens, setSavedTokens] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const dirty = draft !== content;

  const onSave = async () => {
    setError(null);
    try {
      const doc = await save.mutateAsync({ repoId, path, content: draft });
      setSavedTokens(doc.tokens);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("editor.saveError"));
    }
  };

  return (
    <div style={s.wrap}>
      <label style={s.label}>
        <span style={{ display: "block", marginBottom: 8 }}>{t("editor.label")}</span>
        <Textarea value={draft} onChange={setDraft} rows={16} mono />
      </label>
      <div style={s.footer}>
        <Button
          kind="primary"
          size="sm"
          onClick={onSave}
          disabled={!dirty || save.isPending}
          loading={save.isPending}
        >
          {save.isPending ? t("editor.saving") : t("editor.save")}
        </Button>
        {error ? (
          <span role="alert" style={s.error}>
            {error}
          </span>
        ) : dirty ? (
          <span style={s.status}>{t("editor.unsaved")}</span>
        ) : savedTokens != null ? (
          <span aria-live="polite" style={s.status}>
            {t("editor.saved", { count: savedTokens })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

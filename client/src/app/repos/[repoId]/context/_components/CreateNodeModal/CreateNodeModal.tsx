/* CreateNodeModal — the `+` (new document) and folder-icon (new folder)
   dialogs on the tree toolbar (AC-29/30). Server-side path validation is the
   source of truth; this only assembles `parent/name` and surfaces the
   server's rejection reason inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, SelectInput, TextInput, Button } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useCreateContextDoc, useCreateContextFolder } from "@/lib/hooks";
import { s } from "./styles";

export function CreateNodeModal({
  repoId,
  mode,
  folderOptions,
  onClose,
  onCreated,
}: {
  repoId: string;
  mode: "doc" | "folder";
  /** Parent-folder choices — the search roots plus every known folder path. */
  folderOptions: string[];
  onClose: () => void;
  onCreated: (path: string) => void;
}) {
  const t = useTranslations("context");
  const createDoc = useCreateContextDoc();
  const createFolder = useCreateContextFolder();

  const [parent, setParent] = React.useState(folderOptions[0] ?? "");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const targetPath = [parent.replace(/\/$/, ""), name.trim().replace(/^\//, "")]
    .filter(Boolean)
    .join("/");
  const pending = createDoc.isPending || createFolder.isPending;

  const submit = async () => {
    setError(null);
    try {
      if (mode === "doc") {
        const doc = await createDoc.mutateAsync({ repoId, path: targetPath });
        onCreated(doc.path);
      } else {
        const folder = await createFolder.mutateAsync({ repoId, path: targetPath });
        onCreated(folder.path);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("storeError"));
    }
  };

  return (
    <Modal
      width={520}
      title={mode === "doc" ? t("create.docTitle") : t("create.folderTitle")}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button
            kind="primary"
            onClick={submit}
            disabled={pending || name.trim() === ""}
            loading={pending}
          >
            {pending
              ? t("create.creating")
              : mode === "doc"
                ? t("create.submitDoc")
                : t("create.submitFolder")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <label style={s.field}>
          <span style={s.label}>{t("create.folderField")}</span>
          <SelectInput value={parent} onChange={setParent} options={folderOptions} />
        </label>

        <div style={s.field}>
          <label style={s.label} htmlFor="create-node-name">
            {t("create.nameField")}
          </label>
          <TextInput
            id="create-node-name"
            value={name}
            onChange={setName}
            mono
            placeholder={mode === "doc" ? "security-baseline.md" : "security"}
            aria-invalid={error != null}
            aria-describedby="create-node-hint"
          />
          <p id="create-node-hint" style={s.hint}>
            {mode === "doc" ? t("create.docNameHint") : t("create.folderNameHint")}
          </p>
          {targetPath && (
            <p className="mono" style={s.preview}>
              {targetPath}
            </p>
          )}
          {error && (
            <p role="alert" style={s.error}>
              {error}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

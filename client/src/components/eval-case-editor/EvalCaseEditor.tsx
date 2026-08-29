/* EvalCaseEditor — the "Turn into eval case" modal, both variants:
   pre-seeded from a triaged finding (must_find / must_not_flag, AC-2/AC-3) and
   the blank "New case" form opened from the agent's Evals tab. Expected
   output is validated with plain JSON.parse only (AC-8) — never a contract
   safeParse, per client/insights 2026-08-19. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Button, FormField, TextInput, Textarea, SelectInput, Toggle, Tabs, Markdown } from "@devdigest/ui";
import type { EvalCase, EvalExpectationType, EvalExpectedFinding, EvalRun } from "@devdigest/shared";
import { useCreateEvalCase, useUpdateEvalCase, useRunEvalCase } from "@/lib/hooks/eval";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { INPUT_TABS, MODAL_WIDTH, EXPECTATION_TYPE_VALUES, type InputTabKey } from "./constants";
import { parseExpectedOutput, stringifyExpectedOutput, readPrMeta, resultSummaryValues } from "./helpers";
import { s } from "./styles";

export interface EvalCaseSeed {
  expectation_type: EvalExpectationType;
  expected_output: EvalExpectedFinding[];
  name?: string;
}

export function EvalCaseEditor({
  agentId,
  evalCase,
  seed,
  onClose,
}: {
  agentId: string;
  /** Present when editing an existing case. */
  evalCase?: EvalCase | null;
  /** Present when creating a fresh case seeded from a finding (AC-2/AC-3);
   *  the expectation type is locked in that flow so it can't diverge from
   *  the triage decision it was derived from (AC-4). */
  seed?: EvalCaseSeed | null;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const toast = useToast();
  const create = useCreateEvalCase(agentId);
  const update = useUpdateEvalCase();
  const runCase = useRunEvalCase();

  const isEdit = !!evalCase;
  const locked = !!seed && !evalCase; // seeded-from-finding create: type is derived, not picked

  const [name, setName] = React.useState(evalCase?.name ?? seed?.name ?? "");
  const [expectationType, setExpectationType] = React.useState<EvalExpectationType>(
    evalCase?.expectation_type ?? seed?.expectation_type ?? "must_find",
  );
  const [expectedOutputText, setExpectedOutputText] = React.useState(
    stringifyExpectedOutput(evalCase?.expected_output ?? seed?.expected_output ?? []),
  );
  const [notes, setNotes] = React.useState(evalCase?.notes ?? "");
  const [inputDiff, setInputDiff] = React.useState(evalCase?.input_diff ?? "");
  const prMeta = readPrMeta(evalCase?.input_meta);
  const [prTitle, setPrTitle] = React.useState(prMeta.title ?? "");
  const [prBody, setPrBody] = React.useState(prMeta.body ?? "");
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [inputTab, setInputTab] = React.useState<InputTabKey>("diff");
  const [lastRun, setLastRun] = React.useState<EvalRun | null>(null);

  const { value: parsedExpected, valid: expectedValid } = parseExpectedOutput(expectedOutputText);

  const busy = create.isPending || update.isPending || runCase.isPending;

  const buildPatch = () => ({
    owner_kind: "agent" as const,
    owner_id: agentId,
    name: name.trim() || t("caseEditor.newCase"),
    input_diff: inputDiff,
    input_meta: { title: prTitle, body: prBody },
    expectation_type: expectationType,
    expected_output: parsedExpected ?? [],
    notes: notes || undefined,
  });

  const errorMessage = (e: unknown) =>
    e instanceof ApiError && e.status === 0 ? t("errors.unreachable") : e instanceof ApiError ? e.message : String(e);

  const save = async () => {
    if (!expectedValid) return;
    try {
      let caseId = evalCase?.id;
      if (isEdit && caseId) {
        await update.mutateAsync({ caseId, agentId, patch: buildPatch() });
      } else {
        const created = await create.mutateAsync(buildPatch());
        caseId = created.id;
      }
      if (runOnSave && caseId) {
        const result = await runCase.mutateAsync(caseId);
        setLastRun(result.result);
      }
      toast.success(t("caseEditor.save"));
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const runNow = async () => {
    if (!expectedValid || !evalCase) return;
    try {
      const result = await runCase.mutateAsync(evalCase.id);
      setLastRun(result.result);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const summary = lastRun ? resultSummaryValues(lastRun) : null;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={isEdit ? t("caseEditor.caseTitle", { name }) : t("caseEditor.newCase")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <div style={s.runOnSaveRow}>
            <Toggle on={runOnSave} onChange={setRunOnSave} size={16} />
            {t("caseEditor.runCase")}
          </div>
          <div style={s.footerSpacer} />
          {isEdit && (
            <Button kind="secondary" icon="Play" disabled={!expectedValid || busy} onClick={runNow}>
              {runCase.isPending ? t("caseEditor.running") : t("caseEditor.runCase")}
            </Button>
          )}
          <Button kind="primary" icon="Check" disabled={!expectedValid || busy} onClick={save}>
            {create.isPending || update.isPending ? t("caseEditor.saving") : t("caseEditor.save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("caseEditor.nameLabel")} required>
          <TextInput value={name} onChange={setName} placeholder={t("caseEditor.namePlaceholder")} />
        </FormField>

        <FormField label={t("caseEditor.expectationTypeLabel")}>
          <SelectInput
            value={expectationType}
            onChange={(v) => !locked && setExpectationType(v as EvalExpectationType)}
            options={[...EXPECTATION_TYPE_VALUES]}
            mono={false}
          />
        </FormField>
        {locked && (
          <div style={s.lockedHint}>{t("findingCard.turnIntoEvalCaseDisabled")}</div>
        )}

        <FormField label={t("caseEditor.inputLabel")}>
          <div style={s.tabsBar}>
            <Tabs
              tabs={INPUT_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey) }))}
              value={inputTab}
              onChange={(k) => setInputTab(k as InputTabKey)}
            />
          </div>
          {inputTab === "diff" ? (
            <Textarea value={inputDiff} onChange={setInputDiff} rows={8} mono placeholder={t("caseEditor.diffPlaceholder")} />
          ) : (
            <div style={s.prMetaColumn}>
              <TextInput value={prTitle} onChange={setPrTitle} placeholder={t("caseEditor.titlePlaceholder")} />
              <Textarea value={prBody} onChange={setPrBody} rows={4} placeholder={t("caseEditor.bodyPlaceholder")} />
            </div>
          )}
        </FormField>

        <FormField
          label={t("caseEditor.expectedOutput")}
          right={<span style={s.jsonHint(expectedValid)}>{expectedValid ? t("caseEditor.validJson") : t("caseEditor.invalidJson")}</span>}
        >
          {/* Native textarea, not the vendored <Textarea>: it needs an
             `aria-label` for accessible querying, and vendor/ui/kit/Textarea
             doesn't forward extra props (vendor is do-not-touch). Styled to
             match vendor/ui/kit/Textarea exactly via s.expectedOutputTextarea. */}
          <textarea
            className="mono"
            value={expectedOutputText}
            rows={8}
            aria-label="Expected output"
            onChange={(e) => setExpectedOutputText(e.target.value)}
            style={s.expectedOutputTextarea}
          />
        </FormField>

        <FormField label={t("caseEditor.bodyLabel")}>
          <Textarea value={notes} onChange={setNotes} rows={2} placeholder={t("caseEditor.bodyPlaceholder")} />
        </FormField>

        <FormField label={t("caseEditor.actualOutputLabel")}>
          {summary ? (
            <div style={s.actualOutputBox}>
              <div style={s.resultSummary}>{t("caseEditor.resultSummary", summary)}</div>
              <Markdown>{`\`\`\`json\n${JSON.stringify(lastRun?.per_trace ?? [], null, 2)}\n\`\`\``}</Markdown>
            </div>
          ) : (
            <div style={s.actualOutputBox}>{t("caseEditor.neverRun")}</div>
          )}
        </FormField>
      </div>
    </Modal>
  );
}

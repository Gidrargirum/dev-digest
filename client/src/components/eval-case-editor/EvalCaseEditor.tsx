/* EvalCaseEditor — the "Turn into eval case" modal, both variants:
   pre-seeded from a triaged finding (must_find / must_not_flag, AC-2/AC-3) and
   the blank "New case" form opened from the agent's Evals tab. Expected
   output is validated with plain JSON.parse only (AC-8) — never a contract
   safeParse, per client/insights 2026-08-19. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Button, FormField, TextInput, Textarea, SelectInput, Toggle, Tabs, Markdown, Icon } from "@devdigest/ui";
import type { EvalCase, EvalOwnerKind, EvalExpectationType, EvalExpectedFinding, EvalRunRecord, EvalPassResult } from "@devdigest/shared";
import {
  useCreateEvalCase,
  useCreateSkillEvalCase,
  useUpdateEvalCase,
  useRunEvalCase,
  useDeleteEvalCase,
  useDeleteSkillEvalCase,
} from "@/lib/hooks/eval";
import { useAgents } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { INPUT_TABS, MODAL_WIDTH, EXPECTATION_TYPE_VALUES, type InputTabKey } from "./constants";
import {
  parseExpectedOutput,
  stringifyExpectedOutput,
  readPrMeta,
  resultSummaryValues,
  validationDetailText,
  readSkillActualOutput,
  formatMarginal,
  skillGatePrefix,
} from "./helpers";
import { s } from "./styles";

export interface EvalCaseSeed {
  expectation_type: EvalExpectationType;
  expected_output: EvalExpectedFinding[];
  name?: string;
  /** The originating PR's diff/title/body (AC-5's frozen copy) — populated by
   *  the caller from already-loaded PR data, never re-fetched here. */
  input_diff?: string;
  input_meta?: { title?: string; body?: string };
}

export function EvalCaseEditor({
  agentId,
  ownerKind: ownerKindProp,
  ownerId: ownerIdProp,
  baselineAgentId: baselineAgentIdProp,
  skillName,
  evalCase,
  seed,
  onClose,
}: {
  /** @deprecated agent-only shorthand for `{ ownerKind: "agent", ownerId:
   *  agentId }`, kept so existing agent-only call sites/tests keep compiling
   *  unchanged. New call sites (Amendment A) should pass `ownerKind`/`ownerId`. */
  agentId?: string;
  /** Amendment A (AC-36): which kind of thing owns this case. Defaults to
   *  `"agent"` when only the legacy `agentId` is given. */
  ownerKind?: EvalOwnerKind;
  ownerId?: string;
  /** Required for `ownerKind === "skill"` (AC-38) — chosen by the user via
   *  the agent selector below, never auto-inferred. May carry an initial
   *  suggestion (e.g. the skill's most recently used baseline). */
  baselineAgentId?: string;
  /** Used only to build the `<skill-name>-gate-` name suggestion (AC-59). */
  skillName?: string;
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
  const ownerKind: EvalOwnerKind = ownerKindProp ?? "agent";
  const ownerId = ownerIdProp ?? agentId ?? "";
  const isSkillOwned = ownerKind === "skill";

  const createAgentCase = useCreateEvalCase(!isSkillOwned ? ownerId : null);
  const createSkillCase = useCreateSkillEvalCase(isSkillOwned ? ownerId : null);
  const create = isSkillOwned ? createSkillCase : createAgentCase;
  const update = useUpdateEvalCase();
  const runCase = useRunEvalCase();
  const deleteAgentCase = useDeleteEvalCase(!isSkillOwned ? ownerId : null);
  const deleteSkillCase = useDeleteSkillEvalCase(isSkillOwned ? ownerId : null);
  const deleteCase = isSkillOwned ? deleteSkillCase : deleteAgentCase;
  const { data: agents } = useAgents();

  const isEdit = !!evalCase;
  const locked = !!seed && !evalCase; // seeded-from-finding create: type is derived, not picked
  const isNewSkillCase = isSkillOwned && !evalCase && !seed;

  const [name, setName] = React.useState(
    evalCase?.name ?? seed?.name ?? (isNewSkillCase && skillName ? skillGatePrefix(skillName) : ""),
  );
  const [expectationType, setExpectationType] = React.useState<EvalExpectationType>(
    evalCase?.expectation_type ?? seed?.expectation_type ?? "must_find",
  );
  const [expectedOutputText, setExpectedOutputText] = React.useState(
    stringifyExpectedOutput(evalCase?.expected_output ?? seed?.expected_output ?? []),
  );
  const [notes, setNotes] = React.useState(evalCase?.notes ?? "");
  const [inputDiff, setInputDiff] = React.useState(evalCase?.input_diff ?? seed?.input_diff ?? "");
  const prMeta = evalCase ? readPrMeta(evalCase.input_meta) : { title: seed?.input_meta?.title ?? "", body: seed?.input_meta?.body ?? "" };
  const [prTitle, setPrTitle] = React.useState(prMeta.title ?? "");
  const [prBody, setPrBody] = React.useState(prMeta.body ?? "");
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [inputTab, setInputTab] = React.useState<InputTabKey>("diff");
  const [lastRun, setLastRun] = React.useState<EvalRunRecord | null>(null);
  const [baselineAgentId, setBaselineAgentId] = React.useState(
    evalCase?.baseline_agent_id ?? baselineAgentIdProp ?? "",
  );
  // Set when "Run case" silently persists a brand-new (not-yet-saved) case so
  // it has an id to run against. Save() then updates that same row instead
  // of creating a duplicate; Cancel() deletes it so "closes without saving"
  // still holds even after a pre-save trial run.
  const [createdCaseId, setCreatedCaseId] = React.useState<string | null>(null);

  const { value: parsedExpected, valid: expectedValid } = parseExpectedOutput(expectedOutputText);
  const missingBaseline = isSkillOwned && !baselineAgentId;

  const busy = create.isPending || update.isPending || runCase.isPending || deleteCase.isPending;
  const persistedCaseId = evalCase?.id ?? createdCaseId;

  const buildPatch = () => ({
    owner_kind: ownerKind,
    owner_id: ownerId,
    baseline_agent_id: isSkillOwned ? baselineAgentId || null : null,
    name: name.trim() || t("caseEditor.newCase"),
    input_diff: inputDiff,
    input_meta: { title: prTitle, body: prBody },
    expectation_type: expectationType,
    expected_output: parsedExpected ?? [],
    notes: notes || undefined,
  });

  const errorMessage = (e: unknown) => {
    if (!(e instanceof ApiError)) return String(e);
    if (e.status === 0) return t("errors.unreachable");
    const detail = validationDetailText(e.details);
    return detail ? `${e.message}: ${detail}` : e.message;
  };

  const save = async () => {
    if (!expectedValid || missingBaseline) return;
    try {
      let caseId = persistedCaseId;
      if (caseId) {
        await update.mutateAsync({
          caseId,
          agentId: !isSkillOwned ? ownerId : undefined,
          skillId: isSkillOwned ? ownerId : undefined,
          patch: buildPatch(),
        });
      } else {
        const created = await create.mutateAsync(buildPatch());
        caseId = created.id;
      }
      if (runOnSave && caseId) {
        const result = await runCase.mutateAsync(caseId);
        setLastRun(result);
      }
      toast.success(t("caseEditor.save"));
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  /** "Run case" — works before the first Save too: a brand-new case is
   *  silently persisted first (there's no dry-run execution endpoint), and
   *  further edits made before the next click are synced onto that same row
   *  rather than creating another one. */
  const runNow = async () => {
    if (!expectedValid || missingBaseline) return;
    try {
      let caseId = persistedCaseId;
      if (!caseId) {
        const created = await create.mutateAsync(buildPatch());
        caseId = created.id;
        setCreatedCaseId(created.id);
      } else if (!isEdit) {
        await update.mutateAsync({
          caseId,
          agentId: !isSkillOwned ? ownerId : undefined,
          skillId: isSkillOwned ? ownerId : undefined,
          patch: buildPatch(),
        });
      }
      const result = await runCase.mutateAsync(caseId);
      setLastRun(result);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  /** Cancel — closes without saving. If "Run case" already persisted a
   *  not-yet-saved case to get something to run, that row is removed so
   *  cancelling still means nothing was kept. */
  const cancel = async () => {
    if (!isEdit && createdCaseId) {
      try {
        await deleteCase.mutateAsync(createdCaseId);
      } catch {
        // Best-effort: closing the modal must not hang on cleanup failure.
      }
    }
    onClose();
  };

  const summary = lastRun ? resultSummaryValues(lastRun) : null;
  const skillActual = isSkillOwned && lastRun ? readSkillActualOutput(lastRun.actual_output) : null;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={isEdit ? t("caseEditor.caseTitle", { name }) : t("caseEditor.newCase")}
      onClose={cancel}
      footer={
        <div style={s.footerColumn}>
          {lastRun && !isSkillOwned && (
            <div style={s.runBanner(!!lastRun.pass)}>
              {lastRun.pass ? <Icon.CheckCircle size={16} /> : <Icon.XCircle size={16} />}
              <span>{t(lastRun.pass ? "caseEditor.lastRunPassed" : "caseEditor.lastRunFailed")}</span>
              <span style={s.runBannerDetail}>
                ·{" "}
                {t("caseEditor.runStatusLine", {
                  passed: lastRun.pass ? 1 : 0,
                  total: 1,
                  duration: lastRun.duration_ms != null ? (lastRun.duration_ms / 1000).toFixed(1) : "—",
                  cost: lastRun.cost_usd != null ? lastRun.cost_usd.toFixed(2) : "0.00",
                })}
              </span>
            </div>
          )}
          <div style={s.footer}>
            <div style={s.runOnSaveRow}>
              <Toggle on={runOnSave} onChange={setRunOnSave} size={16} />
              {t("caseEditor.runOnSave")}
            </div>
            <div style={s.footerSpacer} />
            <Button kind="secondary" disabled={busy} onClick={cancel}>
              {t("caseEditor.cancel")}
            </Button>
            <Button kind="secondary" icon="Play" disabled={!expectedValid || missingBaseline || busy} onClick={runNow}>
              {runCase.isPending ? t("caseEditor.running") : t("caseEditor.runCase")}
            </Button>
            <Button kind="primary" icon="Check" disabled={!expectedValid || missingBaseline || busy} onClick={save}>
              {create.isPending || update.isPending ? t("caseEditor.saving") : t("caseEditor.save")}
            </Button>
          </div>
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

        {isSkillOwned && (
          <FormField label={t("caseEditor.baselineAgentLabel")} required>
            <SelectInput
              value={baselineAgentId}
              onChange={setBaselineAgentId}
              options={[
                { value: "", label: t("caseEditor.baselineAgentPlaceholder") },
                ...(agents ?? []).map((a) => ({ value: a.id, label: a.name })),
              ]}
              mono={false}
            />
          </FormField>
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

        {isSkillOwned && (
          <div style={s.costWarning}>{t("caseEditor.skillCostWarning")}</div>
        )}

        <FormField label={t("caseEditor.actualOutputLabel")}>
          {isSkillOwned ? (
            skillActual ? (
              <div style={s.actualOutputBox}>
                <div style={s.passGrid}>
                  <PassSummary label={t("caseEditor.withSkill")} pass={skillActual.with} t={t} />
                  <PassSummary label={t("caseEditor.withoutSkill")} pass={skillActual.without} t={t} />
                </div>
                <div style={s.marginalRow}>
                  {t("caseEditor.marginalEffect", {
                    recall: formatMarginal(skillActual.marginal.recall),
                    precision: formatMarginal(skillActual.marginal.precision),
                    citation: formatMarginal(skillActual.marginal.citation_accuracy),
                  })}
                </div>
              </div>
            ) : (
              <div style={s.actualOutputBox}>{t("caseEditor.neverRun")}</div>
            )
          ) : summary ? (
            <div style={s.actualOutputBox}>
              <div style={s.resultSummary}>{t("caseEditor.resultSummary", summary)}</div>
              <Markdown>{`\`\`\`json\n${JSON.stringify({ matched: lastRun?.matched ?? [], unmatched: lastRun?.unmatched ?? [] }, null, 2)}\n\`\`\``}</Markdown>
            </div>
          ) : (
            <div style={s.actualOutputBox}>{t("caseEditor.neverRun")}</div>
          )}
        </FormField>
      </div>
    </Modal>
  );
}

/** One `with`/`without` pass's summary (AC-56) — labelled in text, never by
 *  colour alone. `pass === null` means that side hasn't produced a result
 *  (e.g. the case has never run, or that specific pass failed — AC-46). */
function PassSummary({
  label,
  pass,
  t,
}: {
  label: string;
  pass: EvalPassResult | null;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!pass) {
    return (
      <div style={s.passColumn}>
        <div style={s.passLabel}>{label}</div>
        <div style={s.passSummary}>{t("caseEditor.neverRun")}</div>
      </div>
    );
  }
  const pct = (v: number | null) => (v == null ? "—" : Math.round(v * 100));
  return (
    <div style={s.passColumn}>
      <div style={s.passLabel}>{label}</div>
      <div style={s.passSummary}>
        {pass.error
          ? t("caseEditor.passFailed", { error: pass.error })
          : t("caseEditor.passSummary", { recall: pct(pass.recall), precision: pct(pass.precision), citation: pct(pass.citation_accuracy) })}
      </div>
      <Markdown>{`\`\`\`json\n${JSON.stringify(pass.findings, null, 2)}\n\`\`\``}</Markdown>
    </div>
  );
}

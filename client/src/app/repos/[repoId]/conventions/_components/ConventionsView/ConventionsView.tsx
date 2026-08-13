/* ConventionsView — the Conventions Extractor screen for one repo: run a scan,
   triage the candidates it grounds in real evidence, then bake the accepted
   ones into a Skill. The list self-updates by polling while a scan is live. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import {
  useConventions,
  useExtractConventions,
  usePatchConvention,
} from "@/lib/hooks/conventions";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { NOW_TICK_MS, SKELETON_CARDS, SKELETON_CARD_HEIGHT } from "./constants";
import { acceptedIds, isScanActive, relativeBucket, sortCandidates } from "./helpers";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const { repos } = useActiveRepo();
  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions();
  const patch = usePatchConvention();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [deselecting, setDeselecting] = React.useState(false);
  // The clock is never read during render: the server and the first client
  // render must agree. It arrives on mount and then ticks so the "last scan"
  // label keeps ageing after polling stops.
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const repoLabel = repos.find((r) => r.id === repoId)?.full_name ?? t("page.repoFallback");
  const scan = data?.scan ?? null;
  const candidates = data?.candidates ?? [];
  const sorted = sortCandidates(candidates);
  const accepted = acceptedIds(candidates);
  const scanning = isScanActive(scan) || extract.isPending;

  const runScan = () => extract.mutate(repoId);

  // One `useMutation` instance cannot track N in-flight patches, so the batch
  // owns its own pending flag — the button stays disabled until every patch
  // settles, which is what stops a second racing wave.
  const deselectAll = () => {
    if (deselecting || accepted.length === 0) return;
    setDeselecting(true);
    void (async () => {
      try {
        await Promise.all(
          accepted.map((id) => patch.mutateAsync({ id, repoId, patch: { status: "pending" } })),
        );
      } catch {
        /* surfaced by the mutation's own error handling */
      } finally {
        setDeselecting(false);
      }
    })();
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: repoLabel, mono: true },
    { label: t("page.crumbConventions") },
  ];

  // Before the clock lands, measure the scan against itself → "just now", the
  // same string the server rendered. An unparsable timestamp still falls to
  // the "unknown" bucket inside relativeBucket.
  const scanAt = scan?.finished_at ?? scan?.created_at;
  const bucket = relativeBucket(scanAt, now ?? Date.parse(scanAt ?? ""));
  const subtitle = scan
    ? t("page.subtitle", {
        files: scan.sample_files,
        when: t(`page.relative.${bucket.key}`, { count: bucket.count }),
      })
    : t("page.subtitleNoScan");

  return (
    <AppShell crumb={crumb}>
      {modalOpen && (
        <CreateSkillModal
          repoId={repoId}
          repoLabel={repoLabel}
          conventionIds={accepted}
          onClose={() => setModalOpen(false)}
        />
      )}

      <div style={s.header}>
        <div style={s.headerMain}>
          <h1 style={s.h1}>{t("page.heading", { repo: repoLabel })}</h1>
          <p style={s.subtitle}>{subtitle}</p>
        </div>
        <Button kind="secondary" icon="RefreshCw" onClick={runScan} disabled={scanning}>
          {scanning ? t("page.scanning") : t("page.rescan")}
        </Button>
      </div>

      {scan && isScanActive(scan) && (
        <div style={s.progress}>
          <Icon.RefreshCw size={14} />
          {t("page.scanProgress", { status: t(`page.status.${scan.status}`) })}
        </div>
      )}
      {scan?.status === "failed" && (
        <div role="alert" style={s.scanError}>
          {t("page.scanFailed", { error: scan.error ?? t("page.scanFailedUnknown") })}
        </div>
      )}

      {isLoading ? (
        <div style={s.loadingStack}>
          {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
            <Skeleton key={i} height={SKELETON_CARD_HEIGHT} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title={t("page.errorTitle")}
          body={error instanceof ApiError ? error.message : t("page.loadError")}
          onRetry={() => refetch()}
        />
      ) : !scan ? (
        <EmptyState
          icon="ListChecks"
          title={t("page.empty.title")}
          body={t("page.empty.body")}
          cta={t("page.empty.cta")}
          onCta={runScan}
          ctaLoading={extract.isPending}
        />
      ) : candidates.length === 0 ? (
        <EmptyState
          icon="ListChecks"
          title={t("page.emptyAfterScan.title")}
          body={t("page.emptyAfterScan.body")}
          cta={t("page.emptyAfterScan.cta")}
          onCta={runScan}
          ctaLoading={scanning}
        />
      ) : (
        <>
          <div style={s.toolbar}>
            <Button
              kind="ghost"
              size="sm"
              onClick={deselectAll}
              disabled={accepted.length === 0 || deselecting}
            >
              {t("page.toolbar.deselectAll")}
            </Button>
            <span style={s.counter}>
              {t("page.toolbar.accepted", { accepted: accepted.length, total: candidates.length })}
            </span>
            <Button
              kind="primary"
              size="sm"
              icon="Sparkles"
              onClick={() => setModalOpen(true)}
              disabled={accepted.length === 0}
            >
              {t("page.toolbar.createSkill")}
            </Button>
          </div>
          <div style={s.list}>
            {sorted.map((c) => (
              <ConventionCard key={c.id} candidate={c} repoId={repoId} />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

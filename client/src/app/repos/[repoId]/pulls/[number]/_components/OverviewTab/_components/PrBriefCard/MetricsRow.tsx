import { useTranslations } from "next-intl";
import { Badge, CircularScore, Icon } from "@devdigest/ui";
import { formatCost } from "@/components/run-cost-badge";
import { VERDICT_META } from "./constants";
import {
  formatDuration,
  formatTokens,
  type BriefMetrics,
} from "./helpers";
import { s } from "./styles";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.metric}>
      <span style={s.metricLabel}>{label}</span>
      <span style={s.metricValue}>{value}</span>
    </div>
  );
}

export function MetricsRow({ metrics }: { metrics: BriefMetrics }) {
  const t = useTranslations("prReview");
  const dash = t("brief.metrics.dash");
  const verdictMeta = metrics.verdict ? VERDICT_META[metrics.verdict] : null;
  const VerdictIcon = verdictMeta ? Icon[verdictMeta.icon] : Icon.Info;

  return (
    <div style={s.metricsRow}>
      <div style={s.verdictCell}>
        <div
          style={s.verdictIcon(
            verdictMeta?.background ?? "var(--bg-hover)",
            verdictMeta?.color ?? "var(--text-muted)",
          )}
        >
          <VerdictIcon size={20} />
        </div>
        <Metric
          label={t("brief.metrics.verdict")}
          value={metrics.verdict ? t(`brief.verdictValue.${metrics.verdict}`) : dash}
        />
      </div>
      <div style={s.scoreCell}>
        {metrics.score != null ? (
          <CircularScore score={metrics.score} />
        ) : (
          <span style={s.emptyRing}>{t("brief.metrics.na")}</span>
        )}
        <span style={s.metricLabel}>{t("brief.metrics.score")}</span>
      </div>
      <Badge color="var(--text-secondary)">
        {metrics.findingsCount == null || metrics.blockers == null
          ? dash
          : t("brief.metrics.findingsBlockers", {
              findings: metrics.findingsCount,
              blockers: metrics.blockers,
            })}
      </Badge>
      <Metric
        label={t("brief.metrics.cost")}
        value={formatCost(metrics.costUsd)}
      />
      <Metric
        label={t("brief.metrics.tokens")}
        value={formatTokens(metrics.tokensIn, metrics.tokensOut) ?? dash}
      />
      <Metric
        label={t("brief.metrics.duration")}
        value={formatDuration(metrics.durationMs) ?? dash}
      />
    </div>
  );
}

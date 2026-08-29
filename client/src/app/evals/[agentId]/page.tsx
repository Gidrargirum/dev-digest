"use client";

import { useParams } from "next/navigation";
import { AgentEvalDashboard } from "./_components/AgentEvalDashboard";

/* Route: /evals/:agentId — per-agent eval dashboard (AC-30/AC-27/AC-33). */
export default function AgentEvalDashboardPage() {
  const params = useParams<{ agentId: string }>();
  return <AgentEvalDashboard agentId={params.agentId} />;
}

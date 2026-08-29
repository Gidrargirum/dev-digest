import { EvalDashboard } from "./_components/EvalDashboard";

/* Route: /evals (Eval Dashboard, AC-31/AC-32). Thin route entry — the view,
   its styles, constants, helpers and i18n are colocated under
   _components/EvalDashboard. */
export default function EvalsPage() {
  return <EvalDashboard />;
}

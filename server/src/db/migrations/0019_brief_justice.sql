-- HAND-EDITED (spec 2026-08-28-pr-brief, decision #2): the pre-existing pr_brief
-- rows hold the dead composed `PrBrief` JSON — no `head_sha`, no link to the new
-- `Brief` contract. They are dropped outright so `ADD COLUMN head_sha NOT NULL`
-- has no rows to backfill. `DELETE` is DML, not DDL — it does not alter the
-- drizzle snapshot, so a later `db:generate` over this table is unaffected.
DELETE FROM "pr_brief";--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "head_sha" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "generated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD CONSTRAINT "pr_brief_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pr_brief_run_id_idx" ON "pr_brief" USING btree ("run_id");--> statement-breakpoint
ALTER TABLE "pr_intent" DROP COLUMN "risk_areas";
ALTER TABLE "eval_batches" ADD COLUMN "owner_kind" text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_batches" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_batches" ADD COLUMN "skill_version" integer;--> statement-breakpoint
ALTER TABLE "eval_batches" ADD COLUMN "marginal_recall" double precision;--> statement-breakpoint
ALTER TABLE "eval_batches" ADD COLUMN "marginal_precision" double precision;--> statement-breakpoint
ALTER TABLE "eval_batches" ADD COLUMN "marginal_citation_accuracy" double precision;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "baseline_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_baseline_agent_id_agents_id_fk" FOREIGN KEY ("baseline_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_batches_owner_started_idx" ON "eval_batches" USING btree ("owner_kind","owner_id","started_at");--> statement-breakpoint
CREATE INDEX "eval_cases_baseline_agent_idx" ON "eval_cases" USING btree ("baseline_agent_id");
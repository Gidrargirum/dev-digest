CREATE INDEX "eval_batches_workspace_idx" ON "eval_batches" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "eval_runs_case_idx" ON "eval_runs" USING btree ("case_id");
DROP INDEX "convention_scans_repo_idx";--> statement-breakpoint
DROP INDEX "conventions_repo_status_idx";--> statement-breakpoint
CREATE INDEX "conventions_scan_idx" ON "conventions" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "conventions_skill_idx" ON "conventions" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "convention_scans_repo_idx" ON "convention_scans" USING btree ("workspace_id","repo_id","created_at");--> statement-breakpoint
CREATE INDEX "conventions_repo_status_idx" ON "conventions" USING btree ("workspace_id","repo_id","status");
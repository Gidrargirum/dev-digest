CREATE TABLE "pr_why_risk_brief" (
	"pr_id" uuid PRIMARY KEY NOT NULL,
	"pr_state_key" text NOT NULL,
	"what" text NOT NULL,
	"why" text NOT NULL,
	"risk_level" text NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_focus" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risks_total" integer DEFAULT 0 NOT NULL,
	"review_focus_total" integer DEFAULT 0 NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pr_why_risk_brief" ADD CONSTRAINT "pr_why_risk_brief_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;
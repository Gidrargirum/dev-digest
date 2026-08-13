CREATE TABLE "community_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"repo" text NOT NULL,
	"stars" integer DEFAULT 0 NOT NULL,
	"lang" text NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_skills" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;
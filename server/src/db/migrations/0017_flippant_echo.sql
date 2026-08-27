CREATE TABLE "project_context_nodes" (
	"repo_id" uuid NOT NULL,
	"path" text NOT NULL,
	"kind" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"content_sha" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_context_nodes_repo_id_path_pk" PRIMARY KEY("repo_id","path")
);
--> statement-breakpoint
ALTER TABLE "project_context_nodes" ADD CONSTRAINT "project_context_nodes_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_context_nodes_repo_idx" ON "project_context_nodes" USING btree ("repo_id");
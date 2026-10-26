CREATE TABLE "conversion_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"browser_id" uuid NOT NULL,
	"original_text" text NOT NULL,
	"isl_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "history_browser_created_idx" ON "conversion_history" ("browser_id","created_at");
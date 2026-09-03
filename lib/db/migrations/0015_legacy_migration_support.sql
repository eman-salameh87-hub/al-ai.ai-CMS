ALTER TYPE "public"."form_type" ADD VALUE 'career';--> statement-breakpoint
ALTER TYPE "public"."form_type" ADD VALUE 'training';--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(500) NOT NULL,
	"destination" varchar(500) NOT NULL,
	"status_code" integer DEFAULT 301 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"last_hit_at" timestamp,
	"note" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "redirects_source_unique" UNIQUE("source")
);
--> statement-breakpoint
ALTER TABLE "content" ADD COLUMN "custom_field_values" jsonb;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD COLUMN "attachments" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "redirects_source_idx" ON "redirects" USING btree ("source");--> statement-breakpoint
CREATE INDEX "redirects_active_idx" ON "redirects" USING btree ("is_active");
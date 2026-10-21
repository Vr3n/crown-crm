-- Membership Sale: idempotency + org invoice prefix (Plan A)
ALTER TABLE "organizations" ADD COLUMN "org_invoice_prefix" text;
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "organization_id" integer NOT NULL,
  "key" text NOT NULL,
  "response" text,
  "created_at" text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_org_key_unique" ON "idempotency_keys" ("organization_id","key");
--> statement-breakpoint
CREATE INDEX "idx_idempotency_org_key" ON "idempotency_keys" ("organization_id","key");

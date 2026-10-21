-- PDF Generation: add org branding columns for invoice/receipt headers.
ALTER TABLE "organizations" ADD COLUMN "logo" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "address" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "gstin" text;

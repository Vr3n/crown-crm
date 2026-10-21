-- Issue #111: per-document Terms & Conditions columns on organizations.
-- A column DEFAULT backfills existing rows and supplies new orgs, so receipts
-- are never blank until an owner edits them in Organization settings.
ALTER TABLE "organizations" ADD COLUMN "invoice_terms" text DEFAULT '1. This is a computer-generated invoice and is valid without a signature.
2. Fees for the agreed membership period are payable in full once billed.
3. Report any billing discrepancy within 7 days of the invoice date.
4. This invoice is subject to the gym cancellation, freeze and proration policies in force.';
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "receipt_terms" text DEFAULT '1. This receipt acknowledges payment received for the stated membership.
2. Please keep this receipt for your records.
3. This is a computer-generated document and needs no signature.';
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "refund_terms" text DEFAULT '1. Refunds are issued per the applicable cancellation policy.
2. Refunded value returns via the method shown above.
3. This is a computer-generated document and needs no signature.';
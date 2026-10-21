ALTER TABLE invoices ADD COLUMN membership_id integer REFERENCES memberships(id);
--> statement-breakpoint
CREATE INDEX idx_invoices_membership ON invoices (organization_id, membership_id);
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { openDatabase, closeDatabase, getDb } from '../../src/main/db/connection'
import { runMigrations } from '../../src/main/db/migrations'

/**
 * Focused tests for the drizzle-kit migration runner (ADR-0005): the `?raw`
 * bundled SQL, statement-breakpoint splitting, schema_migrations bookkeeping,
 * idempotency, and the legacy (pre-Drizzle) reconciliation path.
 */
beforeEach(() => {
  closeDatabase()
  openDatabase(':memory:')
})

afterAll(() => {
  closeDatabase()
})

const ALL_TABLES = [
  'app_meta',
  'organization_staff',
  'organizations',
  'permissions',
  'role_permissions',
  'roles',
  'users',
  'people',
  'lead_stages',
  'lead_sources',
  'lead_lost_reasons',
  'lead_activity_types',
  'leads',
  'lead_activities',
  'lead_followups',
  'lead_stage_history',
  'membership_plans',
  'membership_plan_versions',
  'offers',
  'offer_redemptions',
  'freeze_policies',
  'proration_policies',
  'cancellation_policies',
  'offer_versions',
  'customers',
  'memberships',
  'membership_freezes',
  'membership_events',
  'invoices',
  'invoice_lines',
  'invoice_sequence',
  'payment_methods',
  'payments',
  'payment_allocations',
  'refunds',
  'credits',
  'credit_allocations'
]

function tableNames(): Set<string> {
  const rows = getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
    name: string
  }[]
  return new Set(rows.map((r) => r.name))
}

function appliedVersions(): number[] {
  const rows = getDb().prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
    version: number
  }[]
  return rows.map((r) => r.version)
}

describe('runMigrations', () => {
  it('creates every identity and sales table on a fresh database', () => {
    runMigrations()
    const tables = tableNames()
    for (const table of ALL_TABLES) {
      expect(tables.has(table)).toBe(true)
    }
  })

  it('records versions 0, 3-26 plus 28-30 including membership sale idempotency, permission, joining-date, org branding, followup notes, person photo, membership cancel/renew, refund scheduling, and invoice-membership migrations', () => {
    runMigrations()
    const rows = getDb().prepare('SELECT version, name FROM schema_migrations').all() as {
      version: number
      name: string
    }[]
    expect(rows).toEqual([
      { version: 0, name: 'identity' },
      { version: 3, name: 'sales' },
      { version: 4, name: 'sales_list_index' },
      { version: 5, name: 'leads_extra_fields' },
      { version: 6, name: 'seed_sales_reference_data' },
      { version: 7, name: 'grant_lead_delete' },
      { version: 8, name: 'grant_lead_edit' },
      { version: 9, name: 'catalog_plans' },
      { version: 10, name: 'seed_plans' },
      { version: 11, name: 'catalog_offers_policies' },
      { version: 12, name: 'seed_catalog_policies' },
      { version: 13, name: 'offer_versions' },
      { version: 14, name: 'followup_edit_cancel' },
      { version: 15, name: 'customers_memberships_billing_finance' },
      { version: 16, name: 'membership_sale_idempotency' },
      { version: 17, name: 'membership_sell_permission' },
      { version: 18, name: 'membership_joining_date' },
      { version: 19, name: 'org_branding' },
      { version: 20, name: 'followup_notes' },
      { version: 21, name: 'followup_cancel_reason' },
      { version: 22, name: 'lead_stage_suppress_followups' },
      { version: 23, name: 'plan_availability' },
      { version: 24, name: 'person_blacklist' },
      { version: 25, name: 'person_photo' },
      { version: 26, name: 'seed_dnd_not_interested' },
      { version: 28, name: 'membership_cancel_renew' },
      { version: 29, name: 'refund_scheduling' },
      { version: 30, name: 'invoice_membership' },
      { version: 31, name: 'org_receipt_terms' }
    ])
  })

  it('is idempotent — a second run applies nothing', () => {
    runMigrations()
    runMigrations()
    const row = getDb().prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as {
      n: number
    }
    expect(row.n).toBe(29)
  })

  it('reconciles a legacy database and still applies the new sales migration', () => {
    getDb().exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        mobile_number TEXT NOT NULL,
        currency TEXT DEFAULT 'INR' NOT NULL,
        status TEXT DEFAULT 'ACTIVE' NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL
      );
      CREATE TABLE permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        description TEXT
      );
      CREATE TABLE roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_system_role INTEGER DEFAULT 0 NOT NULL,
        is_super INTEGER DEFAULT 0 NOT NULL,
        description TEXT,
        UNIQUE (organization_id, name)
      );
      CREATE TABLE role_permissions (
        role_id INTEGER NOT NULL,
        permission_id INTEGER NOT NULL,
        PRIMARY KEY (role_id, permission_id)
      );
      INSERT INTO schema_migrations (version, name) VALUES (1, 'identity_tenancy'), (2, 'app_meta');
    `)

    runMigrations()

    // Legacy versions 1 & 2 are left as-is; 0 is marked applied (no re-run);
    // the sales migrations (3, 4) must still run — they would be lost on a legacy
    // database if they reused a legacy version number.
    expect(appliedVersions()).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
      26, 28, 29, 30, 31
    ])
    expect(tableNames().has('organizations')).toBe(true)
    expect(tableNames().has('users')).toBe(false)
    expect(tableNames().has('leads')).toBe(true)
    expect(tableNames().has('people')).toBe(true)
  })

  it('applies versions 0 and 3 when schema_migrations exists but the legacy tables do not', () => {
    getDb().exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO schema_migrations (version, name) VALUES (1, 'identity_tenancy');
    `)

    runMigrations()

    expect(appliedVersions()).toEqual([
      0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
      28, 29, 30, 31
    ])
    expect(tableNames().has('users')).toBe(true)
    expect(tableNames().has('leads')).toBe(true)
  })

  it('seeds sales reference data for an organization that predates the org-setup seeding', () => {
    // Simulates a database created before org-setup provisioned sales reference
    // data: the schema (and migration record) exist, but the org has no stages,
    // so lead creation would fail with "No initial lead stage is configured".
    getDb().exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        mobile_number TEXT NOT NULL,
        currency TEXT DEFAULT 'INR' NOT NULL,
        status TEXT DEFAULT 'ACTIVE' NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL
      );
      INSERT INTO organizations (slug, name, mobile_number) VALUES ('old-gym', 'Old Gym', '9999999999');
      CREATE TABLE permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        description TEXT
      );
      CREATE TABLE roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_system_role INTEGER DEFAULT 0 NOT NULL,
        is_super INTEGER DEFAULT 0 NOT NULL,
        description TEXT,
        UNIQUE (organization_id, name)
      );
      CREATE TABLE role_permissions (
        role_id INTEGER NOT NULL,
        permission_id INTEGER NOT NULL,
        PRIMARY KEY (role_id, permission_id)
      );
      INSERT INTO roles (organization_id, name) VALUES (1, 'Manager'), (1, 'Sales'), (1, 'Front Desk');
      CREATE TABLE lead_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_initial INTEGER NOT NULL DEFAULT 0,
        is_won INTEGER NOT NULL DEFAULT 0,
        is_lost INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, name)
      );
      CREATE TABLE lead_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, name)
      );
      CREATE TABLE lead_activity_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, name)
      );
      CREATE TABLE lead_lost_reasons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, name)
      );
      CREATE TABLE people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, phone)
      );
      CREATE TABLE leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        plan_interest TEXT
      );
      CREATE TABLE lead_followups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        lead_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        due_at TEXT NOT NULL,
        completed_at TEXT,
        completed_by INTEGER,
        created_by INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL
      );
      INSERT INTO schema_migrations (version, name) VALUES (0, 'identity'), (3, 'sales'), (4, 'sales_list_index'), (5, 'leads_extra_fields');
    `)

    runMigrations()

    const stages = getDb()
      .prepare('SELECT name, is_initial, is_won, is_lost FROM lead_stages ORDER BY sort_order')
      .all() as { name: string; is_initial: number; is_won: number; is_lost: number }[]
    expect(stages).toHaveLength(11)
    expect(stages[0]).toEqual({ name: 'NEW', is_initial: 1, is_won: 0, is_lost: 0 })
    expect(stages).toContainEqual({ name: 'WON', is_initial: 0, is_won: 1, is_lost: 0 })
    expect(stages).toContainEqual({ name: 'LOST', is_initial: 0, is_won: 0, is_lost: 1 })
    // v26 seeds the DND / Not Interested stages for pre-existing orgs.
    expect(stages).toContainEqual({
      name: 'DO_NOT_DISTURB',
      is_initial: 0,
      is_won: 0,
      is_lost: 0
    })
    expect(stages).toContainEqual({
      name: 'NOT_INTERESTED',
      is_initial: 0,
      is_won: 0,
      is_lost: 0
    })

    const sourceCount = getDb().prepare('SELECT COUNT(*) AS n FROM lead_sources').get() as {
      n: number
    }
    expect(sourceCount.n).toBe(8)
    const activityTypeCount = getDb()
      .prepare('SELECT COUNT(*) AS n FROM lead_activity_types')
      .get() as { n: number }
    expect(activityTypeCount.n).toBe(9)
    const lostReasonCount = getDb()
      .prepare('SELECT COUNT(*) AS n FROM lead_lost_reasons')
      .get() as { n: number }
    expect(lostReasonCount.n).toBe(8)

    // A second migration run must not duplicate the seed rows (unique constraint).
    runMigrations()
    const stageCountAfter = getDb().prepare('SELECT COUNT(*) AS n FROM lead_stages').get() as {
      n: number
    }
    expect(stageCountAfter.n).toBe(11)
  })

  it('seeds the starter membership plans for an organization that predates the org-setup seeding', () => {
    // Simulates a database created before the catalog module existed: the schema
    // (and migration record) exist, but the org has no plans yet. The seed must
    // provision the starter catalog (v10) and stay idempotent on a second run.
    getDb().exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        mobile_number TEXT NOT NULL,
        currency TEXT DEFAULT 'INR' NOT NULL,
        status TEXT DEFAULT 'ACTIVE' NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL
      );
      INSERT INTO organizations (slug, name, mobile_number) VALUES ('old-gym', 'Old Gym', '9999999999');
      CREATE TABLE permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, description TEXT);
      CREATE TABLE roles (id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, name TEXT NOT NULL, UNIQUE (organization_id, name));
      CREATE TABLE role_permissions (role_id INTEGER NOT NULL, permission_id INTEGER NOT NULL, PRIMARY KEY (role_id, permission_id));
      CREATE TABLE lead_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_initial INTEGER NOT NULL DEFAULT 0,
        is_won INTEGER NOT NULL DEFAULT 0,
        is_lost INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, name)
      );
      CREATE TABLE people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, phone)
      );
      CREATE TABLE leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        plan_interest TEXT
      );
      CREATE TABLE lead_followups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        lead_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        due_at TEXT NOT NULL,
        completed_at TEXT,
        completed_by INTEGER,
        created_by INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL
      );
      INSERT INTO schema_migrations (version, name) VALUES (0, 'identity'), (3, 'sales'), (4, 'sales_list_index'), (5, 'leads_extra_fields'), (6, 'seed_sales_reference_data'), (7, 'grant_lead_delete'), (8, 'grant_lead_edit');
    `)

    runMigrations()

    const plans = getDb()
      .prepare('SELECT name, active FROM membership_plans WHERE organization_id = 1 ORDER BY name')
      .all() as { name: string; active: number }[]
    expect(plans).toHaveLength(7)
    expect(plans).toContainEqual({ name: 'Annual Premium', active: 1 })
    expect(plans).toContainEqual({ name: 'Weekend Access', active: 0 })
    expect(plans).toContainEqual({ name: 'Basic Monthly', active: 1 })

    const planCols = getDb().prepare('PRAGMA table_info(leads)').all() as { name: string }[]
    expect(planCols.some((c) => c.name === 'plan_id')).toBe(true)
    expect(planCols.some((c) => c.name === 'plan_interest')).toBe(false)

    // A second migration run must not duplicate the seeded plans.
    runMigrations()
    const planCountAfter = getDb()
      .prepare('SELECT COUNT(*) AS n FROM membership_plans WHERE organization_id = 1')
      .get() as { n: number }
    expect(planCountAfter.n).toBe(7)
  })

  it('grants lead.delete to Manager and Sales roles of existing organizations', () => {
    // Simulates an org created before the permission catalog gained lead.delete:
    // the identity schema and migration record exist, but the grant does not.
    getDb().exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        mobile_number TEXT NOT NULL,
        currency TEXT DEFAULT 'INR' NOT NULL,
        status TEXT DEFAULT 'ACTIVE' NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL
      );
      CREATE TABLE permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        description TEXT
      );
      CREATE TABLE roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_system_role INTEGER DEFAULT 0 NOT NULL,
        is_super INTEGER DEFAULT 0 NOT NULL,
        description TEXT,
        UNIQUE (organization_id, name)
      );
      CREATE TABLE role_permissions (
        role_id INTEGER NOT NULL,
        permission_id INTEGER NOT NULL,
        PRIMARY KEY (role_id, permission_id)
      );
      CREATE TABLE lead_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_initial INTEGER NOT NULL DEFAULT 0,
        is_won INTEGER NOT NULL DEFAULT 0,
        is_lost INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, name)
      );
      CREATE TABLE people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, phone)
      );
      CREATE TABLE leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        plan_interest TEXT
      );
      CREATE TABLE lead_followups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        lead_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        due_at TEXT NOT NULL,
        completed_at TEXT,
        completed_by INTEGER,
        created_by INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL
      );
      INSERT INTO schema_migrations (version, name)
      VALUES (0, 'identity'), (3, 'sales'), (4, 'sales_list_index'), (5, 'leads_extra_fields'), (6, 'seed_sales_reference_data');
      INSERT INTO organizations (slug, name, mobile_number) VALUES ('old-gym', 'Old Gym', '9999999999');
      INSERT INTO roles (organization_id, name) VALUES (1, 'Manager'), (1, 'Sales'), (1, 'Front Desk');
      INSERT INTO permissions (code) VALUES ('lead.view');
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'Manager' AND p.code = 'lead.view';
    `)

    runMigrations()

    const grant = (roleName: string): boolean =>
      getDb()
        .prepare(
          `SELECT 1 FROM role_permissions rp
           JOIN roles r ON r.id = rp.role_id
           JOIN permissions p ON p.id = rp.permission_id
           WHERE r.name = ? AND p.code = 'lead.delete'`
        )
        .get(roleName) !== undefined

    expect(grant('Manager')).toBe(true)
    expect(grant('Sales')).toBe(true)
    expect(grant('Front Desk')).toBe(false)

    // A second run is a no-op: the permission row + grants already exist.
    runMigrations()
    const deleteGrants = getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
         WHERE p.code = 'lead.delete'`
      )
      .get() as { n: number }
    expect(deleteGrants.n).toBe(2)
  })

  it('grants lead.edit to Manager and Sales roles of existing organizations', () => {
    // Simulates an org created before the permission catalog gained lead.edit:
    // the identity schema and migration record exist (including the lead.delete
    // grant), but the lead.edit grant does not.
    getDb().exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        mobile_number TEXT NOT NULL,
        currency TEXT DEFAULT 'INR' NOT NULL,
        status TEXT DEFAULT 'ACTIVE' NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL
      );
      CREATE TABLE permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        description TEXT
      );
      CREATE TABLE roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_system_role INTEGER DEFAULT 0 NOT NULL,
        is_super INTEGER DEFAULT 0 NOT NULL,
        description TEXT,
        UNIQUE (organization_id, name)
      );
      CREATE TABLE role_permissions (
        role_id INTEGER NOT NULL,
        permission_id INTEGER NOT NULL,
        PRIMARY KEY (role_id, permission_id)
      );
      CREATE TABLE lead_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_initial INTEGER NOT NULL DEFAULT 0,
        is_won INTEGER NOT NULL DEFAULT 0,
        is_lost INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, name)
      );
      CREATE TABLE people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, phone)
      );
      CREATE TABLE leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        plan_interest TEXT
      );
      CREATE TABLE lead_followups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        lead_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        due_at TEXT NOT NULL,
        completed_at TEXT,
        completed_by INTEGER,
        created_by INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL
      );
      INSERT INTO schema_migrations (version, name)
      VALUES (0, 'identity'), (3, 'sales'), (4, 'sales_list_index'), (5, 'leads_extra_fields'), (6, 'seed_sales_reference_data'), (7, 'grant_lead_delete');
      INSERT INTO organizations (slug, name, mobile_number) VALUES ('old-gym', 'Old Gym', '9999999999');
      INSERT INTO roles (organization_id, name) VALUES (1, 'Manager'), (1, 'Sales'), (1, 'Front Desk');
      INSERT INTO permissions (code) VALUES ('lead.view');
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'Manager' AND p.code = 'lead.view';
    `)

    runMigrations()

    const grant = (roleName: string): boolean =>
      getDb()
        .prepare(
          `SELECT 1 FROM role_permissions rp
           JOIN roles r ON r.id = rp.role_id
           JOIN permissions p ON p.id = rp.permission_id
           WHERE r.name = ? AND p.code = 'lead.edit'`
        )
        .get(roleName) !== undefined

    expect(grant('Manager')).toBe(true)
    expect(grant('Sales')).toBe(true)
    expect(grant('Front Desk')).toBe(false)

    // A second run is a no-op: the permission row + grants already exist.
    runMigrations()
    const editGrants = getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
         WHERE p.code = 'lead.edit'`
      )
      .get() as { n: number }
    expect(editGrants.n).toBe(2)
  })

  it('seeds default policies and attaches them to plans for an org that predates the policy tables', () => {
    // Simulates an org created before the catalog offers/policies module landed:
    // the schema (and migration record through v10) exists, but the policy
    // tables and their default rows do not. v11 creates the tables, v12 must
    // provision the default policies and attach them to the org's plans, and a
    // second run must stay idempotent.
    getDb().exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        mobile_number TEXT NOT NULL,
        currency TEXT DEFAULT 'INR' NOT NULL,
        status TEXT DEFAULT 'ACTIVE' NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL
      );
      INSERT INTO organizations (slug, name, mobile_number) VALUES ('old-gym', 'Old Gym', '9999999999');
      CREATE TABLE permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, description TEXT);
      CREATE TABLE roles (id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, name TEXT NOT NULL, UNIQUE (organization_id, name));
      CREATE TABLE role_permissions (role_id INTEGER NOT NULL, permission_id INTEGER NOT NULL, PRIMARY KEY (role_id, permission_id));
      CREATE TABLE lead_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_initial INTEGER NOT NULL DEFAULT 0,
        is_won INTEGER NOT NULL DEFAULT 0,
        is_lost INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, name)
      );
      CREATE TABLE people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, phone)
      );
      CREATE TABLE membership_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        duration TEXT NOT NULL,
        billing_frequency TEXT DEFAULT 'ONE_TIME' NOT NULL,
        base_price_minor INTEGER NOT NULL,
        access_window TEXT DEFAULT 'ALL_HOURS' NOT NULL,
        start_time TEXT,
        end_time TEXT,
        active INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL,
        updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
        UNIQUE (organization_id, name)
      );
      INSERT INTO membership_plans (organization_id, name, duration, base_price_minor)
      VALUES (1, 'Legacy Monthly', 'MONTHLY', 150000);
      CREATE TABLE lead_followups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        lead_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        due_at TEXT NOT NULL,
        completed_at TEXT,
        completed_by INTEGER,
        created_by INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL
      );
      INSERT INTO schema_migrations (version, name) VALUES
        (0, 'identity'), (3, 'sales'), (4, 'sales_list_index'), (5, 'leads_extra_fields'),
        (6, 'seed_sales_reference_data'), (7, 'grant_lead_delete'), (8, 'grant_lead_edit'),
        (9, 'catalog_plans'), (10, 'seed_plans');
    `)

    runMigrations()

    const policyCount = getDb()
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM freeze_policies WHERE organization_id = 1) AS freeze,
          (SELECT COUNT(*) FROM proration_policies WHERE organization_id = 1) AS proration,
          (SELECT COUNT(*) FROM cancellation_policies WHERE organization_id = 1) AS cancel`
      )
      .get() as { freeze: number; proration: number; cancel: number }
    expect(policyCount).toEqual({ freeze: 3, proration: 3, cancel: 3 })

    const plan = getDb()
      .prepare(
        `SELECT fp.name AS freeze, pp.name AS proration, cp.name AS cancel
         FROM membership_plans mp
         LEFT JOIN freeze_policies fp ON fp.id = mp.freeze_policy_id
         LEFT JOIN proration_policies pp ON pp.id = mp.proration_policy_id
         LEFT JOIN cancellation_policies cp ON cp.id = mp.cancellation_policy_id
         WHERE mp.organization_id = 1 AND mp.name = 'Legacy Monthly'`
      )
      .get() as { freeze: string | null; proration: string | null; cancel: string | null }
    expect(plan).toEqual({
      freeze: 'Standard Freeze',
      proration: 'Standard Proration',
      cancel: 'End of Period'
    })

    // A second migration run must not duplicate the seeded policies.
    runMigrations()
    const after = getDb()
      .prepare(`SELECT COUNT(*) AS n FROM freeze_policies WHERE organization_id = 1`)
      .get() as { n: number }
    expect(after.n).toBe(3)
  })
})

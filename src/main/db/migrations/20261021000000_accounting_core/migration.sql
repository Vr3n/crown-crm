-- Crown Books baseline schema.
-- One active company per installation, company_id on every business row.
-- Money is integer paise. Quantity is integer scaled by 10,000. Rates are basis points.

CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  legal_name TEXT,
  gstin TEXT,
  pan TEXT,
  state_code TEXT NOT NULL,
  address TEXT,
  city TEXT,
  pincode TEXT,
  phone TEXT,
  email TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  fy_start_month INTEGER NOT NULL DEFAULT 4,
  books_begin_date TEXT NOT NULL,
  logo TEXT,
  invoice_prefix TEXT,
  invoice_terms TEXT DEFAULT '1. This is a computer generated invoice and is valid without a signature.
2. Goods once sold will not be taken back after 7 days.
3. Report any discrepancy within 7 days of the invoice date.',
  costing_method TEXT NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
  round_off_mode TEXT NOT NULL DEFAULT 'INVOICE',
  allow_negative_stock INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  is_system_role INTEGER NOT NULL DEFAULT 0,
  is_super INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  UNIQUE (company_id, name)
);

CREATE TABLE permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE company_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role_id INTEGER NOT NULL REFERENCES roles(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, user_id)
);
CREATE INDEX idx_company_users_company ON company_users(company_id);
CREATE INDEX idx_company_users_user ON company_users(user_id);

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE account_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  parent_id INTEGER,
  nature TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 0,
  UNIQUE (company_id, name)
);
CREATE INDEX idx_account_groups_company ON account_groups(company_id);

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  group_id INTEGER NOT NULL REFERENCES account_groups(id),
  name TEXT NOT NULL,
  code TEXT,
  type TEXT NOT NULL,
  system_key TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  opening_balance_minor INTEGER NOT NULL DEFAULT 0,
  opening_balance_side TEXT NOT NULL DEFAULT 'DEBIT',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, name)
);
CREATE INDEX idx_accounts_company_type ON accounts(company_id, type);
CREATE INDEX idx_accounts_company_group ON accounts(company_id, group_id);

CREATE TABLE parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  display_name TEXT,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  pan TEXT,
  state_code TEXT,
  billing_address TEXT,
  shipping_address TEXT,
  is_customer INTEGER NOT NULL DEFAULT 0,
  is_supplier INTEGER NOT NULL DEFAULT 0,
  credit_days INTEGER NOT NULL DEFAULT 0,
  credit_limit_minor INTEGER NOT NULL DEFAULT 0,
  opening_balance_minor INTEGER NOT NULL DEFAULT 0,
  opening_balance_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id)
);
CREATE INDEX idx_parties_company_name ON parties(company_id, name);
CREATE INDEX idx_parties_company_customer ON parties(company_id, is_customer, is_active);
CREATE INDEX idx_parties_company_phone ON parties(company_id, phone);

CREATE TABLE party_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  party_id INTEGER NOT NULL REFERENCES parties(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  role TEXT NOT NULL,
  UNIQUE (company_id, party_id, role)
);
CREATE INDEX idx_party_accounts_account ON party_accounts(account_id);

CREATE TABLE units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 0,
  UNIQUE (company_id, name)
);

CREATE TABLE stock_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  parent_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (company_id, name)
);

CREATE TABLE godowns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  address TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (company_id, name)
);

CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  sku TEXT,
  hsn_sac TEXT,
  uom_id INTEGER REFERENCES units(id),
  stock_group_id INTEGER REFERENCES stock_groups(id),
  gst_rate_bps INTEGER NOT NULL DEFAULT 0,
  cess_rate_bps INTEGER NOT NULL DEFAULT 0,
  is_service INTEGER NOT NULL DEFAULT 0,
  track_serial INTEGER NOT NULL DEFAULT 0,
  sale_price_minor INTEGER NOT NULL DEFAULT 0,
  purchase_price_minor INTEGER NOT NULL DEFAULT 0,
  opening_qty_e4 INTEGER NOT NULL DEFAULT 0,
  opening_rate_minor INTEGER NOT NULL DEFAULT 0,
  reorder_level_e4 INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id),
  UNIQUE (company_id, sku)
);
CREATE INDEX idx_items_company_name ON items(company_id, name);
CREATE INDEX idx_items_company_hsn ON items(company_id, hsn_sac);

CREATE TABLE tax_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  gst_rate_bps INTEGER NOT NULL,
  cess_rate_bps INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT
);
CREATE INDEX idx_tax_rates_company ON tax_rates(company_id, effective_from);

CREATE TABLE voucher_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  voucher_type TEXT NOT NULL,
  series TEXT NOT NULL,
  fy TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  suffix TEXT NOT NULL DEFAULT '',
  padding INTEGER NOT NULL DEFAULT 4,
  last_value INTEGER NOT NULL DEFAULT 0,
  UNIQUE (company_id, voucher_type, series, fy)
);

CREATE TABLE vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  voucher_type TEXT NOT NULL,
  series TEXT NOT NULL,
  number TEXT NOT NULL,
  fy TEXT NOT NULL,
  voucher_date TEXT NOT NULL,
  due_date TEXT,
  party_id INTEGER REFERENCES parties(id),
  place_of_supply_state_code TEXT,
  narration TEXT,
  reference_no TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  taxable_minor INTEGER NOT NULL DEFAULT 0,
  cgst_minor INTEGER NOT NULL DEFAULT 0,
  sgst_minor INTEGER NOT NULL DEFAULT 0,
  igst_minor INTEGER NOT NULL DEFAULT 0,
  cess_minor INTEGER NOT NULL DEFAULT 0,
  discount_minor INTEGER NOT NULL DEFAULT 0,
  round_off_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL DEFAULT 0,
  total_qty_e4 INTEGER NOT NULL DEFAULT 0,
  payment_method_id INTEGER,
  instrument_no TEXT,
  instrument_date TEXT,
  bank_account_id INTEGER REFERENCES accounts(id),
  reversal_of_voucher_id INTEGER,
  cancelled_at TEXT,
  cancelled_by INTEGER REFERENCES users(id),
  cancel_reason TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id),
  posted_at TEXT,
  posted_by INTEGER REFERENCES users(id),
  UNIQUE (company_id, voucher_type, series, fy, number)
);
CREATE INDEX idx_vouchers_company_date ON vouchers(company_id, voucher_date);
CREATE INDEX idx_vouchers_company_type_status ON vouchers(company_id, voucher_type, status);
CREATE INDEX idx_vouchers_company_party ON vouchers(company_id, party_id, voucher_date);
CREATE INDEX idx_vouchers_company_due ON vouchers(company_id, due_date);

CREATE TABLE voucher_item_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id),
  description_snapshot TEXT NOT NULL,
  hsn_snapshot TEXT,
  uom_snapshot TEXT,
  qty_e4 INTEGER NOT NULL,
  entered_rate_minor INTEGER NOT NULL,
  rate_includes_tax INTEGER NOT NULL DEFAULT 0,
  discount_bps INTEGER NOT NULL DEFAULT 0,
  gst_rate_bps INTEGER NOT NULL DEFAULT 0,
  taxable_value_minor INTEGER NOT NULL DEFAULT 0,
  cgst_minor INTEGER NOT NULL DEFAULT 0,
  sgst_minor INTEGER NOT NULL DEFAULT 0,
  igst_minor INTEGER NOT NULL DEFAULT 0,
  cess_minor INTEGER NOT NULL DEFAULT 0,
  line_total_minor INTEGER NOT NULL DEFAULT 0,
  unit_cost_minor INTEGER,
  godown_id INTEGER REFERENCES godowns(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  CHECK (qty_e4 > 0)
);
CREATE INDEX idx_item_lines_voucher ON voucher_item_lines(voucher_id);

CREATE TABLE ledger_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  party_id INTEGER REFERENCES parties(id),
  debit_minor INTEGER NOT NULL DEFAULT 0,
  credit_minor INTEGER NOT NULL DEFAULT 0,
  narration TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  CHECK ((debit_minor = 0) <> (credit_minor = 0)),
  CHECK (debit_minor >= 0 AND credit_minor >= 0)
);
CREATE INDEX idx_ledger_company_account ON ledger_lines(company_id, account_id);
CREATE INDEX idx_ledger_voucher ON ledger_lines(voucher_id);
CREATE INDEX idx_ledger_company_party ON ledger_lines(company_id, party_id);

CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  godown_id INTEGER REFERENCES godowns(id),
  qty_in_e4 INTEGER NOT NULL DEFAULT 0,
  qty_out_e4 INTEGER NOT NULL DEFAULT 0,
  unit_cost_minor INTEGER NOT NULL DEFAULT 0,
  movement_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((qty_in_e4 = 0) <> (qty_out_e4 = 0))
);
CREATE INDEX idx_stock_company_item ON stock_movements(company_id, item_id, godown_id);
CREATE INDEX idx_stock_voucher ON stock_movements(voucher_id);

CREATE TABLE bill_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  from_voucher_id INTEGER NOT NULL REFERENCES vouchers(id),
  to_voucher_id INTEGER NOT NULL REFERENCES vouchers(id),
  amount_minor INTEGER NOT NULL,
  allocation_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id),
  CHECK (amount_minor > 0)
);
CREATE INDEX idx_allocations_from ON bill_allocations(from_voucher_id);
CREATE INDEX idx_allocations_to ON bill_allocations(to_voucher_id);
CREATE INDEX idx_allocations_company ON bill_allocations(company_id);

CREATE TABLE payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (company_id, name)
);
CREATE INDEX idx_payment_methods_company ON payment_methods(company_id);

CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  entity TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  actor_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_company_entity ON audit_events(company_id, entity, entity_id);
CREATE INDEX idx_audit_company_date ON audit_events(company_id, created_at);

CREATE TABLE idempotency_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  channel TEXT NOT NULL,
  key TEXT NOT NULL,
  payload_hash TEXT,
  response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, channel, key)
);
CREATE INDEX idx_idempotency_company_key ON idempotency_keys(company_id, key);

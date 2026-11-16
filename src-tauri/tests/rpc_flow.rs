//! End-to-end backend test.
//!
//! Drives the real RPC dispatcher against a real SQLite file: setup → masters →
//! numbering → sales invoice → reports → dashboard → summaries → search →
//! outstanding → backup → logout/login. This is the same code path the Tauri
//! `rpc` command calls, minus the webview (which is why `Ctx::app` is an
//! `Option`).

use std::path::PathBuf;

use crown_books_lib as cb;
use serde_json::{json, Value};

struct Harness {
    inner: cb::state::Inner,
    paths: cb::paths::Paths,
    root: PathBuf,
}

impl Harness {
    fn new(name: &str) -> Self {
        let root = std::env::temp_dir().join(format!("crown-books-it-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("create temp dir");

        let paths = cb::paths::Paths {
            user_data: root.clone(),
            database: root.join("crown-books.db"),
            backups: root.join("backups"),
            logs: root.join("logs"),
        };
        paths.ensure().expect("create data dirs");

        let conn = cb::db::open(&paths.database).expect("open database");
        cb::db::migrate(&conn).expect("migrate");
        cb::db::seed::seed_permissions(&conn).expect("seed permissions");

        Self { inner: cb::state::Inner { conn, session: None }, paths, root }
    }

    fn call(&mut self, channel: &str, payload: Value) -> Value {
        let args: Vec<Value> = if payload.is_null() { Vec::new() } else { vec![payload] };
        let mut ctx = cb::state::Ctx::new(&mut self.inner, &self.paths, None);
        match cb::rpc::dispatch(&mut ctx, channel, &args) {
            Ok(data) => data,
            Err(err) => panic!("{channel} failed: {err}"),
        }
    }

    fn call_err(&mut self, channel: &str, payload: Value) -> &'static str {
        let args: Vec<Value> = if payload.is_null() { Vec::new() } else { vec![payload] };
        let mut ctx = cb::state::Ctx::new(&mut self.inner, &self.paths, None);
        match cb::rpc::dispatch(&mut ctx, channel, &args) {
            Ok(data) => panic!("{channel} was expected to fail, returned {data}"),
            Err(err) => err.code,
        }
    }

    fn call_error(&mut self, channel: &str, payload: Value) -> cb::error::AppError {
        let args: Vec<Value> = if payload.is_null() { Vec::new() } else { vec![payload] };
        let mut ctx = cb::state::Ctx::new(&mut self.inner, &self.paths, None);
        match cb::rpc::dispatch(&mut ctx, channel, &args) {
            Ok(data) => panic!("{channel} was expected to fail, returned {data}"),
            Err(err) => err,
        }
    }
}

impl Drop for Harness {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn rows(value: &Value) -> &Vec<Value> {
    value.as_array().unwrap_or_else(|| panic!("expected an array, got {value}"))
}

#[test]
fn full_rpc_flow() {
    let mut app = Harness::new("flow");

    // --- first run ------------------------------------------------------
    assert_eq!(app.call("identity:status", Value::Null), json!("SETUP_REQUIRED"));

    let session = app.call(
        "identity:setup",
        json!({
            "name": "Acme Traders",
            "ownerFullName": "Asha Rao",
            "ownerEmail": "asha@acme.test",
            "ownerPassword": "correct-horse",
            "stateCode": "27",
            "gstin": "27AAPFU0939F1ZV",
            "booksBeginDate": "2026-04-01"
        }),
    );
    assert_eq!(session["companyName"], json!("Acme Traders"));
    assert_eq!(session["companySlug"], json!("acme-traders"));
    assert_eq!(session["isSuper"], json!(true));
    assert_eq!(session["roleName"], json!("Owner"));
    assert_eq!(session["permissions"].as_array().map(Vec::len), Some(31));
    let company_id = session["companyId"].as_i64().expect("company id");

    assert_eq!(app.call("identity:status", Value::Null), json!("AUTHENTICATED"));

    let company = app.call("identity:company", Value::Null);
    assert_eq!(company["id"].as_i64(), Some(company_id));
    assert_eq!(company["fyStartMonth"].as_i64(), Some(4));
    assert_eq!(company["currency"], json!("INR"));

    // A second setup must be refused.
    assert_eq!(
        app.call_err(
            "identity:setup",
            json!({
                "name": "Other Co",
                "ownerFullName": "B",
                "ownerEmail": "b@other.test",
                "ownerPassword": "correct-horse"
            })
        ),
        "VALIDATION_ERROR"
    );

    // --- access ---------------------------------------------------------
    let roles = app.call("identity:roles", Value::Null);
    assert_eq!(rows(&roles).len(), 5, "seeded roles: {roles}");
    let permissions = app.call("identity:permissions", Value::Null);
    assert_eq!(rows(&permissions).len(), 31);
    let staff = app.call("identity:staff", Value::Null);
    assert_eq!(rows(&staff).len(), 1);
    assert_eq!(staff[0]["isSelf"], json!(true));

    // --- seeded masters -------------------------------------------------
    let units = app.call("units:list", json!({}));
    assert!(rows(&units).len() >= 8, "units: {units}");
    let nos_id = units
        .as_array()
        .unwrap()
        .iter()
        .find(|u| u["symbol"] == json!("nos"))
        .and_then(|u| u["id"].as_i64())
        .expect("Nos unit");

    let accounts = app.call("accounts:list", json!({}));
    assert!(rows(&accounts).len() >= 19, "accounts: {}", rows(&accounts).len());
    let system_keys: Vec<&str> = accounts
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|a| a["systemKey"].as_str())
        .collect();
    for required in ["SALES", "OUTPUT_CGST", "OUTPUT_SGST", "INVENTORY", "ROUND_OFF"] {
        assert!(system_keys.contains(&required), "missing system account {required}");
    }

    let groups = app.call("accounts:groups", Value::Null);
    assert!(rows(&groups).len() >= 19);

    let tax_rates = app.call("taxRates:list", json!({}));
    assert_eq!(rows(&tax_rates).len(), 4);
    assert_eq!(tax_rates[0]["isCurrent"], json!(true));

    let godowns = app.call("godowns:list", Value::Null);
    assert_eq!(rows(&godowns).len(), 1);
    let godown_id = godowns[0]["id"].as_i64().expect("godown id");

    // --- masters --------------------------------------------------------
    let party = app.call(
        "parties:create",
        json!({
            "name": "Ravi Kirana",
            "phone": "9876543210",
            "stateCode": "27",
            "isCustomer": true,
            "isSupplier": false,
            "creditDays": 15,
            "openingBalanceMinor": 0
        }),
    );
    let party_id = party["id"].as_i64().expect("party id");
    assert_eq!(party["isCustomer"], json!(true));
    assert_eq!(party["balanceMinor"].as_i64(), Some(0));

    let item = app.call(
        "items:create",
        json!({
            "name": "Toor Dal 1kg",
            "sku": "TD-1",
            "hsnSac": "0713",
            "uomId": nos_id,
            "gstRateBps": 1800,
            "isService": false,
            "salePriceMinor": 10000,
            "purchasePriceMinor": 8000,
            "openingQtyE4": 100000,
            "openingRateMinor": 8000
        }),
    );
    let item_id = item["id"].as_i64().expect("item id");
    assert_eq!(item["openingQtyE4"].as_i64(), Some(100000));
    // Declared opening stock only reaches the ledger when the opening voucher
    // is posted, exactly like the Electron implementation.
    assert_eq!(item["stockQtyE4"].as_i64(), Some(0));
    assert_eq!(item["gstRateBps"].as_i64(), Some(1800));

    // The customer/supplier ledgers are created alongside the party.
    let party_after = app.call("parties:get", json!({ "id": party_id }));
    assert_eq!(party_after["id"].as_i64(), Some(party_id));

    let parties = app.call("parties:list", json!({ "query": "ravi" }));
    assert_eq!(rows(&parties).len(), 1);
    let items = app.call("items:list", json!({ "query": "dal" }));
    assert_eq!(rows(&items).len(), 1);

    // --- numbering ------------------------------------------------------
    let numbering = app.call("numbering:list", Value::Null);
    assert_eq!(rows(&numbering).len(), 9, "nine voucher types");
    let sales = numbering
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["voucherType"] == json!("SALES"))
        .expect("sales numbering row");
    assert_eq!(sales["nextNumber"], json!("INV/0001"));

    // --- opening balances -----------------------------------------------
    let opening = app.call("vouchers:postOpening", json!({ "date": "2026-04-01" }));
    assert!(opening["id"].as_i64().is_some(), "opening voucher: {opening}");
    let item_opening = app.call("items:get", json!({ "id": item_id }));
    assert_eq!(item_opening["stockQtyE4"].as_i64(), Some(100000));

    // --- post a sales invoice -------------------------------------------
    let sales_input = json!({
        "requestId": "it-request-0001",
        "type": "SALES",
        "date": "2026-04-10",
        "dueDate": "2026-04-25",
        "partyId": party_id,
        "placeOfSupplyStateCode": "27",
        "narration": "First invoice",
        "lines": [{
            "itemId": item_id,
            "description": "Toor Dal 1kg",
            "hsn": "0713",
            "uom": "nos",
            "qtyE4": 20000,
            "rateMinor": 10000,
            "discountBps": 0,
            "gstRateBps": 1800,
            "godownId": godown_id
        }]
    });
    let posted = app.call("vouchers:post", sales_input.clone());
    let voucher_id = posted["id"].as_i64().expect("voucher id");
    assert_eq!(posted["number"], json!("INV/0001"));

    // The same request id with the same payload replays the stored response.
    let replay = app.call("vouchers:post", sales_input.clone());
    assert_eq!(replay["id"].as_i64(), Some(voucher_id));

    // The same request id with a different payload is a conflict.
    let mut tampered = sales_input.clone();
    tampered["narration"] = json!("Edited after the fact");
    assert_eq!(app.call_err("vouchers:post", tampered), "IDEMPOTENCY_CONFLICT");

    let detail = app.call("vouchers:get", json!({ "id": voucher_id }));
    assert_eq!(detail["number"], json!("INV/0001"));
    assert_eq!(detail["status"], json!("POSTED"));
    // 2 x 100.00 = 200.00 taxable, 18% GST = 36.00, total 236.00.
    assert_eq!(detail["totalMinor"].as_i64(), Some(23600), "detail: {detail}");
    assert_eq!(rows(&detail["lines"]).len(), 1);

    let list = app.call("vouchers:list", json!({ "type": "SALES" }));
    assert_eq!(rows(&list).len(), 1);
    assert_eq!(list[0]["partyName"], json!("Ravi Kirana"));

    let invoice = app.call("vouchers:invoice", json!({ "id": voucher_id }));
    assert_eq!(invoice["number"], json!("INV/0001"));
    assert!(rows(&invoice["lines"]).len() == 1, "invoice lines: {invoice}");
    assert_eq!(invoice["interState"], json!(false));
    assert!(invoice["amountInWords"].as_str().is_some_and(|w| !w.is_empty()));

    // Stock moved: 10 units on hand, 8 sold.
    let item_after = app.call("items:get", json!({ "id": item_id }));
    assert_eq!(item_after["stockQtyE4"].as_i64(), Some(80000));

    // --- outstanding, reports, dashboard --------------------------------
    let outstanding = app.call("vouchers:outstanding", json!({ "partyId": party_id }));
    assert_eq!(rows(&outstanding).len(), 1);
    assert_eq!(outstanding[0]["id"].as_i64(), Some(voucher_id));

    let trial = app.call("reports:trialBalance", Value::Null);
    assert!(!rows(&trial).is_empty());
    let debit: i64 = trial.as_array().unwrap().iter().filter_map(|r| r["debitMinor"].as_i64()).sum();
    let credit: i64 = trial.as_array().unwrap().iter().filter_map(|r| r["creditMinor"].as_i64()).sum();
    assert_eq!(debit, credit, "trial balance must balance: {trial}");

    let pnl = app.call("reports:profitLoss", json!({ "from": "2026-04-01", "to": "2027-03-31" }));
    // Sales 200.00 taxable; cost of goods sold 2 x 80.00 = 160.00.
    assert_eq!(pnl["totalIncomeMinor"].as_i64(), Some(20000), "pnl: {pnl}");
    assert_eq!(pnl["totalExpenseMinor"].as_i64(), Some(16000), "pnl: {pnl}");
    assert_eq!(pnl["netProfitMinor"].as_i64(), Some(4000), "pnl: {pnl}");
    // The chart series is an additive read of the same period. It must sum to
    // the table totals, opening balances included.
    let monthly = pnl["monthly"].as_array().expect("monthly series");
    assert_eq!(monthly.len(), 1, "pnl monthly: {pnl}");
    assert_eq!(monthly[0]["month"], json!("2026-04"));
    assert_eq!(monthly[0]["incomeMinor"].as_i64(), Some(20000));
    assert_eq!(monthly[0]["expenseMinor"].as_i64(), Some(16000));
    assert_eq!(monthly[0]["netProfitMinor"].as_i64(), Some(4000));

    let sheet = app.call("reports:balanceSheet", json!({ "from": "2026-04-01", "to": "2027-03-31" }));
    assert_eq!(sheet["differenceMinor"].as_i64(), Some(0), "balance sheet: {sheet}");

    let receivables = app.call("reports:receivables", json!({ "asOf": "2026-04-30", "basis": "DUE_DATE" }));
    assert_eq!(rows(&receivables).len(), 1);
    // Due 2026-04-25, five days late: bucket 0-30, nothing still to fall due.
    assert_eq!(receivables[0]["bucketsMinor"], json!([23600, 0, 0, 0, 0]));
    assert_eq!(receivables[0]["dueWithin7Minor"].as_i64(), Some(0));
    assert_eq!(receivables[0]["dueWithin30Minor"].as_i64(), Some(0));

    // Before the due date the same bill is due soon, which the status stripe
    // and the payables ranking read from the same fields.
    let before_due = app.call("reports:receivables", json!({ "asOf": "2026-04-20", "basis": "DUE_DATE" }));
    assert_eq!(before_due[0]["overdueMinor"].as_i64(), Some(0));
    assert_eq!(before_due[0]["notDueMinor"].as_i64(), Some(23600));
    assert_eq!(before_due[0]["dueWithin7Minor"].as_i64(), Some(23600));
    assert_eq!(before_due[0]["dueWithin30Minor"].as_i64(), Some(23600));
    assert_eq!(before_due[0]["bucketsMinor"], json!([23600, 0, 0, 0, 0]));

    let payables = app.call("reports:payables", json!({ "asOf": "2026-04-30", "basis": "DUE_DATE" }));
    assert!(rows(&payables).is_empty());

    let ageing = app.call("reports:ageing", json!({ "asOf": "2026-04-30", "basis": "DUE_DATE" }));
    assert_eq!(rows(&ageing).len(), 1, "one row per party: {ageing}");
    assert_eq!(ageing[0]["bucketsMinor"].as_array().map(Vec::len), Some(5));
    assert_eq!(ageing[0]["totalMinor"].as_i64(), Some(23600), "ageing: {ageing}");
    // Due 2026-04-25, as of 2026-04-30: five days late, so the first bucket,
    // which covers everything up to 30 days (and not-yet-due bills).
    assert_eq!(ageing[0]["bucketsMinor"][0].as_i64(), Some(23600));

    let statement = app.call(
        "reports:statement",
        json!({ "partyId": party_id, "from": "2026-04-01", "to": "2027-03-31" }),
    );
    assert_eq!(rows(&statement).len(), 1);

    let register = app.call("reports:register", json!({ "type": "SALES", "from": "2026-04-01", "to": "2027-03-31" }));
    assert_eq!(rows(&register).len(), 1);

    let stock = app.call("reports:stock", Value::Null);
    assert_eq!(rows(&stock).len(), 1);
    let movements = app.call(
        "reports:stock-movements",
        json!({ "itemId": item_id, "from": "2026-04-01", "to": "2027-03-31" }),
    );
    assert!(!rows(&movements).is_empty());

    let dashboard = app.call("dashboard:summary", Value::Null);
    assert_eq!(dashboard["receivableMinor"].as_i64(), Some(23600), "dashboard: {dashboard}");
    assert_eq!(dashboard["voucherCount"].as_i64(), Some(2));
    assert_eq!(dashboard["partyCount"].as_i64(), Some(1));
    assert_eq!(dashboard["itemCount"].as_i64(), Some(1));
    assert_eq!(rows(&dashboard["ageing"]).len(), 5);

    let party_summary = app.call("parties:summary", Value::Null);
    assert_eq!(party_summary["customerCount"].as_i64(), Some(1));
    let item_summary = app.call("items:summary", Value::Null);
    assert_eq!(item_summary["itemCount"].as_i64(), Some(1));
    let voucher_summary = app.call(
        "vouchers:summary",
        json!({ "type": "SALES", "from": "2026-04-01", "to": "2027-03-31" }),
    );
    assert_eq!(voucher_summary["count"].as_i64(), Some(1));

    let search = app.call("search:query", json!({ "query": "ravi" }));
    assert!(search["total"].as_i64().unwrap_or(0) >= 1, "search: {search}");

    // --- backup and license ---------------------------------------------
    let created = app.call("backup:create", Value::Null);
    assert!(created["name"].as_str().is_some_and(|n| n.ends_with(".db")));
    assert!(created["sizeBytes"].as_i64().unwrap_or(0) > 0);
    let backups = app.call("backup:list", Value::Null);
    assert_eq!(rows(&backups).len(), 1);
    assert!(app.paths.backups.join(created["name"].as_str().unwrap()).exists());

    // No `machine.lock` next to the test binary: the lock reports NO_LOCK.
    let license = app.call("license:status", Value::Null);
    assert!(
        matches!(license["state"].as_str(), Some("ACTIVE") | Some("LOCKED")),
        "license: {license}"
    );

    // --- cancel, then re-login ------------------------------------------
    app.call("vouchers:cancel", json!({ "id": voucher_id, "reason": "Wrong customer" }));
    let cancelled = app.call("vouchers:get", json!({ "id": voucher_id }));
    assert_eq!(cancelled["status"], json!("CANCELLED"));

    assert_eq!(app.call("identity:logout", Value::Null), json!(true));
    assert_eq!(app.call("identity:status", Value::Null), json!("LOGIN_REQUIRED"));
    assert_eq!(app.call("identity:session", Value::Null), Value::Null);

    assert_eq!(
        app.call_err("identity:login", json!({ "email": "asha@acme.test", "password": "wrong" })),
        "UNAUTHENTICATED"
    );
    let back = app.call(
        "identity:login",
        json!({ "email": "asha@acme.test", "password": "correct-horse" }),
    );
    assert_eq!(back["userId"], session["userId"]);
}

#[test]
fn unauthenticated_reads_are_refused() {
    let mut app = Harness::new("auth");
    app.call(
        "identity:setup",
        json!({
            "name": "Solo Books",
            "ownerFullName": "Owner",
            "ownerEmail": "owner@solo.test",
            "ownerPassword": "correct-horse"
        }),
    );
    app.call("identity:logout", Value::Null);

    for channel in [
        "identity:company",
        "identity:staff",
        "parties:list",
        "items:list",
        "accounts:list",
        "units:list",
        "taxRates:list",
        "godowns:list",
        "vouchers:list",
        "reports:trialBalance",
        "reports:stock",
        "dashboard:summary",
        "parties:summary",
        "items:summary",
        "numbering:list",
        "backup:list",
    ] {
        assert_eq!(app.call_err(channel, json!({})), "UNAUTHENTICATED", "{channel}");
    }

    // A ranged read needs a valid range before its permission gate runs, so it
    // gets a real payload rather than the empty one used above.
    assert_eq!(
        app.call_err(
            "reports:stock-flow",
            json!({ "from": "2026-04-01", "to": "2027-03-31" })
        ),
        "UNAUTHENTICATED"
    );
}

#[test]
fn item_price_tax_flow() {
    let mut app = Harness::new("price-tax");

    app.call(
        "identity:setup",
        json!({
            "name": "Price Tax Traders",
            "ownerFullName": "Owner",
            "ownerEmail": "owner@price-tax.test",
            "ownerPassword": "correct-horse",
            "stateCode": "27",
            "booksBeginDate": "2026-04-01"
        }),
    );

    let units = app.call("units:list", json!({}));
    let nos_id = units
        .as_array()
        .unwrap()
        .iter()
        .find(|unit| unit["symbol"] == json!("nos"))
        .and_then(|unit| unit["id"].as_i64())
        .expect("Nos unit");

    let party = app.call(
        "parties:create",
        json!({
            "name": "Rice Buyer and Seller",
            "stateCode": "27",
            "isCustomer": true,
            "isSupplier": true,
            "creditDays": 0
        }),
    );
    let party_id = party["id"].as_i64().expect("party id");

    // Create carries both flags and the cess rate through the repository.
    let item = app.call(
        "items:create",
        json!({
            "name": "Basmati Rice 1kg",
            "hsnSac": "1006",
            "uomId": nos_id,
            "gstRateBps": 1800,
            "cessRateBps": 0,
            "isService": false,
            "salePriceMinor": 250_000,
            "purchasePriceMinor": 175_000,
            "salePriceIncludesTax": true,
            "purchasePriceIncludesTax": false,
            "openingQtyE4": 0,
            "openingRateMinor": 0
        }),
    );
    let item_id = item["id"].as_i64().expect("item id");
    assert_eq!(item["salePriceIncludesTax"], json!(true), "item: {item}");
    assert_eq!(item["purchasePriceIncludesTax"], json!(false), "item: {item}");
    assert_eq!(item["cessRateBps"], json!(0));

    let updated = app.call(
        "items:update",
        json!({
            "id": item_id,
            "salePriceIncludesTax": false,
            "purchasePriceIncludesTax": true,
            "cessRateBps": 1200
        }),
    );
    assert_eq!(updated["salePriceIncludesTax"], json!(false), "updated: {updated}");
    assert_eq!(updated["purchasePriceIncludesTax"], json!(true), "updated: {updated}");
    assert_eq!(updated["cessRateBps"], json!(1200));

    // Only 0/1 is a stored flag; the renderer sends booleans, scripts may send
    // the integer form, and anything else is rejected at the boundary.
    assert_eq!(
        app.call_err(
            "items:update",
            json!({ "id": item_id, "salePriceIncludesTax": 2 })
        ),
        "VALIDATION_ERROR"
    );

    // Put the item back to the customer-facing defaults for the posting checks.
    app.call(
        "items:update",
        json!({
            "id": item_id,
            "salePriceIncludesTax": true,
            "purchasePriceIncludesTax": false,
            "cessRateBps": 0
        }),
    );

    // A sales line at 2500 inclusive splits into 2118.64 + 381.36.
    let sale = app.call(
        "vouchers:post",
        json!({
            "requestId": "price-tax-sale-0001",
            "type": "SALES",
            "date": "2026-04-10",
            "partyId": party_id,
            "placeOfSupplyStateCode": "27",
            "lines": [{
                "itemId": item_id,
                "description": "Basmati Rice 1kg",
                "qtyE4": 10_000,
                "rateMinor": 250_000,
                "rateIncludesTax": true,
                "discountBps": 0,
                "gstRateBps": 1800
            }]
        }),
    );
    let sale_id = sale["id"].as_i64().expect("sale id");
    let sale_detail = app.call("vouchers:get", json!({ "id": sale_id }));
    assert_eq!(sale_detail["taxableMinor"].as_i64(), Some(211_864), "{sale_detail}");
    assert_eq!(sale_detail["cgstMinor"].as_i64(), Some(19_068), "{sale_detail}");
    assert_eq!(sale_detail["sgstMinor"].as_i64(), Some(19_068), "{sale_detail}");
    assert_eq!(sale_detail["totalMinor"].as_i64(), Some(250_000), "{sale_detail}");

    // A purchase line at 1750 exclusive posts 1750 + 315 input tax, landing at
    // 2065 for the customer-facing preview.
    let purchase = app.call(
        "vouchers:post",
        json!({
            "requestId": "price-tax-purchase-0001",
            "type": "PURCHASE",
            "date": "2026-04-11",
            "partyId": party_id,
            "placeOfSupplyStateCode": "27",
            "supplierBillMissing": true,
            "lines": [{
                "itemId": item_id,
                "description": "Basmati Rice 1kg",
                "qtyE4": 10_000,
                "rateMinor": 175_000,
                "rateIncludesTax": false,
                "discountBps": 0,
                "gstRateBps": 1800
            }]
        }),
    );
    let purchase_id = purchase["id"].as_i64().expect("purchase id");
    let purchase_detail = app.call("vouchers:get", json!({ "id": purchase_id }));
    assert_eq!(purchase_detail["taxableMinor"].as_i64(), Some(175_000), "{purchase_detail}");
    assert_eq!(purchase_detail["cgstMinor"].as_i64(), Some(15_750), "{purchase_detail}");
    assert_eq!(purchase_detail["sgstMinor"].as_i64(), Some(15_750), "{purchase_detail}");
    assert_eq!(purchase_detail["totalMinor"].as_i64(), Some(206_500), "{purchase_detail}");
}

#[test]
fn stock_flow_report_returns_every_item_in_range() {
    let mut app = Harness::new("stock-flow");

    app.call(
        "identity:setup",
        json!({
            "name": "Stock Flow Traders",
            "ownerFullName": "Owner",
            "ownerEmail": "owner@stock-flow.test",
            "ownerPassword": "correct-horse",
            "stateCode": "27",
            "booksBeginDate": "2026-04-01"
        }),
    );

    let units = app.call("units:list", json!({}));
    let nos_id = units
        .as_array()
        .unwrap()
        .iter()
        .find(|unit| unit["symbol"] == json!("nos"))
        .and_then(|unit| unit["id"].as_i64())
        .expect("Nos unit");

    let party = app.call(
        "parties:create",
        json!({
            "name": "Flow Buyer",
            "stateCode": "27",
            "isCustomer": true,
            "isSupplier": true,
            "creditDays": 0
        }),
    );
    let party_id = party["id"].as_i64().expect("party id");

    let item_a = app.call(
        "items:create",
        json!({
            "name": "Flow Item A",
            "hsnSac": "1006",
            "uomId": nos_id,
            "gstRateBps": 1800,
            "isService": false,
            "salePriceMinor": 10_000,
            "purchasePriceMinor": 8_000,
            "salePriceIncludesTax": true,
            "purchasePriceIncludesTax": false
        }),
    );
    let item_a_id = item_a["id"].as_i64().expect("item A id");
    let item_b = app.call(
        "items:create",
        json!({
            "name": "Flow Item B",
            "hsnSac": "1006",
            "uomId": nos_id,
            "gstRateBps": 1800,
            "isService": false,
            "salePriceMinor": 20_000,
            "purchasePriceMinor": 16_000,
            "salePriceIncludesTax": true,
            "purchasePriceIncludesTax": false
        }),
    );
    let item_b_id = item_b["id"].as_i64().expect("item B id");

    let line = |item_id: i64, description: &str, qty: i64, rate: i64| {
        json!({
            "itemId": item_id,
            "description": description,
            "qtyE4": qty,
            "rateMinor": rate,
            "rateIncludesTax": false,
            "discountBps": 0,
            "gstRateBps": 1800
        })
    };

    app.call(
        "vouchers:post",
        json!({
            "requestId": "stock-flow-purchase-0001",
            "type": "PURCHASE",
            "date": "2026-04-10",
            "partyId": party_id,
            "placeOfSupplyStateCode": "27",
            "supplierBillMissing": true,
            "lines": [
                line(item_a_id, "Flow Item A", 100_000, 8_000),
                line(item_b_id, "Flow Item B", 50_000, 16_000)
            ]
        }),
    );

    app.call(
        "vouchers:post",
        json!({
            "requestId": "stock-flow-sale-0001",
            "type": "SALES",
            "date": "2026-05-10",
            "partyId": party_id,
            "placeOfSupplyStateCode": "27",
            "lines": [line(item_a_id, "Flow Item A", 20_000, 10_000)]
        }),
    );

    let full = app.call(
        "reports:stock-flow",
        json!({ "from": "2026-04-01", "to": "2026-06-30" }),
    );
    assert_eq!(rows(&full).len(), 3, "two purchases and one sale: {full}");
    assert!(full
        .as_array()
        .unwrap()
        .iter()
        .any(|row| row["itemId"].as_i64() == Some(item_b_id)));
    let sale_row = full
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["qtyOutE4"].as_i64() == Some(20_000))
        .expect("sale row");
    assert_eq!(sale_row["itemId"].as_i64(), Some(item_a_id));
    assert_eq!(sale_row["date"], json!("2026-05-10"));

    let narrowed = app.call(
        "reports:stock-flow",
        json!({ "from": "2026-05-01", "to": "2026-06-30" }),
    );
    assert_eq!(rows(&narrowed).len(), 1, "only the May sale: {narrowed}");
    assert_eq!(narrowed[0]["itemId"].as_i64(), Some(item_a_id));

    let empty = app.call(
        "reports:stock-flow",
        json!({ "from": "2026-01-01", "to": "2026-03-31" }),
    );
    assert!(rows(&empty).is_empty(), "outside the range: {empty}");
}

#[test]
fn supplier_bill_numbering_flow() {
    let mut app = Harness::new("supplier-bill");

    app.call(
        "identity:setup",
        json!({
            "name": "Supplier Bill Traders",
            "ownerFullName": "Owner",
            "ownerEmail": "owner@supplier-bill.test",
            "ownerPassword": "correct-horse",
            "stateCode": "27",
            "booksBeginDate": "2026-04-01"
        }),
    );

    let units = app.call("units:list", json!({}));
    let nos_id = units
        .as_array()
        .unwrap()
        .iter()
        .find(|unit| unit["symbol"] == json!("nos"))
        .and_then(|unit| unit["id"].as_i64())
        .expect("Nos unit");

    let supplier_a = app.call(
        "parties:create",
        json!({
            "name": "Supplier A",
            "stateCode": "27",
            "isSupplier": true,
            "creditDays": 0
        }),
    )["id"]
        .as_i64()
        .expect("supplier A id");
    let supplier_b = app.call(
        "parties:create",
        json!({
            "name": "Supplier B",
            "stateCode": "27",
            "isSupplier": true,
            "creditDays": 0
        }),
    )["id"]
        .as_i64()
        .expect("supplier B id");

    let item = app.call(
        "items:create",
        json!({
            "name": "Packing Tape",
            "hsnSac": "3919",
            "uomId": nos_id,
            "gstRateBps": 1800,
            "cessRateBps": 0,
            "isService": false,
            "salePriceMinor": 10_000,
            "purchasePriceMinor": 8_000,
            "salePriceIncludesTax": true,
            "purchasePriceIncludesTax": false,
            "openingQtyE4": 0,
            "openingRateMinor": 0
        }),
    );
    let item_id = item["id"].as_i64().expect("item id");

    let line = json!({
        "itemId": item_id,
        "description": "Packing Tape",
        "qtyE4": 10_000,
        "rateMinor": 8_000,
        "rateIncludesTax": false,
        "discountBps": 0,
        "gstRateBps": 1800
    });

    // The number is stored exactly as typed, trimmed at the ends only.
    let first = app.call(
        "vouchers:post",
        json!({
            "requestId": "supplier-bill-post-0001",
            "type": "PURCHASE",
            "date": "2026-04-10",
            "partyId": supplier_a,
            "placeOfSupplyStateCode": "27",
            "supplierBillNo": "  TC/2026-27/583  ",
            "lines": [line.clone()]
        }),
    );
    let first_id = first["id"].as_i64().expect("first purchase id");
    assert_eq!(first["number"], json!("TC/2026-27/583"), "first: {first}");

    let detail = app.call("vouchers:get", json!({ "id": first_id }));
    assert_eq!(detail["number"], json!("TC/2026-27/583"), "detail: {detail}");
    assert_eq!(detail["numberSource"], json!("SUPPLIER"), "detail: {detail}");

    // Series is scoped per supplier so the table-level unique constraint
    // enforces (company, supplier, fy, number), and the normalized form is kept
    // only for duplicate detection.
    let (series, normalized): (String, String) = app
        .inner
        .conn
        .query_row(
            "SELECT series, number_normalized FROM vouchers WHERE id = ?1",
            [first_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("stored supplier bill columns");
    assert_eq!(series, format!("SUP{supplier_a}"));
    assert_eq!(normalized, "TC202627583");

    // A differently spaced and punctuated form is the same bill.
    let duplicate = app.call_error(
        "vouchers:post",
        json!({
            "requestId": "supplier-bill-post-0002",
            "type": "PURCHASE",
            "date": "2026-05-01",
            "partyId": supplier_a,
            "placeOfSupplyStateCode": "27",
            "supplierBillNo": "tc 2026-27.583",
            "lines": [line.clone()]
        }),
    );
    assert_eq!(duplicate.code, "DUPLICATE_SUPPLIER_BILL", "duplicate: {duplicate:?}");
    assert!(duplicate.message.contains("TC/2026-27/583"), "{}", duplicate.message);
    assert!(duplicate.message.contains("2026-04-10"), "{}", duplicate.message);

    // The same number belongs to a different supplier's series.
    let other = app.call(
        "vouchers:post",
        json!({
            "requestId": "supplier-bill-post-0003",
            "type": "PURCHASE",
            "date": "2026-04-10",
            "partyId": supplier_b,
            "placeOfSupplyStateCode": "27",
            "supplierBillNo": "TC/2026-27/583",
            "lines": [line.clone()]
        }),
    );
    assert_eq!(other["number"], json!("TC/2026-27/583"), "other: {other}");

    // A supplier may reuse the number in a later financial year.
    let later = app.call(
        "vouchers:post",
        json!({
            "requestId": "supplier-bill-post-0004",
            "type": "PURCHASE",
            "date": "2027-04-05",
            "partyId": supplier_a,
            "placeOfSupplyStateCode": "27",
            "supplierBillNo": "TC/2026-27/583",
            "lines": [line.clone()]
        }),
    );
    let later_id = later["id"].as_i64().expect("later purchase id");
    let later_detail = app.call("vouchers:get", json!({ "id": later_id }));
    assert_eq!(later_detail["numberSource"], json!("SUPPLIER"), "{later_detail}");

    // The print read model carries the same identity decision.
    let invoice = app.call("vouchers:invoice", json!({ "id": first_id }));
    assert_eq!(invoice["number"], json!("TC/2026-27/583"), "invoice: {invoice}");
    assert_eq!(invoice["numberSource"], json!("SUPPLIER"), "invoice: {invoice}");

    let listed = app.call("vouchers:list", json!({ "type": "PURCHASE" }));
    assert!(
        rows(&listed).iter().all(|row| row["numberSource"].is_string()),
        "list rows carry numberSource: {listed}"
    );

    // Cancelling frees the live series slot and the number can be re-entered.
    app.call(
        "vouchers:cancel",
        json!({ "id": first_id, "reason": "Entered twice" }),
    );
    let cancelled = app.call("vouchers:get", json!({ "id": first_id }));
    assert_eq!(cancelled["status"], json!("CANCELLED"), "{cancelled}");
    let cancelled_series: String = app
        .inner
        .conn
        .query_row(
            "SELECT series FROM vouchers WHERE id = ?1",
            [first_id],
            |row| row.get(0),
        )
        .expect("cancelled series");
    assert_eq!(cancelled_series, format!("SUP{supplier_a}/C{first_id}"));

    let reentered = app.call(
        "vouchers:post",
        json!({
            "requestId": "supplier-bill-post-0005",
            "type": "PURCHASE",
            "date": "2026-04-10",
            "partyId": supplier_a,
            "placeOfSupplyStateCode": "27",
            "supplierBillNo": "TC/2026-27/583",
            "lines": [line.clone()]
        }),
    );
    assert_eq!(reentered["number"], json!("TC/2026-27/583"), "reentered: {reentered}");

    // A declared no-supplier-bill purchase takes the internal PUR sequence.
    let no_bill = app.call(
        "vouchers:post",
        json!({
            "requestId": "supplier-bill-post-0006",
            "type": "PURCHASE",
            "date": "2026-04-12",
            "partyId": supplier_a,
            "placeOfSupplyStateCode": "27",
            "supplierBillMissing": true,
            "lines": [line]
        }),
    );
    let no_bill_id = no_bill["id"].as_i64().expect("no-bill purchase id");
    let no_bill_number = no_bill["number"].as_str().expect("no-bill number");
    assert!(no_bill_number.starts_with("PUR/"), "{no_bill_number}");
    let no_bill_detail = app.call("vouchers:get", json!({ "id": no_bill_id }));
    assert_eq!(no_bill_detail["numberSource"], json!("INTERNAL"), "{no_bill_detail}");

    let no_bill_invoice = app.call("vouchers:invoice", json!({ "id": no_bill_id }));
    assert_eq!(no_bill_invoice["numberSource"], json!("INTERNAL"), "{no_bill_invoice}");

    let no_bill_series: String = app
        .inner
        .conn
        .query_row(
            "SELECT series FROM vouchers WHERE id = ?1",
            [no_bill_id],
            |row| row.get(0),
        )
        .expect("no-bill series");
    assert_eq!(no_bill_series, "PUR");
}

#[test]
fn persisted_login_is_restored_after_restart() {
    let root = std::env::temp_dir().join(format!("crown-books-it-remember-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("temp dir");
    let paths = cb::paths::Paths {
        user_data: root.clone(),
        database: root.join("crown-books.db"),
        backups: root.join("backups"),
        logs: root.join("logs"),
    };
    paths.ensure().expect("data dirs");

    {
        let conn = cb::db::open(&paths.database).expect("open");
        cb::db::migrate(&conn).expect("migrate");
        cb::db::seed::seed_permissions(&conn).expect("seed");
        let mut inner = cb::state::Inner { conn, session: None };
        let mut ctx = cb::state::Ctx::new(&mut inner, &paths, None);
        let args = vec![json!({
            "name": "Restart Books",
            "ownerFullName": "Owner",
            "ownerEmail": "owner@restart.test",
            "ownerPassword": "correct-horse"
        })];
        cb::rpc::dispatch(&mut ctx, "identity:setup", &args).expect("setup");
    }

    // Fresh process equivalent: reopen the file and restore the remembered user.
    let conn = cb::db::open(&paths.database).expect("reopen");
    cb::db::migrate(&conn).expect("migrate again");
    let session = cb::identity::app::restore_remembered_login(&conn)
        .expect("restore")
        .expect("a remembered session");
    assert_eq!(session.company_name, "Restart Books");
    assert_eq!(session.role_name, "Owner");

    let _ = std::fs::remove_dir_all(&root);
}

//! End-to-end test of every feature the app ships.
//!
//! One company is set up and then driven through the whole product: access
//! control, every masters screen, voucher numbering, all nine voucher types
//! with GST, discounts, round-off, stock and settlement, every report, the
//! dashboard and page summaries, global search, the XLSX and invoice-PDF
//! builders, backup and the install lock.
//!
//! Arithmetic is asserted exactly, because that is the product: the point of
//! the test is that the ledger, the stock ledger and the reports agree with
//! each other after a realistic month of trading.

mod common;

use common::{account_id, group_id, id, rows, unit_id, Harness};
use crown_books_lib as cb;
use serde_json::{json, Value};

/// A sale is `qty_e4`, `rate_minor` and `gst_rate_bps`, all integers.
fn sales_line(item_id: i64, qty_e4: i64, rate_minor: i64, gst_rate_bps: i64) -> Value {
    json!({
        "itemId": item_id,
        "description": "Widget",
        "hsn": "8471",
        "uom": "nos",
        "qtyE4": qty_e4,
        "rateMinor": rate_minor,
        "discountBps": 0,
        "gstRateBps": gst_rate_bps
    })
}

#[test]
fn every_feature() {
    let mut app = Harness::new("full");

    // =====================================================================
    // 1. Identity and access control
    // =====================================================================
    assert_eq!(app.call("identity:status", Value::Null), json!("SETUP_REQUIRED"));
    assert_eq!(
        app.call(
            "identity:checkCompanyExists",
            json!({ "name": "Acme Traders", "ownerEmail": "asha@acme.test" })
        ),
        json!(false)
    );

    let session = app.setup_company("Acme Traders", "27");
    assert_eq!(session["companyName"], json!("Acme Traders"));
    assert_eq!(session["isSuper"], json!(true));
    assert_eq!(session["permissions"].as_array().map(Vec::len), Some(31));
    let company_id = session["companyId"].as_i64().expect("company id");
    let owner_user_id = session["userId"].as_i64().expect("owner id");

    assert_eq!(app.call("identity:status", Value::Null), json!("AUTHENTICATED"));
    assert_eq!(
        app.call(
            "identity:checkCompanyExists",
            json!({ "name": "Acme Traders", "ownerEmail": "asha@acme.test" })
        ),
        json!(true)
    );

    let company = app.call("identity:company", Value::Null);
    assert_eq!(company["id"].as_i64(), Some(company_id));
    assert_eq!(company["stateCode"], json!("27"));
    assert_eq!(company["currency"], json!("INR"));

    // Company profile edits, including the tax and stock switches.
    let company = app.call(
        "identity:updateCompany",
        json!({
            "name": "Acme Traders",
            "legalName": "Acme Traders Private Limited",
            "pan": "AAPFU0939F",
            "address": "12 Laxmi Road",
            "city": "Pune",
            "pincode": "411002",
            "phone": "02024470000",
            "email": "books@acme.test",
            "invoiceTerms": "Goods once sold are not taken back.",
            "roundOffMode": "INVOICE",
            "costingMethod": "WEIGHTED_AVERAGE",
            "allowNegativeStock": false
        }),
    );
    assert_eq!(company["legalName"], json!("Acme Traders Private Limited"));
    assert_eq!(company["city"], json!("Pune"));
    assert_eq!(company["roundOffMode"], json!("INVOICE"));
    assert_eq!(company["allowNegativeStock"], json!(false));

    // Validation still rejects a malformed GSTIN and PAN.
    assert_eq!(
        app.err("identity:updateCompany", json!({ "gstin": "NOT-A-GSTIN" })),
        "VALIDATION_ERROR"
    );
    assert_eq!(
        app.err("identity:updateCompany", json!({ "pan": "12345" })),
        "VALIDATION_ERROR"
    );

    // Roles: create a limited role, rename it, then delete a throwaway one.
    let permissions = app.call("identity:permissions", Value::Null);
    assert_eq!(rows(&permissions).len(), 31);
    let roles = app.call("identity:roles", Value::Null);
    assert_eq!(rows(&roles).len(), 5);

    let keeper = app.call(
        "identity:roleCreate",
        json!({
            "name": "Store Keeper",
            "description": "Stock and bills only",
            "permissionCodes": ["party.view", "item.view", "voucher.view", "report.view"]
        }),
    );
    let keeper_role_id = id(&keeper);
    assert_eq!(keeper["permissionCodes"].as_array().map(Vec::len), Some(4));
    assert_eq!(keeper["memberCount"], json!(0));

    let keeper = app.call(
        "identity:roleUpdate",
        json!({
            "id": keeper_role_id,
            "name": "Store Keeper",
            "description": "Stock, bills and reports",
            "permissionCodes": ["party.view", "item.view", "voucher.view", "report.view", "report.export"]
        }),
    );
    assert_eq!(keeper["permissionCodes"].as_array().map(Vec::len), Some(5));

    let throwaway = app.call(
        "identity:roleCreate",
        json!({ "name": "Temporary", "permissionCodes": [] }),
    );
    assert_eq!(rows(&app.call("identity:roles", Value::Null)).len(), 7);
    assert_eq!(app.call("identity:roleDelete", json!({ "id": id(&throwaway) })), json!(true));
    assert_eq!(rows(&app.call("identity:roles", Value::Null)).len(), 6);

    // A system role cannot be renamed or deleted.
    let owner_role_id = rows(&app.call("identity:roles", Value::Null))
        .iter()
        .find(|role| role["name"] == json!("Owner"))
        .and_then(|role| role["id"].as_i64())
        .expect("owner role");
    assert_eq!(
        app.err("identity:roleUpdate", json!({ "id": owner_role_id, "name": "Boss" })),
        "VALIDATION_ERROR"
    );
    assert_eq!(app.err("identity:roleDelete", json!({ "id": owner_role_id })), "VALIDATION_ERROR");

    // Staff: create, edit, reset the password, then sign in as that user.
    let staff_member = app.call(
        "identity:createStaff",
        json!({
            "fullName": "Ravi Store",
            "email": "ravi@acme.test",
            "password": "store-keeper-1",
            "roleName": "Store Keeper"
        })
    );
    let staff_user_id = staff_member["userId"].as_i64().expect("staff user id");
    assert_eq!(rows(&app.call("identity:staff", Value::Null)).len(), 2);

    let staff = rows(&app.call("identity:staff", Value::Null))
        .iter()
        .find(|row| row["userId"] == json!(staff_user_id))
        .cloned()
        .expect("staff row");
    let staff_row_id = id(&staff);
    assert_eq!(staff["isSelf"], json!(false));
    assert_eq!(staff["roleName"], json!("Store Keeper"));

    let staff = app.call(
        "identity:updateStaff",
        json!({ "id": staff_row_id, "fullName": "Ravi Kumar" }),
    );
    assert_eq!(staff["fullName"], json!("Ravi Kumar"));

    assert_eq!(
        app.call(
            "identity:resetStaffPassword",
            json!({ "id": staff_row_id, "password": "store-keeper-2" })
        ),
        json!(true)
    );

    // Signing in as the limited user must prune the permission list.
    app.call("identity:logout", Value::Null);
    let limited = app.call(
        "identity:login",
        json!({ "email": "ravi@acme.test", "password": "store-keeper-2" })
    );
    assert_eq!(limited["roleName"], json!("Store Keeper"));
    assert_eq!(limited["permissions"].as_array().map(Vec::len), Some(5));
    assert_eq!(limited["isSuper"], json!(false));

    // The limited role can read but cannot create masters.
    assert_eq!(
        app.err("parties:create", json!({ "name": "Nope", "isCustomer": true })),
        "PERMISSION_DENIED"
    );
    assert_eq!(app.err("identity:roleDelete", json!({ "id": keeper_role_id })), "PERMISSION_DENIED");
    assert!(rows(&app.call("parties:list", json!({}))).is_empty());

    // A non-super user cannot grant themselves more than they hold.
    assert_eq!(
        app.err(
            "identity:roleCreate",
            json!({ "name": "Escalation", "permissionCodes": ["company.manage"] })
        ),
        "PERMISSION_DENIED"
    );

    // Back to the owner for the rest of the run.
    app.call("identity:logout", Value::Null);
    let back = app.call(
        "identity:login",
        json!({ "email": "asha@acme.test", "password": "correct-horse" })
    );
    assert_eq!(back["userId"].as_i64(), Some(owner_user_id));

    // =====================================================================
    // 2. Masters
    // =====================================================================
    let units = app.call("units:list", json!({}));
    assert!(rows(&units).len() >= 8);
    let nos = unit_id(&units, "nos");

    let dozen = app.call("units:create", json!({ "name": "Dozen", "symbol": "dz", "decimals": 0 }));
    let dozen_id = id(&dozen);
    assert_eq!(dozen["isActive"], json!(true));
    let dozen = app.call("units:update", json!({ "id": dozen_id, "symbol": "doz" }));
    assert_eq!(dozen["symbol"], json!("doz"));
    let dozen = app.call("units:deactivate", json!({ "id": dozen_id }));
    assert_eq!(dozen["isActive"], json!(false));
    assert!(!rows(&app.call("units:list", json!({})))
        .iter()
        .any(|row| row["id"] == json!(dozen_id)));
    assert!(rows(&app.call("units:list", json!({ "includeInactive": true })))
        .iter()
        .any(|row| row["id"] == json!(dozen_id)));

    let groups = app.call("accounts:groups", Value::Null);
    assert!(rows(&groups).len() >= 19);
    let indirect_expenses = group_id(&groups, "Indirect Expenses");

    let freight = app.call(
        "accounts:create",
        json!({
            "name": "Freight Outward",
            "groupId": indirect_expenses,
            "type": "EXPENSE",
            "openingBalanceMinor": 25000,
            "openingBalanceSide": "DEBIT"
        }),
    );
    let freight_id = id(&freight);
    // The opening balance is a column on the account; the ledger balance only
    // exists once the opening voucher posts (asserted below).
    assert_eq!(freight["isSystem"], json!(false));
    assert_eq!(freight["isActive"], json!(true));
    assert_eq!(freight["groupName"], json!("Indirect Expenses"));
    assert_eq!(freight["type"], json!("EXPENSE"));

    let accounts = app.call("accounts:list", json!({}));
    let cash = account_id(&accounts, "CASH");
    let bank = account_id(&accounts, "BANK");
    let round_off = account_id(&accounts, "ROUND_OFF");
    let discount_received = account_id(&accounts, "DISCOUNT_RECEIVED");
    assert_eq!(accounts.as_array().map(Vec::len), Some(rows(&accounts).len()));

    assert_eq!(app.call("accounts:deactivate", json!({ "id": freight_id })), Value::Null);
    let retired = rows(&app.call("accounts:list", json!({ "includeInactive": true })))
        .iter()
        .find(|row| row["id"] == json!(freight_id))
        .cloned()
        .expect("retired account");
    assert_eq!(retired["isActive"], json!(false));
    assert!(!rows(&app.call("accounts:list", json!({})))
        .iter()
        .any(|row| row["id"] == json!(freight_id)));

    // Parties: one intra-state customer, one inter-state customer, one supplier.
    let customer = app.call(
        "parties:create",
        json!({
            "name": "Ravi Kirana",
            "phone": "9876543210",
            "email": "ravi@kirana.test",
            "stateCode": "27",
            "billingAddress": "Market Yard, Pune",
            "isCustomer": true,
            "isSupplier": false,
            "creditDays": 15,
            "creditLimitMinor": 500000,
            "openingBalanceMinor": 50000,
            "openingBalanceDate": "2026-04-01"
        }),
    );
    let customer_id = id(&customer);
    assert_eq!(customer["isCustomer"], json!(true));
    assert_eq!(customer["openingBalanceMinor"], json!(50000));
    assert_eq!(customer["balanceMinor"], json!(0), "the ledger balance follows posting");

    let outstation = app.call(
        "parties:create",
        json!({
            "name": "Bengaluru Traders",
            "stateCode": "29",
            "isCustomer": true,
            "creditDays": 15
        }),
    );
    let outstation_id = id(&outstation);

    let supplier = app.call(
        "parties:create",
        json!({
            "name": "Mumbai Wholesale",
            "stateCode": "29",
            "isSupplier": true,
            "creditDays": 30
        }),
    );
    let supplier_id = id(&supplier);
    assert_eq!(supplier["isSupplier"], json!(true));

    let customer = app.call(
        "parties:update",
        json!({ "id": customer_id, "creditLimitMinor": 750000, "notes": "Pays on time" }),
    );
    assert_eq!(customer["creditLimitMinor"], json!(750000));
    assert_eq!(customer["notes"], json!("Pays on time"));

    assert_eq!(rows(&app.call("parties:list", json!({ "query": "ravi" }))).len(), 1);
    assert_eq!(
        rows(&app.call("parties:list", json!({ "role": "SUPPLIER" }))).len(),
        1,
        "only the supplier"
    );
    assert_eq!(rows(&app.call("parties:list", json!({}))).len(), 3);

    let discard = app.call(
        "parties:create",
        json!({ "name": "Delete Me", "isCustomer": true }),
    );
    assert_eq!(app.call("parties:deactivate", json!({ "id": id(&discard) })), Value::Null);
    assert_eq!(rows(&app.call("parties:list", json!({}))).len(), 3);
    assert_eq!(rows(&app.call("parties:list", json!({ "includeInactive": true }))).len(), 4);

    // Items: a traded good with opening stock, a service, and a throwaway.
    let widget = app.call(
        "items:create",
        json!({
            "name": "Widget",
            "sku": "W-1",
            "hsnSac": "8471",
            "uomId": nos,
            "gstRateBps": 1800,
            "isService": false,
            "salePriceMinor": 10000,
            "purchasePriceMinor": 8000,
            "openingQtyE4": 100000,
            "openingRateMinor": 8000,
            "reorderLevelE4": 20000
        }),
    );
    let widget_id = id(&widget);
    assert_eq!(widget["openingQtyE4"], json!(100000));
    assert_eq!(widget["stockQtyE4"], json!(0), "stock only moves when the opening voucher posts");

    let service = app.call(
        "items:create",
        json!({
            "name": "Installation",
            "hsnSac": "9987",
            "gstRateBps": 1800,
            "isService": true,
            "salePriceMinor": 50000
        }),
    );
    let service_id = id(&service);
    assert_eq!(service["isService"], json!(true));

    let discard_item = app.call("items:create", json!({ "name": "Delete Me Item" }));
    assert_eq!(app.call("items:deactivate", json!({ "id": id(&discard_item) })), Value::Null);
    assert_eq!(rows(&app.call("items:list", json!({}))).len(), 2);
    assert_eq!(rows(&app.call("items:list", json!({ "includeInactive": true }))).len(), 3);

    let widget = app.call("items:update", json!({ "id": widget_id, "salePriceMinor": 12000 }));
    assert_eq!(widget["salePriceMinor"], json!(12000));
    assert_eq!(widget["stockQtyE4"], json!(0));
    assert_eq!(rows(&app.call("items:list", json!({ "query": "widget" }))).len(), 1);

    // Tax rates: create a 12% slab, revise it to 18%, retire it.
    let slab = app.call(
        "taxRates:create",
        json!({
            "gstRateBps": 1200,
            "cessRateBps": 0,
            "description": "GST 12%",
            "effectiveFrom": "2026-04-01"
        }),
    );
    let slab_id = id(&slab);
    assert_eq!(slab["isCurrent"], json!(true));

    // 12% closes the day before 28% starts; the old row is never edited.
    let slab = app.call(
        "taxRates:revise",
        json!({
            "id": slab_id,
            "gstRateBps": 2800,
            "cessRateBps": 0,
            "description": "GST 28%",
            "effectiveFrom": "2026-06-01"
        }),
    );
    let revised_id = id(&slab);
    assert_eq!(slab["gstRateBps"], json!(2800));

    // An existing slab cannot be duplicated on the same day.
    assert_eq!(
        app.err(
            "taxRates:create",
            json!({ "gstRateBps": 1800, "cessRateBps": 0, "effectiveFrom": "2026-04-01" })
        ),
        "VALIDATION_ERROR"
    );

    let slab = app.call("taxRates:retire", json!({ "id": revised_id, "effectiveFrom": "2027-01-01" }));
    assert_eq!(slab["effectiveTo"], json!("2026-12-31"));
    let history = rows(&app.call("taxRates:list", json!({ "includeHistory": true }))).len();
    assert_eq!(history, 6, "four seeded slabs plus the closed 12% and the open 28%");
    assert_eq!(rows(&app.call("taxRates:list", json!({}))).len(), 5);

    let godowns = app.call("godowns:list", Value::Null);
    assert_eq!(rows(&godowns).len(), 1);
    let godown_id = godowns[0]["id"].as_i64().expect("godown id");

    // =====================================================================
    // 3. Voucher numbering
    // =====================================================================
    let numbering = app.call("numbering:list", Value::Null);
    assert_eq!(rows(&numbering).len(), 9);
    assert_eq!(
        rows(&numbering)
            .iter()
            .find(|row| row["voucherType"] == json!("SALES"))
            .map(|row| row["nextNumber"].clone()),
        Some(json!("INV/0001"))
    );

    let updated = app.call(
        "numbering:update",
        json!({
            "requestId": "numbering-1",
            "items": [{
                "voucherType": "SALES",
                "series": "SINV",
                "prefix": "SINV/{FY}/",
                "suffix": "",
                "padding": 3,
                "startNumber": 1,
                "resetPeriod": "YEARLY",
                "manualOverride": true
            }]
        }),
    );
    let sales_numbering = rows(&updated)
        .iter()
        .find(|row| row["voucherType"] == json!("SALES"))
        .cloned()
        .expect("sales numbering");
    assert_eq!(sales_numbering["nextNumber"], json!("SINV/2026-27/001"));
    assert_eq!(sales_numbering["series"], json!("SINV"));

    assert_eq!(
        app.err(
            "numbering:update",
            json!({
                "requestId": "numbering-2",
                "items": [{
                    "voucherType": "SALES",
                    "series": "1",
                    "prefix": "",
                    "suffix": "",
                    "padding": 3,
                    "startNumber": 1,
                    "resetPeriod": "YEARLY",
                    "manualOverride": false
                }]
            })
        ),
        "VALIDATION_ERROR"
    );
    assert_eq!(
        app.err(
            "numbering:update",
            json!({
                "requestId": "numbering-3",
                "items": [{
                    "voucherType": "SALES",
                    "series": "SINV",
                    "prefix": "SINV/{WEEK}/",
                    "suffix": "",
                    "padding": 3,
                    "startNumber": 1,
                    "resetPeriod": "YEARLY",
                    "manualOverride": false
                }]
            })
        ),
        "VALIDATION_ERROR"
    );

    // =====================================================================
    // 4. Opening balances
    // =====================================================================
    let opening = app.call("vouchers:postOpening", json!({ "date": "2026-04-01" }));
    assert_eq!(opening["number"], json!("OPN/0001"));
    let opening_id = id(&opening);
    assert_eq!(app.call("vouchers:get", json!({ "id": opening_id }))["status"], json!("POSTED"));

    // The account opening balance, the customer opening balance and the opening
    // stock now exist as ledger rows.
    let accounts_after = app.call("accounts:list", json!({ "includeInactive": true }));
    let freight_after = rows(&accounts_after)
        .iter()
        .find(|row| row["id"] == json!(freight_id))
        .cloned()
        .expect("freight account");
    assert_eq!(freight_after["balanceMinor"], json!(25000));
    let customer_after = app.call("parties:get", json!({ "id": customer_id }));
    assert_eq!(customer_after["balanceMinor"], json!(50000));

    let widget_after_opening = app.call("items:get", json!({ "id": widget_id }));
    assert_eq!(widget_after_opening["stockQtyE4"], json!(100000));

    // Posting opening twice is refused.
    assert_eq!(app.err("vouchers:postOpening", json!({ "date": "2026-04-01" })), "CONFLICT");

    // =====================================================================
    // 5. All nine voucher types
    // =====================================================================

    // 5.1 Sales, intra-state, applying the new series.
    let sales1 = app.call(
        "vouchers:post",
        json!({
            "requestId": "sale-0001",
            "type": "SALES",
            "date": "2026-04-10",
            "dueDate": "2026-04-25",
            "partyId": customer_id,
            "narration": "First sale",
            "lines": [sales_line(widget_id, 20000, 10000, 1800)]
        }),
    );
    assert_eq!(sales1["number"], json!("SINV/2026-27/001"));
    let sales1_id = id(&sales1);

    let detail = app.call("vouchers:get", json!({ "id": sales1_id }));
    assert_eq!(detail["totalMinor"], json!(23600));
    assert_eq!(detail["cgstMinor"], json!(1800));
    assert_eq!(detail["sgstMinor"], json!(1800));
    assert_eq!(detail["igstMinor"], json!(0));
    assert_eq!(detail["roundOffMinor"], json!(0));
    assert_eq!(detail["status"], json!("POSTED"));
    assert_eq!(detail["partyName"], json!("Ravi Kirana"));

    // 5.2 Sales, inter-state, a discount, a manual number and round off.
    let sales2 = app.call(
        "vouchers:post",
        json!({
            "requestId": "sale-0002",
            "type": "SALES",
            "date": "2026-05-05",
            "dueDate": "2026-05-20",
            "partyId": outstation_id,
            "placeOfSupplyStateCode": "29",
            "manualNumber": 7,
            "lines": [{
                "itemId": widget_id,
                "description": "Widget (bulk)",
                "hsn": "8471",
                "uom": "nos",
                "qtyE4": 30000,
                "rateMinor": 30000,
                "discountBps": 1000,
                "gstRateBps": 1800
            }]
        }),
    );
    assert_eq!(sales2["number"], json!("SINV/2026-27/007"));
    let sales2_id = id(&sales2);
    let detail = app.call("vouchers:get", json!({ "id": sales2_id }));
    // 3 x 300.00 = 900.00, less 10% = 810.00, IGST 18% = 145.80, total 955.80,
    // rounded to 956.00.
    assert_eq!(detail["taxableMinor"], json!(81000));
    assert_eq!(detail["igstMinor"], json!(14580));
    assert_eq!(detail["roundOffMinor"], json!(20));
    assert_eq!(detail["totalMinor"], json!(95600));

    // 5.3 Sales of a service: no stock movement, still taxed.
    let sales3 = app.call(
        "vouchers:post",
        json!({
            "requestId": "sale-0003",
            "type": "SALES",
            "date": "2026-07-01",
            "partyId": customer_id,
            "lines": [sales_line(service_id, 10000, 50000, 1800)]
        }),
    );
    assert_eq!(sales3["number"], json!("SINV/2026-27/008"));
    let sales3_id = id(&sales3);
    let detail = app.call("vouchers:get", json!({ "id": sales3_id }));
    assert_eq!(detail["totalMinor"], json!(59000));

    // 5.4 Purchase bill, inter-state, 12% IGST, stock in.
    let purchase = app.call(
        "vouchers:post",
        json!({
            "requestId": "purchase-0001",
            "type": "PURCHASE",
            "date": "2026-06-01",
            "dueDate": "2026-07-01",
            "partyId": supplier_id,
            "referenceNo": "MW/118",
            "supplierBillMissing": true,
            "lines": [{
                "itemId": widget_id,
                "description": "Widget",
                "hsn": "8471",
                "uom": "nos",
                "qtyE4": 100000,
                "rateMinor": 8000,
                "discountBps": 0,
                "gstRateBps": 1200,
                "godownId": godown_id
            }]
        }),
    );
    assert_eq!(purchase["number"], json!("PUR/0001"));
    let purchase_id = id(&purchase);
    let detail = app.call("vouchers:get", json!({ "id": purchase_id }));
    assert_eq!(detail["taxableMinor"], json!(80000));
    assert_eq!(detail["igstMinor"], json!(9600));
    assert_eq!(detail["totalMinor"], json!(89600));

    // 5.5 Receipt against the first sale.
    let receipt = app.call(
        "vouchers:post",
        json!({
            "requestId": "receipt-0001",
            "type": "RECEIPT",
            "date": "2026-06-10",
            "partyId": customer_id,
            "amountMinor": 10000,
            "cashAccountId": cash,
            "narration": "Part payment",
            "allocations": [{ "toVoucherId": sales1_id, "amountMinor": 10000, "type": "AGAINST_REF" }]
        }),
    );
    let receipt_id = id(&receipt);
    assert_eq!(app.call("vouchers:get", json!({ "id": receipt_id }))["totalMinor"], json!(10000));

    // 5.6 Payment against the purchase bill.
    let payment = app.call(
        "vouchers:post",
        json!({
            "requestId": "payment-0001",
            "type": "PAYMENT",
            "date": "2026-06-15",
            "partyId": supplier_id,
            "amountMinor": 40000,
            "cashAccountId": bank,
            "allocations": [{ "toVoucherId": purchase_id, "amountMinor": 40000, "type": "AGAINST_REF" }]
        }),
    );
    let payment_id = id(&payment);
    assert_eq!(app.call("vouchers:get", json!({ "id": payment_id }))["totalMinor"], json!(40000));

    // 5.7 Credit note: one widget comes back, stock and COGS reverse.
    let credit_note = app.call(
        "vouchers:post",
        json!({
            "requestId": "credit-0001",
            "type": "CREDIT_NOTE",
            "date": "2026-06-20",
            "partyId": customer_id,
            "lines": [sales_line(widget_id, 10000, 10000, 1800)]
        }),
    );
    let credit_note_id = id(&credit_note);
    assert_eq!(
        app.call("vouchers:get", json!({ "id": credit_note_id }))["totalMinor"],
        json!(11800)
    );

    // 5.8 Debit note: one widget goes back to the supplier, then cancel it.
    let debit_note = app.call(
        "vouchers:post",
        json!({
            "requestId": "debit-0001",
            "type": "DEBIT_NOTE",
            "date": "2026-06-25",
            "partyId": supplier_id,
            "lines": [sales_line(widget_id, 10000, 8000, 1200)]
        }),
    );
    let debit_note_id = id(&debit_note);
    let detail = app.call("vouchers:get", json!({ "id": debit_note_id }));
    // 80.00 + 9.60 IGST = 89.60, rounded to the nearest rupee: 90.00.
    assert_eq!(detail["taxableMinor"], json!(8000));
    assert_eq!(detail["igstMinor"], json!(960));
    assert_eq!(detail["roundOffMinor"], json!(40));
    assert_eq!(detail["totalMinor"], json!(9000));

    // 5.9 Journal, and contra.
    let journal = app.call(
        "vouchers:post",
        json!({
            "requestId": "journal-0001",
            "type": "JOURNAL",
            "date": "2026-06-30",
            "narration": "Rounding and discounts",
            "journalLines": [
                { "accountId": round_off, "debitMinor": 500, "creditMinor": 0 },
                { "accountId": discount_received, "debitMinor": 0, "creditMinor": 500 }
            ]
        }),
    );
    let journal_id = id(&journal);
    assert_eq!(app.call("vouchers:get", json!({ "id": journal_id }))["totalMinor"], json!(500));

    let contra = app.call(
        "vouchers:post",
        json!({
            "requestId": "contra-0001",
            "type": "CONTRA",
            "date": "2026-06-30",
            "amountMinor": 200000,
            "contraFromAccountId": cash,
            "contraToAccountId": bank,
            "narration": "Cash deposited"
        }),
    );
    let contra_id = id(&contra);
    assert_eq!(app.call("vouchers:get", json!({ "id": contra_id }))["totalMinor"], json!(200000));

    // =====================================================================
    // 6. Ledger, stock and settlement invariants
    // =====================================================================
    let widget_now = app.call("items:get", json!({ "id": widget_id }));
    // 10 opening + 10 purchase + 1 credit note - 2 sales - 3 sales - 1 debit note
    assert_eq!(widget_now["stockQtyE4"], json!(150000), "stock after the month");

    let service_now = app.call("items:get", json!({ "id": service_id }));
    assert_eq!(service_now["stockQtyE4"], json!(0), "a service never holds stock");

    // The trial balance must balance, and the cash and bank accounts must carry
    // the contra and the settled amounts.
    let trial = app.call("reports:trialBalance", Value::Null);
    let debit: i64 = rows(&trial).iter().filter_map(|row| row["debitMinor"].as_i64()).sum();
    let credit: i64 = rows(&trial).iter().filter_map(|row| row["creditMinor"].as_i64()).sum();
    assert_eq!(debit, credit, "trial balance must balance");
    let cash_row = rows(&trial).iter().find(|row| row["id"] == json!(cash)).cloned().expect("cash");
    // Cash received 100.00 from the receipt, paid 2000.00 into the bank.
    assert_eq!(cash_row["debitMinor"].as_i64(), Some(10000), "cash: {cash_row}");
    assert_eq!(cash_row["creditMinor"].as_i64(), Some(200000), "cash: {cash_row}");

    // Settlement: the first sale is partly paid, the second is untouched.
    let open_bills = app.call(
        "vouchers:outstanding",
        json!({ "partyId": customer_id, "asOf": "2026-07-31", "kind": "RECEIVABLE" })
    );
    let bill_ids: Vec<i64> = rows(&open_bills).iter().filter_map(|row| row["id"].as_i64()).collect();
    assert!(bill_ids.contains(&sales1_id));
    assert!(bill_ids.contains(&sales3_id));
    let first_bill = rows(&open_bills)
        .iter()
        .find(|row| row["id"] == json!(sales1_id))
        .cloned()
        .expect("first sale");
    assert_eq!(first_bill["totalMinor"], json!(23600));
    assert_eq!(first_bill["paidMinor"], json!(10000));
    assert_eq!(first_bill["outstandingMinor"], json!(13600));

    // Cancelling a bill that has an allocation is refused until it is reversed.
    assert_eq!(
        app.err("vouchers:cancel", json!({ "id": sales1_id, "reason": "Changed mind" })),
        "CONFLICT"
    );

    // Cancel the debit note: status flips and the stock goes back on the shelf.
    app.call("vouchers:cancel", json!({ "id": debit_note_id, "reason": "Wrong supplier" }));
    assert_eq!(
        app.call("vouchers:get", json!({ "id": debit_note_id }))["status"],
        json!("CANCELLED")
    );
    assert_eq!(
        app.call("items:get", json!({ "id": widget_id }))["stockQtyE4"],
        json!(160000),
        "cancelling the debit note returns the unit"
    );
    assert_eq!(
        app.err("vouchers:cancel", json!({ "id": debit_note_id, "reason": "again" })),
        "CONFLICT"
    );
    assert_eq!(app.err("vouchers:cancel", json!({ "id": debit_note_id, "reason": "x" })), "VALIDATION_ERROR");

    // =====================================================================
    // 7. Lists, filters and the invoice document
    // =====================================================================
    let sales_list = app.call("vouchers:list", json!({ "type": "SALES" }));
    assert_eq!(rows(&sales_list).len(), 3);
    let purchase_list = app.call("vouchers:list", json!({ "type": "PURCHASE" }));
    assert_eq!(rows(&purchase_list).len(), 1);
    let party_list = app.call(
        "vouchers:list",
        json!({ "partyId": customer_id, "from": "2026-04-01", "to": "2026-12-31" })
    );
    assert_eq!(rows(&party_list).len(), 4, "two sales, the credit note and the receipt");
    let queried = app.call("vouchers:list", json!({ "query": "SINV/2026-27/007" }));
    assert_eq!(rows(&queried).len(), 1);
    assert_eq!(queried[0]["id"].as_i64(), Some(sales2_id));
    let paged = app.call("vouchers:list", json!({ "limit": 2, "offset": 0 }));
    assert_eq!(rows(&paged).len(), 2);

    let invoice = app.call("vouchers:invoice", json!({ "id": sales2_id }));
    assert_eq!(invoice["number"], json!("SINV/2026-27/007"));
    assert_eq!(invoice["type"], json!("SALES"));
    assert_eq!(invoice["interState"], json!(true));
    assert_eq!(invoice["placeOfSupplyStateCode"], json!("29"));
    assert_eq!(invoice["totals"]["totalMinor"], json!(95600));
    assert_eq!(invoice["totals"]["igstMinor"], json!(14580));
    assert_eq!(invoice["totals"]["roundOffMinor"], json!(20));
    assert_eq!(invoice["company"]["name"], json!("Acme Traders"));
    assert_eq!(invoice["company"]["gstin"], json!("27AAPFU0939F1ZV"));
    assert_eq!(invoice["party"]["name"], json!("Bengaluru Traders"));
    assert!(invoice["amountInWords"].as_str().is_some_and(|text| !text.is_empty()));
    assert_eq!(rows(&invoice["lines"]).len(), 1);
    assert_eq!(rows(&invoice["taxSlabs"]).len(), 1);

    assert_eq!(
        app.err("vouchers:invoice", json!({ "id": journal_id })),
        "NOT_FOUND",
        "a journal has no printable invoice"
    );

    // =====================================================================
    // 8. Reports
    // =====================================================================
    let pnl = app.call("reports:profitLoss", json!({ "from": "2026-04-01", "to": "2027-03-31" }));
    // Sales 1510.00 + discount received 5.00 - sales returns 100.00 = 1415.00.
    assert_eq!(pnl["totalIncomeMinor"].as_i64(), Some(141500), "pnl: {pnl}");
    assert!(pnl["netProfitMinor"].as_i64().is_some());
    assert!(!rows(&pnl["income"]).is_empty());

    let sheet = app.call("reports:balanceSheet", json!({ "from": "2026-04-01", "to": "2027-03-31" }));
    assert_eq!(sheet["differenceMinor"].as_i64(), Some(0), "balance sheet balances: {sheet}");

    let receivables = app.call(
        "reports:receivables",
        json!({ "asOf": "2026-07-31", "basis": "DUE_DATE" })
    );
    assert_eq!(rows(&receivables).len(), 2, "two customers owe money");
    let payables = app.call("reports:payables", json!({ "asOf": "2026-07-31", "basis": "DUE_DATE" }));
    assert_eq!(rows(&payables).len(), 1);
    assert_eq!(payables[0]["totalMinor"], json!(49600));

    let ageing = app.call("reports:ageing", json!({ "asOf": "2026-07-31", "basis": "DUE_DATE" }));
    assert_eq!(rows(&ageing).len(), 2);
    for row in rows(&ageing) {
        assert_eq!(row["bucketsMinor"].as_array().map(Vec::len), Some(5));
    }

    let statement = app.call(
        "reports:statement",
        json!({ "partyId": customer_id, "from": "2026-04-01", "to": "2027-03-31" })
    );
    assert!(
        rows(&statement).len() >= 5,
        "opening, three sales, credit note, receipt: {}",
        rows(&statement).len()
    );
    let last = rows(&statement).last().expect("last row");
    assert!(last["balanceMinor"].as_i64().is_some());

    let sales_register = app.call(
        "reports:register",
        json!({ "type": "SALES", "from": "2026-04-01", "to": "2027-03-31" })
    );
    assert_eq!(rows(&sales_register).len(), 3);
    let purchase_register = app.call(
        "reports:register",
        json!({ "type": "PURCHASE", "from": "2026-04-01", "to": "2027-03-31" })
    );
    assert_eq!(rows(&purchase_register).len(), 1);

    let stock = app.call("reports:stock", Value::Null);
    let widget_stock = rows(&stock)
        .iter()
        .find(|row| row["id"] == json!(widget_id))
        .cloned()
        .expect("widget in the stock report");
    assert_eq!(widget_stock["qtyE4"], json!(160000));
    assert!(widget_stock["valueMinor"].as_i64().unwrap_or(0) > 0);

    let movements = app.call(
        "reports:stock-movements",
        json!({ "itemId": widget_id, "from": "2026-04-01", "to": "2027-03-31" })
    );
    // Opening, two sales, the purchase and the credit note. The debit note is
    // cancelled (so its movement is gone) and the service sale never held stock.
    assert_eq!(rows(&movements).len(), 5, "movements: {movements}");
    let sale_movement = rows(&movements)
        .iter()
        .find(|row| row["voucherId"] == json!(sales1_id))
        .cloned()
        .expect("sale movement");
    assert_eq!(sale_movement["qtyOutE4"], json!(20000));
    assert_eq!(sale_movement["unitCostMinor"], json!(8000));

    // =====================================================================
    // 9. Dashboard, summaries and search
    // =====================================================================
    let dashboard = app.call("dashboard:summary", Value::Null);
    // Counts are row counts, exactly as the dashboard has always defined them:
    // a deactivated party or item still exists in the books.
    assert_eq!(dashboard["partyCount"], json!(4));
    assert_eq!(dashboard["itemCount"], json!(3));
    assert_eq!(dashboard["receivableMinor"], json!(168200), "13600 + 95600 + 59000");
    assert_eq!(dashboard["payableMinor"], json!(49600));
    assert_eq!(rows(&dashboard["ageing"]).len(), 5);
    assert!(!rows(&dashboard["recentVouchers"]).is_empty());
    assert!(dashboard["setup"]["done"].as_i64().is_some());

    let party_summary = app.call("parties:summary", Value::Null);
    assert_eq!(party_summary["customerCount"], json!(2));
    assert_eq!(party_summary["supplierCount"], json!(1));
    // The party page reads ledger balances: 500.00 opening + 236.00 + 590.00
    // - 118.00 credit note - 100.00 receipt, plus 956.00 from the other customer.
    assert_eq!(party_summary["receivableMinor"], json!(206400));
    // The debit note was cancelled, so only the purchase less the payment counts.
    assert_eq!(party_summary["payableMinor"], json!(49600));
    assert_eq!(rows(&party_summary["ageing"]).len(), 5);

    let item_summary = app.call("items:summary", Value::Null);
    assert_eq!(item_summary["itemCount"], json!(2));
    assert_eq!(item_summary["serviceCount"], json!(1));
    assert!(item_summary["inventoryValueMinor"].as_i64().unwrap_or(0) > 0);

    let voucher_summary = app.call(
        "vouchers:summary",
        json!({ "type": "SALES", "from": "2026-04-01", "to": "2027-03-31" })
    );
    assert_eq!(voucher_summary["count"], json!(3));
    assert_eq!(voucher_summary["totalMinor"], json!(178200), "23600 + 95600 + 59000");
    // One point per month that has vouchers: April, May and July.
    let months: Vec<&str> = rows(&voucher_summary["monthly"])
        .iter()
        .filter_map(|row| row["month"].as_str())
        .collect();
    assert_eq!(months, vec!["2026-04", "2026-05", "2026-07"]);

    let search = app.call("search:query", json!({ "query": "ravi" }));
    assert!(search["total"].as_i64().unwrap_or(0) >= 1);
    assert!(!rows(&search["groups"]).is_empty());

    let search = app.call("search:query", json!({ "query": "widget" }));
    assert!(rows(&search["groups"]).iter().any(|group| group["kind"] == json!("ITEM")));
    assert_eq!(app.err("search:query", json!({ "query": "" })), "VALIDATION_ERROR");

    // =====================================================================
    // 10. Exports: the real file builders
    // =====================================================================
    let workbook = cb::export::xlsx::build(&json!({
        "filename": "sales register",
        "sheetName": "Sales Register",
        "head": ["Date", "Number", "Party", "Amount"],
        "rows": [
            ["2026-04-10", "SINV/2026-27/001", "Ravi Kirana", "236.00"],
            ["2026-05-05", "SINV/2026-27/007", "Bengaluru Traders", "956.00"]
        ],
        "numeric": [3],
        "dateColumns": [0],
        "footer": ["", "", "Total", "1192.00"]
    }))
    .expect("build workbook");
    assert!(workbook.len() > 4000, "workbook bytes: {}", workbook.len());
    assert_eq!(&workbook[..2], b"PK", "an xlsx is a zip");

    let pdf = cb::export::invoice_pdf::build(&invoice).expect("build invoice pdf");
    assert!(pdf.len() > 4000, "pdf bytes: {}", pdf.len());
    assert_eq!(&pdf[..5], b"%PDF-", "a pdf starts with its magic");
    let pdf_name = cb::export::invoice_pdf::default_filename(&invoice);
    assert!(pdf_name.ends_with(".pdf"), "default pdf name: {pdf_name}");

    // Without a window there is no save dialog, and the commands say so
    // instead of panicking or writing somewhere unexpected.
    assert_eq!(
        app.err(
            "export:xlsx",
            json!({ "filename": "x", "sheetName": "x", "head": ["a"], "rows": [["1"]] })
        ),
        "INTERNAL_ERROR"
    );

    // =====================================================================
    // 11. Backup and the install lock
    // =====================================================================
    let backup = app.call("backup:create", Value::Null);
    let backup_name = backup["name"].as_str().expect("backup name").to_string();
    assert!(backup_name.ends_with(".db"));
    assert!(backup["sizeBytes"].as_i64().unwrap_or(0) > 0);
    assert_eq!(backup["copies"][0]["ok"], json!(true));
    assert!(app.paths.backups.join(&backup_name).exists());

    let backups = app.call("backup:list", Value::Null);
    assert_eq!(rows(&backups).len(), 1);
    assert_eq!(backups[0]["name"], json!(backup_name));

    let destinations = app.call("backup:destinations", Value::Null);
    assert!(destinations["primary"].as_str().is_some());
    assert_eq!(rows(&destinations["extras"]).len(), 0);

    let removed = app.call("backup:removeDestination", json!({ "path": "Z:\\nowhere" }));
    assert_eq!(rows(&removed["extras"]).len(), 0);

    assert_eq!(
        app.err("backup:reveal", json!({ "path": "Z:\\definitely-not-here" })),
        "INTERNAL_ERROR"
    );

    // A second backup lands next to the first one.
    let second = app.call("backup:create", Value::Null);
    assert_ne!(second["name"], json!(backup_name));
    assert_eq!(rows(&app.call("backup:list", Value::Null)).len(), 2);

    let license = app.call("license:status", Value::Null);
    assert!(
        matches!(license["state"].as_str(), Some("ACTIVE") | Some("LOCKED")),
        "license: {license}"
    );

    // =====================================================================
    // 12. Error contract
    // =====================================================================
    // Balanced-journal guard.
    assert_eq!(
        app.err(
            "vouchers:post",
            json!({
                "requestId": "journal-bad-1",
                "type": "JOURNAL",
                "date": "2026-07-01",
                "journalLines": [
                    { "accountId": round_off, "debitMinor": 100, "creditMinor": 0 },
                    { "accountId": discount_received, "debitMinor": 0, "creditMinor": 90 }
                ]
            })
        ),
        "VOUCHER_UNBALANCED"
    );

    // A receipt must be from a customer, a payment to a supplier.
    assert_eq!(
        app.err(
            "vouchers:post",
            json!({
                "requestId": "receipt-bad-1",
                "type": "RECEIPT",
                "date": "2026-07-02",
                "partyId": supplier_id,
                "amountMinor": 100
            })
        ),
        "PARTY_NOT_ALLOWED"
    );

    // A sale needs a party and at least one line.
    assert_eq!(
        app.err(
            "vouchers:post",
            json!({ "requestId": "sale-bad-1", "type": "SALES", "date": "2026-07-03", "lines": [] })
        ),
        "PARTY_NOT_ALLOWED"
    );

    // Manual numbers are only honoured where the series allows them.
    assert_eq!(
        app.err(
            "vouchers:post",
            json!({
                "requestId": "purchase-bad-1",
                "type": "PURCHASE",
                "date": "2026-07-04",
                "partyId": supplier_id,
                "manualNumber": 9,
                "supplierBillMissing": true,
                "lines": [sales_line(widget_id, 10000, 8000, 1200)]
            })
        ),
        "VALIDATION_ERROR"
    );

    // An unknown voucher type and an unknown channel both fail loudly.
    assert_eq!(
        app.err(
            "vouchers:post",
            json!({ "requestId": "bad-type-1", "type": "PAYROLL", "date": "2026-07-05" })
        ),
        "VALIDATION_ERROR"
    );
    assert_eq!(app.err("nope:nothing", Value::Null), "INTERNAL_ERROR");

    // Reading before signing in is refused everywhere.
    app.call("identity:logout", Value::Null);
    for channel in [
        "identity:company",
        "parties:list",
        "items:list",
        "vouchers:list",
        "reports:trialBalance",
        "dashboard:summary",
        "search:query",
        "backup:list",
        "numbering:list",
    ] {
        assert_eq!(app.err(channel, json!({})), "UNAUTHENTICATED", "{channel}");
    }
}

/// The ledger must reject a voucher that would not balance, and must not leave
/// anything behind when it does. This is a narrower test on the same engine.
#[test]
fn rejected_vouchers_leave_no_trace() {
    let mut app = Harness::new("rollback");
    app.setup_company("Rollback Books", "27");

    let units = app.call("units:list", json!({}));
    let nos = unit_id(&units, "nos");
    let item = app.call(
        "items:create",
        json!({ "name": "Bolt", "uomId": nos, "gstRateBps": 1800, "salePriceMinor": 1000 })
    );
    let item_id = id(&item);
    let party = app.call(
        "parties:create",
        json!({ "name": "Buyer", "stateCode": "27", "isCustomer": true })
    );
    let party_id = id(&party);

    let before = rows(&app.call("vouchers:list", json!({}))).len();
    assert_eq!(
        app.err(
            "vouchers:post",
            json!({
                "requestId": "unbalanced-1",
                "type": "JOURNAL",
                "date": "2026-05-01",
                "journalLines": [
                    { "accountId": 1, "debitMinor": 1000, "creditMinor": 0 },
                    { "accountId": 2, "debitMinor": 0, "creditMinor": 999 }
                ]
            })
        ),
        "VOUCHER_UNBALANCED"
    );
    assert_eq!(rows(&app.call("vouchers:list", json!({}))).len(), before);
    assert_eq!(
        app.call("items:get", json!({ "id": item_id }))["stockQtyE4"],
        json!(0),
        "no stock moved"
    );

    // A failed post must not consume a voucher number either.
    let numbering = app.call("numbering:list", Value::Null);
    let sales = rows(&numbering)
        .iter()
        .find(|row| row["voucherType"] == json!("SALES"))
        .cloned()
        .expect("sales numbering");
    assert_eq!(sales["nextNumber"], json!("INV/0001"));

    // The same request id can then be used for a valid voucher.
    let posted = app.call(
        "vouchers:post",
        json!({
            "requestId": "unbalanced-1",
            "type": "SALES",
            "date": "2026-05-02",
            "partyId": party_id,
            "lines": [sales_line(item_id, 10000, 1000, 1800)]
        })
    );
    assert_eq!(posted["number"], json!("INV/0001"));
}

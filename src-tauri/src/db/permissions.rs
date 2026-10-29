//! The canonical permission catalog, mirroring `src/main/db/permissions.ts`.

pub mod codes {
    pub const COMPANY_VIEW: &str = "company.view";
    pub const COMPANY_MANAGE: &str = "company.manage";

    pub const USER_VIEW: &str = "user.view";
    pub const USER_CREATE: &str = "user.create";
    pub const USER_MANAGE: &str = "user.manage";
    pub const ROLE_VIEW: &str = "role.view";
    pub const ROLE_MANAGE: &str = "role.manage";

    pub const PARTY_VIEW: &str = "party.view";
    pub const PARTY_CREATE: &str = "party.create";
    pub const PARTY_EDIT: &str = "party.edit";
    pub const PARTY_DEACTIVATE: &str = "party.deactivate";

    pub const ITEM_VIEW: &str = "item.view";
    pub const ITEM_CREATE: &str = "item.create";
    pub const ITEM_EDIT: &str = "item.edit";
    pub const ITEM_DEACTIVATE: &str = "item.deactivate";

    pub const VOUCHER_VIEW: &str = "voucher.view";
    pub const VOUCHER_CREATE: &str = "voucher.create";
    pub const VOUCHER_POST: &str = "voucher.post";
    pub const VOUCHER_CANCEL: &str = "voucher.cancel";

    pub const RECEIPT_VIEW: &str = "receipt.view";
    pub const RECEIPT_RECORD: &str = "receipt.record";
    pub const PAYMENT_VIEW: &str = "payment.view";
    pub const PAYMENT_RECORD: &str = "payment.record";
    pub const NOTE_VIEW: &str = "note.view";
    pub const NOTE_CREATE: &str = "note.create";
    pub const JOURNAL_VIEW: &str = "journal.view";
    pub const JOURNAL_CREATE: &str = "journal.create";

    pub const REPORT_VIEW: &str = "report.view";
    pub const REPORT_EXPORT: &str = "report.export";

    pub const BACKUP_MANAGE: &str = "backup.manage";
    pub const SETTINGS_MANAGE: &str = "settings.manage";
}

/// Every code the command layer checks. New permissions are added here AND
/// seeded into the database.
pub const ALL_PERMISSION_CODES: &[&str] = &[
    codes::COMPANY_VIEW,
    codes::COMPANY_MANAGE,
    codes::USER_VIEW,
    codes::USER_CREATE,
    codes::USER_MANAGE,
    codes::ROLE_VIEW,
    codes::ROLE_MANAGE,
    codes::PARTY_VIEW,
    codes::PARTY_CREATE,
    codes::PARTY_EDIT,
    codes::PARTY_DEACTIVATE,
    codes::ITEM_VIEW,
    codes::ITEM_CREATE,
    codes::ITEM_EDIT,
    codes::ITEM_DEACTIVATE,
    codes::VOUCHER_VIEW,
    codes::VOUCHER_CREATE,
    codes::VOUCHER_POST,
    codes::VOUCHER_CANCEL,
    codes::RECEIPT_VIEW,
    codes::RECEIPT_RECORD,
    codes::PAYMENT_VIEW,
    codes::PAYMENT_RECORD,
    codes::NOTE_VIEW,
    codes::NOTE_CREATE,
    codes::JOURNAL_VIEW,
    codes::JOURNAL_CREATE,
    codes::REPORT_VIEW,
    codes::REPORT_EXPORT,
    codes::BACKUP_MANAGE,
    codes::SETTINGS_MANAGE,
];

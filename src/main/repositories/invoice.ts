import { and, eq } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import { accounts, companies, parties, voucherItemLines, vouchers } from '../db/schema'
import { buildTaxSlabs } from '../../shared/invoice'
import type { InvoiceDocument, InvoiceLine } from '../../shared/contracts/invoice'

/**
 * One read for the printable invoice. It joins the company block and the party
 * snapshot the voucher needs, and keeps the per-line CGST, SGST and IGST that
 * `VoucherDetail` collapses into a single tax number.
 */
export const invoiceRepo = {
  findForPrint(companyId: number, id: number): InvoiceDocument | null {
    const db = getDrizzle()

    const header = db
      .select()
      .from(vouchers)
      .where(and(eq(vouchers.company_id, companyId), eq(vouchers.id, id)))
      .get()
    if (!header) return null
    if (header.voucher_type !== 'SALES' && header.voucher_type !== 'PURCHASE') return null

    const company = db
      .select({
        name: companies.name,
        legalName: companies.legal_name,
        gstin: companies.gstin,
        pan: companies.pan,
        stateCode: companies.state_code,
        address: companies.address,
        city: companies.city,
        pincode: companies.pincode,
        phone: companies.phone,
        email: companies.email,
        currency: companies.currency,
        invoiceTerms: companies.invoice_terms
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .get()
    if (!company) return null

    const party = header.party_id
      ? db.select().from(parties).where(eq(parties.id, header.party_id)).get()
      : null

    const lineRows = db
      .select()
      .from(voucherItemLines)
      .where(eq(voucherItemLines.voucher_id, id))
      .orderBy(voucherItemLines.sort_order)
      .all()

    const bank = header.bank_account_id
      ? db
          .select({ name: accounts.name, code: accounts.code })
          .from(accounts)
          .where(eq(accounts.id, header.bank_account_id))
          .get()
      : null

    const lines: InvoiceLine[] = lineRows.map((line) => ({
      id: line.id,
      description: line.description_snapshot,
      hsn: line.hsn_snapshot,
      uom: line.uom_snapshot,
      qtyE4: line.qty_e4,
      rateMinor: line.entered_rate_minor,
      discountBps: line.discount_bps,
      gstRateBps: line.gst_rate_bps,
      taxableMinor: line.taxable_value_minor,
      cgstMinor: line.cgst_minor,
      sgstMinor: line.sgst_minor,
      igstMinor: line.igst_minor,
      cessMinor: line.cess_minor,
      totalMinor: line.line_total_minor
    }))

    return {
      id: header.id,
      type: header.voucher_type as InvoiceDocument['type'],
      number: header.number,
      date: header.voucher_date,
      dueDate: header.due_date,
      referenceNo: header.reference_no,
      narration: header.narration,
      placeOfSupplyStateCode:
        header.place_of_supply_state_code ?? party?.state_code ?? company.stateCode,
      status: header.status === 'CANCELLED' ? 'CANCELLED' : 'POSTED',
      company,
      party: party
        ? {
            id: party.id,
            name: party.name,
            gstin: party.gstin,
            pan: party.pan,
            stateCode: party.state_code,
            billingAddress: party.billing_address,
            shippingAddress: party.shipping_address,
            phone: party.phone,
            email: party.email
          }
        : null,
      lines,
      taxSlabs: buildTaxSlabs(lines),
      bank: bank ?? null,
      totals: {
        taxableMinor: header.taxable_minor,
        cgstMinor: header.cgst_minor,
        sgstMinor: header.sgst_minor,
        igstMinor: header.igst_minor,
        cessMinor: header.cess_minor,
        discountMinor: header.discount_minor,
        roundOffMinor: header.round_off_minor,
        totalMinor: header.total_minor,
        totalQtyE4: header.total_qty_e4
      }
    }
  }
}

import { amountInWords } from '../../../../../shared/amount-in-words'
import type { InvoiceCopyCaption, InvoiceDocument } from '../../../../../shared/contracts/invoice'
import {
  formatInvoiceAmount,
  formatInvoiceDate,
  formatInvoicePercent,
  formatInvoiceQty,
  invoiceDocumentTitle,
  invoiceNumberLabel,
  invoicePartyLabel,
  invoiceTermLines,
  isInterStateInvoice
} from '../../../../../shared/invoice'
import { stateLabel } from '../../../../../shared/indian-states'
import '../invoice-print.css'

interface InvoiceSheetProps {
  document: InvoiceDocument
  caption: InvoiceCopyCaption
  page: number
  pages: number
}

function stateText(code: string | null | undefined): string {
  return stateLabel(code) ?? '—'
}

function amountOrDash(value: number): string {
  return value === 0 ? '—' : formatInvoiceAmount(value)
}

function addressText(...parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '')
    .join(', ')
}

/**
 * One printed copy of a sales invoice or purchase bill, sized to a single A4
 * sheet. The page renders this twice with the two GST Rule 48(1) captions.
 */
export function InvoiceSheet({
  document,
  caption,
  page,
  pages
}: InvoiceSheetProps): React.JSX.Element {
  const { company, party, totals } = document
  const interState = isInterStateInvoice(document)
  const terms = invoiceTermLines(company.invoiceTerms)
  const cancelled = document.status === 'CANCELLED'

  const shipTo =
    document.type === 'SALES'
      ? {
          name: party?.name ?? null,
          address: party?.shippingAddress || party?.billingAddress || null,
          gstin: party?.gstin ?? null,
          stateCode: party?.stateCode ?? null
        }
      : {
          name: company.name,
          address: company.address,
          gstin: company.gstin,
          stateCode: company.stateCode
        }

  return (
    <article className="invoice-sheet" data-copy={caption}>
      {cancelled ? (
        <p className="invoice-watermark" aria-hidden="true">
          CANCELLED
        </p>
      ) : null}

      <header className="invoice-head">
        <div className="invoice-company">
          <div className="invoice-brand">
            {company.logo ? (
              <img className="invoice-logo" src={company.logo} alt="" decoding="async" />
            ) : null}
            <div className="invoice-brand-text">
              <p className="invoice-company-name">{company.name}</p>
              {company.legalName && company.legalName !== company.name ? (
                <p className="invoice-company-legal">{company.legalName}</p>
              ) : null}
            </div>
          </div>
          {company.address ? <p className="invoice-address">{company.address}</p> : null}
          <p>{addressText(company.city, company.pincode)}</p>
          <p className="invoice-company-ids">
            {company.gstin ? <span>GSTIN {company.gstin}</span> : null}
            {company.pan ? <span>PAN {company.pan}</span> : null}
            <span>State {stateText(company.stateCode)}</span>
          </p>
          <p className="invoice-company-contact">
            {company.phone ? <span>{company.phone}</span> : null}
            {company.email ? <span>{company.email}</span> : null}
          </p>
        </div>

        <div className="invoice-head-title">
          <p className="invoice-title">{invoiceDocumentTitle(document.type)}</p>
          <p className="invoice-caption">{caption}</p>
        </div>
      </header>

      <dl className="invoice-meta">
        <div>
          <dt>{invoiceNumberLabel(document.type)}</dt>
          <dd className="invoice-mono">{document.number}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd className="invoice-mono">{formatInvoiceDate(document.date)}</dd>
        </div>
        <div>
          <dt>Due Date</dt>
          <dd className="invoice-mono">{formatInvoiceDate(document.dueDate) || '—'}</dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd>{document.referenceNo ?? '—'}</dd>
        </div>
        <div>
          <dt>Place of Supply</dt>
          <dd>{stateText(document.placeOfSupplyStateCode)}</dd>
        </div>
      </dl>

      <section className="invoice-parties" aria-label="Parties">
        <div className="invoice-party">
          <p className="invoice-block-label">{invoicePartyLabel(document.type)}</p>
          <p className="invoice-party-name">{party?.name ?? 'Cash sale'}</p>
          {party?.billingAddress ? <p className="invoice-address">{party.billingAddress}</p> : null}
          <p className="invoice-party-ids">
            {party?.gstin ? <span>GSTIN {party.gstin}</span> : <span>Unregistered</span>}
            {party?.stateCode ? <span>State {stateText(party.stateCode)}</span> : null}
          </p>
          {party?.phone || party?.email ? (
            <p className="invoice-party-contact">
              {[party?.phone, party?.email].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>

        <div className="invoice-party">
          <p className="invoice-block-label">Ship To</p>
          <p className="invoice-party-name">{shipTo.name ?? '—'}</p>
          {shipTo.address ? <p className="invoice-address">{shipTo.address}</p> : null}
          <p className="invoice-party-ids">
            {shipTo.gstin ? <span>GSTIN {shipTo.gstin}</span> : <span>Unregistered</span>}
            {shipTo.stateCode ? <span>State {stateText(shipTo.stateCode)}</span> : null}
          </p>
        </div>
      </section>

      <table className={interState ? 'invoice-lines is-interstate' : 'invoice-lines'}>
        <colgroup>
          <col className="col-sno" />
          <col className="col-description" />
          <col className="col-hsn" />
          <col className="col-qty" />
          <col className="col-rate" />
          <col className="col-discount" />
          <col className="col-taxable" />
          <col className="col-gst" />
          {interState ? (
            <col className="col-tax" />
          ) : (
            <>
              <col className="col-tax" />
              <col className="col-tax" />
            </>
          )}
          <col className="col-amount" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="is-left">
              S.No
            </th>
            <th scope="col" className="is-left">
              Description
            </th>
            <th scope="col">HSN/SAC</th>
            <th scope="col">Qty</th>
            <th scope="col">Rate</th>
            <th scope="col">Disc %</th>
            <th scope="col">Taxable</th>
            <th scope="col">GST %</th>
            {interState ? (
              <th scope="col">IGST</th>
            ) : (
              <>
                <th scope="col">CGST</th>
                <th scope="col">SGST</th>
              </>
            )}
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {document.lines.map((line, index) => (
            <tr key={line.id}>
              <td className="is-left invoice-mono">{index + 1}</td>
              <td className="is-left">{line.description}</td>
              <td className="invoice-mono">{line.hsn ?? '—'}</td>
              <td className="invoice-mono">
                {formatInvoiceQty(line.qtyE4)}
                {line.uom ? ` ${line.uom}` : ''}
              </td>
              <td className="invoice-mono">{formatInvoiceAmount(line.rateMinor)}</td>
              <td className="invoice-mono">{formatInvoicePercent(line.discountBps)}</td>
              <td className="invoice-mono">{formatInvoiceAmount(line.taxableMinor)}</td>
              <td className="invoice-mono">{formatInvoicePercent(line.gstRateBps)}</td>
              {interState ? (
                <td className="invoice-mono">{amountOrDash(line.igstMinor)}</td>
              ) : (
                <>
                  <td className="invoice-mono">{amountOrDash(line.cgstMinor)}</td>
                  <td className="invoice-mono">{amountOrDash(line.sgstMinor)}</td>
                </>
              )}
              <td className="invoice-mono">{formatInvoiceAmount(line.totalMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="invoice-tax-analysis" aria-label="Rate-wise tax summary">
        <p className="invoice-block-label">Rate-wise Tax Summary</p>
        <table>
          <thead>
            <tr>
              <th scope="col">GST Rate</th>
              <th scope="col">Taxable</th>
              {interState ? (
                <th scope="col">IGST</th>
              ) : (
                <>
                  <th scope="col">CGST</th>
                  <th scope="col">SGST</th>
                </>
              )}
              {document.taxSlabs.some((slab) => slab.cessMinor !== 0) ? (
                <th scope="col">Cess</th>
              ) : null}
              <th scope="col">Total Tax</th>
            </tr>
          </thead>
          <tbody>
            {document.taxSlabs.map((slab) => (
              <tr key={slab.gstRateBps}>
                <td className="invoice-mono">{formatInvoicePercent(slab.gstRateBps)}</td>
                <td className="invoice-mono">{formatInvoiceAmount(slab.taxableMinor)}</td>
                {interState ? (
                  <td className="invoice-mono">{amountOrDash(slab.igstMinor)}</td>
                ) : (
                  <>
                    <td className="invoice-mono">{amountOrDash(slab.cgstMinor)}</td>
                    <td className="invoice-mono">{amountOrDash(slab.sgstMinor)}</td>
                  </>
                )}
                {document.taxSlabs.some((row) => row.cessMinor !== 0) ? (
                  <td className="invoice-mono">{amountOrDash(slab.cessMinor)}</td>
                ) : null}
                <td className="invoice-mono">{formatInvoiceAmount(slab.taxMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="invoice-summary">
        <div className="invoice-summary-left">
          <div className="invoice-words">
            <p className="invoice-block-label">Amount in Words</p>
            <p>{amountInWords(totals.totalMinor, company.currency)}</p>
          </div>

          {document.bank ? (
            <div className="invoice-bank">
              <p className="invoice-block-label">Bank Details</p>
              <p>
                <span className="invoice-bank-name">{document.bank.name}</span>
                {document.bank.code ? (
                  <span className="invoice-mono"> · Code {document.bank.code}</span>
                ) : null}
              </p>
            </div>
          ) : null}

          {terms.length > 0 ? (
            <div className="invoice-terms">
              <p className="invoice-block-label">Terms &amp; Conditions</p>
              <ul>
                {terms.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <dl className="invoice-totals">
          {totals.discountMinor !== 0 ? (
            <div>
              <dt>Discount</dt>
              <dd className="invoice-mono">{formatInvoiceAmount(totals.discountMinor)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Taxable Value</dt>
            <dd className="invoice-mono">{formatInvoiceAmount(totals.taxableMinor)}</dd>
          </div>
          {totals.cgstMinor !== 0 ? (
            <div>
              <dt>CGST</dt>
              <dd className="invoice-mono">{formatInvoiceAmount(totals.cgstMinor)}</dd>
            </div>
          ) : null}
          {totals.sgstMinor !== 0 ? (
            <div>
              <dt>SGST</dt>
              <dd className="invoice-mono">{formatInvoiceAmount(totals.sgstMinor)}</dd>
            </div>
          ) : null}
          {totals.igstMinor !== 0 ? (
            <div>
              <dt>IGST</dt>
              <dd className="invoice-mono">{formatInvoiceAmount(totals.igstMinor)}</dd>
            </div>
          ) : null}
          {totals.cessMinor !== 0 ? (
            <div>
              <dt>Cess</dt>
              <dd className="invoice-mono">{formatInvoiceAmount(totals.cessMinor)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Round Off</dt>
            <dd className="invoice-mono">{formatInvoiceAmount(totals.roundOffMinor)}</dd>
          </div>
          <div className="invoice-grand-total">
            <dt>Grand Total</dt>
            <dd className="invoice-mono">{formatInvoiceAmount(totals.totalMinor)}</dd>
          </div>
        </dl>
      </section>

      <section className="invoice-signature">
        <div className="invoice-jurisdiction">
          {company.city ? `Subject to ${company.city} jurisdiction` : 'Subject to jurisdiction'}
        </div>
        <div className="invoice-signatory">
          <p>For {company.name}</p>
          <p className="invoice-signatory-line">Authorised Signatory</p>
        </div>
      </section>

      <footer className="invoice-foot">
        <span>{caption}</span>
        <span>
          Page {page} of {pages}
        </span>
      </footer>
    </article>
  )
}

import { amountInWords } from '../../../../../shared/amount-in-words'
import type { InvoiceCopyCaption, InvoiceDocument } from '../../../../../shared/contracts/invoice'
import {
  INVOICE_DOCUMENT_TITLE,
  buildHsnSummary,
  formatInvoiceAmount,
  formatInvoiceDate,
  formatInvoicePercent,
  formatInvoiceQty,
  invoiceNumberLabel,
  invoiceTaxTotal,
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

interface PartyBlock {
  name: string
  legalName: string | null
  address: string | null
  city: string | null
  pincode: string | null
  gstin: string | null
  pan: string | null
  stateCode: string | null
  phone: string | null
  email: string | null
  logo: string | null
}

function stateText(code: string | null | undefined): string {
  return stateLabel(code) ?? '—'
}

function valueOrDash(value: string | null | undefined): string {
  const text = (value ?? '').trim()
  return text === '' ? '—' : text
}

function addressText(...parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '')
    .join(', ')
}

function MetaCell({
  label,
  value,
  mono = false
}: {
  label: string
  value: string | null
  mono?: boolean
}): React.JSX.Element {
  const text = valueOrDash(value)
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono && text !== '—' ? 'invoice-mono' : undefined}>{text}</dd>
    </div>
  )
}

/**
 * One printed copy of a sales invoice or purchase bill, sized to a single A4
 * sheet. The page renders this twice with the two GST Rule 48(1) captions.
 *
 * A sales voucher prints our company as the issuer and the customer as the
 * buyer. A purchase voucher reproduces the supplier's tax invoice: the party
 * is the issuer and our company is the buyer, which is why the blocks swap.
 */
export function InvoiceSheet({
  document,
  caption,
  page,
  pages
}: InvoiceSheetProps): React.JSX.Element {
  const { company, party, totals } = document
  const isPurchase = document.type === 'PURCHASE'
  const interState = isInterStateInvoice(document)
  const terms = isPurchase ? [] : invoiceTermLines(company.invoiceTerms)
  const cancelled = document.status === 'CANCELLED'
  const taxTotal = invoiceTaxTotal(totals)

  const issuer: PartyBlock =
    isPurchase && party
      ? {
          name: party.name,
          legalName: null,
          address: party.billingAddress,
          city: null,
          pincode: null,
          gstin: party.gstin,
          pan: party.pan,
          stateCode: party.stateCode,
          phone: party.phone,
          email: party.email,
          logo: null
        }
      : {
          name: company.name,
          legalName: company.legalName,
          address: company.address,
          city: company.city,
          pincode: company.pincode,
          gstin: company.gstin,
          pan: company.pan,
          stateCode: company.stateCode,
          phone: company.phone,
          email: company.email,
          logo: company.logo
        }

  const buyer: PartyBlock = isPurchase
    ? {
        name: company.name,
        legalName: company.legalName,
        address: addressText(company.address, company.city, company.pincode) || null,
        city: company.city,
        pincode: company.pincode,
        gstin: company.gstin,
        pan: company.pan,
        stateCode: company.stateCode,
        phone: company.phone,
        email: company.email,
        logo: null
      }
    : party
      ? {
          name: party.name,
          legalName: null,
          address: party.billingAddress,
          city: null,
          pincode: null,
          gstin: party.gstin,
          pan: party.pan,
          stateCode: party.stateCode,
          phone: party.phone,
          email: party.email,
          logo: null
        }
      : {
          name: 'Cash sale',
          legalName: null,
          address: null,
          city: null,
          pincode: null,
          gstin: null,
          pan: null,
          stateCode: null,
          phone: null,
          email: null,
          logo: null
        }

  const invoiceNumber = isPurchase ? (document.referenceNo ?? document.number) : document.number
  const deliveryAddress = isPurchase
    ? addressText(company.address, company.city, company.pincode)
    : addressText(party?.shippingAddress || party?.billingAddress)
  const deliveryState = isPurchase ? company.stateCode : (party?.stateCode ?? null)

  const jurisdiction = isPurchase
    ? (stateLabel(party?.stateCode) ?? company.city ?? null)
    : (company.city ?? stateLabel(company.stateCode))
  const jurisdictionText = jurisdiction
    ? `Subject to ${jurisdiction} jurisdiction`
    : 'Subject to jurisdiction'

  const taxRows = document.taxSlabs.flatMap((slab) => {
    if (interState) {
      return [
        {
          key: `igst-${slab.gstRateBps}`,
          label: `IGST @ ${formatInvoicePercent(slab.gstRateBps)}`,
          value: slab.igstMinor
        }
      ]
    }
    const half = formatInvoicePercent(slab.gstRateBps / 2)
    const rows = [
      { key: `cgst-${slab.gstRateBps}`, label: `CGST @ ${half}`, value: slab.cgstMinor },
      { key: `sgst-${slab.gstRateBps}`, label: `SGST @ ${half}`, value: slab.sgstMinor }
    ]
    if (slab.cessMinor !== 0) {
      rows.push({ key: `cess-${slab.gstRateBps}`, label: 'Cess', value: slab.cessMinor })
    }
    return rows
  })

  const hsnSummary = buildHsnSummary(document.lines)
  const hasCess = hsnSummary.some((row) => row.cessMinor !== 0)

  return (
    <article className="invoice-sheet" data-copy={caption}>
      {cancelled ? (
        <p className="invoice-watermark" aria-hidden="true">
          CANCELLED
        </p>
      ) : null}

      <header className="invoice-doc-head">
        <p className="invoice-title">{INVOICE_DOCUMENT_TITLE}</p>
        <p className="invoice-caption">{caption}</p>
      </header>

      <section className="invoice-head" aria-label="Supplier and invoice details">
        <section className="invoice-supplier" aria-label="Supplier">
          <p className="invoice-block-label">Supplier</p>
          <div className="invoice-supplier-body">
            <div className="invoice-brand">
              {issuer.logo ? (
                <img className="invoice-logo" src={issuer.logo} alt="" decoding="async" />
              ) : null}
              <div className="invoice-brand-text">
                <p className="invoice-company-name">{issuer.name}</p>
                {issuer.legalName && issuer.legalName !== issuer.name ? (
                  <p className="invoice-company-legal">{issuer.legalName}</p>
                ) : null}
              </div>
            </div>
            {issuer.address ? <p className="invoice-address">{issuer.address}</p> : null}
            {addressText(issuer.city, issuer.pincode) ? (
              <p>{addressText(issuer.city, issuer.pincode)}</p>
            ) : null}
            <p className="invoice-party-line">
              <span>Phone: {valueOrDash(issuer.phone)}</span>
            </p>
            <p className="invoice-party-line">
              <span>Email: {valueOrDash(issuer.email)}</span>
            </p>
            <p className="invoice-party-line">
              <span>
                GSTIN/UIN: <span className="invoice-mono">{valueOrDash(issuer.gstin)}</span>
              </span>
              <span>
                PAN/IT No.: <span className="invoice-mono">{valueOrDash(issuer.pan)}</span>
              </span>
              <span>
                State: {stateText(issuer.stateCode)}
                {issuer.stateCode ? `, Code: ${issuer.stateCode}` : ''}
              </span>
            </p>
          </div>
        </section>

        <div className="invoice-meta-col">
          {isPurchase ? (
            /*
             * The purchase sample is a supplier's Tally invoice, which prints a
             * two-row reference grid instead of the full transport grid. Our
             * voucher number and the place of supply carry the extra rows.
             */
            <dl className="invoice-meta">
              <MetaCell label={invoiceNumberLabel(document.type)} value={invoiceNumber} mono />
              <MetaCell label="Dated" value={formatInvoiceDate(document.date)} mono />
              <MetaCell label="Voucher No." value={document.number} mono />
              <MetaCell
                label="Place of Supply"
                value={stateText(document.placeOfSupplyStateCode)}
              />
              <MetaCell label="Reference No. & Date" value={null} />
              <MetaCell label="Other References" value={document.narration} />
            </dl>
          ) : (
            <dl className="invoice-meta">
              <MetaCell label={invoiceNumberLabel(document.type)} value={invoiceNumber} mono />
              <MetaCell label="Dated" value={formatInvoiceDate(document.date)} mono />
              <MetaCell label="Delivery Note" value={null} />
              <MetaCell label="Mode of Payment" value={null} />
              <MetaCell label="Supplier's Ref." value={document.referenceNo} mono />
              <MetaCell label="Other Reference" value={document.narration} />
              <MetaCell label="Buyer's Order No." value={null} />
              <MetaCell label="Dated" value={null} mono />
              <MetaCell label="Despatch Doc No." value={null} />
              <MetaCell label="Delivery Note Date" value={null} mono />
              <MetaCell label="Despatched Through" value={null} />
              <MetaCell label="Terms of Delivery" value={null} />
              <div className="invoice-meta-wide">
                <dt>Place of Delivery</dt>
                <dd>
                  <span className="invoice-address">{deliveryAddress || '—'}</span>
                  <span className="invoice-meta-sub">State: {stateText(deliveryState)}</span>
                </dd>
              </div>
            </dl>
          )}
          {!isPurchase && document.dueDate ? (
            <p className="invoice-meta-extra">Due {formatInvoiceDate(document.dueDate)}</p>
          ) : null}
        </div>
      </section>

      <section className="invoice-buyer" aria-label="Buyer">
        <p className="invoice-block-label">Buyer</p>
        <div className="invoice-buyer-body">
          <p className="invoice-party-name">{buyer.name}</p>
          <p className="invoice-address">{valueOrDash(buyer.address)}</p>
          <p className="invoice-party-line">
            <span>Phone: {valueOrDash(buyer.phone)}</span>
            <span>Email: {valueOrDash(buyer.email)}</span>
          </p>
          <p className="invoice-party-line">
            <span>
              GSTIN/UIN: <span className="invoice-mono">{valueOrDash(buyer.gstin)}</span>
            </span>
            <span>
              PAN/IT No.: <span className="invoice-mono">{valueOrDash(buyer.pan)}</span>
            </span>
            <span>State: {stateText(buyer.stateCode)}</span>
          </p>
        </div>
      </section>

      <div className="invoice-lines-wrap">
        <table className="invoice-lines">
          <colgroup>
            <col className="col-sno" />
            <col className="col-description" />
            <col className="col-hsn" />
            <col className="col-qty" />
            <col className="col-rate" />
            <col className="col-per" />
            <col className="col-discount" />
            <col className="col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">S.No</th>
              <th scope="col" className="is-left">
                Description of Goods
              </th>
              <th scope="col">HSN/SAC</th>
              <th scope="col">Quantity</th>
              <th scope="col">Rate</th>
              <th scope="col">per</th>
              <th scope="col">Disc. %</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {document.lines.map((line, index) => (
              <tr key={line.id}>
                <td className="invoice-mono">{index + 1}</td>
                <td className="is-left">{line.description}</td>
                <td className="invoice-mono">{line.hsn ?? '—'}</td>
                <td className="invoice-mono">{formatInvoiceQty(line.qtyE4)}</td>
                <td className="invoice-mono">{formatInvoiceAmount(line.rateMinor)}</td>
                <td>{line.uom ?? '—'}</td>
                <td className="invoice-mono">{formatInvoicePercent(line.discountBps)}</td>
                <td className="invoice-mono">{formatInvoiceAmount(line.taxableMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="invoice-bottom">
        <div className="invoice-bank">
          {!isPurchase && document.bank ? (
            <>
              <p className="invoice-block-label">Bank Details</p>
              <p className="invoice-bank-name">{document.bank.name}</p>
              {document.bank.code ? (
                <p>
                  A/c Code: <span className="invoice-mono">{document.bank.code}</span>
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <dl className="invoice-totals">
          <div>
            <dt>Taxable Value</dt>
            <dd className="invoice-mono">{formatInvoiceAmount(totals.taxableMinor)}</dd>
          </div>
          {taxRows.map((row) => (
            <div key={row.key}>
              <dt>{row.label}</dt>
              <dd className="invoice-mono">{formatInvoiceAmount(row.value)}</dd>
            </div>
          ))}
          {totals.roundOffMinor !== 0 ? (
            <div>
              <dt>Round Off</dt>
              <dd className="invoice-mono">{formatInvoiceAmount(totals.roundOffMinor)}</dd>
            </div>
          ) : null}
          <div className="invoice-grand-total">
            <dt>Total</dt>
            <dd className="invoice-mono">
              {company.currency === 'INR' ? '₹ ' : ''}
              {formatInvoiceAmount(totals.totalMinor)}
            </dd>
          </div>
        </dl>
      </section>

      <div className="invoice-words">
        <div>
          <p className="invoice-block-label">Amount (in Words)</p>
          <p className="invoice-words-value">
            {amountInWords(totals.totalMinor, company.currency)}
          </p>
        </div>
        <span className="invoice-eoe">E. &amp; E.O.</span>
      </div>

      <section className="invoice-tax-summary" aria-label="HSN-wise tax summary">
        <p className="invoice-block-label">HSN/SAC-wise Tax Summary</p>
        <table>
          <colgroup>
            <col className="col-hsn-summary" />
            <col className="col-taxable-summary" />
            <col className="col-rate-summary" />
            <col className="col-tax-summary" />
            <col className="col-rate-summary" />
            <col className="col-tax-summary" />
            {hasCess ? <col className="col-rate-summary" /> : null}
            {hasCess ? <col className="col-tax-summary" /> : null}
            <col className="col-tax-summary" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">HSN/SAC</th>
              <th scope="col">Taxable Value</th>
              {interState ? (
                <>
                  <th scope="col">IGST Rate</th>
                  <th scope="col">IGST Amount</th>
                </>
              ) : (
                <>
                  <th scope="col">CGST Rate</th>
                  <th scope="col">CGST Amount</th>
                  <th scope="col">SGST Rate</th>
                  <th scope="col">SGST Amount</th>
                </>
              )}
              {hasCess ? <th scope="col">Cess Rate</th> : null}
              {hasCess ? <th scope="col">Cess Amount</th> : null}
              <th scope="col">Total Tax Amount</th>
            </tr>
          </thead>
          <tbody>
            {hsnSummary.map((row) => (
              <tr key={`${row.hsn ?? 'none'}-${row.gstRateBps}`}>
                <td>{row.hsn ?? '—'}</td>
                <td className="invoice-mono">{formatInvoiceAmount(row.taxableMinor)}</td>
                {interState ? (
                  <>
                    <td className="invoice-mono">{formatInvoicePercent(row.gstRateBps)}</td>
                    <td className="invoice-mono">{formatInvoiceAmount(row.igstMinor)}</td>
                  </>
                ) : (
                  <>
                    <td className="invoice-mono">{formatInvoicePercent(row.gstRateBps / 2)}</td>
                    <td className="invoice-mono">{formatInvoiceAmount(row.cgstMinor)}</td>
                    <td className="invoice-mono">{formatInvoicePercent(row.gstRateBps / 2)}</td>
                    <td className="invoice-mono">{formatInvoiceAmount(row.sgstMinor)}</td>
                  </>
                )}
                {hasCess ? (
                  <td className="invoice-mono">{formatInvoicePercent(row.gstRateBps)}</td>
                ) : null}
                {hasCess ? (
                  <td className="invoice-mono">{formatInvoiceAmount(row.cessMinor)}</td>
                ) : null}
                <td className="invoice-mono">{formatInvoiceAmount(row.taxMinor)}</td>
              </tr>
            ))}
            <tr className="invoice-tax-total">
              <td>Total</td>
              <td className="invoice-mono">{formatInvoiceAmount(totals.taxableMinor)}</td>
              {interState ? (
                <>
                  <td />
                  <td className="invoice-mono">{formatInvoiceAmount(totals.igstMinor)}</td>
                </>
              ) : (
                <>
                  <td />
                  <td className="invoice-mono">{formatInvoiceAmount(totals.cgstMinor)}</td>
                  <td />
                  <td className="invoice-mono">{formatInvoiceAmount(totals.sgstMinor)}</td>
                </>
              )}
              {hasCess ? <td /> : null}
              {hasCess ? (
                <td className="invoice-mono">{formatInvoiceAmount(totals.cessMinor)}</td>
              ) : null}
              <td className="invoice-mono">{formatInvoiceAmount(taxTotal)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {taxTotal !== 0 ? (
        <p className="invoice-tax-words">
          <span>Tax Amount (in words):</span> {amountInWords(taxTotal, company.currency)}
        </p>
      ) : null}

      {terms.length > 0 ? (
        <section className="invoice-terms">
          <p className="invoice-block-label">Terms &amp; Conditions</p>
          <ul>
            {terms.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="invoice-declaration">
        <div className="invoice-declaration-box">
          <p className="invoice-block-label">Declaration</p>
          <p>
            We declare that this invoice shows the actual price of the goods described and that all
            particulars are true and correct.
          </p>
          {isPurchase ? <p className="invoice-seal">Customer&apos;s Seal and Signature</p> : null}
        </div>
        <div className="invoice-signatory">
          <p>For {issuer.name}</p>
          <p className="invoice-signatory-line">Authorised Signatory</p>
        </div>
      </section>

      <footer className="invoice-foot">
        <span>{jurisdictionText}</span>
        <span>This is a Computer Generated Invoice</span>
        <span>
          {caption} · Page {page} of {pages}
        </span>
      </footer>
    </article>
  )
}

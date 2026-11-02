# Context

The glossary for Crown Books. Terms here are canonical: use them in code, docs,
issues and conversation. This file holds no implementation detail.

## Documents

**Sales invoice** — Our own GST tax invoice to a customer. Carries our number.

**Purchase bill** — The supplier's GST tax invoice as received. Recorded as a
purchase voucher so input tax credit and stock can be booked.

**Supplier bill number** — The number printed on the supplier's invoice, in the
format the supplier uses. On a purchase bill this is the document number people
quote, search and reconcile against GSTR-2B.

**Internal voucher number** — The number our books assign to a voucher we must
number ourselves: sales invoices and every non-purchase voucher. Never reused,
never rewritten.

**No-supplier-bill purchase** — A purchase the supplier did not invoice
(counter sale, unregistered vendor). It still needs a number, so it takes the
internal purchase sequence.

**Voucher** — One posted accounting document. A sales invoice and a purchase bill
are both vouchers. A voucher is either posted or cancelled; it is never edited
after posting.

**Reference** — Free text on a voucher for an external reference such as a
supplier's order number. Never the document's identity.

## Money

**Taxable value** — The amount a tax rate is applied to: quantity × rate, less
line discount.

**Tax-inclusive price** — A price the customer pays as quoted; tax is contained
inside it and extracted for the return. A 2500 inclusive price at 18% is
2118.64 taxable plus 381.36 tax.

**Tax-exclusive price** — A price before tax; tax is added on top. A 1750
exclusive purchase at 18% lands at 2065.

**Landed purchase cost** — Purchase price plus the input tax that cannot be
recovered, used to judge margin. Recoverable GST is not a cost.

**Input tax credit (ITC)** — GST paid on a purchase, claimable against output
tax. Booked as an asset, never as an expense.

**Round off** — A visible voucher line absorbing the difference between the
exact total and the rounded payable amount.

## Reports

**Ageing bucket** — A band of days a receivable or payable has been outstanding:
0–30, 31–60, 61–90, 91–180, 180+.

**Overdue** — A bill whose due date has passed and which is not fully settled.

**Purchase register** — Bill-wise purchase listing used to reconcile ITC against
GSTR-2B.

**Report period** — The date range a report reads. Defaults to the current
financial year to date.

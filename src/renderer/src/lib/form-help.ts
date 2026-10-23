import type { FieldHelpContent } from '@/components/ui/field-help'

/**
 * Field explanations in one place, so the dialogs, the tests and the guide use
 * the same words. Keep every entry short: one sentence plus at most three
 * bullets.
 */
export const FIELD_HELP = {
  party: {
    name: {
      summary: 'The business or person you trade with.',
      points: ['Use the name printed on their invoices.', 'Required.']
    },
    phone: {
      summary: 'A contact number for reminders and statements.',
      points: ['Optional. Digits, spaces and a country code are accepted.']
    },
    email: {
      summary: 'Where invoices and statements are sent.',
      points: ['Optional. Use a valid address such as accounts@example.com.']
    },
    gstin: {
      summary: 'The 15 character GST registration number.',
      points: ['Optional for unregistered parties.', 'The first two digits set the state code.']
    },
    stateCode: {
      summary: 'The two digit state code used to decide CGST + SGST or IGST.',
      points: ['Filled from the GSTIN when one is entered.', 'Example: 27 for Maharashtra.']
    },
    billingAddress: {
      summary: 'The address printed on documents for this party.',
      points: ['Optional. A saved address is kept unless you type a replacement.']
    },
    creditDays: {
      summary: 'How long the party has to pay after an invoice.',
      points: ['0 means payment on the invoice date.', 'Used to set the due date on new bills.']
    },
    creditLimit: {
      summary: 'The most you will let this party owe at once.',
      points: ['0 means no limit is enforced.', 'A sale above the limit warns, it does not block.']
    },
    openingBalance: {
      summary: 'What the party already owed you when the books began.',
      points: [
        'Positive is Dr, meaning they owe you.',
        'Negative is Cr, meaning you owe them.',
        'Posted once with the opening balances.'
      ]
    },
    openingDate: {
      summary: 'The date the opening balance applies to.',
      points: ['Defaults to the books begin date.', 'Cannot be changed after the party is saved.']
    },
    role: {
      summary: 'Whether this party buys from you, sells to you, or both.',
      points: ['Customers appear on sales.', 'Suppliers appear on purchases.']
    }
  },
  item: {
    name: {
      summary: 'The name shown on invoices and bills.',
      points: ['Required. Use the name your staff and customers recognise.']
    },
    sku: {
      summary: 'Your internal code for the item.',
      points: ['Optional. Useful when the same name repeats across sizes.']
    },
    hsnSac: {
      summary: 'The HSN or SAC code used for GST classification.',
      points: ['Optional. Printed on the tax invoice.']
    },
    uom: {
      summary: 'The unit you buy and sell in.',
      points: ['Examples: Nos, Kg, Ltr.', 'Set once, then reused on every line.']
    },
    gstRate: {
      summary: 'The GST rate applied to this item.',
      points: ['Used to fill the line GST rate.', 'Change it per line when a sale differs.']
    },
    salePrice: {
      summary: 'The default price charged to customers.',
      points: ['Filled into a sales line when the item is picked.']
    },
    purchasePrice: {
      summary: 'The default price paid to suppliers.',
      points: ['Filled into a purchase line when the item is picked.']
    },
    openingQty: {
      summary: 'The quantity already on hand when the books began.',
      points: ['Posted once with the opening balances.']
    },
    openingRate: {
      summary: 'The cost per unit for the opening quantity.',
      points: ['Used to value opening stock.']
    },
    reorderLevel: {
      summary: 'The quantity at which the item should be reordered.',
      points: ['Optional. Drives the low stock warning on the dashboard.']
    },
    service: {
      summary: 'Marks the item as a service rather than stock.',
      points: ['Services never change stock on hand.']
    }
  },
  account: {
    name: {
      summary: 'The ledger name shown in reports.',
      points: ['Required. Keep it short and specific.']
    },
    group: {
      summary: 'The group that decides where the ledger appears.',
      points: ['Assets, liabilities, income and expenses follow the group.']
    },
    type: {
      summary: 'The accounting nature of the ledger.',
      points: ['Usually set by the group you choose.']
    },
    openingBalance: {
      summary: 'The balance carried in when the books began.',
      points: [
        'Positive values follow the account nature.',
        'Posted once with the opening balances.'
      ]
    }
  },
  journal: {
    date: {
      summary: 'The date the adjustment takes effect.',
      points: ['Must fall in the open period.', 'Reports read this date.']
    },
    narration: {
      summary: 'Why this entry exists.',
      points: ['Printed on the voucher and shown in the day book.']
    },
    account: {
      summary: 'The ledger this line debits or credits.',
      points: ['Debits must equal credits before the entry can post.']
    },
    debit: {
      summary: 'The amount debited to this ledger.',
      points: ['Enter a value on one side only.']
    },
    credit: {
      summary: 'The amount credited to this ledger.',
      points: ['Enter a value on one side only.']
    }
  },
  company: {
    booksBegin: {
      summary: 'The first day you want to keep accounts for.',
      points: [
        'Opening balances and opening stock use this date.',
        'Tax rates seeded for the company take effect from this date.',
        'Transactions from before this date belong in the opening balances.'
      ]
    },
    fyStartMonth: {
      summary: 'The month the financial year starts.',
      points: ['April is the default for India.', 'Voucher numbering restarts each financial year.']
    }
  }
} as const satisfies Record<string, Record<string, FieldHelpContent>>

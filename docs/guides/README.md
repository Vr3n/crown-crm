# Crown Books user guide

The PDF is written for the people who use the application, not for developers.

- **Read it:** [`crown-books-user-guide.pdf`](crown-books-user-guide.pdf)
- **Source:** [`crown-books-user-guide.html`](crown-books-user-guide.html)
- **Screenshots:** [`assets/screens/`](assets/screens/)
- **Callout positions:** [`assets/annotations.json`](assets/annotations.json)

## What it covers

1. First run, sign in, the shell and the anatomy of a voucher
2. Company settings, chart of accounts, “books begin” and opening balances
3. Customers and suppliers
4. Items, goods versus services, and stock
5. Purchase bills, supplier payments, payables and the purchase register
6. Sales invoices, GST place of supply, printing, receipts, receivables and ageing
7. Cancellation, journals and contra
8. Day book, trial balance, profit and loss and balance sheet
9. Backup and restore
10. Shortcuts, voucher series, messages, glossary and daily routine

The guide uses the Crown Traders example company. It also states what is reserved in this
edition, such as global search, the Tax Rates and Units masters, user management, credit/debit
note screens, Excel export and bank reconciliation.

## Rebuilding it

The screenshots are produced from the real Electron build.

```powershell
npx electron-vite build
node scripts/guide/capture-guide.mjs
node scripts/guide/render-guide-pdf.mjs
```

`capture-guide.mjs` creates a throwaway company, posts a month of purchases, sales, receipts,
payments and adjustments, captures 31 screens, and writes the callout coordinates. It removes
the throwaway database when it finishes.

To inspect the PDF as images:

```powershell
uv run --with pymupdf --with pillow python scripts/guide/preview_pdf.py
```

The preview images are written to `%LOCALAPPDATA%\Temp\opencode\guide-pdf`.

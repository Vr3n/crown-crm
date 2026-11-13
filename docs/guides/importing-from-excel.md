# Importing your Excel data

This guide is for the person who keeps the bills in Excel. You do not need to
know accounting or change your file. Crown Books reads the sheet you already
have.

The importer creates **purchase bills** or **sales invoices**. It does not import
payments, receipts, credit notes or opening balances.

## What you need

- An Excel file: `.xlsx`, `.xls` or `.csv`.
- One row for each item line. If a bill has three items, it has three rows.
- The supplier bill number or your invoice number in one column, so the rows can
  be grouped into one bill.
- Column names somewhere above the rows. They do not have to be in row 1.

Your file can have several sheets. It can have a title above the table and a
total below it. You will select only the table.

## The five screens

### 1. File

Choose **Purchase bills** or **Sales invoices**, then choose your file.

The type matters. A purchase bill creates a payable and input tax. A sales
invoice creates a receivable and output tax.

If you want to see how it works first, choose **Try the sample**. It is a small
workbook with three sheets, a title row and a totals row.

Nothing is saved at this point. You can close the page and nothing changes.

### 2. Sheet and range

The sheet appears as it is in Excel. The importer guesses the table and
highlights it in blue.

Check two things:

1. The blue box covers the column names and every data row.
2. The row with the column names is marked with **H** in the row number.

If the box includes a title or a total, drag over the correct cells. You can also
type the row numbers in **From row** and **To row**.

```
        A              B            C           D
  1   Crown Books                                 <- title, leave out
  2   April to June                               <- leave out
  3
  4   Supplier Bill  Bill Date    Supplier    Item   <- header, include
  5   SH-1042        05-04-2026   Sharma      SSD    <- data, include
  6   SH-1042        05-04-2026   Sharma      Cable  <- data, include
  7   Total                                       <- total, leave out
```

If you have more than one sheet, click the sheet tab first. The party list sheet
in the sample is not part of the import.

### 3. Map columns

The importer matches your column names to the fields Crown Books needs. The
middle column shows what it chose. The right column shows an example from your
own sheet.

Fields marked **Required** must have a column. If one is missing, the button at
the bottom tells you which one.

What the fields mean:

| Field             | What it is                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Supplier bill no. | The number printed on the supplier's bill. Rows with the same number become one purchase bill.                          |
| Bill date         | The date on the supplier's bill.                                                                                        |
| Supplier          | Who the bill is from. We match it by GSTIN first, then by name.                                                         |
| Item              | The item in your item master. If it does not match, the line still imports as free text.                                |
| Description       | What is printed on the bill. If it is blank, the item name is used.                                                     |
| Quantity          | How many. Must be more than zero.                                                                                       |
| Rate              | The price for one unit.                                                                                                 |
| GST %             | The tax rate on the line.                                                                                               |
| Place of supply   | The two digit state code. It decides CGST + SGST versus IGST. If the column is missing, the state in the GSTIN is used. |

Three options sit below the mapping:

- **The rates in the file already include GST.** Turn this on only if your rate
  column is the final price the customer pays. Leave it off for a normal
  invoice where tax is added on top.
- **Create suppliers or customers that do not exist.** On, a new name is created
  with the details in the file. You still see it on the next screen.
- **Create items that do not exist.** Off, an unknown item posts as a free-text
  line and does not move stock. On, the item is added to your item master first.

If your file has no description column, that is fine. The item name becomes the
description. You need an item column or a description column, not both.

### 4. Check rows

This is the last screen before anything is written.

At the top you see how many bills, how many item lines, the total value and how
many problems were found.

Below that, every supplier or customer name is listed once. A matched name shows
the party it will use. A new name shows **Will be created**. A name that needs a
choice shows a dropdown. Pick an existing party, or create a new one.

The **Rows to check** panel lists errors and warnings.

- An **error** stops the import. It names the Excel row, the field and the fix.
- A **warning** does not stop the import. It tells you what will happen.

Open a bill to see its item lines, the source row for each line, and the totals.
Compare one bill with your Excel file. If the total is wrong, the mapping is
wrong. Go back and fix it.

### 5. Import

Press **Import 8 purchase bills** (the number is yours). Bills post one at a
time. Keep the page open until every bill has a result.

When it finishes you see:

- how many bills posted, and their voucher numbers
- how many failed, and why
- how many suppliers or customers were created

A posted bill is final. If one is wrong, cancel that voucher and post a corrected
one. You can retry failed bills without posting the successful ones again.

## Common questions

**My file has a title in row 1 and the column names in row 4.**
That is fine. Select from row 4 to the last data row, and click row 4's number so
it shows **H**.

**My file has a total row at the bottom.**
Leave it out of the blue box. The importer stops at a row whose first cell starts
with "Total" when it guesses the range, but you can always adjust the range.

**My bill has several items.**
Put the same supplier bill number on each row. The importer groups them into one
bill. If the bill number is blank, each row becomes its own bill.

**My invoice numbers are from the old software.**
That is fine for sales. The old invoice number is kept as the reference, and
Crown Books assigns its own invoice number.

**A supplier is spelled differently in my file.**
The importer matches by GSTIN first, then by a cleaned-up name. If it still does
not match, the Check screen lets you pick the existing supplier. You do not have
to edit the Excel file.

**Some rows have no GST.**
Map the GST column if it exists. If the column is missing, every line posts at
0% and you get a warning. Check that this is what you want.

**A rate looks like 3,855.93 or ₹3,855.93.**
Both are read correctly. Indian grouping with commas is fine.

**A date looks like 05/04/2026.**
It is read as 5 April 2026, day first. If your file uses month first, change the
cells to a real Excel date or to `05-04-2026`.

**I have a bill with two different suppliers under one bill number.**
The Check screen shows an error. Give each supplier its own bill number.

**Can I undo the whole import?**
No. The domain model does not allow a batch undo. Each posted voucher can be
cancelled individually, and the audit trail keeps both rows.

## A short checklist

Before you press Import:

- The blue box starts at the column names and ends at the last data row.
- Every required field has a column.
- The example values in the mapping look like the right columns.
- The bill count and total value look plausible.
- Every supplier or customer has a match or a clear "will be created".
- There are no errors, only warnings you understand.

## If you get stuck

- Use **Try the sample** to see the flow with a known-good file.
- Use **Download a template** if you want a clean starting point.
- Read the reason next to the disabled button. It names the field or the row.
- Nothing is written until the final Import. You can go back and change any
  choice.

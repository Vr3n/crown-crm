import { ArrowLeftRight, Columns3, Download, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fieldsFor, requiredFields } from '@shared/excel-import/fields'
import { duplicateMappingFields, missingRequiredFields } from '@shared/excel-import/automap'
import { cellText, columnLetter } from '@shared/excel-import/parse'
import type {
  CellRange,
  CellValue,
  FieldKey,
  FieldMapping,
  ImportOptions,
  ImportTarget
} from '@shared/excel-import/types'

function headerFor(rows: CellValue[][], headerRow: number | null, col: number): string {
  const text = headerRow === null ? '' : cellText(rows[headerRow]?.[col] as CellValue)
  return text || `Column ${columnLetter(col)}`
}

export function MappingStep({
  target,
  mapping,
  rows,
  range,
  headerRow,
  options,
  onChange,
  onClear,
  onOption,
  onTargetChange,
  onDownloadTemplate
}: {
  target: ImportTarget
  mapping: FieldMapping
  rows: CellValue[][]
  range: CellRange
  headerRow: number | null
  options: ImportOptions
  onChange: (field: FieldKey, column: number) => void
  onClear: (field: FieldKey) => void
  onOption: (key: keyof ImportOptions, value: boolean) => void
  onTargetChange: (target: ImportTarget) => void
  onDownloadTemplate: () => void
}): React.JSX.Element {
  const fields = fieldsFor(target)
  const missing = missingRequiredFields(target, mapping)
  const duplicates = duplicateMappingFields(mapping)
  const required = new Set(requiredFields(target))
  const mappedCount = fields.filter((field) => mapping[field.key] !== undefined).length
  const used = new Set(
    Object.values(mapping).filter((value): value is number => value !== undefined)
  )
  const unmapped = Array.from(
    { length: range.endCol - range.startCol + 1 },
    (_, index) => range.startCol + index
  ).filter((col) => !used.has(col))

  const dataStart = headerRow === null ? range.startRow : headerRow + 1
  let exampleRow = dataStart
  for (let row = dataStart; row <= range.endRow; row += 1) {
    const filled = (rows[row] ?? [])
      .slice(range.startCol, range.endCol + 1)
      .some((cell) => cellText(cell as CellValue))
    if (filled) {
      exampleRow = row
      break
    }
  }

  const role = target === 'PURCHASE' ? 'supplier' : 'customer'
  const billWord = target === 'PURCHASE' ? 'purchase bill' : 'sales invoice'

  return (
    <div className="flex flex-col gap-3">
      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="size-4 text-info" strokeWidth={1.75} />
            <h2 className="text-[0.9375rem] font-semibold">What are you importing?</h2>
          </div>
          <button
            type="button"
            onClick={onDownloadTemplate}
            className="inline-flex items-center gap-1.5 text-[0.75rem] text-primary underline-offset-4 hover:underline"
          >
            <Download className="size-3.5" strokeWidth={1.75} />
            Download a template
          </button>
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-2">
          {[
            {
              value: 'PURCHASE' as const,
              title: 'Purchase bills',
              body: 'What suppliers billed you. This creates payables and input tax.'
            },
            {
              value: 'SALES' as const,
              title: 'Sales invoices',
              body: 'What you billed customers. This creates receivables and output tax.'
            }
          ].map((choice) => {
            const active = target === choice.value
            return (
              <button
                key={choice.value}
                type="button"
                onClick={() => onTargetChange(choice.value)}
                aria-pressed={active}
                className={cn(
                  'border px-3 py-2.5 text-left transition-colors',
                  active
                    ? 'border-primary bg-accent-soft/60'
                    : 'border-border hover:border-rule-strong hover:bg-muted/50'
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="text-[0.875rem] font-semibold">{choice.title}</span>
                    {active ? (
                      <span className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-primary">
                        Selected
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      'size-3.5 border',
                      active ? 'border-primary bg-primary' : 'border-input bg-background'
                    )}
                    aria-hidden
                  />
                </span>
                <span className="mt-1 block text-[0.75rem] leading-snug text-muted-foreground">
                  {choice.body}
                </span>
              </button>
            )
          })}
        </div>
        <p className="border-t border-border px-4 py-2 text-[0.75rem] text-muted-foreground">
          Changing the type starts the sheet selection and mapping again.
        </p>
      </section>

      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Columns3 className="size-4 text-info" strokeWidth={1.75} />
            <h2 className="text-[0.9375rem] font-semibold">Match your columns</h2>
            <span className="text-[0.75rem] text-muted-foreground">
              {mappedCount} of {fields.length} matched
            </span>
          </div>
          {duplicates.length > 0 ? (
            <span className="text-[0.75rem] text-destructive">A column is used twice</span>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="h-8 px-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Crown Books field
                </th>
                <th className="h-8 px-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Column in your file
                </th>
                <th className="h-8 px-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Example from row {exampleRow + 1}
                </th>
              </tr>
            </thead>
            <tbody>
              {(['bill', 'line'] as const).map((group) => (
                <GroupRows
                  key={group}
                  group={group}
                  fields={fields}
                  mapping={mapping}
                  required={required}
                  missing={missing}
                  rows={rows}
                  range={range}
                  headerRow={headerRow}
                  exampleRow={exampleRow}
                  onChange={onChange}
                  onClear={onClear}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Info className="size-3.5 text-info" strokeWidth={1.75} />
            <p className="text-[0.8125rem] leading-relaxed">
              Rows with the same{' '}
              <span className="font-medium">
                {target === 'PURCHASE' ? 'supplier bill no.' : 'invoice no.'}
              </span>{' '}
              become one {billWord}. If it is blank, each row becomes its own {billWord}.
            </p>
          </div>
        </div>
      </section>

      <section className="border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-[0.9375rem] font-semibold">Options</h2>
        </div>
        <div className="divide-y divide-border">
          <OptionRow
            id="prices-include-tax"
            checked={options.pricesIncludeTax}
            onChange={(value) => onOption('pricesIncludeTax', value)}
            label="The rates in the file already include GST"
            help="Leave this off if the file shows the rate before tax, like a normal invoice. The posted bill will still show the tax separately."
          />
          <OptionRow
            id="create-parties"
            checked={options.createMissingParties}
            onChange={(value) => onOption('createMissingParties', value)}
            label={`Create ${role}s that do not exist`}
            help={`A name that does not match an existing ${role} is created with the details in the file. You can review each one before importing.`}
          />
          <OptionRow
            id="create-items"
            checked={options.createMissingItems}
            onChange={(value) => onOption('createMissingItems', value)}
            label="Create items that do not exist"
            help="Off, an unmatched item posts as a free-text line and does not move stock. On, the item is added to your item master first."
          />
        </div>
      </section>

      <section className="border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-[0.9375rem] font-semibold">Not imported</h2>
        </div>
        <div className="flex flex-wrap gap-1.5 px-4 py-3">
          {unmapped.length === 0 ? (
            <p className="text-[0.8125rem] text-muted-foreground">
              Every column in the selected range is mapped.
            </p>
          ) : (
            unmapped.map((col) => (
              <span
                key={col}
                className="border border-border bg-muted/50 px-2 py-1 text-[0.75rem] text-muted-foreground"
              >
                <span className="font-mono text-[0.6875rem]">{columnLetter(col)}</span>
                {' · '}
                {headerFor(rows, headerRow, col)}
              </span>
            ))
          )}
        </div>
        {unmapped.length > 0 ? (
          <p className="border-t border-border px-4 py-2 text-[0.75rem] text-muted-foreground">
            These columns are skipped. Nothing is dropped silently.
          </p>
        ) : null}
      </section>
    </div>
  )
}

function GroupRows({
  group,
  fields,
  mapping,
  required,
  missing,
  rows,
  range,
  headerRow,
  exampleRow,
  onChange,
  onClear
}: {
  group: 'bill' | 'line'
  fields: ReturnType<typeof fieldsFor>
  mapping: FieldMapping
  required: Set<FieldKey>
  missing: FieldKey[]
  rows: CellValue[][]
  range: CellRange
  headerRow: number | null
  exampleRow: number
  onChange: (field: FieldKey, column: number) => void
  onClear: (field: FieldKey) => void
}): React.JSX.Element {
  const groupFields = fields.filter((field) => field.group === group)
  return (
    <>
      <tr className="border-b border-border bg-accent-soft/30">
        <th
          colSpan={3}
          scope="colgroup"
          className="px-3 py-1.5 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-primary"
        >
          {group === 'bill' ? 'Bill details' : 'Item line'}
        </th>
      </tr>
      {groupFields.map((field) => {
        const column = mapping[field.key]
        const example =
          column === undefined ? '' : cellText(rows[exampleRow]?.[column] as CellValue)
        const isMissing = missing.includes(field.key)
        return (
          <tr key={field.key} className="border-b border-border last:border-b-0">
            <th scope="row" className="px-3 py-2 text-left align-top">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-[0.875rem] font-medium">{field.label}</span>
                {required.has(field.key) ? (
                  <span className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-stamp">
                    Required
                  </span>
                ) : null}
                {isMissing ? (
                  <span className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-destructive">
                    Choose a column
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block max-w-[46ch] text-[0.75rem] leading-snug text-muted-foreground">
                {field.help}
              </span>
            </th>
            <td className="px-3 py-2 align-top">
              <select
                value={column ?? ''}
                onChange={(event) => {
                  if (event.target.value === '') onClear(field.key)
                  else onChange(field.key, Number(event.target.value))
                }}
                aria-label={`Column for ${field.label}`}
                className={cn(
                  'h-8 w-full max-w-[280px] border bg-background px-2 text-[0.8125rem] outline-none focus:border-primary',
                  isMissing ? 'border-destructive' : 'border-input'
                )}
              >
                <option value="">Not imported</option>
                {Array.from(
                  { length: range.endCol - range.startCol + 1 },
                  (_, index) => range.startCol + index
                ).map((col) => (
                  <option key={col} value={col}>
                    {columnLetter(col)} · {headerFor(rows, headerRow, col)}
                  </option>
                ))}
              </select>
            </td>
            <td className="px-3 py-2 align-top">
              <span
                className={cn(
                  'block max-w-[260px] truncate font-mono text-[0.75rem]',
                  example ? 'text-foreground/85' : 'text-muted-foreground'
                )}
                title={example}
              >
                {example || 'Empty'}
              </span>
            </td>
          </tr>
        )
      })}
    </>
  )
}

function OptionRow({
  id,
  checked,
  onChange,
  label,
  help
}: {
  id: string
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  help: string
}): React.JSX.Element {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 px-4 py-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-primary"
      />
      <span>
        <span className="block text-[0.875rem] font-medium">{label}</span>
        <span className="mt-0.5 block max-w-[65ch] text-[0.75rem] leading-snug text-muted-foreground">
          {help}
        </span>
      </span>
    </label>
  )
}

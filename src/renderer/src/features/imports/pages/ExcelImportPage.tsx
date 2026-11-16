import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import {
  activeSheet,
  canContinue,
  createInitialState,
  importReducer,
  nextBlockedReason,
  primaryLabel,
  stepIndex,
  type ImportStep
} from '@shared/excel-import/machine'
import { buildPlan, buildVoucherInput, partyKey, requestIdFor } from '@shared/excel-import/plan'
import type { ImportBill, ImportPlan, ImportTarget } from '@shared/excel-import/types'
import { ContextRail } from '../components/context-rail'
import { ImportStepper } from '../components/import-stepper'
import { MappingStep } from '../components/mapping-step'
import { RangeStep } from '../components/range-step'
import { ReviewStep } from '../components/review-step'
import { RunStep } from '../components/run-step'
import { UploadStep } from '../components/upload-step'
import { createDemoRuntime } from '../lib/demo-runtime'
import { appRuntime, isTauri, type ImportRuntime } from '../lib/runtime'
import { sampleWorkbook } from '../lib/sample-workbook'
import { downloadTemplate, readWorkbookFile } from '../lib/workbook'

const RUNTIME_TIMEOUT_MS = 30_000

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Could not read this file.'
}

/**
 * A local SQLite post should answer in well under a second. If an IPC call
 * never settles, fail that bill instead of leaving the whole import on
 * "Posting" forever. The request id is stable, so a retry cannot post twice.
 */
function withTimeout<T>(promise: Promise<T>, label: string, traceId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      logger.error(
        'import',
        'timeout',
        { label, timeoutMs: RUNTIME_TIMEOUT_MS },
        traceId,
        { message: `${label} did not respond within ${RUNTIME_TIMEOUT_MS / 1000} seconds.` }
      )
      reject(
        new Error(
          `${label} did not respond within ${RUNTIME_TIMEOUT_MS / 1000} seconds. This bill was stopped so the rest could continue.`
        )
      )
    }, RUNTIME_TIMEOUT_MS)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

export function ExcelImportPage({
  runtime: providedRuntime
}: {
  runtime?: ImportRuntime
}): React.JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const runtime = useMemo(
    () => providedRuntime ?? (isTauri() ? appRuntime : createDemoRuntime()),
    [providedRuntime]
  )
  const [state, dispatch] = useReducer(importReducer, undefined, () => createInitialState())
  const [readingFile, setReadingFile] = useState(false)
  const [runNonce, setRunNonce] = useState(0)
  const [createdCounts, setCreatedCounts] = useState({ parties: 0, items: 0 })
  const stateRef = useRef(state)
  const runningRef = useRef(false)
  const createdParties = useRef(new Map<string, number>())
  const createdItems = useRef(new Map<string, number>())

  const partiesQuery = useQuery({
    queryKey: ['import', 'parties', runtime.source],
    queryFn: () => runtime.listParties(),
    staleTime: 30_000
  })
  const itemsQuery = useQuery({
    queryKey: ['import', 'items', runtime.source],
    queryFn: () => runtime.listItems(),
    staleTime: 30_000
  })
  const companyQuery = useQuery({
    queryKey: ['import', 'company', runtime.source],
    queryFn: () => runtime.company(),
    staleTime: 5 * 60_000
  })

  const sheet = activeSheet(state)
  const companyState = companyQuery.data?.stateCode ?? '27'
  const roundOffMode = companyQuery.data?.roundOffMode ?? 'INVOICE'
  const parties = partiesQuery.data ?? []

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    logger.info('import', 'page.open', { source: runtime.source })
    return () => logger.info('import', 'page.close', { source: runtime.source })
  }, [runtime.source])

  // The plan is derived from the mapping and the masters. The machine holds the
  // last built plan so the import step and its guard read one source.
  useEffect(() => {
    if (state.step !== 'review') return
    if (!sheet || !state.selection || state.headerRow === null) return
    if (!partiesQuery.data || !itemsQuery.data || !companyQuery.data) return
    const plan = buildPlan({
      target: state.target,
      rows: sheet.rows,
      range: state.selection,
      headerRow: state.headerRow,
      mapping: state.mapping,
      options: state.options,
      parties: partiesQuery.data,
      items: itemsQuery.data,
      partyResolutions: state.partyResolutions,
      companyStateCode: companyState,
      roundOffMode
    })
    logger.info('import', 'plan.built', {
      target: state.target,
      bills: plan.stats.bills,
      lines: plan.stats.lines,
      errors: plan.stats.errors,
      warnings: plan.stats.warnings,
      canImport: plan.canImport,
      newParties: plan.stats.newParties,
      newItems: plan.stats.newItems
    })
    dispatch({ type: 'SET_PLAN', plan })
  }, [
    state.step,
    state.target,
    state.selection,
    state.headerRow,
    state.mapping,
    state.options,
    state.partyResolutions,
    partiesQuery.data,
    itemsQuery.data,
    companyQuery.data,
    companyState,
    roundOffMode,
    sheet
  ])

  // Posting runs once per import or retry. The guard survives StrictMode's
  // double mount and a double click on the primary button.
  useEffect(() => {
    if (state.step !== 'importing') return
    if (runningRef.current) return
    const current = stateRef.current
    const plan = current.plan
    if (!plan || !current.posting) return
    const activePlan = plan
    const queued = current.posting.bills.filter((bill) => bill.status === 'queued')
    if (queued.length === 0) {
      dispatch({ type: 'FINISHED' })
      return
    }
    runningRef.current = true
    const runTrace = logger.trace('import', 'run.start', {
      sessionId: current.sessionId,
      target: current.target,
      bills: queued.length,
      source: runtime.source
    })
    const runStarted = Date.now()
    let postedCount = 0
    let failedCount = 0

    async function ensureParty(
      bill: ImportBill,
      target: ImportTarget,
      traceId: string
    ): Promise<number> {
      if (bill.partyId) {
        logger.debug('import', 'party.matched', { partyId: bill.partyId }, traceId)
        return bill.partyId
      }
      if (bill.partyAction !== 'create') {
        throw new Error(
          `Choose a ${target === 'PURCHASE' ? 'supplier' : 'customer'} for ${bill.billNo ?? 'this bill'}.`
        )
      }
      const key = partyKey(bill.partyName, bill.partyGstin)
      const existing = createdParties.current.get(key)
      if (existing) {
        logger.debug('import', 'party.create.reuse', { key, partyId: existing }, traceId)
        return existing
      }
      logger.info('import', 'party.create.start', { key, name: bill.partyName }, traceId)
      try {
        const created = await withTimeout(
          runtime.createParty({
            name: bill.partyName,
            gstin: bill.partyGstin,
            stateCode: bill.placeOfSupply,
            isCustomer: target === 'SALES',
            isSupplier: target === 'PURCHASE',
            creditDays: 30,
            creditLimitMinor: 0,
            openingBalanceMinor: 0
          }),
          'Create party',
          traceId
        )
        createdParties.current.set(key, created.id)
        setCreatedCounts((current) => ({ ...current, parties: current.parties + 1 }))
        logger.info('import', 'party.create.ok', { key, partyId: created.id }, traceId)
        return created.id
      } catch (error) {
        logger.error('import', 'party.create.fail', { key }, traceId, {
          message: errorMessage(error)
        })
        throw error
      }
    }

    async function ensureItems(
      bill: ImportBill,
      target: ImportTarget,
      traceId: string
    ): Promise<Record<string, number>> {
      const map: Record<string, number> = {}
      for (const line of bill.lines) {
        if (!line.newItemKey) continue
        const key = line.newItemKey
        const existing = createdItems.current.get(key)
        if (existing) {
          map[key] = existing
          continue
        }
        const item = activePlan.newItems.find((row) => row.key === key)
        if (!item) continue
        logger.info('import', 'item.create.start', { key, name: item.name }, traceId)
        try {
          const created = await withTimeout(
            runtime.createItem({
              name: item.name,
              hsnSac: line.hsn,
              gstRateBps: item.gstRateBps,
              cessRateBps: 0,
              isService: false,
              salePriceMinor: target === 'SALES' ? line.rateMinor : 0,
              purchasePriceMinor: target === 'PURCHASE' ? line.rateMinor : 0,
              salePriceIncludesTax: false,
              purchasePriceIncludesTax: false,
              openingQtyE4: 0,
              openingRateMinor: 0,
              reorderLevelE4: 0
            }),
            'Create item',
            traceId
          )
          createdItems.current.set(key, created.id)
          setCreatedCounts((current) => ({ ...current, items: current.items + 1 }))
          map[key] = created.id
          logger.info('import', 'item.create.ok', { key, itemId: created.id }, traceId)
        } catch (error) {
          logger.error('import', 'item.create.fail', { key }, traceId, {
            message: errorMessage(error)
          })
          throw error
        }
      }
      return map
    }

    async function run(): Promise<void> {
      try {
        for (const runBill of queued) {
          dispatch({ type: 'BILL_PROGRESS', key: runBill.key, patch: { status: 'posting' } })
          const bill = activePlan.bills.find((row) => row.key === runBill.key)
          if (!bill) {
            logger.error('import', 'bill.missing', { billKey: runBill.key }, runTrace, {
              message: 'The bill disappeared from the plan.'
            })
            dispatch({
              type: 'BILL_PROGRESS',
              key: runBill.key,
              patch: { status: 'failed', error: 'The bill disappeared from the plan.' }
            })
            failedCount += 1
            continue
          }
          logger.info(
            'import',
            'bill.start',
            {
              billKey: runBill.key,
              billNo: bill.billNo,
              party: bill.partyName,
              lines: bill.lines.length
            },
            runTrace
          )
          try {
            const partyId = await ensureParty(bill, current.target, runTrace)
            const itemIds = await ensureItems(bill, current.target, runTrace)
            const input = buildVoucherInput(
              activePlan,
              bill,
              requestIdFor(current.sessionId, bill.key),
              partyId,
              itemIds
            )
            logger.info(
              'import',
              'bill.post.start',
              { requestId: input.requestId, lineCount: input.lines.length },
              runTrace
            )
            const started = Date.now()
            const result = await withTimeout(
              runtime.postVoucher(input),
              'Post voucher',
              runTrace
            )
            postedCount += 1
            logger.info(
              'import',
              'bill.post.ok',
              {
                requestId: input.requestId,
                id: result.id,
                number: result.number,
                durationMs: Date.now() - started
              },
              runTrace
            )
            dispatch({
              type: 'BILL_PROGRESS',
              key: runBill.key,
              patch: { status: 'posted', voucherId: result.id, number: result.number }
            })
          } catch (error) {
            failedCount += 1
            const code = (error as Error & { code?: string }).code
            logger.error(
              'import',
              'bill.fail',
              { billKey: runBill.key, code },
              runTrace,
              { message: errorMessage(error) }
            )
            dispatch({
              type: 'BILL_PROGRESS',
              key: runBill.key,
              patch: { status: 'failed', error: errorMessage(error), errorCode: code }
            })
          }
        }

        void queryClient.invalidateQueries({ queryKey: ['import', 'parties', runtime.source] })
        void queryClient.invalidateQueries({ queryKey: ['import', 'items', runtime.source] })
        if (runtime.source === 'app') {
          void queryClient.invalidateQueries({ queryKey: ['vouchers'] })
          void queryClient.invalidateQueries({ queryKey: ['parties'] })
          void queryClient.invalidateQueries({ queryKey: ['items'] })
        }
        logger.info(
          'import',
          'run.finish',
          { posted: postedCount, failed: failedCount, durationMs: Date.now() - runStarted },
          runTrace
        )
        dispatch({ type: 'FINISHED' })
      } catch (error) {
        logger.error('import', 'run.crash', {}, runTrace, { message: errorMessage(error) })
        dispatch({ type: 'FINISHED' })
      } finally {
        runningRef.current = false
      }
    }

    void run()
  }, [state.step, runNonce, runtime, queryClient])

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName ?? ''
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target?.isContentEditable) {
        return
      }
      if (
        event.key === 'Escape' &&
        state.step !== 'file' &&
        state.step !== 'importing' &&
        state.step !== 'done'
      ) {
        dispatch({ type: 'BACK' })
      }
      if (
        event.ctrlKey &&
        event.key === 'Enter' &&
        tag !== 'BUTTON' &&
        state.step !== 'importing' &&
        state.step !== 'done'
      ) {
        if (canContinue(stateRef.current)) dispatch({ type: 'NEXT' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.step])

  useEffect(() => {
    if (state.step !== 'importing') return
    const guard = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [state.step])

  async function onFile(file: File): Promise<void> {
    const traceId = logger.trace('import', 'file.read.start', {
      fileName: file.name,
      size: file.size
    })
    setReadingFile(true)
    try {
      const workbook = await readWorkbookFile(file)
      logger.end(traceId, 'info', 'import', 'file.read.ok', {
        fileName: file.name,
        sheets: workbook.sheets.length,
        sheetNames: workbook.sheets.map((sheet) => sheet.name)
      })
      dispatch({ type: 'FILE_LOADED', file: workbook })
    } catch (error) {
      logger.end(
        traceId,
        'error',
        'import',
        'file.read.fail',
        { fileName: file.name },
        { message: errorMessage(error) }
      )
      dispatch({ type: 'FILE_FAILED', message: errorMessage(error) })
    } finally {
      setReadingFile(false)
    }
  }

  function backTo(targetStep: ImportStep): void {
    const from = stepIndex(state.step)
    const to = stepIndex(targetStep)
    for (let index = 0; index < from - to; index += 1) dispatch({ type: 'BACK' })
  }

  function retry(): void {
    dispatch({ type: 'RETRY_FAILED' })
    setRunNonce((value) => value + 1)
  }

  function reset(): void {
    createdParties.current.clear()
    createdItems.current.clear()
    runningRef.current = false
    dispatch({ type: 'RESET' })
    setRunNonce(0)
    setCreatedCounts({ parties: 0, items: 0 })
  }

  const reason = nextBlockedReason(state)
  const showFooter = state.step !== 'done' && (state.step !== 'file' || state.file !== null)
  const plan: ImportPlan | null = state.plan
  const loadFailed = partiesQuery.isError || itemsQuery.isError || companyQuery.isError

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-6 pb-24">
      <PageHeader
        title="Import from Excel"
        description="Bring purchase bills or sales invoices from a spreadsheet. Pick the sheet, select the table, map the columns, check the rows, then import."
        actions={
          runtime.source === 'demo' ? (
            <span className="border border-warning/50 bg-warning-soft px-2 py-1 text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-warning">
              Demo data
            </span>
          ) : null
        }
      />

      {runtime.source === 'demo' ? (
        <p className="border border-warning/40 bg-warning-soft/40 px-3 py-2 text-[0.8125rem] text-warning">
          This browser preview uses sample parties and items. Posting is simulated. The real app
          writes vouchers to your books.
        </p>
      ) : null}

      {readingFile ? (
        <p
          role="status"
          className="flex items-center gap-2 border border-border bg-card px-3 py-2 text-[0.8125rem] text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.75} />
          Reading the workbook…
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[210px_minmax(0,1fr)_290px]">
        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <ImportStepper state={state} onBackTo={backTo} />
        </div>

        <div className="min-w-0">
          {state.step === 'file' ? (
            <UploadStep
              target={state.target}
              error={state.error}
              onTargetChange={(target) => dispatch({ type: 'SET_TARGET', target })}
              onFile={(file) => void onFile(file)}
              onSample={() => dispatch({ type: 'FILE_LOADED', file: sampleWorkbook() })}
              onTemplate={() => void downloadTemplate(state.target)}
              onDismissError={() => dispatch({ type: 'DISMISS_ERROR' })}
            />
          ) : null}

          {state.step === 'range' && sheet && state.selection ? (
            <RangeStep
              sheet={sheet}
              sheets={(state.file?.sheets ?? []).map((row) => ({
                name: row.name,
                rowCount: row.rowCount,
                colCount: row.colCount
              }))}
              range={state.selection}
              headerRow={state.headerRow}
              onSelectSheet={(name) => dispatch({ type: 'SELECT_SHEET', sheetName: name })}
              onRangeChange={(range) => dispatch({ type: 'SET_RANGE', range })}
              onHeaderRowChange={(headerRow) => dispatch({ type: 'SET_HEADER_ROW', headerRow })}
            />
          ) : null}

          {state.step === 'map' && sheet && state.selection ? (
            <MappingStep
              target={state.target}
              mapping={state.mapping}
              rows={sheet.rows}
              range={state.selection}
              headerRow={state.headerRow}
              options={state.options}
              onChange={(field, column) => dispatch({ type: 'SET_MAPPING', field, column })}
              onClear={(field) => dispatch({ type: 'CLEAR_MAPPING', field })}
              onOption={(key, value) => dispatch({ type: 'SET_OPTION', key, value })}
              onTargetChange={(target) => dispatch({ type: 'SET_TARGET', target })}
              onDownloadTemplate={() => void downloadTemplate(state.target)}
            />
          ) : null}

          {state.step === 'review' ? (
            plan ? (
              <ReviewStep
                plan={plan}
                target={state.target}
                parties={parties}
                partiesError={loadFailed}
                resolutions={state.partyResolutions}
                onResolution={(key, resolution) =>
                  dispatch({ type: 'SET_PARTY_RESOLUTION', key, resolution })
                }
                onRetryLoad={() => {
                  void partiesQuery.refetch()
                  void itemsQuery.refetch()
                  void companyQuery.refetch()
                }}
              />
            ) : (
              <div className="border border-border bg-card px-4 py-8">
                {loadFailed ? (
                  <div className="flex flex-col items-start gap-2">
                    <p className="text-[0.9375rem] font-medium text-destructive">
                      Could not load your company, parties and items.
                    </p>
                    <p className="text-[0.8125rem] text-muted-foreground">
                      The check needs them to match names and decide the tax.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void partiesQuery.refetch()
                        void itemsQuery.refetch()
                        void companyQuery.refetch()
                      }}
                    >
                      Try again
                    </Button>
                  </div>
                ) : (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-[0.875rem] text-muted-foreground"
                  >
                    <Loader2
                      className="size-4 animate-spin motion-reduce:animate-none"
                      strokeWidth={1.75}
                    />
                    Checking the rows…
                  </p>
                )}
              </div>
            )
          ) : null}

          {(state.step === 'importing' || state.step === 'done') && plan ? (
            <RunStep
              state={state}
              plan={plan}
              linkVouchers={runtime.source === 'app'}
              createdParties={createdCounts.parties}
              createdItems={createdCounts.items}
              onRetry={retry}
              onReset={reset}
              onViewList={() => navigate(state.target === 'PURCHASE' ? '/purchases' : '/sales')}
            />
          ) : null}
        </div>

        <ContextRail
          state={state}
          plan={plan}
          createdParties={createdCounts.parties}
          createdItems={createdCounts.items}
        />
      </div>

      {showFooter ? (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-rule-strong bg-background py-3">
          <div className="flex flex-wrap items-center gap-3">
            {state.step !== 'file' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => dispatch({ type: 'BACK' })}
                disabled={state.step === 'importing'}
              >
                <ArrowLeft className="size-3.5" strokeWidth={1.75} />
                Back
              </Button>
            ) : null}
            <p className="hidden font-mono text-[0.6875rem] text-muted-foreground sm:block">
              {state.step === 'review'
                ? 'Ctrl+Enter imports · Esc goes back'
                : 'Ctrl+Enter continues · Esc goes back'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {reason && state.step !== 'importing' ? (
              <span className="max-w-[46ch] text-right text-[0.75rem] leading-snug text-muted-foreground">
                {reason}
              </span>
            ) : null}
            {state.step !== 'importing' ? (
              <Button
                type="button"
                size="sm"
                className={cn(
                  state.target === 'PURCHASE' && 'bg-stamp text-paper hover:bg-stamp/90'
                )}
                onClick={() => dispatch({ type: 'NEXT' })}
                disabled={!canContinue(state)}
              >
                {primaryLabel(state)}
                <ArrowRight className="size-3.5" strokeWidth={1.75} />
              </Button>
            ) : (
              <span className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  strokeWidth={1.75}
                />
                Posting bills…
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

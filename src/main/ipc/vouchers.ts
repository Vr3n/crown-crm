import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import {
  cancelVoucherInputSchema,
  listVouchersInputSchema,
  outstandingInputSchema,
  postVoucherInputSchema,
  voucherIdSchema
} from '../../shared/contracts/vouchers'
import { postOpeningInputSchema } from '../../shared/contracts/masters'
import {
  cancelVoucher,
  getOutstanding,
  getVoucher,
  postOpeningBalances,
  postVoucher
} from '../application/vouchers'
import { currentCompanyId, requirePermission } from '../auth/session'
import { PERMISSIONS } from '../db/permissions'
import { voucherRepo } from '../repositories/vouchers'
import { handle } from './handle'

export function registerVouchersIpc(): void {
  handle(IPC_CHANNELS.VOUCHERS_POST, postVoucherInputSchema, (input) => postVoucher(input))

  handle(IPC_CHANNELS.VOUCHERS_GET, voucherIdSchema, (input) => {
    requirePermission(PERMISSIONS.VOUCHER_VIEW)
    return getVoucher(currentCompanyId(), input.id)
  })

  handle(IPC_CHANNELS.VOUCHERS_LIST, listVouchersInputSchema, (input) => {
    requirePermission(PERMISSIONS.VOUCHER_VIEW)
    return voucherRepo.list(currentCompanyId(), input)
  })

  handle(IPC_CHANNELS.VOUCHERS_CANCEL, cancelVoucherInputSchema, (input) => {
    cancelVoucher(currentCompanyId(), input.id, input.reason)
  })

  handle(IPC_CHANNELS.VOUCHERS_OUTSTANDING, outstandingInputSchema, (input) => {
    requirePermission(PERMISSIONS.REPORT_VIEW)
    return getOutstanding(currentCompanyId(), input)
  })

  handle(IPC_CHANNELS.VOUCHERS_POST_OPENING, postOpeningInputSchema, (input) =>
    postOpeningBalances(input.date)
  )
}

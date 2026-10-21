import { describe, it, expect } from 'vitest'
import { PaymentAllocationService } from '../../src/main/domain/finance'
import {
  PaymentOverAllocatedError,
  RefundExceedsPaymentError,
  CreditExceedsBalanceError
} from '../../src/main/domain/errors'

describe('PaymentAllocationService', () => {
  describe('calculateNetAllocated', () => {
    it('calculates net allocated as payments minus refunds', () => {
      const allocations = [{ amountMinor: 100000 }, { amountMinor: 50000 }]
      const refunds = [{ amountMinor: 20000 }]
      expect(PaymentAllocationService.calculateNetAllocated(allocations, refunds)).toBe(130000)
    })

    it('returns 0 for empty allocations', () => {
      expect(PaymentAllocationService.calculateNetAllocated([], [])).toBe(0)
    })

    it('handles refunds exceeding allocations', () => {
      const allocations = [{ amountMinor: 50000 }]
      const refunds = [{ amountMinor: 100000 }]
      expect(PaymentAllocationService.calculateNetAllocated(allocations, refunds)).toBe(-50000)
    })

    it('includes credit allocations in net calculation', () => {
      const allocations = [{ amountMinor: 50000 }]
      const refunds = [{ amountMinor: 10000 }]
      const creditAllocations = [{ amountMinor: 30000 }]
      expect(
        PaymentAllocationService.calculateNetAllocated(allocations, refunds, creditAllocations)
      ).toBe(70000)
    })

    it('handles credit allocations without refunds', () => {
      const allocations = [{ amountMinor: 50000 }]
      const creditAllocations = [{ amountMinor: 50000 }]
      expect(
        PaymentAllocationService.calculateNetAllocated(allocations, [], creditAllocations)
      ).toBe(100000)
    })

    it('defaults credit allocations to empty array', () => {
      const allocations = [{ amountMinor: 100000 }]
      const refunds = [{ amountMinor: 20000 }]
      expect(PaymentAllocationService.calculateNetAllocated(allocations, refunds)).toBe(80000)
    })
  })

  describe('calculateOutstanding', () => {
    it('calculates outstanding as total minus allocated, clamped to 0', () => {
      expect(PaymentAllocationService.calculateOutstanding(100000, 30000)).toBe(70000)
    })

    it('clamps to 0 when fully paid', () => {
      expect(PaymentAllocationService.calculateOutstanding(100000, 100000)).toBe(0)
    })

    it('clamps to 0 when overpaid', () => {
      expect(PaymentAllocationService.calculateOutstanding(100000, 150000)).toBe(0)
    })

    it('returns full amount when nothing allocated', () => {
      expect(PaymentAllocationService.calculateOutstanding(100000, 0)).toBe(100000)
    })
  })

  describe('deriveInvoiceStatus', () => {
    it('returns OPEN when nothing allocated', () => {
      expect(PaymentAllocationService.deriveInvoiceStatus(0, 100000)).toBe('OPEN')
    })

    it('returns PARTIALLY_PAID when partially paid', () => {
      expect(PaymentAllocationService.deriveInvoiceStatus(50000, 100000)).toBe('PARTIALLY_PAID')
    })

    it('returns PAID when fully paid', () => {
      expect(PaymentAllocationService.deriveInvoiceStatus(100000, 100000)).toBe('PAID')
    })

    it('returns PAID when overpaid', () => {
      expect(PaymentAllocationService.deriveInvoiceStatus(150000, 100000)).toBe('PAID')
    })
  })

  describe('validateAllocation', () => {
    it('passes when allocation is valid', () => {
      expect(() =>
        PaymentAllocationService.validateAllocation(100000, [], 50000, 100000)
      ).not.toThrow()
    })

    it('throws PaymentOverAllocatedError when exceeds payment', () => {
      expect(() => PaymentAllocationService.validateAllocation(50000, [], 60000, 100000)).toThrow(
        PaymentOverAllocatedError
      )
    })

    it('throws PaymentOverAllocatedError when existing + new exceeds payment', () => {
      expect(() =>
        PaymentAllocationService.validateAllocation(100000, [{ amountMinor: 80000 }], 30000, 100000)
      ).toThrow(PaymentOverAllocatedError)
    })

    it('throws PaymentOverAllocatedError when exceeds invoice outstanding', () => {
      expect(() => PaymentAllocationService.validateAllocation(100000, [], 80000, 50000)).toThrow(
        PaymentOverAllocatedError
      )
    })
  })

  describe('validateRefund', () => {
    it('passes when refund is within net paid', () => {
      expect(() => PaymentAllocationService.validateRefund(100000, 50000)).not.toThrow()
    })

    it('throws RefundExceedsPaymentError when exceeds net paid', () => {
      expect(() => PaymentAllocationService.validateRefund(50000, 100000)).toThrow(
        RefundExceedsPaymentError
      )
    })
  })

  describe('validateCreditApplication', () => {
    it('passes when within remaining balance', () => {
      expect(() => PaymentAllocationService.validateCreditApplication(100000, 50000)).not.toThrow()
    })

    it('throws CreditExceedsBalanceError when exceeds remaining', () => {
      expect(() => PaymentAllocationService.validateCreditApplication(50000, 100000)).toThrow(
        CreditExceedsBalanceError
      )
    })
  })

  describe('handleOverpayment', () => {
    it('returns full allocation when within outstanding', () => {
      const result = PaymentAllocationService.handleOverpayment(50000, 50000, 100000)
      expect(result).toEqual({ allocatedToInvoice: 50000, unallocatedRemainder: 0 })
    })

    it('caps allocation at outstanding and returns remainder', () => {
      const result = PaymentAllocationService.handleOverpayment(100000, 100000, 50000)
      expect(result).toEqual({ allocatedToInvoice: 50000, unallocatedRemainder: 50000 })
    })

    it('handles zero outstanding', () => {
      const result = PaymentAllocationService.handleOverpayment(100000, 100000, 0)
      expect(result).toEqual({ allocatedToInvoice: 0, unallocatedRemainder: 100000 })
    })
  })
})

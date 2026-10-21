import type {
  CancellationPolicyRow,
  CreateCancellationPolicyInput,
  CreateFreezePolicyInput,
  CreateProrationPolicyInput,
  FreezePolicyRow,
  PolicyLookupSet,
  ProrationPolicyRow,
  UpdateCancellationPolicyInput,
  UpdateFreezePolicyInput,
  UpdateProrationPolicyInput
} from '../../../../../shared/contracts/catalog'

/**
 * Policies IPC facade (wire shape). Policy admin is gated behind
 * `settings.manage`; lookups read under `plan.view` (ADR-0008, Module 03 §11).
 */
export const policiesApi = {
  listPolicyLookups(): Promise<PolicyLookupSet> {
    return window.api.catalog.listPolicyLookups()
  },

  createFreezePolicy(input: CreateFreezePolicyInput): Promise<FreezePolicyRow> {
    return window.api.catalog.createFreezePolicy(input)
  },

  updateFreezePolicy(input: UpdateFreezePolicyInput): Promise<FreezePolicyRow> {
    return window.api.catalog.updateFreezePolicy(input)
  },

  createProrationPolicy(input: CreateProrationPolicyInput): Promise<ProrationPolicyRow> {
    return window.api.catalog.createProrationPolicy(input)
  },

  updateProrationPolicy(input: UpdateProrationPolicyInput): Promise<ProrationPolicyRow> {
    return window.api.catalog.updateProrationPolicy(input)
  },

  createCancellationPolicy(input: CreateCancellationPolicyInput): Promise<CancellationPolicyRow> {
    return window.api.catalog.createCancellationPolicy(input)
  },

  updateCancellationPolicy(input: UpdateCancellationPolicyInput): Promise<CancellationPolicyRow> {
    return window.api.catalog.updateCancellationPolicy(input)
  }
}

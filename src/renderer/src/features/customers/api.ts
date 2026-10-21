import type { Customer } from './types'

/**
 * Thin IPC facade for the customers surface. Every method delegates to the
 * preload bridge (`window.api.customers.*`).
 */
export const api = {
  list: (): Promise<Customer[]> => window.api.customers.list() as unknown as Promise<Customer[]>,
  get: (id: string): Promise<Customer | undefined> =>
    window.api.customers.get({ customerId: id }) as unknown as Promise<Customer | undefined>
}

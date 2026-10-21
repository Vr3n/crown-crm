import { z } from 'zod'

export const blacklistPersonInputSchema = z.object({
  personId: z.number().int().positive(),
  reason: z.string().max(500).nullable()
})

export type BlacklistPersonInput = z.infer<typeof blacklistPersonInputSchema>

export const unblacklistPersonInputSchema = z.object({
  personId: z.number().int().positive()
})

export type UnblacklistPersonInput = z.infer<typeof unblacklistPersonInputSchema>

export const blacklistPersonResultSchema = z.object({
  personId: z.number().int().positive(),
  isBlacklisted: z.boolean()
})

export type BlacklistPersonResult = z.infer<typeof blacklistPersonResultSchema>

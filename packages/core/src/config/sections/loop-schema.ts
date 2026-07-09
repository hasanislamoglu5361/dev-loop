// packages/core/src/config/sections/loop-schema.ts

import { z } from 'zod';

export const loopSectionSchema = z.object({
  max_retry: z.number().int().positive().default(5),
  retry_delay_seconds: z.number().int().nonnegative().default(2),
  diff_aware: z.boolean().default(true),
  sandbox_mode: z.boolean().default(true),
  checkpoint: z.boolean().default(true),
  smart_retry: z.boolean().default(true),
  incremental_testing: z.boolean().default(true),
  idempotency_check: z.boolean().default(true),
  cost_budget_usd: z.number().positive().default(5.00),
  time_budget_minutes: z.number().positive().default(60),
  warmup_prompt: z.boolean().default(true),
  conversation_memory: z.boolean().default(true),
  uncertain_tag: z.string().default('TODO:UNCERTAIN'),
  uncertain_notify: z.boolean().default(true),
  auto_rollback: z.boolean().default(true),
}).default({});

export type LoopSection = z.infer<typeof loopSectionSchema>;
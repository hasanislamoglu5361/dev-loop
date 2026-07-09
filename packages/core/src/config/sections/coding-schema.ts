// packages/core/src/config/sections/coding-schema.ts
// Section schema: coding configuration

import { z } from 'zod';

const autoSelectDefaults = { enabled: true, prefer_local: true, prefer_cheapest: true, prefer_fastest: true, max_cost_per_1k_tokens: 0.002, auto_switch_on_repeated_failure: true, failure_threshold: 2, notify_on_switch: true, auto_confirm_switch: false };

export const codingSectionSchema = z.object({
  primary: z.object({
    provider: z.enum(['auto', 'openrouter', 'lmstudio', 'ollama', 'openai', 'anthropic']).default('auto'),
    model: z.string().default('auto'),
    api_key: z.string().optional(),
    temperature: z.number().min(0).max(2).default(0.2),
    max_tokens: z.number().positive().default(16384),
  }).default({}),
  auto_select: z.object({
    enabled: z.boolean().default(true),
    prefer_local: z.boolean().default(true),
    prefer_cheapest: z.boolean().default(true),
    prefer_fastest: z.boolean().default(true),
    max_cost_per_1k_tokens: z.number().positive().default(0.002),
    auto_switch_on_repeated_failure: z.boolean().default(true),
    failure_threshold: z.number().int().min(1).default(2),
    notify_on_switch: z.boolean().default(true),
    auto_confirm_switch: z.boolean().default(false),
  }).default({}),
  warm_state: z.boolean().default(true),
  warmup_prompt: z.boolean().default(true),
}).default({});

export type CodingSection = z.infer<typeof codingSectionSchema>;

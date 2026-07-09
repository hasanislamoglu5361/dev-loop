// packages/core/src/config/sections/planning-schema.ts
// Section schema: planning configuration

import { z } from 'zod';

export const planningSectionSchema = z.object({
  primary: z.object({
    provider: z.enum(['openrouter', 'lmstudio', 'ollama', 'openai', 'anthropic', 'google']).default('anthropic'),
    model: z.string().default('claude-sonnet-4-6'),
    api_key: z.string().default('${ANTHROPIC_API_KEY}'),
    temperature: z.number().min(0).max(2).default(0.3),
    max_tokens: z.number().positive().default(8192),
  }).default({}),
  auto_select: z.boolean().default(false),
  scoring: z.boolean().default(true),
}).default({});

export type PlanningSection = z.infer<typeof planningSectionSchema>;

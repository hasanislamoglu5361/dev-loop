// packages/core/src/config/sections/fallback-schema.ts

import { z } from 'zod';

export const fallbackSectionSchema = z.object({
  provider: z.enum(['claude-code-cli', 'codex-cli', 'api']).default('claude-code-cli'),
  model: z.string().optional(),
  api_key: z.string().optional(),
  effort: z.enum(['low', 'medium', 'high']).default('high'),
  max_attempts: z.number().int().min(1).default(1),
}).default({});

export type FallbackSection = z.infer<typeof fallbackSectionSchema>;

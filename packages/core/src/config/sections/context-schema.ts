// packages/core/src/config/sections/context-schema.ts

import { z } from 'zod';

export const contextSectionSchema = z.object({
  code_map: z.boolean().default(true),
  decisions: z.boolean().default(true),
  patterns: z.boolean().default(true),
  semantic_search: z.boolean().default(true),
  token_cache: z.boolean().default(true),
  max_context_tokens: z.number().positive().default(100000),
}).default({});

export type ContextSection = z.infer<typeof contextSectionSchema>;
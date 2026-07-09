// packages/core/src/config/sections/agents-schema.ts

import { z } from 'zod';

export const agentsSectionSchema = z.object({
  supervisor: z.boolean().default(true),
  specialized: z.object({
    planning: z.boolean().default(false),
    testing: z.boolean().default(false),
    refactoring: z.boolean().default(false),
    documentation: z.boolean().default(false),
    security: z.boolean().default(false),
  }).default({}),
}).default({});

export type AgentsSection = z.infer<typeof agentsSectionSchema>;
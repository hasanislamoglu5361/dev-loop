// packages/core/src/config/sections/mcp-schema.ts

import { z } from 'zod';

const serverDefaults = { auto_enable: false };

export const mcpSectionSchema = z.object({
  enabled: z.boolean().default(true),
  injection_detection: z.boolean().default(true),
  servers: z.array(z.object({
    name: z.string().default(''),
    command: z.string().default(''),
    args: z.array(z.string()).default([]),
    env: z.record(z.string()).optional(),
    auto_enable: z.boolean().default(false),
  }).default({})).default([]),
}).default({});

export type McpSection = z.infer<typeof mcpSectionSchema>;
// packages/core/src/config/sections/ui-schema.ts

import { z } from 'zod';

export const uiSectionSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3747),
  host: z.string().default('localhost'),
  open_browser: z.boolean().default(true),
  theme: z.enum(['dark', 'light', 'system']).default('dark'),
  real_time_updates: z.boolean().default(true),
}).default({});

export type UiSection = z.infer<typeof uiSectionSchema>;
// packages/core/src/config/sections/observability-schema.ts

import { z } from 'zod';

export const observabilitySectionSchema = z.object({
  anomaly_detection: z.boolean().default(true),
  sla_minutes: z.number().int().min(0).default(0),
  trend_analysis: z.boolean().default(true),
  export_formats: z.array(z.enum(['csv', 'pdf', 'json'])).default(['csv', 'pdf', 'json']),
  natural_language_queries: z.boolean().default(true),
}).default({});

export type ObservabilitySection = z.infer<typeof observabilitySectionSchema>;

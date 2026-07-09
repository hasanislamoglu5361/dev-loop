// packages/core/src/config/sections/benchmark-schema.ts

import { z } from 'zod';

export const benchmarkSectionSchema = z.object({
  vram_check: z.boolean().default(true),
  sequential_load: z.boolean().default(true),
  track_token_per_second: z.boolean().default(true),
}).default({});

export type BenchmarkSection = z.infer<typeof benchmarkSectionSchema>;
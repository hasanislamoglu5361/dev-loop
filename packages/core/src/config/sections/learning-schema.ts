// packages/core/src/config/sections/learning-schema.ts

import { z } from 'zod';

export const learningSectionSchema = z.object({
  error_patterns: z.object({ enabled: z.boolean().default(true), threshold: z.number().int().default(1), auto_inject: z.boolean().default(true), versioned: z.boolean().default(true) }).default({}),
  success_patterns: z.object({ enabled: z.boolean().default(true) }).default({}),
  model_calibration: z.object({ enabled: z.boolean().default(true), track_time_of_day: z.boolean().default(true), track_feature_type: z.boolean().default(true), track_language: z.boolean().default(true) }).default({}),
  cross_project: z.object({ enabled: z.boolean().default(false), export_path: z.string().optional() }).default({}),
  fine_tune_dataset: z.object({ enabled: z.boolean().default(false), output_path: z.string().optional() }).default({}),
  prompt_ab_testing: z.object({ enabled: z.boolean().default(false), min_samples: z.number().int().default(5) }).default({}),
}).default({});

export type LearningSection = z.infer<typeof learningSectionSchema>;
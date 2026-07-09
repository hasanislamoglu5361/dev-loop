// packages/core/src/config/sections/test-runner-schema.ts

import { z } from 'zod';

export const testRunnerSectionSchema = z.object({
  type: z.enum(['command', 'docker', 'none']).default('command'),
  command: z.string().default('pytest'),
  args: z.array(z.string()).default(['-v', '--tb=short']),
  timeout_seconds: z.number().int().positive().default(300),
  compose_file: z.string().optional(),
  service: z.string().optional(),
}).default({});

export type TestRunnerSection = z.infer<typeof testRunnerSectionSchema>;
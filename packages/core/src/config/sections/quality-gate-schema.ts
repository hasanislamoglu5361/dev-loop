// packages/core/src/config/sections/quality-gate-schema.ts

import { z } from 'zod';

const checksDefaults = { test_coverage_min: 80, complexity_max: 10, secrets: true, vulnerabilities: true, mcp_score_min: 0, uncertain_tags: true, lint: true, type_coverage_min: 0 };

export const qualityGateSectionSchema = z.object({
  enabled: z.boolean().default(true),
  block_commit_on_failure: z.boolean().default(true),
  checks: z.object({
    test_coverage_min: z.number().min(0).default(80),
    complexity_max: z.number().int().min(0).default(10),
    secrets: z.boolean().default(true),
    vulnerabilities: z.boolean().default(true),
    mcp_score_min: z.number().min(0).max(100).default(0),
    uncertain_tags: z.boolean().default(true),
    lint: z.boolean().default(true),
    type_coverage_min: z.number().min(0).default(0),
  }).default({}),
}).default({});

export type QualityGateSection = z.infer<typeof qualityGateSectionSchema>;
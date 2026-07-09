// packages/core/src/config/schema.ts
// Zod runtime schema validation for dev-loop.yaml configuration

import { z } from 'zod';
import { agentsSectionSchema } from './sections/agents-schema.js';
import { benchmarkSectionSchema } from './sections/benchmark-schema.js';
import { codingSectionSchema } from './sections/coding-schema.js';
import { contextSectionSchema } from './sections/context-schema.js';
import { fallbackSectionSchema } from './sections/fallback-schema.js';
import { gitSectionSchema } from './sections/git-schema.js';
import { integrationsSectionSchema } from './sections/integrations-schema.js';
import { learningSectionSchema } from './sections/learning-schema.js';
import { loopSectionSchema } from './sections/loop-schema.js';
import { mcpSectionSchema } from './sections/mcp-schema.js';
import { notificationsSectionSchema } from './sections/notifications-schema.js';
import { observabilitySectionSchema } from './sections/observability-schema.js';
import { planningSectionSchema } from './sections/planning-schema.js';
import { qualityGateSectionSchema } from './sections/quality-gate-schema.js';
import { testRunnerSectionSchema } from './sections/test-runner-schema.js';
import { uiSectionSchema } from './sections/ui-schema.js';
import { verifierSectionSchema } from './sections/verifier-schema.js';
import { voiceSectionSchema } from './sections/voice-schema.js';

export const ConfigSchema = z.object({
  version: z.string().default('1'),
  planning: planningSectionSchema,
  coding: codingSectionSchema,
  verifier: verifierSectionSchema,
  fallback: fallbackSectionSchema,
  loop: loopSectionSchema,
  test_runner: testRunnerSectionSchema,
  quality_gate: qualityGateSectionSchema,
  mcp: mcpSectionSchema,
  context: contextSectionSchema,
  learning: learningSectionSchema,
  benchmark: benchmarkSectionSchema,
  notifications: notificationsSectionSchema,
  integrations: integrationsSectionSchema,
  git: gitSectionSchema,
  agents: agentsSectionSchema,
  ui: uiSectionSchema,
  voice: voiceSectionSchema,
  observability: observabilitySectionSchema,
});

export type DevLoopConfig = z.infer<typeof ConfigSchema>;

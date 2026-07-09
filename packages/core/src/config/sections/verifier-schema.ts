// packages/core/src/config/sections/verifier-schema.ts

import { z } from 'zod';

const effortDefaults = { default: 'medium', auto_adjust: true, low: { context: ['diff', 'bugs'], max_tokens: 2048, thinking: false }, medium: { context: ['diff', 'bugs', 'features'], max_tokens: 8192, thinking: false }, high: { context: ['diff', 'bugs', 'features', 'full_source'], max_tokens: 32768, thinking: true } };

export const verifierSectionSchema = z.object({
  provider: z.enum(['claude-cli', 'codex-cli', 'claude-code-cli', 'api']).default('claude-code-cli'),
  model: z.string().default('claude-sonnet-4-6'),
  api_key: z.string().optional(),
  effort: z.object({
    default: z.enum(['low', 'medium', 'high']).default('medium'),
    auto_adjust: z.boolean().default(true),
    low: z.object({ context: z.array(z.string()), max_tokens: z.number(), thinking: z.boolean() }).default(effortDefaults.low),
    medium: z.object({ context: z.array(z.string()), max_tokens: z.number(), thinking: z.boolean() }).default(effortDefaults.medium),
    high: z.object({ context: z.array(z.string()), max_tokens: z.number(), thinking: z.boolean() }).default(effortDefaults.high),
  }).default({}),
  rotation: z.object({ enabled: z.boolean().default(false), verifiers: z.array(z.any()).default([]), strategy: z.enum(['round-robin', 'best-score', 'random']).default('round-robin') }).default({}),
  parallel: z.object({ enabled: z.boolean().default(false), require_all_pass: z.boolean().default(true) }).default({}),
  confidence_score: z.object({ enabled: z.boolean().default(true), notify_below: z.number().min(0).max(1).default(0.7) }).default({}),
  asymmetric: z.object({ enabled: z.boolean().default(true), risk_threshold: z.number().default(0.4), cheap_verifier: z.string().default('codex-cli'), expensive_verifier: z.string().default('claude-code-cli') }).default({}),
}).default({});

export type VerifierSection = z.infer<typeof verifierSectionSchema>;

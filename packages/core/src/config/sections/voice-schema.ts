// packages/core/src/config/sections/voice-schema.ts

import { z } from 'zod';

export const voiceSectionSchema = z.object({
  enabled: z.boolean().default(false),
  model: z.enum(['tiny', 'base', 'small', 'medium', 'large']).default('base'),
  language: z.string().default('en'),
}).default({});

export type VoiceSection = z.infer<typeof voiceSectionSchema>;
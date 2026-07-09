// packages/core/src/config/sections/git-schema.ts

import { z } from 'zod';

export const gitSectionSchema = z.object({
  auto_commit: z.boolean().default(true),
  commit_prefix: z.string().default('feat'),
  commit_message_template: z.string().default('{prefix}: {feature_summary}'),
  sign_commits: z.boolean().default(false),
  auto_changelog: z.boolean().default(true),
  semantic_versioning: z.boolean().default(true),
}).default({});

export type GitSection = z.infer<typeof gitSectionSchema>;
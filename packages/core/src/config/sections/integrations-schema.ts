// packages/core/src/config/sections/integrations-schema.ts

import { z } from 'zod';

export const integrationsSectionSchema = z.object({
  github: z.object({ enabled: z.boolean().default(false), token: z.string().optional(), owner: z.string().optional(), repo: z.string().optional(), auto_pr: z.boolean().default(true), auto_branch: z.boolean().default(true), branch_prefix: z.string().default('feature/') }).default({}),
  jira: z.object({ enabled: z.boolean().default(false), url: z.string().optional(), email: z.string().optional(), token: z.string().optional(), project_key: z.string().optional(), comment_on_done: z.boolean().default(true), watch_for_new_tickets: z.boolean().default(true), collision_check: z.boolean().default(true) }).default({}),
  linear: z.object({ enabled: z.boolean().default(false), api_key: z.string().optional(), team_id: z.string().optional(), watch_for_new_tickets: z.boolean().default(true) }).default({}),
  notion: z.object({ enabled: z.boolean().default(false), token: z.string().optional(), database_id: z.string().optional() }).default({}),
  postman: z.object({ enabled: z.boolean().default(false), api_key: z.string().optional(), collection_id: z.string().optional(), environment_id: z.string().optional(), smoke_test_on_success: z.boolean().default(true) }).default({}),
  obsidian: z.object({ enabled: z.boolean().default(false), vault_path: z.string().optional(), sync_decisions: z.boolean().default(true), sync_code_map: z.boolean().default(true) }).default({}),
  calendar: z.object({ enabled: z.boolean().default(false), provider: z.enum(['google', 'outlook']).default('google'), credentials: z.string().optional() }).default({}),
}).default({});

export type IntegrationsSection = z.infer<typeof integrationsSectionSchema>;
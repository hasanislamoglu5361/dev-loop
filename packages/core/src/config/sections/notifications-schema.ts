// packages/core/src/config/sections/notifications-schema.ts

import { z } from 'zod';

export const notificationsSectionSchema = z.object({
  telegram: z.object({ enabled: z.boolean().default(false), bot_token: z.string().optional(), chat_id: z.string().optional(), events: z.array(z.string()).default([]) }).default({}),
  slack: z.object({ enabled: z.boolean().default(false), webhook_url: z.string().optional(), events: z.array(z.string()).default([]) }).default({}),
  email: z.object({ enabled: z.boolean().default(false), host: z.string().optional(), port: z.number().int().default(587), user: z.string().optional(), pass: z.string().optional(), from: z.string().optional(), to: z.string().optional(), scheduled_digest: z.object({ enabled: z.boolean().default(false), cron: z.string().default('0 8 * * 1') }).default({}) }).default({}),
  desktop: z.object({ enabled: z.boolean().default(true), events: z.array(z.string()).default(['success', 'failure']) }).default({}),
  sound: z.object({ enabled: z.boolean().default(false), success_file: z.string().optional(), failure_file: z.string().optional() }).default({}),
}).default({});

export type NotificationsSection = z.infer<typeof notificationsSectionSchema>;
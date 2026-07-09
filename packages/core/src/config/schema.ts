// packages/core/src/config/schema.ts
// Zod runtime schema validation for dev-loop.yaml configuration

import { z } from 'zod';

export const ConfigSchema = z.object({
  version: z.string().default('1'),

  planning: z.object({
    primary: z.object({
      provider: z.enum(['openrouter', 'lmstudio', 'ollama', 'openai', 'anthropic', 'google']),
      model: z.string(),
      api_key: z.string(),
      temperature: z.number().min(0).max(2),
      max_tokens: z.number().positive(),
    }),
    auto_select: z.boolean(),
    scoring: z.boolean(),
  }).default({
    primary: { provider: 'anthropic', model: 'claude-sonnet-4-6', api_key: '${ANTHROPIC_API_KEY}', temperature: 0.3, max_tokens: 8192 },
    auto_select: false, scoring: true,
  }),

  coding: z.object({
    primary: z.object({
      provider: z.enum(['auto', 'openrouter', 'lmstudio', 'ollama', 'openai', 'anthropic']),
      model: z.string(),
      api_key: z.string().optional(),
      temperature: z.number().min(0).max(2),
      max_tokens: z.number().positive(),
    }).default({ provider: 'auto', model: 'auto', temperature: 0.2, max_tokens: 16384 }),
    auto_select: z.object({
      enabled: z.boolean(),
      prefer_local: z.boolean(),
      prefer_cheapest: z.boolean(),
      prefer_fastest: z.boolean(),
      max_cost_per_1k_tokens: z.number().positive(),
      auto_switch_on_repeated_failure: z.boolean(),
      failure_threshold: z.number().int().min(1),
      notify_on_switch: z.boolean(),
      auto_confirm_switch: z.boolean(),
    }).default({ enabled: true, prefer_local: true, prefer_cheapest: true, prefer_fastest: true, max_cost_per_1k_tokens: 0.002, auto_switch_on_repeated_failure: true, failure_threshold: 2, notify_on_switch: true, auto_confirm_switch: false }),
    warm_state: z.boolean().default(true),
    warmup_prompt: z.boolean().default(true),
  }).default({}),

  verifier: z.object({
    provider: z.enum(['claude-cli', 'codex-cli', 'claude-code-cli', 'api']).default('claude-code-cli'),
    model: z.string().default('claude-sonnet-4-6'),
    api_key: z.string().optional(),
    effort: z.object({
      default: z.enum(['low', 'medium', 'high']),
      auto_adjust: z.boolean(),
      low: z.object({ context: z.array(z.string()), max_tokens: z.number(), thinking: z.boolean() }),
      medium: z.object({ context: z.array(z.string()), max_tokens: z.number(), thinking: z.boolean() }),
      high: z.object({ context: z.array(z.string()), max_tokens: z.number(), thinking: z.boolean() }),
    }).default({
      default: 'medium', auto_adjust: true,
      low: { context: ['diff', 'bugs'], max_tokens: 2048, thinking: false },
      medium: { context: ['diff', 'bugs', 'features'], max_tokens: 8192, thinking: false },
      high: { context: ['diff', 'bugs', 'features', 'full_source'], max_tokens: 32768, thinking: true },
    }),
    rotation: z.object({ enabled: z.boolean(), verifiers: z.array(z.any()), strategy: z.enum(['round-robin', 'best-score', 'random']) }).default({ enabled: false, verifiers: [], strategy: 'round-robin' }),
    parallel: z.object({ enabled: z.boolean(), require_all_pass: z.boolean() }).default({ enabled: false, require_all_pass: true }),
    confidence_score: z.object({ enabled: z.boolean(), notify_below: z.number().min(0).max(1) }).default({ enabled: true, notify_below: 0.7 }),
    asymmetric: z.object({ enabled: z.boolean(), risk_threshold: z.number(), cheap_verifier: z.string(), expensive_verifier: z.string() }).default({ enabled: true, risk_threshold: 0.4, cheap_verifier: 'codex-cli', expensive_verifier: 'claude-code-cli' }),
  }).default({}),

  fallback: z.object({
    provider: z.enum(['claude-code-cli', 'codex-cli', 'api']).default('claude-code-cli'),
    model: z.string().optional(),
    api_key: z.string().optional(),
    effort: z.enum(['low', 'medium', 'high']).default('high'),
    max_attempts: z.number().int().min(1).default(1),
  }).default({}),

  loop: z.object({
    max_retry: z.number().int().positive(),
    retry_delay_seconds: z.number().int().nonnegative(),
    diff_aware: z.boolean(),
    sandbox_mode: z.boolean(),
    checkpoint: z.boolean(),
    smart_retry: z.boolean(),
    incremental_testing: z.boolean(),
    idempotency_check: z.boolean(),
    cost_budget_usd: z.number().positive(),
    time_budget_minutes: z.number().positive(),
    warmup_prompt: z.boolean(),
    conversation_memory: z.boolean(),
    uncertain_tag: z.string(),
    uncertain_notify: z.boolean(),
    auto_rollback: z.boolean(),
  }).default({
    max_retry: 5, retry_delay_seconds: 2, diff_aware: true, sandbox_mode: true, checkpoint: true,
    smart_retry: true, incremental_testing: true, idempotency_check: true, cost_budget_usd: 5.00,
    time_budget_minutes: 60, warmup_prompt: true, conversation_memory: true, uncertain_tag: 'TODO:UNCERTAIN',
    uncertain_notify: true, auto_rollback: true,
  }),

  test_runner: z.object({
    type: z.enum(['command', 'docker', 'none']),
    command: z.string(),
    args: z.array(z.string()),
    timeout_seconds: z.number().int().positive(),
    compose_file: z.string().optional(),
    service: z.string().optional(),
  }).default({ type: 'command', command: 'pytest', args: ['-v', '--tb=short'], timeout_seconds: 300 }),

  quality_gate: z.object({
    enabled: z.boolean(),
    block_commit_on_failure: z.boolean(),
    checks: z.object({
      test_coverage_min: z.number().min(0),
      complexity_max: z.number().int().min(0),
      secrets: z.boolean(),
      vulnerabilities: z.boolean(),
      mcp_score_min: z.number().min(0).max(100),
      uncertain_tags: z.boolean(),
      lint: z.boolean(),
      type_coverage_min: z.number().min(0),
    }).default({
      test_coverage_min: 80, complexity_max: 10, secrets: true, vulnerabilities: true,
      mcp_score_min: 0, uncertain_tags: true, lint: true, type_coverage_min: 0,
    }),
  }).default({
    enabled: true,
    block_commit_on_failure: true,
    checks: {
      test_coverage_min: 80,
      complexity_max: 10,
      secrets: true,
      vulnerabilities: true,
      mcp_score_min: 0,
      uncertain_tags: true,
      lint: true,
      type_coverage_min: 0,
    },
  }),

  mcp: z.object({
    enabled: z.boolean(),
    injection_detection: z.boolean(),
    servers: z.array(z.object({
      name: z.string(),
      command: z.string(),
      args: z.array(z.string()),
      env: z.record(z.string()).optional(),
      auto_enable: z.boolean().default(false),
    })),
  }).default({ enabled: true, injection_detection: true, servers: [] }),

  context: z.object({
    code_map: z.boolean(),
    decisions: z.boolean(),
    patterns: z.boolean(),
    semantic_search: z.boolean(),
    token_cache: z.boolean(),
    max_context_tokens: z.number().positive(),
  }).default({ code_map: true, decisions: true, patterns: true, semantic_search: true, token_cache: true, max_context_tokens: 100000 }),

  learning: z.object({
    error_patterns: z.object({ enabled: z.boolean(), threshold: z.number().int(), auto_inject: z.boolean(), versioned: z.boolean() }).default({ enabled: true, threshold: 1, auto_inject: true, versioned: true }),
    success_patterns: z.object({ enabled: z.boolean() }).default({ enabled: true }),
    model_calibration: z.object({ enabled: z.boolean(), track_time_of_day: z.boolean(), track_feature_type: z.boolean(), track_language: z.boolean() }).default({ enabled: true, track_time_of_day: true, track_feature_type: true, track_language: true }),
    cross_project: z.object({ enabled: z.boolean(), export_path: z.string().optional() }).default({ enabled: false }),
    fine_tune_dataset: z.object({ enabled: z.boolean(), output_path: z.string().optional() }).default({ enabled: false }),
    prompt_ab_testing: z.object({ enabled: z.boolean(), min_samples: z.number().int() }).default({ enabled: false, min_samples: 5 }),
  }).default({}),

  benchmark: z.object({ vram_check: z.boolean(), sequential_load: z.boolean(), track_token_per_second: z.boolean() }).default({ vram_check: true, sequential_load: true, track_token_per_second: true }),

  notifications: z.object({
    telegram: z.object({ enabled: z.boolean(), bot_token: z.string().optional(), chat_id: z.string().optional(), events: z.array(z.string()) }).default({ enabled: false, bot_token: '', chat_id: '', events: [] }),
    slack: z.object({ enabled: z.boolean(), webhook_url: z.string().optional(), events: z.array(z.string()) }).default({ enabled: false, webhook_url: '', events: [] }),
    email: z.object({ enabled: z.boolean(), host: z.string().optional(), port: z.number().int(), user: z.string().optional(), pass: z.string().optional(), from: z.string().optional(), to: z.string().optional(), scheduled_digest: z.object({ enabled: z.boolean(), cron: z.string() }).default({ enabled: false, cron: '0 8 * * 1' }) }).default({ enabled: false, host: '', port: 587, user: '', pass: '', from: '', to: '', scheduled_digest: { enabled: false, cron: '0 8 * * 1' } }),
    desktop: z.object({ enabled: z.boolean(), events: z.array(z.string()) }).default({ enabled: true, events: ['success', 'failure'] }),
    sound: z.object({ enabled: z.boolean(), success_file: z.string().optional(), failure_file: z.string().optional() }).default({ enabled: false, success_file: '', failure_file: '' }),
  }).default({}),

  integrations: z.object({
    github: z.object({ enabled: z.boolean(), token: z.string().optional(), owner: z.string().optional(), repo: z.string().optional(), auto_pr: z.boolean(), auto_branch: z.boolean(), branch_prefix: z.string() }).default({ enabled: false, token: '', owner: '', repo: '', auto_pr: true, auto_branch: true, branch_prefix: 'feature/' }),
    jira: z.object({ enabled: z.boolean(), url: z.string().optional(), email: z.string().optional(), token: z.string().optional(), project_key: z.string().optional(), comment_on_done: z.boolean(), watch_for_new_tickets: z.boolean(), collision_check: z.boolean() }).default({ enabled: false, url: '', email: '', token: '', project_key: '', comment_on_done: true, watch_for_new_tickets: true, collision_check: true }),
    linear: z.object({ enabled: z.boolean(), api_key: z.string().optional(), team_id: z.string().optional(), watch_for_new_tickets: z.boolean() }).default({ enabled: false, api_key: '', team_id: '', watch_for_new_tickets: true }),
    notion: z.object({ enabled: z.boolean(), token: z.string().optional(), database_id: z.string().optional() }).default({ enabled: false, token: '', database_id: '' }),
    postman: z.object({ enabled: z.boolean(), api_key: z.string().optional(), collection_id: z.string().optional(), environment_id: z.string().optional(), smoke_test_on_success: z.boolean() }).default({ enabled: false, api_key: '', collection_id: '', environment_id: '', smoke_test_on_success: true }),
    obsidian: z.object({ enabled: z.boolean(), vault_path: z.string().optional(), sync_decisions: z.boolean(), sync_code_map: z.boolean() }).default({ enabled: false, vault_path: '', sync_decisions: true, sync_code_map: true }),
    calendar: z.object({ enabled: z.boolean(), provider: z.enum(['google', 'outlook']), credentials: z.string().optional() }).default({ enabled: false, provider: 'google', credentials: '' }),
  }).default({}),

  git: z.object({ auto_commit: z.boolean(), commit_prefix: z.string(), commit_message_template: z.string(), sign_commits: z.boolean(), auto_changelog: z.boolean(), semantic_versioning: z.boolean() }).default({ auto_commit: true, commit_prefix: 'feat', commit_message_template: '{prefix}: {feature_summary}', sign_commits: false, auto_changelog: true, semantic_versioning: true }),

  agents: z.object({
    supervisor: z.boolean().default(true),
    specialized: z.object({ planning: z.boolean(), testing: z.boolean(), refactoring: z.boolean(), documentation: z.boolean(), security: z.boolean() }).default({ planning: false, testing: false, refactoring: false, documentation: false, security: false }),
  }).default({
    supervisor: true,
    specialized: {
      planning: false,
      testing: false,
      refactoring: false,
      documentation: false,
      security: false,
    },
  }),

  ui: z.object({ port: z.number().int().min(1).max(65535), host: z.string(), open_browser: z.boolean(), theme: z.enum(['dark', 'light', 'system']), real_time_updates: z.boolean() }).default({ port: 3747, host: 'localhost', open_browser: true, theme: 'dark', real_time_updates: true }),

  voice: z.object({ enabled: z.boolean(), model: z.enum(['tiny', 'base', 'small', 'medium', 'large']), language: z.string() }).default({ enabled: false, model: 'base', language: 'en' }),

  observability: z.object({
    anomaly_detection: z.boolean(),
    sla_minutes: z.number().int().min(0),
    trend_analysis: z.boolean(),
    export_formats: z.array(z.enum(['csv', 'pdf', 'json'])).default(['csv', 'pdf', 'json']),
    natural_language_queries: z.boolean(),
  }).default({ anomaly_detection: true, sla_minutes: 0, trend_analysis: true, export_formats: ['csv', 'pdf', 'json'], natural_language_queries: true }),
});

export type DevLoopConfig = z.infer<typeof ConfigSchema>;

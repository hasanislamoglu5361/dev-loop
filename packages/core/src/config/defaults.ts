// packages/core/src/config/defaults.ts
// Default configuration values matching spec defaults

import type { DevLoopConfig } from './schema.js';

export const DEFAULT_CONFIG: DevLoopConfig = {
  version: '1',

  planning: {
    primary: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      api_key: '${ANTHROPIC_API_KEY}',
      temperature: 0.3,
      max_tokens: 8192,
    },
    auto_select: false,
    scoring: true,
  },

  coding: {
    primary: {
      provider: 'auto',
      model: 'auto',
      temperature: 0.2,
      max_tokens: 16384,
    },
    auto_select: {
      enabled: true,
      prefer_local: true,
      prefer_cheapest: true,
      prefer_fastest: true,
      max_cost_per_1k_tokens: 0.002,
      auto_switch_on_repeated_failure: true,
      failure_threshold: 2,
      notify_on_switch: true,
      auto_confirm_switch: false,
    },
    warm_state: true,
    warmup_prompt: true,
  },

  verifier: {
    provider: 'claude-code-cli',
    model: 'claude-sonnet-4-6',
    effort: {
      default: 'medium',
      auto_adjust: true,
      low: { context: ['diff', 'bugs'], max_tokens: 2048, thinking: false },
      medium: { context: ['diff', 'bugs', 'features'], max_tokens: 8192, thinking: false },
      high: { context: ['diff', 'bugs', 'features', 'full_source'], max_tokens: 32768, thinking: true },
    },
    rotation: { enabled: false, verifiers: [], strategy: 'round-robin' },
    parallel: { enabled: false, require_all_pass: true },
    confidence_score: { enabled: true, notify_below: 0.7 },
    asymmetric: {
      enabled: true,
      risk_threshold: 0.4,
      cheap_verifier: 'codex-cli',
      expensive_verifier: 'claude-code-cli',
    },
  },

  fallback: {
    provider: 'claude-code-cli',
    effort: 'high',
    max_attempts: 1,
  },

  loop: {
    max_retry: 5,
    retry_delay_seconds: 2,
    diff_aware: true,
    sandbox_mode: true,
    checkpoint: true,
    smart_retry: true,
    incremental_testing: true,
    idempotency_check: true,
    cost_budget_usd: 5.00,
    time_budget_minutes: 60,
    warmup_prompt: true,
    conversation_memory: true,
    uncertain_tag: 'TODO:UNCERTAIN',
    uncertain_notify: true,
    auto_rollback: true,
  },

  test_runner: {
    type: 'command',
    command: 'pytest',
    args: ['-v', '--tb=short'],
    timeout_seconds: 300,
  },

  quality_gate: {
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
  },

  mcp: {
    enabled: true,
    injection_detection: true,
    servers: [],
  },

  context: {
    code_map: true,
    decisions: true,
    patterns: true,
    semantic_search: true,
    token_cache: true,
    max_context_tokens: 100000,
  },

  learning: {
    error_patterns: { enabled: true, threshold: 1, auto_inject: true, versioned: true },
    success_patterns: { enabled: true },
    model_calibration: { enabled: true, track_time_of_day: true, track_feature_type: true, track_language: true },
    cross_project: { enabled: false },
    fine_tune_dataset: { enabled: false },
    prompt_ab_testing: { enabled: false, min_samples: 5 },
  },

  benchmark: { vram_check: true, sequential_load: true, track_token_per_second: true },

  notifications: {
    telegram: { enabled: false, bot_token: '', chat_id: '', events: [] },
    slack: { enabled: false, webhook_url: '', events: [] },
    email: {
      enabled: false,
      host: '',
      port: 587,
      user: '',
      pass: '',
      from: '',
      to: '',
      scheduled_digest: { enabled: false, cron: '0 8 * * 1' },
    },
    desktop: { enabled: true, events: ['success', 'failure'] },
    sound: { enabled: false, success_file: '', failure_file: '' },
  },

  integrations: {
    github: { enabled: false, token: '', owner: '', repo: '', auto_pr: true, auto_branch: true, branch_prefix: 'feature/' },
    jira: { enabled: false, url: '', email: '', token: '', project_key: '', comment_on_done: true, watch_for_new_tickets: true, collision_check: true },
    linear: { enabled: false, api_key: '', team_id: '', watch_for_new_tickets: true },
    notion: { enabled: false, token: '', database_id: '' },
    postman: { enabled: false, api_key: '', collection_id: '', environment_id: '', smoke_test_on_success: true },
    obsidian: { enabled: false, vault_path: '', sync_decisions: true, sync_code_map: true },
    calendar: { enabled: false, provider: 'google', credentials: '' },
  },

  git: {
    auto_commit: true,
    commit_prefix: 'feat',
    commit_message_template: '{prefix}: {feature_summary}',
    sign_commits: false,
    auto_changelog: true,
    semantic_versioning: true,
  },

  agents: {
    supervisor: true,
    specialized: { planning: false, testing: false, refactoring: false, documentation: false, security: false },
  },

  ui: {
    port: 3747,
    host: 'localhost',
    open_browser: true,
    theme: 'dark',
    real_time_updates: true,
  },

  voice: { enabled: false, model: 'base', language: 'en' },

  observability: {
    anomaly_detection: true,
    sla_minutes: 0,
    trend_analysis: true,
    export_formats: ['csv', 'pdf', 'json'],
    natural_language_queries: true,
  },
};

export const MODEL_PRICING = {
  // OpenRouter pricing per 1K tokens (input/output)
  openrouter: {
    'deepseek/deepseek-r1': { input: 0.0009, output: 0.0054 },
    'qwen/qwen-2.5-coder-32b': { input: 0.0008, output: 0.002 },
    'meta-llama/llama-3.3-70b-instruct': { input: 0.0009, output: 0.0015 },
    'anthropic/claude-sonnet-4-6': { input: 0.003, output: 0.015 },
    'anthropic/claude-opus-4-6': { input: 0.005, output: 0.025 },
    'openai/gpt-4o': { input: 0.0025, output: 0.01 },
    'google/gemini-pro-1.5': { input: 0.00125, output: 0.005 },
  },

  // Local model pricing (always $0)
  local: { input: 0, output: 0 },
} as const;

export function getModelPricing(provider: string, modelId: string): { input: number; output: number } {
  if (provider === 'local' || provider === 'lmstudio' || provider === 'ollama') {
    return MODEL_PRICING.local;
  }

  const providerPricing = MODEL_PRICING[provider as keyof typeof MODEL_PRICING];
  if (!providerPricing) return { input: 0, output: 0 };

  const modelPricing = (providerPricing as Record<string, { input: number; output: number }>)[modelId];
  return modelPricing || { input: 0, output: 0 };
}

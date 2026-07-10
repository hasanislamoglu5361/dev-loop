import { redactFreeText, safeJsonStringify } from '../utils/redaction.js';

export type NotificationEventType =
  | 'success'
  | 'failure'
  | 'fallback'
  | 'uncertain'
  | 'low_confidence'
  | 'cost_time'
  | 'model_switch'
  | 'quality_failure'
  | 'injection'
  | 'migration'
  | 'pattern_conflict'
  | 'anomaly'
  | 'smoke_test'
  | string;

export interface NotificationFormatInput {
  type: NotificationEventType;
  loopId?: string;
  title?: string;
  detail?: string;
  data?: Record<string, unknown>;
}

const EVENT_LABELS: Record<string, string> = {
  success: 'Success',
  failure: 'Failure',
  fallback: 'Fallback path',
  uncertain: 'Uncertain tags',
  low_confidence: 'Low confidence',
  cost_time: 'Cost/time budget',
  model_switch: 'Model switch',
  quality_failure: 'Quality failure',
  injection: 'Prompt injection risk',
  migration: 'Migration',
  pattern_conflict: 'Pattern conflict',
  anomaly: 'Anomaly',
  smoke_test: 'Smoke test',
};

const EVENT_ACTIONS: Record<string, string> = {
  success: 'Review the completed changes and continue.',
  failure: 'Inspect the failure and retry with the captured context.',
  fallback: 'Review fallback output before accepting it.',
  uncertain: 'Resolve uncertain tags before committing.',
  low_confidence: 'Ask for verifier confirmation or add stronger evidence.',
  cost_time: 'Reduce scope or raise the configured budget.',
  model_switch: 'Confirm the selected model is appropriate for the next turn.',
  quality_failure: 'Fix quality gate failures before commit.',
  injection: 'Pause external input processing and review the source.',
  migration: 'Check migration status before continuing.',
  pattern_conflict: 'Review pattern history and choose the current fix.',
  anomaly: 'Inspect the anomaly before trusting the result.',
  smoke_test: 'Check smoke test output before release.',
};

export function formatNotificationMessage(input: NotificationFormatInput): string {
  const label = EVENT_LABELS[input.type];
  const detail = redactNotificationText(input.detail ?? input.title ?? 'No detail provided.');
  const loop = input.loopId ? ` for ${input.loopId}` : '';

  if (!label) {
    return `Notification ${input.type}${loop}: ${detail}`;
  }

  const action = EVENT_ACTIONS[input.type] ?? 'Review this event.';
  const dataSummary = input.data ? ` Data: ${redactNotificationText(safeJsonStringify(input.data))}` : '';

  return `${label}${loop}: ${detail}. Next: ${action}.${dataSummary}`;
}

function redactNotificationText(value: string): string {
  // Route through the shared secret-value pattern list (sk-, gh*_, github_pat_,
  // Slack webhooks, Bearer headers) so free text gets the same coverage as
  // structured `data` payloads, then layer the "password <value>" word-scan on
  // top since that's a field-shaped leak (not a token pattern) the shared
  // utility doesn't cover for prose.
  return redactFreeText(value)
    .replace(/\bpassword\s+\S+/gi, 'password [REDACTED]');
}

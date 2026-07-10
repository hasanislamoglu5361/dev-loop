export type SecondaryIntegrationName = 'linear' | 'notion' | 'postman' | 'obsidian' | 'calendar';
export type SecondaryIntegrationStatus = 'success' | 'failed' | 'skipped';

export interface SecondaryIntegrationPayload {
  title: string;
  summary: string;
  progress?: number;
  metadata?: Record<string, unknown>;
}

export interface LinearClient {
  createIssue(input: { title: string; description: string; metadata?: Record<string, unknown> }): Promise<{ id: string }>;
}

export interface NotionClient {
  appendPage(input: { title: string; body: string; metadata?: Record<string, unknown> }): Promise<{ id: string }>;
}

export interface PostmanSmokeResult {
  ok: boolean;
  runId?: string;
  failures?: string[];
}

export interface PostmanClient {
  runSmokeTest(collectionId: string): Promise<PostmanSmokeResult>;
}

export interface ObsidianClient {
  syncNote(input: { path: string; title: string; body: string; metadata?: Record<string, unknown> }): Promise<{ path: string }>;
}

export interface CalendarClient {
  recordProgress(input: { title: string; summary: string; progress?: number; metadata?: Record<string, unknown> }): Promise<{ id: string }>;
}

export interface LinearIntegrationConfig {
  enabled: boolean;
  client?: LinearClient;
}

export interface NotionIntegrationConfig {
  enabled: boolean;
  client?: NotionClient;
}

export interface PostmanIntegrationConfig {
  enabled: boolean;
  client?: PostmanClient;
  collectionId?: string;
}

export interface ObsidianIntegrationConfig {
  enabled: boolean;
  client?: ObsidianClient;
  notePath?: string;
}

export interface CalendarIntegrationConfig {
  enabled: boolean;
  client?: CalendarClient;
}

export interface RunSecondaryIntegrationsOptions {
  linear?: LinearIntegrationConfig;
  notion?: NotionIntegrationConfig;
  postman?: PostmanIntegrationConfig;
  obsidian?: ObsidianIntegrationConfig;
  calendar?: CalendarIntegrationConfig;
  payload: SecondaryIntegrationPayload;
}

export interface SecondaryIntegrationResult {
  integration: SecondaryIntegrationName;
  status: SecondaryIntegrationStatus;
  id?: string;
  reason?: string;
  error?: string;
  details?: string[];
}

export interface RunSecondaryIntegrationsResult {
  results: SecondaryIntegrationResult[];
}

export async function runSecondaryIntegrations(
  options: RunSecondaryIntegrationsOptions,
): Promise<RunSecondaryIntegrationsResult> {
  const results: SecondaryIntegrationResult[] = [];

  if (options.linear) {
    results.push(await runLinear(options.linear, options.payload));
  }
  if (options.notion) {
    results.push(await runNotion(options.notion, options.payload));
  }
  if (options.postman) {
    results.push(await runPostman(options.postman));
  }
  if (options.obsidian) {
    results.push(await runObsidian(options.obsidian, options.payload));
  }
  if (options.calendar) {
    results.push(await runCalendar(options.calendar, options.payload));
  }

  return { results };
}

async function runLinear(
  config: LinearIntegrationConfig,
  payload: SecondaryIntegrationPayload,
): Promise<SecondaryIntegrationResult> {
  if (!config.enabled) return skipped('linear');
  if (!config.client) return missingClient('linear');

  try {
    const issue = await config.client.createIssue({
      title: payload.title,
      description: payload.summary,
      metadata: payload.metadata,
    });
    return { integration: 'linear', status: 'success', id: issue.id };
  } catch (error) {
    return failed('linear', error);
  }
}

async function runNotion(
  config: NotionIntegrationConfig,
  payload: SecondaryIntegrationPayload,
): Promise<SecondaryIntegrationResult> {
  if (!config.enabled) return skipped('notion');
  if (!config.client) return missingClient('notion');

  try {
    const page = await config.client.appendPage({
      title: payload.title,
      body: payload.summary,
      metadata: payload.metadata,
    });
    return { integration: 'notion', status: 'success', id: page.id };
  } catch (error) {
    return failed('notion', error);
  }
}

async function runPostman(config: PostmanIntegrationConfig): Promise<SecondaryIntegrationResult> {
  if (!config.enabled) return skipped('postman');
  if (!config.client) return missingClient('postman');
  if (!config.collectionId) {
    return { integration: 'postman', status: 'failed', error: 'Postman collectionId is required.' };
  }

  try {
    const result = await config.client.runSmokeTest(config.collectionId);
    if (!result.ok) {
      return {
        integration: 'postman',
        status: 'failed',
        error: 'Postman smoke test failed.',
        details: result.failures ?? [],
      };
    }
    return { integration: 'postman', status: 'success', id: result.runId };
  } catch (error) {
    return failed('postman', error);
  }
}

async function runObsidian(
  config: ObsidianIntegrationConfig,
  payload: SecondaryIntegrationPayload,
): Promise<SecondaryIntegrationResult> {
  if (!config.enabled) return skipped('obsidian');
  if (!config.client) return missingClient('obsidian');

  const path = config.notePath ?? `${payload.title}.md`;
  try {
    const note = await config.client.syncNote({
      path,
      title: payload.title,
      body: payload.summary,
      metadata: payload.metadata,
    });
    return { integration: 'obsidian', status: 'success', id: note.path };
  } catch (error) {
    return failed('obsidian', error);
  }
}

async function runCalendar(
  config: CalendarIntegrationConfig,
  payload: SecondaryIntegrationPayload,
): Promise<SecondaryIntegrationResult> {
  if (!config.enabled) return skipped('calendar');
  if (!config.client) return missingClient('calendar');

  try {
    const event = await config.client.recordProgress({
      title: payload.title,
      summary: payload.summary,
      progress: payload.progress,
      metadata: payload.metadata,
    });
    return { integration: 'calendar', status: 'success', id: event.id };
  } catch (error) {
    return failed('calendar', error);
  }
}

function skipped(integration: SecondaryIntegrationName): SecondaryIntegrationResult {
  return { integration, status: 'skipped', reason: 'Integration disabled.' };
}

function missingClient(integration: SecondaryIntegrationName): SecondaryIntegrationResult {
  return { integration, status: 'failed', error: 'Client is required for enabled integration.' };
}

function failed(integration: SecondaryIntegrationName, error: unknown): SecondaryIntegrationResult {
  return {
    integration,
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
  };
}

import { scanMcpInputForInjection } from '../models/verifier/injection-detector.js';

export interface GithubClient {
  createBranch(branch: string): Promise<void>;
  createPullRequest(input: { title: string; head: string; body: string }): Promise<{ url: string }>;
  findPullRequest?(head: string): Promise<{ url: string } | null>;
  deleteBranch?(branch: string): Promise<void>;
}

export interface CreateGithubPullRequestOptions {
  enabled: boolean;
  client: GithubClient;
  branch: string;
  title: string;
  summary: string;
  tests: string[];
  retries?: number;
}

export interface CreateGithubPullRequestResult {
  created: boolean;
  url?: string;
  reason?: string;
}

export interface JiraTicket {
  id: string;
  title: string;
  description: string;
}

export interface JiraClient {
  pollTickets(): Promise<JiraTicket[]>;
  addComment(ticketId: string, comment: string): Promise<void>;
  closeTicket?(ticketId: string): Promise<void>;
}

export interface ProcessJiraTicketsOptions {
  jira: JiraClient;
  appendTicket(ticket: JiraTicket): Promise<void>;
  collisionCheck(ticket: JiraTicket): Promise<boolean>;
  signal?: AbortSignal;
  retries?: number;
}

export interface ProcessJiraTicketsResult {
  appended: string[];
  blocked: string[];
  collisions: string[];
}

export async function createGithubPullRequest(
  options: CreateGithubPullRequestOptions,
): Promise<CreateGithubPullRequestResult> {
  if (!options.enabled) {
    return { created: false, reason: 'GitHub integration disabled.' };
  }

  const existing = await options.client.findPullRequest?.(options.branch);
  if (existing) return { created: false, url: existing.url, reason: 'Pull request already exists.' };

  await retry(() => options.client.createBranch(options.branch), options.retries ?? 2);
  let pr: { url: string };
  try {
    pr = await retry(() => options.client.createPullRequest({
      title: options.title,
      head: options.branch,
      body: buildPullRequestBody(options.summary, options.tests),
    }), options.retries ?? 2);
  } catch (error) {
    await options.client.deleteBranch?.(options.branch).catch(() => undefined);
    throw error;
  }

  return { created: true, url: pr.url };
}

export async function processJiraTickets(
  options: ProcessJiraTicketsOptions,
): Promise<ProcessJiraTicketsResult> {
  const appended: string[] = [];
  const blocked: string[] = [];
  const collisions: string[] = [];
  throwIfAborted(options.signal);
  const tickets = await retry(() => options.jira.pollTickets(), options.retries ?? 2, options.signal);
  const seen = new Set<string>();

  for (const ticket of tickets) {
    throwIfAborted(options.signal);
    if (seen.has(ticket.id)) continue;
    seen.add(ticket.id);
    if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(ticket.id) || !ticket.title?.trim() || typeof ticket.description !== 'string') {
      blocked.push(ticket.id || '<invalid>');
      continue;
    }
    const injection = scanMcpInputForInjection(`${ticket.title}\n${ticket.description}`);
    if (injection.detected) {
      blocked.push(ticket.id);
      await retry(() => options.jira.addComment(ticket.id, 'Ticket intake paused: prompt injection risk detected.'), options.retries ?? 2, options.signal);
      continue;
    }

    if (await options.collisionCheck(ticket)) {
      collisions.push(ticket.id);
      await retry(() => options.jira.addComment(ticket.id, 'Ticket intake paused: potential work collision detected.'), options.retries ?? 2, options.signal);
      continue;
    }

    await retry(() => options.appendTicket(ticket), options.retries ?? 2, options.signal);
    appended.push(ticket.id);
    await retry(() => options.jira.addComment(ticket.id, 'Ticket queued for dev-loop processing.'), options.retries ?? 2, options.signal);
  }

  return { appended, blocked, collisions };
}

async function retry<T>(operation: () => Promise<T>, retries: number, signal?: AbortSignal): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    throwIfAborted(signal);
    try { return await operation(); } catch (error) { last = error; }
  }
  throw last;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Integration operation cancelled.');
}

function buildPullRequestBody(summary: string, tests: string[]): string {
  const lines = [
    '## Summary',
    '',
    summary,
    '',
    '## Verification',
    '',
    ...(tests.length > 0 ? tests.map(test => `- \`${test}\``) : ['- Not provided.']),
    '',
  ];

  return lines.join('\n');
}

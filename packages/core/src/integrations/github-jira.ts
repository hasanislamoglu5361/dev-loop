import { scanMcpInputForInjection } from '../models/verifier/injection-detector.js';

export interface GithubClient {
  createBranch(branch: string): Promise<void>;
  createPullRequest(input: { title: string; head: string; body: string }): Promise<{ url: string }>;
}

export interface CreateGithubPullRequestOptions {
  enabled: boolean;
  client: GithubClient;
  branch: string;
  title: string;
  summary: string;
  tests: string[];
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

  await options.client.createBranch(options.branch);
  const pr = await options.client.createPullRequest({
    title: options.title,
    head: options.branch,
    body: buildPullRequestBody(options.summary, options.tests),
  });

  return { created: true, url: pr.url };
}

export async function processJiraTickets(
  options: ProcessJiraTicketsOptions,
): Promise<ProcessJiraTicketsResult> {
  const appended: string[] = [];
  const blocked: string[] = [];
  const collisions: string[] = [];
  const tickets = await options.jira.pollTickets();

  for (const ticket of tickets) {
    const injection = scanMcpInputForInjection(`${ticket.title}\n${ticket.description}`);
    if (injection.detected) {
      blocked.push(ticket.id);
      await options.jira.addComment(ticket.id, 'Ticket intake paused: prompt injection risk detected.');
      continue;
    }

    if (await options.collisionCheck(ticket)) {
      collisions.push(ticket.id);
      await options.jira.addComment(ticket.id, 'Ticket intake paused: potential work collision detected.');
      continue;
    }

    await options.appendTicket(ticket);
    appended.push(ticket.id);
    await options.jira.addComment(ticket.id, 'Ticket queued for dev-loop processing.');
  }

  return { appended, blocked, collisions };
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

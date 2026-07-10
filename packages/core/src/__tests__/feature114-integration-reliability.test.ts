import { describe, expect, it, vi } from 'vitest';
import { createGithubPullRequest, processJiraTickets } from '../integrations/github-jira.js';
describe('FEATURE114 integration reliability', () => {
  it('returns an existing PR without recreating branch or PR', async () => {
    const client = { findPullRequest: vi.fn(async () => ({ url: 'https://github.test/pull/7' })), createBranch: vi.fn(), createPullRequest: vi.fn() };
    await expect(createGithubPullRequest({ enabled: true, client, branch: 'feature/F7', title: 'F7', summary: 'done', tests: [] })).resolves.toEqual({ created: false, url: 'https://github.test/pull/7', reason: 'Pull request already exists.' });
    expect(client.createBranch).not.toHaveBeenCalled();
  });
  it('compensates branch creation when PR creation exhausts retries', async () => {
    const client = { createBranch: vi.fn(async () => undefined), createPullRequest: vi.fn(async () => { throw new Error('github down'); }), deleteBranch: vi.fn(async () => undefined) };
    await expect(createGithubPullRequest({ enabled: true, client, branch: 'feature/F8', title: 'F8', summary: 'x', tests: [], retries: 1 })).rejects.toThrow('github down');
    expect(client.createPullRequest).toHaveBeenCalledTimes(2); expect(client.deleteBranch).toHaveBeenCalledWith('feature/F8');
  });
  it('deduplicates realistic Jira payloads and retries transient polling', async () => {
    const pollTickets = vi.fn().mockRejectedValueOnce(new Error('503')).mockResolvedValue([{ id: 'DEV-42', title: 'Validate API', description: 'Add request validation' }, { id: 'DEV-42', title: 'duplicate', description: 'duplicate' }]);
    const appendTicket = vi.fn(async () => undefined); const addComment = vi.fn(async () => undefined);
    await expect(processJiraTickets({ jira: { pollTickets, addComment }, appendTicket, collisionCheck: async () => false, retries: 1 })).resolves.toEqual({ appended: ['DEV-42'], blocked: [], collisions: [] });
    expect(pollTickets).toHaveBeenCalledTimes(2); expect(appendTicket).toHaveBeenCalledOnce();
  });
  it('honors cancellation before polling', async () => {
    const controller = new AbortController(); controller.abort(); const pollTickets = vi.fn();
    await expect(processJiraTickets({ jira: { pollTickets, addComment: vi.fn() }, appendTicket: vi.fn(), collisionCheck: vi.fn(), signal: controller.signal })).rejects.toThrow('cancelled');
    expect(pollTickets).not.toHaveBeenCalled();
  });
});

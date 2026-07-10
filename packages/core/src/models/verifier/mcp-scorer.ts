export interface McpUsageRecord {
  server: string;
  tool: string;
  success: boolean;
  error?: string;
}

export interface McpIncorrectUse {
  server: string;
  tool: string;
  reason: string;
}

export interface McpWebSearchStats {
  count: number;
  success: number;
}

export interface McpUsageScoreInput {
  task: string;
  usage: McpUsageRecord[];
}

export interface McpUsageScoreResult {
  score: number;
  notes: string[];
  shouldHaveUsed: string[];
  incorrectUse: McpIncorrectUse[];
  webSearch: McpWebSearchStats;
}

const WEB_SEARCH_TOOL = 'web.search';

export function scoreMcpUsage(input: McpUsageScoreInput): McpUsageScoreResult {
  const notes: string[] = [];
  const shouldHaveUsed: string[] = [];
  const incorrectUse: McpIncorrectUse[] = [];
  const webSearch = countWebSearch(input.usage);
  const needsWebSearch = taskNeedsWebSearch(input.task);
  let score = 100;

  if (needsWebSearch && webSearch.success === 0) {
    score -= 40;
    shouldHaveUsed.push(WEB_SEARCH_TOOL);
    notes.push('Should have used web.search for current external information.');
  }

  for (const record of input.usage) {
    if (record.success) continue;

    const unnecessary = record.tool === WEB_SEARCH_TOOL && !needsWebSearch;
    incorrectUse.push({
      server: record.server,
      tool: record.tool,
      reason: unnecessary
        ? 'Tool was not needed for this task and failed.'
        : 'Tool call failed.',
    });
    score -= unnecessary ? 25 : 15;
  }

  if (!needsWebSearch && input.usage.length === 0) {
    notes.push('No MCP usage required for this task.');
  }

  if (needsWebSearch && webSearch.success > 0) {
    notes.push('Used web.search for current external information.');
  }

  return {
    score: clampScore(score),
    notes,
    shouldHaveUsed,
    incorrectUse,
    webSearch,
  };
}

function countWebSearch(usage: McpUsageRecord[]): McpWebSearchStats {
  const webSearchRecords = usage.filter(record => record.tool === WEB_SEARCH_TOOL);

  return {
    count: webSearchRecords.length,
    success: webSearchRecords.filter(record => record.success).length,
  };
}

function taskNeedsWebSearch(task: string): boolean {
  return /\b(?:latest|current|today|recent|news|price|pricing|documentation|docs|api\s+docs|up-to-date)\b/i.test(task);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

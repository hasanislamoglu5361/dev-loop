// packages/core/src/utils/token-counter.ts
// Token counting using tiktoken for OpenAI-compatible models, fallback heuristic counter

/** Estimate tokens from character count (rough approximation) */
export function estimateTokensFromChars(text: string): number {
  // Average English word ≈ 4 chars + 1 space = ~5 chars per token
  return Math.ceil(text.length / 4);
}

/** Count tokens for a given text using a simple heuristic when tiktoken is unavailable */
export function countTokensHeuristic(text: string, modelFamily?: 'claude' | 'gpt'): number {
  if (!text) return 0;

  // Claude token estimation: ~3.5 characters per token on average
  const charPerToken = modelFamily === 'claude' ? 3.5 : 4;

  let count = 0;
  for (const char of text) {
    if (char === '\n') continue; // Newlines don't count as tokens in Claude
    if (char.trim() !== '') {
      count++;
    } else {
      count += 0.25; // Whitespace counts ~1/4 token
    }
  }

  return Math.ceil(count);
}

/** Count tokens for OpenAI-compatible models using a character-based heuristic */
export function countOpenAITokens(text: string): number {
  if (!text) return 0;

  let total = 0;
  // Count newlines (each newline is roughly 1 token)
  const newlines = (text.match(/\n/g) || []).length;
  total += newlines;

  // Remove newlines for word counting
  const cleanedText = text.replace(/\n/g, ' ');
  // Each whitespace-separated chunk ≈ 4 tokens (rough heuristic)
  const words = cleanedText.split(/\s+/).filter(w => w.length > 0);
  total += Math.ceil(words.length * 1.3);

  return total;
}

export async function countTokens(
  text: string,
  options: { model?: string; modelFamily?: 'claude' | 'gpt' } = {},
): Promise<number> {
  if (!text) return 0;

  const model = options.model;
  if (model && isOpenAICompatibleModel(model)) {
    try {
      const { encoding_for_model } = await import('tiktoken');
      const encoder = encoding_for_model(model as never);
      try {
        return encoder.encode(text).length;
      } finally {
        encoder.free();
      }
    } catch {
      return countTokensHeuristic(text, options.modelFamily ?? 'gpt');
    }
  }

  return countTokensHeuristic(text, options.modelFamily);
}

function isOpenAICompatibleModel(model: string): boolean {
  return /^(gpt-|o\d|text-|davinci|curie|babbage|ada)/i.test(model);
}

/** Count tokens for a message array used in chat completions */
export function countChatTokens(
  messages: Array<{ role: string; content: string }>,
  modelFamily?: 'claude' | 'gpt',
): number {
  let total = 0;

  // Each message has overhead (role prefix, etc.)
  const messageOverhead = modelFamily === 'claude' ? 4 : 3;

  for (const msg of messages) {
    total += messageOverhead + countTokensHeuristic(msg.content, modelFamily);
  }

  // System prompt counts as one extra message
  if (messages.some(m => m.role === 'system')) {
    total += 1;
  }

  return total;
}

/** Count tokens for a file content string */
export function countFileTokens(content: string, language?: string): number {
  // Language-specific adjustments
  const langMultiplier: Record<string, number> = {
    typescript: 0.9, // Slightly more efficient tokenization
    python: 1.0,
    javascript: 1.05,
    go: 0.95,
    rust: 0.92,
    java: 1.0,
    csharp: 0.95,
    cpp: 1.0,
    sql: 1.1,
    markdown: 1.15, // More whitespace
  };

  if (!language) return Math.ceil(countTokensHeuristic(content));
  const normalizedLang = language.toLowerCase();
  const multiplier = langMultiplier[normalizedLang] ?? 1.0;
  return Math.ceil(countTokensHeuristic(content) * multiplier);
}

/** Count tokens across multiple files */
export function countFilesTokens(
  files: Array<{ path: string; content: string }>,
): { totalTokens: number; perFile: Record<string, number> } {
  const perFile: Record<string, number> = {};
  let totalTokens = 0;

  for (const file of files) {
    // Extract language from extension
    const ext = file.path.split('.').pop()?.toLowerCase() ?? 'txt';
    const lang = extToLanguage(ext);
    perFile[file.path] = countFileTokens(file.content, lang);
    totalTokens += perFile[file.path];
  }

  return { totalTokens, perFile };
}

/** Map file extensions to language names for token counting */
const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  cs: 'csharp',
  cc: 'cpp',
  cpp: 'cpp',
  c: 'cpp',
  h: 'cpp',
  sql: 'sql',
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
};

function extToLanguage(ext: string): string | undefined {
  return EXT_TO_LANG[ext];
}

/** Calculate token ratio for context budgeting */
export function getTokenRatio(usedTokens: number, maxTokens: number): number {
  if (maxTokens <= 0) return 1;
  return Math.min(usedTokens / maxTokens, 1);
}

/** Check if content fits within a token budget */
export function canFitInBudget(content: string, maxTokens: number, modelFamily?: 'claude' | 'gpt'): boolean {
  const required = countTokensHeuristic(content, modelFamily);
  return required <= maxTokens;
}

/** Truncate content to fit within a token budget */
export function truncateToTokenBudget(
  text: string,
  maxTokens: number,
  modelFamily?: 'claude' | 'gpt',
): { truncated: string; tokensUsed: number; overflow: boolean } {
  const totalTokens = countTokensHeuristic(text, modelFamily);

  if (totalTokens <= maxTokens) {
    return { truncated: text, tokensUsed: totalTokens, overflow: false };
  }

  // Binary search for the right cutoff point
  let lo = 0;
  let hi = text.length;

  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = text.substring(0, mid);
    if (countTokensHeuristic(candidate, modelFamily) <= maxTokens) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return {
    truncated: text.substring(0, lo),
    tokensUsed: countTokensHeuristic(text.substring(0, lo), modelFamily),
    overflow: true,
  };
}

import { countTokensHeuristic as defaultCountTokens } from '../utils/token-counter.js';

export type OptimizedContextSectionType = 'system' | 'feature' | 'bugs' | 'code_map' | 'file';

export interface OptimizerRelevantFile {
  path: string;
  content: string;
}

export interface OptimizeContextOptions {
  systemPrompt: string;
  featureText: string;
  bugs?: string;
  retry?: boolean;
  relevantFiles?: OptimizerRelevantFile[];
  codeMap?: string;
  maxTokens: number;
  countTokens?: (content: string) => number;
}

export interface OptimizedContextSection {
  type: OptimizedContextSectionType;
  label: string;
  content: string;
  tokens: number;
  priority: number;
}

export interface OptimizedContextResult {
  content: string;
  cacheablePrefix: string;
  sections: OptimizedContextSection[];
  dropped: OptimizedContextSection[];
  totalTokens: number;
}

export function optimizeContext(options: OptimizeContextOptions): OptimizedContextResult {
  const countTokens = options.countTokens ?? defaultCountTokens;
  const mandatory = [
    createSection('system', 'System Prompt', options.systemPrompt, 1, countTokens),
    createSection('feature', 'Feature', options.featureText, 2, countTokens),
  ];
  const optional: OptimizedContextSection[] = [];

  if (options.retry && options.bugs?.trim()) {
    optional.push(createSection('bugs', 'BUGS', options.bugs, 3, countTokens));
  }

  if (options.codeMap?.trim()) {
    optional.push(createSection('code_map', 'CODE_MAP', options.codeMap, 4, countTokens));
  }

  for (const file of options.relevantFiles ?? []) {
    optional.push(createSection('file', file.path, file.content, 5, countTokens));
  }

  const sections: OptimizedContextSection[] = [];
  const dropped: OptimizedContextSection[] = [];
  let totalTokens = 0;

  for (const section of mandatory) {
    sections.push(section);
    totalTokens += section.tokens;
  }

  for (const section of optional.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label))) {
    if (totalTokens + section.tokens > options.maxTokens) {
      dropped.push(section);
      continue;
    }

    sections.push(section);
    totalTokens += section.tokens;
  }

  const content = renderContextSections(sections);
  const cacheablePrefix = renderContextSections(mandatory);

  return {
    content,
    cacheablePrefix,
    sections,
    dropped,
    totalTokens,
  };
}

function createSection(
  type: OptimizedContextSectionType,
  label: string,
  content: string,
  priority: number,
  countTokens: (content: string) => number,
): OptimizedContextSection {
  return {
    type,
    label,
    content,
    tokens: countTokens(content),
    priority,
  };
}

function renderContextSections(sections: OptimizedContextSection[]): string {
  return sections
    .map(section => `## ${section.label}\n\n${section.content.trim()}`)
    .join('\n\n');
}

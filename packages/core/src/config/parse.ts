import YAML from 'yaml';
import { ConfigError } from '../errors.js';

export function parseYamlObject(rawContent: string, filePath?: string): Record<string, unknown> {
  const label = filePath ?? 'dev-loop.yaml';
  try {
    const parsed = YAML.parse(rawContent) ?? {};
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ConfigError(
        `${label} must contain an object at the top level.`,
        'Use key/value YAML such as `version: "1"`.',
        { path: label },
      );
    }
    return parsed as Record<string, unknown>;
  } catch (cause) {
    if (cause instanceof ConfigError) throw cause;
    throw new ConfigError(
      `Invalid YAML syntax in ${label}.`,
      'Fix the YAML syntax and run the command again.',
      { path: label },
      cause instanceof Error ? cause : undefined,
    );
  }
}

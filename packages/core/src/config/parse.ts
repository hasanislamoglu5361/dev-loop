import YAML from 'yaml';
import { ConfigError } from '../errors.js';

export function parseYamlObject(rawContent: string): Record<string, unknown> {
  try {
    const parsed = YAML.parse(rawContent) ?? {};
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ConfigError(
        'dev-loop.yaml must contain an object at the top level.',
        'Use key/value YAML such as `version: "1"`.',
      );
    }
    return parsed as Record<string, unknown>;
  } catch (cause) {
    if (cause instanceof ConfigError) throw cause;
    throw new ConfigError(
      'Invalid dev-loop.yaml syntax.',
      'Fix the YAML syntax and run the command again.',
      undefined,
      cause instanceof Error ? cause : undefined,
    );
  }
}

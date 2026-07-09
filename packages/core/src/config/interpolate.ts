export interface ConfigWarning {
  code: string;
  message: string;
  details?: unknown;
}

export interface InterpolateOptions {
  env: NodeJS.ProcessEnv;
  onWarning?: (warning: ConfigWarning) => void;
}

export function interpolateEnvValue(value: string, options: InterpolateOptions): string {
  return value.replace(/\$\{(\w+)\}/g, (match, envVar: string) => {
    const envValue = options.env[envVar];
    if (envValue === undefined || envValue === '') {
      options.onWarning?.({
        code: 'config.env.missing',
        message: `Environment variable ${envVar} is not set.`,
      });
      return match;
    }
    return envValue;
  });
}

export function interpolateConfig(input: unknown, options: InterpolateOptions): unknown {
  if (typeof input === 'string') return interpolateEnvValue(input, options);
  if (Array.isArray(input)) return input.map(item => interpolateConfig(item, options));
  if (input !== null && typeof input === 'object' && !(input instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (key.startsWith('DEV_LOOP_')) continue;
      result[key] = interpolateConfig(value, options);
    }
    return result;
  }
  return input;
}

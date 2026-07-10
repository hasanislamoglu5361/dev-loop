import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DevLoopError } from '../errors.js';

const execFileAsync = promisify(execFile);

export type VramPlatform = 'linux' | 'darwin' | 'win32' | NodeJS.Platform;

export interface VramCommandResult {
  stdout: string;
  stderr?: string;
}

export type VramCommandRunner = (command: string, args: string[]) => Promise<VramCommandResult>;

export interface VramInfo {
  totalMb: number;
  availableMb: number;
  source: 'nvidia-smi' | 'system_profiler' | 'wmic' | 'fallback';
  reliable: boolean;
  message?: string;
}

export interface VramManagerOptions {
  platform?: VramPlatform;
  runCommand?: VramCommandRunner;
}

export interface AssertCanLoadOptions {
  model: string;
  requiredMb: number;
}

export interface ModelLoadLockOptions extends AssertCanLoadOptions {
  onLoad?: (model: string) => Promise<void> | void;
  onUnload?: (model: string) => Promise<void> | void;
}

export interface QuantizationSuggestionOptions {
  availableMb: number;
  modelParameterBillion: number;
}

export class VramError extends DevLoopError {
  constructor(message: string, action: string, details?: Record<string, unknown>) {
    super(message, 'vram.insufficient', action, details);
    this.name = 'VramError';
  }
}

export class VramManager {
  private readonly platform: VramPlatform;
  private readonly runCommand: VramCommandRunner;
  private loadLock: Promise<void> = Promise.resolve();

  constructor(options: VramManagerOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.runCommand = options.runCommand ?? defaultCommandRunner;
  }

  async detect(): Promise<VramInfo> {
    try {
      if (this.platform === 'linux') return await this.detectLinux();
      if (this.platform === 'darwin') return await this.detectDarwin();
      if (this.platform === 'win32') return await this.detectWindows();
      return fallbackVramInfo();
    } catch {
      return fallbackVramInfo();
    }
  }

  async assertCanLoad(options: AssertCanLoadOptions): Promise<VramInfo> {
    const info = await this.detect();
    if (info.availableMb < options.requiredMb) {
      const suggestions = suggestQuantization({
        availableMb: info.availableMb,
        modelParameterBillion: estimateModelSizeBillion(options.requiredMb),
      });
      throw new VramError(
        `Insufficient VRAM for ${options.model}: requires ${options.requiredMb} MB, detected ${info.availableMb} MB available.`,
        `Use a smaller model, unload other local models, or try quantization (${suggestions.join(', ') || 'Q2_K'}).`,
        {
          model: options.model,
          requiredMb: options.requiredMb,
          availableMb: info.availableMb,
          totalMb: info.totalMb,
          suggestions,
        },
      );
    }

    return info;
  }

  async withModelLoadLock<T>(options: ModelLoadLockOptions, operation: () => Promise<T>): Promise<T> {
    const previous = this.loadLock;
    let release!: () => void;
    this.loadLock = previous.then(() => new Promise<void>(resolve => {
      release = resolve;
    }));

    await previous;

    try {
      await this.assertCanLoad(options);
      await options.onLoad?.(options.model);
      try {
        return await operation();
      } finally {
        await options.onUnload?.(options.model);
      }
    } finally {
      release();
    }
  }

  private async detectLinux(): Promise<VramInfo> {
    const result = await this.runCommand('nvidia-smi', [
      '--query-gpu=memory.total,memory.free',
      '--format=csv,noheader,nounits',
    ]);
    const numbers = parseNumbers(result.stdout);
    const totalMb = numbers[0];
    const availableMb = numbers[1] ?? totalMb;
    if (totalMb === undefined) return fallbackVramInfo();
    return { totalMb, availableMb, source: 'nvidia-smi', reliable: true };
  }

  private async detectDarwin(): Promise<VramInfo> {
    const result = await this.runCommand('system_profiler', ['SPDisplaysDataType']);
    const gbMatch = result.stdout.match(/VRAM\s*\(Total\):\s*([0-9.]+)\s*GB/i);
    const mbMatch = result.stdout.match(/VRAM\s*\(Total\):\s*([0-9.]+)\s*MB/i);
    const totalMb = gbMatch
      ? Math.round(Number(gbMatch[1]) * 1024)
      : mbMatch
        ? Math.round(Number(mbMatch[1]))
        : undefined;
    if (!totalMb || !Number.isFinite(totalMb)) return fallbackVramInfo();
    return { totalMb, availableMb: totalMb, source: 'system_profiler', reliable: true };
  }

  private async detectWindows(): Promise<VramInfo> {
    const result = await this.runCommand('wmic', ['path', 'win32_VideoController', 'get', 'AdapterRAM']);
    const bytes = parseNumbers(result.stdout).find(value => value > 1024 * 1024);
    if (bytes === undefined) return fallbackVramInfo();
    const totalMb = Math.round(bytes / 1024 / 1024);
    return { totalMb, availableMb: totalMb, source: 'wmic', reliable: true };
  }
}

export function suggestQuantization(options: QuantizationSuggestionOptions): string[] {
  const q2Mb = options.modelParameterBillion * 360;
  const q3Mb = options.modelParameterBillion * 420;
  const q4Mb = options.modelParameterBillion * 700;
  const q5Mb = options.modelParameterBillion * 850;
  const result: string[] = [];

  if (options.availableMb >= q2Mb) result.push('Q2_K');
  if (options.availableMb >= q3Mb) result.push('Q3_K_S');
  if (options.availableMb >= q4Mb) result.push('Q4_K_M');
  if (options.availableMb >= q5Mb) result.push('Q5_K_M');

  return result.length > 0 ? result : ['Q2_K'];
}

async function defaultCommandRunner(command: string, args: string[]): Promise<VramCommandResult> {
  const result = await execFileAsync(command, args, { encoding: 'utf8' });
  return { stdout: result.stdout, stderr: result.stderr };
}

function fallbackVramInfo(): VramInfo {
  return {
    totalMb: 0,
    availableMb: 0,
    source: 'fallback',
    reliable: false,
    message: 'VRAM could not be detected; assuming no dedicated VRAM is available.',
  };
}

function parseNumbers(value: string): number[] {
  return value
    .match(/[0-9]+(?:\.[0-9]+)?/g)
    ?.map(Number)
    .filter(number => Number.isFinite(number)) ?? [];
}

function estimateModelSizeBillion(requiredMb: number): number {
  return Math.max(1, Math.round(requiredMb / 700));
}

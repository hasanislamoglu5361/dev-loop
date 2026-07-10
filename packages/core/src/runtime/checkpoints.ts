import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DevLoopError } from '../errors.js';
import { ensureDir, writeFileAtomic } from '../utils/file-system.js';

export interface CheckpointManagerOptions {
  checkpointDir: string;
}

export interface CheckpointRecord<TState = unknown> {
  loopId: string;
  turn: number;
  state: TState;
}

export class CheckpointError extends DevLoopError {
  constructor(message: string, action: string, details?: Record<string, unknown>, cause?: Error) {
    super(message, 'checkpoint.error', action, details, cause);
    this.name = 'CheckpointError';
  }
}

export class CheckpointManager {
  private readonly checkpointDir: string;

  constructor(options: CheckpointManagerOptions) {
    this.checkpointDir = options.checkpointDir;
  }

  async save<TState>(record: CheckpointRecord<TState>): Promise<void> {
    await ensureDir(this.checkpointDir);
    await writeFileAtomic(this.filePath(record.loopId, record.turn), `${JSON.stringify(record, null, 2)}\n`);
  }

  async restore<TState = unknown>(loopId: string, turn: number): Promise<CheckpointRecord<TState> | null> {
    const filePath = this.filePath(loopId, turn);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content) as CheckpointRecord<TState>;
    } catch (error) {
      if (isNotFound(error)) return null;
      if (error instanceof SyntaxError) {
        throw new CheckpointError(
          `Checkpoint for ${loopId} turn ${turn} contains invalid JSON.`,
          'Delete the corrupt checkpoint or restore from an earlier turn.',
          { loopId, turn, filePath },
          error,
        );
      }
      throw error;
    }
  }

  async restoreLatest<TState = unknown>(loopId: string): Promise<CheckpointRecord<TState> | null> {
    const entries = await this.loopCheckpointEntries(loopId);
    const latest = entries.sort((left, right) => right.turn - left.turn)[0];
    return latest ? this.restore<TState>(loopId, latest.turn) : null;
  }

  async clear(loopId: string): Promise<number> {
    const entries = await this.loopCheckpointEntries(loopId);
    await Promise.all(entries.map(entry => fs.rm(entry.filePath, { force: true })));
    return entries.length;
  }

  private async loopCheckpointEntries(loopId: string): Promise<Array<{ turn: number; filePath: string }>> {
    try {
      const files = await fs.readdir(this.checkpointDir);
      const prefix = `${safeLoopId(loopId)}-turn-`;
      return files
        .map(file => ({ file, match: file.match(new RegExp(`^${escapeRegExp(prefix)}(\\d+)\\.json$`)) }))
        .filter((entry): entry is { file: string; match: RegExpMatchArray } => Boolean(entry.match))
        .map(entry => ({
          turn: Number(entry.match[1]),
          filePath: path.join(this.checkpointDir, entry.file),
        }))
        .filter(entry => Number.isInteger(entry.turn));
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }

  private filePath(loopId: string, turn: number): string {
    return path.join(this.checkpointDir, `${safeLoopId(loopId)}-turn-${turn}.json`);
  }
}

function safeLoopId(loopId: string): string {
  return loopId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ENOENT');
}

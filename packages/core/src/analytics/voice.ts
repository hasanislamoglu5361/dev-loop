// packages/core/src/analytics/voice.ts
// Voice transcription wrapper with graceful unavailable dependency handling.
// Uses lazy loading for optional dependencies like Whisper.

import { readFile, rm, stat } from 'node:fs/promises';

export class VoiceDependencyUnavailableError extends Error {
  constructor() {
    super('Voice transcription service is not available. Please check your configuration.');
    this.name = 'VoiceDependencyUnavailableError';
  }
}

export interface TranscribeResult {
  text: string;
  language?: string;
}

export interface VoiceTranscriber {
  transcribe(audioBuffer: Buffer): Promise<TranscribeResult> | TranscribeResult;
}

export interface ProcessVoiceInputOptions {
  enabled: boolean;
  file?: string;
  record?: () => Promise<{ file: string; temporary: true }>;
  maxBytes?: number;
  confirm: (message: string) => boolean | Promise<boolean>;
  transcriber?: VoiceTranscriber;
}

export interface ProcessVoiceInputResult extends TranscribeResult { source: 'file' | 'recording'; bytes: number; confirmed: true }

export async function processVoiceInput(options: ProcessVoiceInputOptions): Promise<ProcessVoiceInputResult> {
  if (!options.enabled) throw new Error('Voice commands are disabled in configuration.');
  if (Boolean(options.file) === Boolean(options.record)) throw new Error('Provide exactly one voice input: file or recording.');
  const recording = options.record ? await options.record() : undefined;
  const file = options.file ?? recording!.file;
  try {
    const info = await stat(file);
    const maxBytes = options.maxBytes ?? 25 * 1024 * 1024;
    if (!info.isFile() || info.size === 0) throw new Error('Audio input must be a non-empty file.');
    if (info.size > maxBytes) throw new Error(`Audio input exceeds the ${maxBytes} byte limit.`);
    if (!await options.confirm(`Transcribe and use ${recording ? 'recorded' : 'selected'} audio (${info.size} bytes)?`)) throw new Error('Voice command cancelled by user.');
    const result = await transcribeAudio(await readFile(file), options.transcriber);
    if (!result.text.trim()) throw new Error('Transcription was empty.');
    return { ...result, text: result.text.trim(), source: recording ? 'recording' : 'file', bytes: info.size, confirmed: true };
  } finally {
    if (recording?.temporary) await rm(recording.file, { force: true }).catch(() => undefined);
  }
}

/**
 * Lazily load the whisper module to avoid import-time failures.
 */
async function getWhisperModule(): Promise<VoiceTranscriber> {
  try {
    // Dynamic import - only loads when actually needed.
    // @ts-expect-error 'whisper' is an optional runtime dependency, not installed at build time
    const whisper = await import('whisper') as unknown as Record<string, unknown>;
    const candidate = (whisper.default ?? whisper) as Record<string, unknown>;
    const transcribe = candidate.transcribe;
    if (typeof transcribe !== 'function') throw new VoiceDependencyUnavailableError();
    return {
      transcribe: audio => Promise.resolve(transcribe.call(candidate, audio)).then(normalizeTranscription),
    };
  } catch {
    throw new VoiceDependencyUnavailableError();
  }
}

/**
 * Transcribe audio buffer using Whisper or similar service.
 * Throws VoiceDependencyUnavailableError if the dependency is not installed/configured.
 *
 * @param audioBuffer - Audio data as Buffer (WAV, MP3, etc.)
 * @returns Transcription result with text and optional language detection
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  transcriber?: VoiceTranscriber,
): Promise<TranscribeResult> {
  try {
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      throw new Error('Audio buffer must not be empty.');
    }
    return normalizeTranscription(await (transcriber ?? await getWhisperModule()).transcribe(audioBuffer));
  } catch (error) {
    if (error instanceof VoiceDependencyUnavailableError) {
      throw error;
    }

    throw new VoiceDependencyUnavailableError();
  }
}

/**
 * Check if voice transcription is available without throwing.
 */
export async function isVoiceAvailable(transcriber?: VoiceTranscriber): Promise<boolean> {
  try {
    if (!transcriber) await getWhisperModule();
    return true;
  } catch {
    return false;
  }
}

function normalizeTranscription(value: unknown): TranscribeResult {
  if (typeof value === 'string') return { text: value };
  if (!value || typeof value !== 'object' || typeof (value as { text?: unknown }).text !== 'string') {
    throw new Error('Transcription provider returned an invalid result.');
  }
  const result = value as { text: string; language?: unknown };
  return {
    text: result.text,
    language: typeof result.language === 'string' ? result.language : undefined,
  };
}

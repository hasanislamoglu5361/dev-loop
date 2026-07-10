// packages/core/src/db/queries/model-profiles.ts
// Model profiles query helpers for dev-loop SQLite database.
// Query helpers currently use better-sqlite3 directly.

import { getDb } from './db.js';
import { getModelPricing } from '../../config/defaults.js';

/** Get model profiles */
export async function getModelProfiles(options?: { provider?: string; featureType?: string }): Promise<Record<string, unknown>[]> {
  const db = getDb();

  let sql = 'SELECT * FROM model_profiles WHERE 1=1';
  const params: unknown[] = [];

  if (options?.provider) {
    sql += ` AND provider = ?`;
    params.push(options.provider);
  }

  if (options?.featureType) {
    sql += ` AND feature_type = ?`;
    params.push(options.featureType);
  }

  return db.prepare(sql).all(...params) as Record<string, unknown>[];
}

/** Update model calibration profile */
export async function updateModelProfile(params: {
  model: string;
  provider?: string;
  featureType?: string;
  language?: string;
  hourOfDay?: number;
  dayOfWeek?: number;
  avgTurnsToSuccess?: number;
  successRate?: number;
  avgTokensPerLoop?: number;
  avgCostPerLoop?: number;
  avgTokensPerSecond?: number;
}): Promise<void> {
  const db = getDb();

  const profile = db.prepare(`
    SELECT id FROM model_profiles
    WHERE model = ? AND provider = ? AND feature_type = ? AND language = ? AND hour_of_day = ?
  `).get(
    params.model,
    params.provider ?? null,
    params.featureType ?? null,
    params.language ?? null,
    params.hourOfDay ?? null
  ) as { id: number } | undefined;

  if (profile) {
    db.prepare(`
      UPDATE model_profiles SET
        avg_turns_to_success = ?, success_rate = ?, avg_tokens_per_loop = ?,
        avg_cost_per_loop = ?, avg_tokens_per_second = ?, total_loops = total_loops + 1,
        last_updated = ?
      WHERE id = ?
    `).run(
      params.avgTurnsToSuccess ?? null,
      params.successRate ?? null,
      params.avgTokensPerLoop ?? null,
      params.avgCostPerLoop ?? null,
      params.avgTokensPerSecond ?? null,
      new Date().toISOString(),
      profile.id
    );
    return;
  }

  db.prepare(`
    INSERT INTO model_profiles (model, provider, feature_type, language, hour_of_day, day_of_week,
      avg_turns_to_success, success_rate, avg_tokens_per_loop, avg_cost_per_loop,
      avg_tokens_per_second, total_loops)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    params.model,
    params.provider ?? null,
    params.featureType ?? null,
    params.language ?? null,
    params.hourOfDay ?? null,
    params.dayOfWeek ?? null,
    params.avgTurnsToSuccess ?? null,
    params.successRate ?? null,
    params.avgTokensPerLoop ?? null,
    params.avgCostPerLoop ?? null,
    params.avgTokensPerSecond ?? null
  );
}

/** Get model profiles for a provider */
export async function getModelProfilesByProvider(provider: string): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM model_profiles
    WHERE provider = ?
    ORDER BY success_rate DESC, total_loops DESC
  `).all(provider) as Record<string, unknown>[];
}

/** Get best model for feature type */
export async function getBestModelForFeatureType(options: {
  featureType?: string;
  language?: string;
  maxCostPer1kTokens?: number;
  minSuccessRate?: number;
  minSamples?: number;
}): Promise<{ model: string; provider: string } | null> {
  const db = getDb();

  let sql = `
    SELECT model, provider, AVG(success_rate) as avg_success, SUM(total_loops) as total_loops
    FROM model_profiles
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (options.featureType) {
    sql += ` AND feature_type = ?`;
    params.push(options.featureType);
  }

  if (options.language) {
    sql += ` AND language = ?`;
    params.push(options.language);
  }

  sql += ` GROUP BY model, provider HAVING SUM(total_loops) >= ?`;
  params.push(options.minSamples ?? 3);

  if (options.minSuccessRate !== undefined) {
    sql += ` AND AVG(success_rate) >= ?`;
    params.push(options.minSuccessRate);
  }

  sql += ` ORDER BY avg_success DESC LIMIT 1`;

  const result = db.prepare(sql).get(...params) as { model: string; provider: string } | undefined;
  if (!result) return null;

  if (options.maxCostPer1kTokens) {
    const pricing = getModelPricing(result.provider, result.model);
    const estimatedCost = 5 * pricing.input + 2 * pricing.output;
    if (estimatedCost > options.maxCostPer1kTokens) return null;
  }

  return { model: result.model, provider: result.provider };
}

/** Retire a model profile */
export async function retireModelProfile(id: number): Promise<void> {
  const db = getDb();
  db.prepare('DELETE FROM model_profiles WHERE id = ?').run(id);
}

/** Create a model profile using the calibration update contract. */
export async function createModelProfile(
  data: Parameters<typeof updateModelProfile>[0]
): Promise<{ id: number }> {
  await updateModelProfile(data);
  const row = getDb().prepare(`
    SELECT id FROM model_profiles
    WHERE model = ? AND provider = ? AND feature_type = ? AND language = ? AND hour_of_day = ?
    ORDER BY id DESC LIMIT 1
  `).get(
    data.model,
    data.provider ?? null,
    data.featureType ?? null,
    data.language ?? null,
    data.hourOfDay ?? null
  ) as { id: number };
  return { id: row.id };
}

/** Get model profiles for feature type with score */
export async function getModelProfilesForFeatureType(
  featureType: string,
  options?: { provider?: string }
): Promise<Record<string, unknown>[]> {
  const db = getDb();
  let sql = `SELECT * FROM model_profiles WHERE feature_type = ?`;
  const params: unknown[] = [featureType];

  if (options?.provider) {
    sql += ' AND provider = ?';
    params.push(options.provider);
  }

  return db.prepare(sql).all(...params) as Record<string, unknown>[];
}

/** Get model scores by feature type */
export async function getModelScoresByFeatureType(
  featureType: string,
  options?: { provider?: string }
): Promise<Record<string, unknown>[]> {
  const db = getDb();
  let sql = `SELECT * FROM model_profiles WHERE feature_type = ?`;
  const params: unknown[] = [featureType];

  if (options?.provider) {
    sql += ' AND provider = ?';
    params.push(options.provider);
  }

  return db.prepare(sql).all(...params) as Record<string, unknown>[];
}

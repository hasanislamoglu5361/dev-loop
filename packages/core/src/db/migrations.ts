// packages/core/src/db/migrations.ts
// SQLite migration runner for dev-loop database schema

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const migrations = [
  { version: 1, name: '001_initial_schema', up: applyMigration1 },
] as const;

/** Run all pending migrations against the database */
export function runMigrations(dbOrPath: string | Database.Database): void {
  const ownsConnection = typeof dbOrPath === 'string';
  if (ownsConnection) {
    const dbDir = path.dirname(dbOrPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  const db = ownsConnection ? new Database(dbOrPath) : dbOrPath;
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  ensureMigrationTable(db);

  try {
    for (const migration of migrations) {
      if (isMigrationApplied(db, migration.version, migration.name)) continue;

      db.transaction(() => {
        migration.up(db);
        markMigrationApplied(db, migration.version, migration.name);
      })();
    }
  } finally {
    if (ownsConnection) {
      db.close();
    }
  }
}

function ensureMigrationTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (version, name),
      UNIQUE(name)
    )
  `);
}

function isMigrationApplied(db: Database.Database, version: number, name: string): boolean {
  const row = db.prepare(`
    SELECT 1 FROM _migrations WHERE version = ? AND name = ?
  `).get(version, name);
  return row !== undefined;
}

function markMigrationApplied(db: Database.Database, version: number, name: string): void {
  db.prepare(`
    INSERT INTO _migrations (version, name) VALUES (?, ?)
  `).run(version, name);
}

/** Migration 001 — Initial schema */
function applyMigration1(db: Database.Database): void {
  // Create all tables from the schema spec
  db.exec(`
    CREATE TABLE IF NOT EXISTS loop_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id TEXT, feature_summary TEXT, feature_keywords TEXT,
      feature_type TEXT, language TEXT,
      primary_model TEXT, primary_provider TEXT,
      verifier_model TEXT, verifier_provider TEXT,
      fallback_used INTEGER DEFAULT 0, fallback_model TEXT,
      total_turns INTEGER DEFAULT 0, success INTEGER DEFAULT 0,
      failure_reason TEXT, duration_seconds REAL,
      total_input_tokens INTEGER DEFAULT 0, total_output_tokens INTEGER DEFAULT 0,
      total_cost_usd REAL DEFAULT 0, commit_hash TEXT, branch_name TEXT, pr_url TEXT,
      quality_gate_passed INTEGER DEFAULT 0, test_coverage_pct REAL,
      uncertain_tags_found INTEGER DEFAULT 0, uncertain_tags_resolved INTEGER DEFAULT 0,
      user_rating INTEGER, planning_loop_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS loop_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loop_id INTEGER NOT NULL, turn_number INTEGER NOT NULL, agent TEXT NOT NULL,
      model TEXT, input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL,
      duration_seconds REAL, success INTEGER DEFAULT 0, error_message TEXT, error_type TEXT,
      diff_size_lines INTEGER, files_changed TEXT, uncertain_tags_added INTEGER DEFAULT 0,
      mcp_servers_used TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loop_id) REFERENCES loop_history(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS error_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_hash TEXT UNIQUE NOT NULL,
      model TEXT NOT NULL, provider TEXT, feature_keywords TEXT NOT NULL,
      language TEXT, error_description TEXT NOT NULL, error_category TEXT,
      fix_description TEXT NOT NULL, fix_example TEXT, version_context TEXT,
      version_history TEXT, seen_count INTEGER DEFAULT 1,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')), last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated TEXT, auto_inject INTEGER DEFAULT 1, conflicting_pattern_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS success_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT, model TEXT NOT NULL, provider TEXT,
      feature_keywords TEXT NOT NULL, language TEXT, feature_type TEXT,
      success_description TEXT, turns_to_complete INTEGER, prompt_version TEXT,
      mcp_used TEXT, seen_count INTEGER DEFAULT 1,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')), last_seen TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS model_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT, model TEXT NOT NULL, provider TEXT NOT NULL,
      feature_type TEXT, language TEXT, hour_of_day INTEGER, day_of_week INTEGER,
      avg_turns_to_success REAL, success_rate REAL, avg_tokens_per_loop INTEGER,
      avg_cost_per_loop REAL, avg_tokens_per_second REAL, total_loops INTEGER DEFAULT 0,
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(model, provider, feature_type, language, hour_of_day)
    );

    CREATE TABLE IF NOT EXISTS mcp_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, loop_id INTEGER NOT NULL, turn_id INTEGER,
      model TEXT, mcp_server TEXT NOT NULL, tool_name TEXT NOT NULL,
      input_summary TEXT, output_summary TEXT, success INTEGER DEFAULT 1,
      was_necessary INTEGER, could_have_prevented_error INTEGER DEFAULT 0, duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loop_id) REFERENCES loop_history(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mcp_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT, loop_id INTEGER NOT NULL, turn_id INTEGER,
      model TEXT, mcp_server TEXT NOT NULL, tool_name TEXT NOT NULL, error_type TEXT,
      error_message TEXT, input_summary TEXT, resolved INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loop_id) REFERENCES loop_history(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mcp_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, loop_id INTEGER NOT NULL, model TEXT,
      should_have_used TEXT, correctly_used TEXT, incorrectly_used TEXT,
      web_search_count INTEGER DEFAULT 0, web_search_success INTEGER DEFAULT 0,
      score INTEGER, verifier_notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loop_id) REFERENCES loop_history(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS benchmark_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT, benchmark_id TEXT NOT NULL, benchmark_name TEXT,
      model TEXT NOT NULL, provider TEXT, feature_summary TEXT, success INTEGER DEFAULT 0,
      turns INTEGER, input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL,
      duration_seconds REAL, tokens_per_second REAL, vram_mb INTEGER, quantization TEXT,
      quality_score INTEGER, test_coverage_pct REAL, mcp_score INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quality_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, loop_id INTEGER NOT NULL, commit_hash TEXT,
      test_coverage_pct REAL, complexity_score REAL, type_coverage_pct REAL, mutation_score REAL,
      secrets_found INTEGER DEFAULT 0, vulnerabilities_critical INTEGER DEFAULT 0,
      vulnerabilities_high INTEGER DEFAULT 0, dead_code_count INTEGER DEFAULT 0,
      duplicate_code_pct REAL, tech_debt_minutes INTEGER, lint_errors INTEGER DEFAULT 0,
      gate_passed INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loop_id) REFERENCES loop_history(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS uncertain_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT, loop_id INTEGER NOT NULL, file_path TEXT NOT NULL,
      line_number INTEGER, code_snippet TEXT, model_note TEXT, verifier_confirmed INTEGER DEFAULT 0,
      resolved INTEGER DEFAULT 0, resolution_note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT, FOREIGN KEY (loop_id) REFERENCES loop_history(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prompt_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, prompt_type TEXT NOT NULL, model TEXT,
      feature_type TEXT, version TEXT NOT NULL, content TEXT NOT NULL, success_rate REAL,
      avg_turns REAL, avg_cost REAL, sample_count INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), retired_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, event_type TEXT NOT NULL,
      message TEXT, loop_id INTEGER, sent INTEGER DEFAULT 0, error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (loop_id) REFERENCES loop_history(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, ticket_id TEXT NOT NULL,
      title TEXT, description TEXT, status TEXT, linked_feature_id TEXT, loop_id INTEGER,
      comment_posted INTEGER DEFAULT 0, injection_detected INTEGER DEFAULT 0, last_synced TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(provider, ticket_id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, model TEXT, loop_id INTEGER,
      feature_summary TEXT, files_changed TEXT, diff_size_lines INTEGER, commit_hash TEXT,
      signature TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS planning_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, feature_id TEXT NOT NULL, planning_model TEXT,
      plan_version INTEGER DEFAULT 1, task_count INTEGER, estimated_effort_hours REAL,
      actual_effort_hours REAL, estimated_cost_usd REAL, actual_cost_usd REAL,
      dependency_count INTEGER, risk_score REAL, plan_content TEXT, score REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS db_query_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT, loop_id INTEGER, query_hash TEXT, query_text TEXT,
      explain_output TEXT, execution_time_ms REAL, is_slow INTEGER DEFAULT 0,
      optimization_suggestion TEXT, index_suggestion TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, loop_id INTEGER NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT, false_positive INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loop_id) REFERENCES loop_history(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS flaky_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, test_name TEXT NOT NULL UNIQUE, test_file TEXT,
      pass_count INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0, flaky_rate REAL,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')), last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      resolved INTEGER DEFAULT 0, resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS golden_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT NOT NULL UNIQUE, content_hash TEXT NOT NULL,
      last_verified TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_communication (
      id INTEGER PRIMARY KEY AUTOINCREMENT, from_agent TEXT NOT NULL, to_agent TEXT NOT NULL,
      instruction TEXT, context TEXT, result_summary TEXT, success INTEGER, timestamp TEXT NOT NULL
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_loop_history_created ON loop_history(created_at);
    CREATE INDEX IF NOT EXISTS idx_loop_history_model ON loop_history(primary_model);
    CREATE INDEX IF NOT EXISTS idx_loop_history_success ON loop_history(success);
    CREATE INDEX IF NOT EXISTS idx_error_patterns_model ON error_patterns(model);
    CREATE INDEX IF NOT EXISTS idx_error_patterns_hash ON error_patterns(pattern_hash);
    CREATE INDEX IF NOT EXISTS idx_mcp_usage_loop ON mcp_usage(loop_id);
    CREATE INDEX IF NOT EXISTS idx_mcp_errors_loop ON mcp_errors(loop_id);
    CREATE INDEX IF NOT EXISTS idx_benchmark_id ON benchmark_results(benchmark_id);
    CREATE INDEX IF NOT EXISTS idx_quality_loop ON quality_history(loop_id);
    CREATE INDEX IF NOT EXISTS idx_uncertain_loop ON uncertain_tags(loop_id);
    CREATE INDEX IF NOT EXISTS idx_uncertain_resolved ON uncertain_tags(resolved);
    CREATE INDEX IF NOT EXISTS idx_tickets_provider ON tickets(provider, ticket_id)
  `);
}

/** Initialize database and run migrations */
export function initDatabase(dbPath: string): Database.Database {
  const absPath = path.resolve(dbPath);
  runMigrations(absPath);
  return new Database(absPath);
}

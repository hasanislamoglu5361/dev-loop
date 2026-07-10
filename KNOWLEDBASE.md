# Local Model Knowledge Base for dev-loop

Use this file as prompt context before asking a local model to implement, review, or fix anything in this repository.

This is not a changelog. It is a guardrail document. Follow it as a checklist and as a set of anti-patterns to avoid.

## Prime Directive

The model must prove behavior, not confidence.

For every task:

1. Read the feature/bug prompt.
2. Read the relevant existing source, tests, package manifests, and configs.
3. Write or update a failing test that proves the real behavior is missing.
4. Run the exact targeted command and confirm the expected failure.
5. Implement the smallest scoped fix.
6. Run the targeted command again.
7. Run the acceptance command from the prompt exactly as written.
8. Report any remaining failure with command, exit code, and short reason.

Never mark work complete because a document says `PASSING`. Review documents are claims; commands and source behavior are evidence.

## Current Repo Facts

This repo is a TypeScript/npm/Turbo monorepo.

Workspaces:

- `packages/core`
- `packages/cli`
- `packages/ui`

Important commands:

```bash
npm test
npm run typecheck
npm run build
npm run lint
```

Current observed status during the 2026-07-09 audit:

- Targeted FEATURE003, FEATURE004, and FEATURE007 tests passed.
- Targeted FEATURE001/FEATURE002 guard tests passed.
- Targeted FEATURE005 test failed because `dist/index.js` was missing after build.
- `npm test` failed because FEATURE005 deletes/loses real build output while incremental state remains.
- `npm run typecheck` passed.
- `npm run build` exited 0 but warned that `@dev-loop/core` had no output files.
- `npm run lint` failed with TypeScript parsing errors.
- Generated `.js`, `.d.ts`, `.js.map`, and `.d.ts.map` files were not present under `packages/*/src` on the latest check.

Therefore: a green test suite does not currently mean the repo is healthy.

## Do Not Trust These False Signals

### False Signal: "All tests pass"

Why it is wrong:

- Tests may be weak or audit-only.
- Some tests check file existence or comments instead of runtime behavior.
- `npm test` can pass while `npm run lint` fails.
- `npm test` can pass while package exports point to missing `dist` files.

Correct action:

- Run the exact acceptance command from the task.
- Add regression tests that exercise the real command or public API.
- Verify outputs exist, not just config fields.

### False Signal: "The review file says PASSING"

Why it is wrong:

- `REVIEW_FEATURES/*.md` files may be stale.
- They may have been written by the same local model that made the mistake.
- Some review files claim commands were run even when actual commands now fail.

Correct action:

- Treat review docs as hypotheses.
- Re-run commands.
- Inspect filesystem state.
- If a claim is false, write a bug report or fix it, depending on the user request.

### False Signal: "A config comment mentions TypeScript"

Why it is wrong:

- Comments do not configure tools.
- `eslint.config.js` currently says it handles TypeScript, but `npm run lint` proves it does not.

Correct action:

- Test the tool on a real TypeScript fixture with TypeScript-only syntax.
- For ESLint, run `npm run lint`.

## Repo-Specific Known Problems

### 1. ESLint Does Not Parse TypeScript

Observed problem:

`npm run lint` fails with parsing errors such as:

```text
Parsing error: Unexpected token :
Parsing error: Unexpected token type
Parsing error: Unexpected token declare
```

Why it is wrong:

- The root lint command targets TypeScript files.
- `eslint.config.js` only uses `@eslint/js` recommended config.
- `@eslint/js` does not make ESLint parse TypeScript syntax.

Why local models make this mistake:

- They confuse ESLint flat config with TypeScript parser support.
- They see `eslint@9` and assume TypeScript is native.
- They make tests pass by searching comments for `.ts` or `typescript`.

Correct fix:

- Add an ESLint 9-compatible TypeScript parser/config.
- Configure Node globals for Node code.
- Ignore generated outputs.
- Run `npm run lint` without `|| true`.

Verification:

```bash
npm run lint
npm test
npm run typecheck
```

### 2. Generated Files Are Under `src`

Observed historical problem:

There were generated files under `packages/core/src`, including `.js`, `.d.ts`, `.js.map`, and `.d.ts.map` files.

Latest 2026-07-09 check:

```bash
find packages/*/src -type f \( -name '*.js' -o -name '*.d.ts' -o -name '*.js.map' -o -name '*.d.ts.map' \) -print
```

Observed result: empty output.

Why it is wrong:

- Source directories should contain source files only.
- Build output should go to `dist`.
- Generated files in `src` are linted and may be mistaken for source.
- Stale generated files can mask missing real build output.

Why local models make this mistake:

- They run `tsc` before `outDir` is configured.
- They change tsconfig but do not clean old outputs.
- They assume generated files are harmless because tests still pass.

Correct fix:

- Remove generated files under `packages/*/src`.
- Keep `dist/` ignored.
- Ignore `*.tsbuildinfo`.
- Add a CI/test check that fails if generated files appear under `src`.

Verification:

```bash
find packages/*/src -type f \( -name '*.js' -o -name '*.d.ts' -o -name '*.js.map' -o -name '*.d.ts.map' \) -print
```

Expected output: empty.

### 3. Build Tests Can Delete Real Outputs and Leave Incremental State

Observed problem:

`feature005-build-pipeline.test.ts` builds `packages/core`, asserts `dist` exists, then deletes `packages/core/dist` while leaving `packages/core/tsconfig.tsbuildinfo`.

Why it is wrong:

- TypeScript can think the project is up to date and skip emit.
- Turbo can report success while output files are absent.
- Package exports point to `dist`, so missing `dist` breaks consumers.

Why local models make this mistake:

- They try to "clean up" after a test without understanding incremental compiler state.
- They test on the real package instead of a temporary fixture.

Correct fix:

- Prefer temp fixtures for build tests.
- If using the real package, clean `dist` and `tsconfig.tsbuildinfo` together.
- Add a regression test for "missing dist but existing tsbuildinfo".

Verification:

```bash
rm -rf packages/core/dist
npm run build
test -f packages/core/dist/index.js
test -f packages/core/dist/index.d.ts
```

### 4. Tests Hide Command Failures

Observed problem:

Some tests run commands like:

```ts
execSync('npm run lint --prefix packages/core 2>&1 || true')
```

Why it is wrong:

- `|| true` converts failure into success.
- The command is not the real root acceptance command.
- `packages/core` has no `lint` script, so this proves almost nothing.

Why local models make this mistake:

- They want to inspect output without failing the test.
- They only assert that one error string is absent.

Correct fix:

- For acceptance checks, let `execSync` throw.
- If failure output must be inspected, catch the error and assert the exit code.
- Run root commands from the repo root unless the prompt says otherwise.

Good pattern:

```ts
expect(() => {
  execSync('npm run lint', { cwd: rootDir, stdio: 'pipe' });
}).not.toThrow();
```

### 5. Tests Check Comments or File Existence Instead of Behavior

Observed problem:

Several feature tests assert that files exist or that text contains words like `dist`, `typescript`, `export`, or `vitest`.

Why it is wrong:

- A file can exist but be unusable.
- An export string can exist while imports fail.
- A comment can mention TypeScript while ESLint cannot parse TypeScript.

Why local models make this mistake:

- String/file tests are easy to make pass.
- They avoid executing the actual toolchain.

Correct fix:

- Test public behavior.
- Import packages through their public entry points.
- Run actual CLI/tool commands.
- For config files, run the tool that consumes the config.

Examples:

- Instead of checking that `eslint.config.js` mentions `.ts`, run ESLint on a `.ts` file.
- Instead of checking `package.json.main` ends with `.js`, build and import the emitted file.
- Instead of checking `turbo.json` exists, run `npm run build` and assert outputs.

### 6. Hardcoded Absolute Paths in Tests

Observed problem:

`packages/feature007/test.test.ts` hardcodes:

```ts
const ROOT_DIR = '/Users/hasanislamoglu/dev-loop';
```

Why it is wrong:

- Tests fail on any other machine or checkout path.
- It makes tests non-portable and fragile.

Why local models make this mistake:

- They copy the current working directory from the environment.
- They optimize for the current session only.

Correct fix:

- Derive paths from `import.meta.url`, `process.cwd()`, or test-relative `path.resolve`.
- Avoid user-specific paths in repo code and tests.
- Do not create ad-hoc feature test packages outside the real workspace/test structure unless the task explicitly requires it.
- Tests for tool config must run the tool, not inspect comments.

### 7. Vitest Passing Does Not Prove `tsc` Buildability

Observed problem:

`feature011-config-schema-skeleton.test.ts` passes under Vitest, but `npm run build` fails with TypeScript compiler errors:

```text
TS2578: Unused '@ts-expect-error' directive.
TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type ...
```

Why it is wrong:

- Vitest can execute transformed TypeScript while `tsc` still rejects the source.
- A feature test can be green while the package cannot emit `dist`.
- Build pipeline feature reviews become stale when later tests introduce compiler errors.

Why local models make this mistake:

- They stop after the targeted Vitest command.
- They use `as any` and `@ts-expect-error` together without checking whether the directive is still needed.
- They dynamically index modules with arbitrary strings and do not run `tsc`.

Correct fix:

- Run `npm run build` for changes that add `.ts` files under package source.
- Do not combine `@ts-expect-error` with `as any`.
- Type dynamic module maps explicitly before indexing.

Verification:

```bash
npm test -- packages/core/src/__tests__/feature011-config-schema-skeleton.test.ts
npm run build
npm run typecheck
```

### 8. Duplicating Extracted Modules Is Not Refactoring

Observed problem:

FEATURE011 added section schema files under `packages/core/src/config/sections/`, but `packages/core/src/config/schema.ts` still contains the full monolithic schema definition.

Why it is wrong:

- Duplicate schemas can drift.
- Tests that import section files only prove the files exist, not that production code uses them.
- A review can claim "schema skeleton complete" while the actual public `ConfigSchema` ignores the extracted sections.

Why local models make this mistake:

- They create new files to satisfy import tests but avoid touching the production entry point.
- They mistake structural duplication for behavior-preserving refactoring.
- They mark phase-one work as complete even when the acceptance language expects the composed schema.

Correct fix:

- Make `schema.ts` import all section schemas and compose the public `ConfigSchema`.
- Keep one source of truth for each section.
- Add tests that compare the public composed schema to the individual section schemas and inspect/import through the public path.

Verification:

```bash
npm test -- packages/core/src/__tests__/feature011-config-schema-skeleton.test.ts
npm run build
```

### 9. Do Not Disable `no-useless-catch` for Re-throw-Only Test Wrappers

Observed problem:

After FEATURE007 ESLint TypeScript parsing was fixed, `npm run lint` had one remaining error:

```text
feature007-loop-structure.test.ts
Unnecessary try/catch wrapper  no-useless-catch
```

The test had this shape:

```ts
try {
  const output = execSync('...', options);
  expect(output).not.toContain('missing-config');
} catch (error) {
  throw error;
}
```

Why it is wrong:

- A `catch` block that only rethrows the same error does not change test behavior.
- Vitest already fails the test when `execSync` throws.
- The wrapper can create a false sense that command failures are being asserted.
- In this repo, command assertions must be direct and must not hide failures.

Why local models make this mistake:

- They think `try/catch` is required for "proper" test failure handling.
- They confuse catching for diagnosis with asserting behavior.
- They avoid changing test structure and instead ask to disable a useful lint rule.

Correct fix:

- Do not disable `no-useless-catch` globally.
- Remove rethrow-only `try/catch` blocks.
- If the command is expected to pass, call it directly or wrap it in `expect(...).not.toThrow()`.
- If the command is expected to fail and output matters, catch the error and assert on `status`, `stdout`, or `stderr`.

Good pattern for a command that must pass:

```ts
expect(() => {
  execSync('npm run lint', { cwd: rootDir, stdio: 'pipe' });
}).not.toThrow();
```

Good pattern when command output must be inspected:

```ts
const output = execSync('npm run lint', {
  cwd: rootDir,
  encoding: 'utf8',
});

expect(output).not.toContain('missing-config');
```

Good pattern for an expected failure:

```ts
try {
  execSync('some failing command', { cwd: rootDir, stdio: 'pipe' });
  throw new Error('Expected command to fail');
} catch (error) {
  const failed = error as { status?: number; stdout?: Buffer; stderr?: Buffer };
  expect(failed.status).not.toBe(0);
  expect(String(failed.stderr ?? failed.stdout ?? '')).toContain('expected message');
}
```

Only use an ESLint disable comment for `no-useless-catch` when the catch block adds real behavior, such as cleanup, logging extra diagnostic context, translating the error, or asserting on the caught error.

Verification:

```bash
npm run lint
npm test -- packages/core/src/__tests__/feature007-loop-structure.test.ts
```

### 10. Config Loader Can Swallow Invalid Config

Observed pattern:

`loadConfig()` catches validation/parsing failures, warns, and may return defaults or partially merged data.

Why it is risky:

- Invalid user configuration can look successful.
- Tests may pass while real users silently lose config values.
- Warnings are not enough for required/unsafe config.

Why local models make this mistake:

- They prefer "robust" fallback behavior over explicit failure.
- They avoid updating tests that expect errors.

Correct fix:

- Decide which invalid states are fatal.
- Throw actionable `ConfigError` for invalid top-level config, invalid enum values, and unsafe values.
- Only fallback for genuinely optional missing files.
- Test invalid YAML, invalid schema, and missing optional file separately.

Verification examples:

```ts
await expect(loadConfig(projectDirWithInvalidYaml)).rejects.toThrow(/Invalid dev-loop.yaml/);
await expect(loadConfig(projectDirWithInvalidEnum)).rejects.toThrow(/provider/);
```

### 11. Falsy Values Are Accidentally Converted to Defaults

Observed pattern:

DB query code frequently uses `value || null` or `value || default`.

Why it is wrong:

- `0`, `false`, and empty strings may be valid values.
- `params.success ? 1 : 0` collapses `undefined` and `false` into the same value.
- `seenCount || 1` converts explicit `0` into `1`.

Why local models make this mistake:

- They use JavaScript truthiness as a shortcut.
- They do not write tests for `0` and `false`.

Correct fix:

- Use `??` for nullish defaults.
- Explicitly check booleans:

```ts
params.success === undefined ? null : Number(params.success)
```

- Add tests for `0`, `false`, empty arrays, and empty strings where valid.

### 12. Dynamic SQL Must Use Allow Lists

Observed pattern:

Some update helpers accept `Partial<Record<string, unknown>>` and build SQL column names from object keys.

Why it is wrong:

- SQL parameters protect values, not identifiers.
- Column names built from arbitrary keys can become SQL injection or runtime SQL errors.

Why local models make this mistake:

- They know to parameterize values but forget identifiers cannot be parameterized.
- They make a generic update helper too early.

Correct fix:

- Use explicit allow maps from API keys to DB column names.
- Reject unsupported keys with actionable errors.
- Test malicious keys:

```ts
await expect(updateThing(id, { 'x = 1; DROP TABLE loop_history; --': true }))
  .rejects.toThrow(/Unsupported/);
```

### 13. Schema and Migration Must Be Kept in Lockstep

Observed repo design:

- Drizzle schema lives in `packages/core/src/db/schema.ts`.
- SQLite migration SQL lives in `packages/core/src/db/migrations.ts`.

Why this is risky:

- The Drizzle schema can compile while migration-created tables differ.
- Query helpers may use columns that migrations never create.

Why local models make this mistake:

- They update whichever file the test mentions.
- They do not inspect both schema and migration.

Correct fix:

- Any table/column/index change must update both schema and migration strategy.
- Add tests with `PRAGMA table_info`, `PRAGMA index_list`, and real insert/update/select flows.
- Prefer testing against a migrated SQLite database, not mocked objects.

### 14. Public Package Exports Must Be Tested by Importing Them

Observed weak tests:

- Some tests only assert `package.json.main` ends with `.js`.
- Some tests only assert `src/index.ts` contains the word `export`.

Why it is wrong:

- Build output can be missing.
- Export maps can point to wrong files.
- Type declarations can be absent or stale.

Correct fix:

- Build the package.
- Import the package's emitted entry point.
- Assert expected public symbols exist.

Verification:

```bash
npm run build
node -e "import('./packages/core/dist/index.js').then(m => console.log(Object.keys(m)))"
```

### 15. CLI Entrypoints Need Import-Safe Separation

Observed pattern:

`packages/cli/src/main.ts` exports `createCli()` and immediately calls `createCli().parse()`.

Why it is risky:

- Importing `main.ts` or its build output can parse `process.argv` as a side effect.
- Tests or consumers importing the CLI API may unexpectedly execute the CLI.

Why local models make this mistake:

- They follow simple CLI examples without separating executable and library entrypoints.

Correct fix:

- Keep `createCli()` in an import-safe module.
- Only call `.parse()` in a small binary module guarded by an entrypoint check, or use separate `index.ts` and `main.ts` roles clearly.
- Test that importing the CLI module does not parse/exit.

### 16. UI Scaffold Must Be Verified as a Server, Not Just a File

Observed pattern:

The UI server currently exposes a minimal Fastify `/health` route.

Why weak tests are risky:

- A file can exist but the server may not start.
- Route registration can fail at runtime.

Correct fix:

- Use Fastify injection in tests:

```ts
const app = createUiServer();
const res = await app.inject({ method: 'GET', url: '/health' });
expect(res.statusCode).toBe(200);
expect(res.json()).toEqual({ ok: true });
```

### 17. TypeScript Project References Need Real Build Verification

Observed repo design:

- Root `tsconfig.base.json` is solution-like and references packages.
- Package tsconfigs set `rootDir: "src"` and `outDir: "dist"`.

Why local models break this:

- They put `rootDir: "./src"` in the root config.
- They run `tsc --noEmit` and assume emit config is correct.
- They do not clean stale outputs before build checks.

Correct fix:

- Root config should not force all packages under root `src`.
- Package configs own package `rootDir` and `outDir`.
- Verify with clean builds and file existence checks.

### 18. Do Not Add Dependencies Blindly

Observed risk:

The repo uses npm workspaces and ESLint 9. Version compatibility matters.

Why local models make this mistake:

- They install package versions from memory.
- They do not check peer dependency ranges.
- They use old `typescript-eslint` versions incompatible with the installed ESLint.

Correct fix:

- Inspect `package.json` and `package-lock.json`.
- Use `npm view <pkg> peerDependencies` when network is allowed.
- Install compatible versions only.
- Re-run `npm install`, `npm test`, `npm run typecheck`, and relevant tool command.

## Refactor Prevention Rules Learned From the 2026-07-09 Codebase Scan

These are not optional style preferences. They are guardrails created from concrete code smells found while preparing the `REFACTOR/` prompts.

The goal is to prevent future local-model changes from creating code that technically compiles but later requires broad refactors.

### 19. Do Not Create God Modules

Observed problem:

`packages/core/src/db/queries.ts` contains unrelated responsibilities in one very large file: loop history, loop turns, learning patterns, MCP tracking, quality history, tickets, planning history, flaky tests, analytics, DB maintenance, and raw SQL.

Why it is wrong:

- A model fixing one function must read unrelated code to understand the file.
- The chance of accidental edits rises with file size.
- Tests become broad and slow instead of targeted.
- Shared patterns such as update building, boolean conversion, and JSON serialization get copied instead of reused.
- It becomes hard to decide what is public API and what is an implementation detail.

Why local models make this mistake:

- They append new functions to the file they already opened.
- They avoid creating a small domain module because that requires updating imports/exports.
- They think fewer files means simpler code.

Correct behavior:

- Split by domain, not by arbitrary size.
- Keep one domain concern per module.
- Keep a compatibility re-export during migration if public imports already exist.
- Add import compatibility tests before moving exports.

Bad:

```ts
// db/queries.ts
export async function createLoop() {}
export async function saveMcpScore() {}
export async function saveTicket() {}
export async function getCostTrend() {}
export async function rawQuery() {}
```

Good:

```text
db/queries/
  index.ts
  loop-history.ts
  loop-turns.ts
  mcp.ts
  tickets.ts
  analytics.ts
  maintenance.ts
```

Compatibility wrapper:

```ts
// db/queries.ts
export * from './queries/index.js';
```

Rule:

If a file starts needing section banners like `// TICKET SYNC QUERIES` and `// ANALYTICS`, stop appending and split by domain.

### 20. Comments Must Not Contradict Code

Observed problem:

`packages/core/src/db/queries.ts` says:

```ts
// Uses Drizzle ORM for all queries — never access SQLite directly
```

but the file uses direct `better-sqlite3` calls:

```ts
const db = getDb();
return db.prepare(sql).all(...params);
```

`eslint.config.js` says TypeScript is handled, but `npm run lint` proves it is not.

Why it is wrong:

- Future agents trust comments during quick scans.
- A false comment is worse than no comment because it encodes misinformation.
- Tests that search comments can pass while runtime behavior fails.

Why local models make this mistake:

- They write aspirational comments describing intended architecture instead of actual implementation.
- They use comments to satisfy weak tests that search for keywords.
- They do not run the tool that consumes the config.

Correct behavior:

- Comments must describe what the code currently does.
- If a comment states a guarantee, add a test for that guarantee.
- Remove or correct stale comments in the same change that invalidates them.

Bad:

```ts
// Uses Drizzle ORM for all queries.
db.prepare('SELECT * FROM loop_history').all();
```

Good:

```ts
// Query helpers currently use better-sqlite3 directly.
// Keep SQL identifiers allow-listed because only values can be parameterized.
db.prepare('SELECT * FROM loop_history WHERE id = ?').get(id);
```

Rule:

Never make a test pass by adding a comment. If the behavior matters, execute the behavior.

### 21. Separate Public API From Internal Implementation

Observed problem:

`packages/core/src/index.ts` broadly exports internals:

```ts
export * from './db/queries.js';
export * from './db/schema.js';
export * from './utils/file-system.js';
```

Why it is wrong:

- Every exported symbol becomes a package contract.
- Internal database schema tables become harder to refactor.
- Root package imports can accidentally depend on low-level implementation details.
- Future cleanup becomes a breaking change.

Why local models make this mistake:

- They see failing entrypoint tests and add `export *` until tests pass.
- They confuse "available internally" with "stable public API".
- They do not think about package consumers.

Correct behavior:

- Export only intentional, stable APIs from the root.
- Use subpath exports for advanced APIs if needed.
- Test built package imports, not source text.

Bad:

```ts
export * from './db/schema.js';
export * from './db/queries.js';
```

Good:

```ts
export {
  loadConfig,
  saveConfig,
  createDefaultConfig,
} from './config/loader.js';

export {
  DevLoopError,
  ConfigError,
  DatabaseError,
} from './errors.js';

export type {
  LoopDef,
  ModelRef,
  LoopResult,
} from './types.js';
```

If DB APIs must be public, expose a deliberate subpath:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./db": {
    "types": "./dist/db/index.d.ts",
    "import": "./dist/db/index.js"
  }
}
```

Rule:

Do not use `export *` from a root package barrel unless every symbol in that module is intentionally public and stable.

### 22. Keep CLI Construction Import-Safe

Observed problem:

`packages/cli/src/main.ts` exports `createCli()` and immediately runs:

```ts
createCli().parse();
```

`packages/cli/src/index.ts` re-exports from `main.js`, so importing the package can execute the CLI parser.

Why it is wrong:

- Importing a library API should not parse `process.argv`.
- Tests importing `createCli()` can accidentally execute command behavior.
- Future package consumers get side effects from a normal import.
- CLI binaries and library entrypoints have different responsibilities.

Why local models make this mistake:

- They copy the simplest Commander example.
- They use `main.ts` for both binary and library exports.
- They do not write import-safety tests.

Correct behavior:

Split the CLI into construction, public export, and binary execution:

```text
packages/cli/src/
  cli.ts
  index.ts
  main.ts
```

Good:

```ts
// cli.ts
import { Command } from 'commander';

export function createCli(): Command {
  return new Command()
    .name('dev-loop')
    .description('AI-powered development loop automation')
    .version('0.1.0');
}
```

```ts
// index.ts
export { createCli } from './cli.js';
```

```ts
// main.ts
#!/usr/bin/env node
import { createCli } from './cli.js';

createCli().parseAsync().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
```

Package manifest should point imports to `index` and binary to `main`:

```json
"bin": {
  "dev-loop": "./dist/main.js"
},
"main": "./dist/index.js",
"types": "./dist/index.d.ts"
```

Rule:

Only the binary entrypoint may call `.parse()` or `.parseAsync()`. Public imports must be side-effect safe.

### 23. Do Not Build Generic Update Helpers Without Identifier Allow-Lists

Observed problem:

Some query helpers build update SQL using raw object keys:

```ts
for (const [key, value] of Object.entries(updates)) {
  fields.push(`${key} = ?`);
  values.push(value);
}
```

Why it is wrong:

- SQL placeholders parameterize values, not column names.
- A malicious or mistaken key can create invalid SQL or injection risk.
- `Partial<Record<string, unknown>>` destroys compile-time safety.

Why local models make this mistake:

- They know values should be parameterized but forget identifiers cannot be.
- They prefer a generic helper because it is shorter.
- They do not test unsupported keys.

Correct behavior:

Use a typed allow-list for every dynamic SQL identifier:

```ts
const LOOP_TURN_UPDATE_COLUMNS = {
  model: 'model',
  inputTokens: 'input_tokens',
  outputTokens: 'output_tokens',
  success: 'success',
  errorMessage: 'error_message',
} as const;

type LoopTurnUpdateKey = keyof typeof LOOP_TURN_UPDATE_COLUMNS;
```

Build updates through the allow-list:

```ts
function buildUpdate<T extends string>(
  updates: Partial<Record<T, unknown>>,
  columns: Record<T, string>,
): { setSql: string; values: unknown[] } | null {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [rawKey, value] of Object.entries(updates) as Array<[T, unknown]>) {
    if (value === undefined) continue;

    const column = columns[rawKey];
    if (!column) {
      throw new Error(`Unsupported update field: ${rawKey}`);
    }

    fields.push(`${column} = ?`);
    values.push(value);
  }

  return fields.length === 0 ? null : { setSql: fields.join(', '), values };
}
```

Required test:

```ts
await expect(updateLoopTurn(1, {
  'success = 1 WHERE 1 = 1 --' as never: true,
})).rejects.toThrow(/Unsupported update field/);
```

Rule:

Any dynamic SQL identifier must come from an explicit map. Never interpolate arbitrary object keys into SQL.

### 24. Never Use JavaScript Truthiness for Persistence Defaults

Observed problem:

The query layer often uses:

```ts
params.inputTokens || null
params.success ? 1 : 0
params.seenCount || 1
limit || 10
```

Why it is wrong:

- `0` is often a valid metric.
- `false` is often a valid state.
- Empty string may be an intentionally supplied value in some domains.
- `undefined` and `false` should not always mean the same thing.

Why local models make this mistake:

- `||` is shorter than explicit nullish/default handling.
- They test only happy-path nonzero values.
- They forget persistence layers must preserve exact values.

Correct behavior:

Use `??` when only `null`/`undefined` should default:

```ts
params.inputTokens ?? null
params.seenCount ?? 1
limit ?? 10
```

Use explicit boolean conversion:

```ts
params.success === undefined ? null : Number(params.success)
```

Use named helpers when the pattern repeats:

```ts
export function sqlNullable<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

export function sqlBoolean(value: boolean | null | undefined): number | null {
  return value === undefined || value === null ? null : Number(value);
}

export function sqlBooleanDefault(value: boolean | undefined, defaultValue: boolean): number {
  return Number(value ?? defaultValue);
}
```

Required tests:

```ts
it('preserves zero and false values', async () => {
  const id = await createLoopTurn({
    loopId,
    turnNumber: 1,
    agent: 'tester',
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    success: false,
  });

  const row = await getLoopTurn(id);
  expect(row.input_tokens).toBe(0);
  expect(row.output_tokens).toBe(0);
  expect(row.cost_usd).toBe(0);
  expect(row.success).toBe(0);
});
```

Rule:

In DB/config code, `||` is suspicious. Use `??` or an explicit boolean check unless you truly want all falsy values to become defaults.

### 25. Config Loading Must Be a Pipeline, Not a Catch-All Function

Observed problem:

`packages/core/src/config/loader.ts` currently owns YAML parsing, env interpolation, env overrides, default merging, validation, warning output, file creation, and saving.

It also catches broad failures and can return defaults:

```ts
catch (err) {
  console.warn('Failed to parse config file:', err);
  return ConfigSchema.parse({});
}
```

Why it is wrong:

- Invalid user config can be silently ignored.
- Tests cannot target individual stages cleanly.
- Logging policy is mixed with parsing policy.
- Future changes to env overrides can break YAML parsing or saving.

Why local models make this mistake:

- They try to make one public function "robust".
- They treat "not throwing" as good UX.
- They avoid designing explicit error policy.

Correct behavior:

Split into stages:

```text
config/
  parse.ts
  interpolate.ts
  env-overrides.ts
  merge.ts
  writer.ts
  loader.ts
```

Keep `loader.ts` as orchestration:

```ts
const raw = fs.readFileSync(filePath, 'utf8');
const parsed = parseYamlObject(raw);
const interpolated = interpolateConfig(parsed, { env, onMissingEnv });
const withDefaults = mergeDefaults(defaultConfig, interpolated);
const withEnv = applyEnvOverrides(withDefaults, { env });
const validated = ConfigSchema.parse(withEnv);
return validated;
```

Use typed errors for invalid provided config:

```ts
throw new ConfigError(
  'dev-loop.yaml failed validation.',
  'Fix the reported config keys and run the command again.',
  { issues: validated.error.errors },
);
```

Fallback is acceptable only for missing optional config files:

```ts
if (!fs.existsSync(filePath)) {
  return ConfigSchema.parse({});
}
```

Rule:

Missing config may default. Invalid config should usually throw. If compatibility requires fallback, expose it as an explicit option and test that option.

### 26. Low-Level Modules Should Not Log Directly

Observed problem:

Config code calls `console.warn` while parsing/interpolating/loading.

Why it is wrong:

- Libraries should not decide UI/logging behavior.
- Tests become noisy.
- Callers cannot route warnings to CLI, UI, or telemetry consistently.
- Logs can accidentally include secrets unless a redaction layer exists.

Why local models make this mistake:

- They want to show helpful messages quickly.
- They put CLI behavior into core modules.
- They do not distinguish library errors from command output.

Correct behavior:

Return warnings or accept an `onWarning` callback:

```ts
export interface ConfigWarning {
  code: string;
  message: string;
  details?: unknown;
}

export interface LoadConfigOptions {
  onWarning?: (warning: ConfigWarning) => void;
}
```

Then the CLI decides how to display it:

```ts
const config = await loadConfig({
  onWarning: warning => logger.warn(formatConfigWarning(warning)),
});
```

Rule:

Core modules throw typed errors or return structured warnings. CLI/UI layers decide how to print them.

### 27. Test Harness Code Should Be Shared, Not Rewritten Per Feature

Observed problem:

Tests repeatedly compute repo paths, parse package JSON, run shell commands, and manage temporary files by hand.

Why it is wrong:

- Every feature can invent a slightly different and weaker pattern.
- One test uses root commands; another uses package prefix commands.
- Mutating tests can accidentally delete real outputs.
- Hardcoded paths creep in.

Why local models make this mistake:

- They optimize for the single test file in front of them.
- They do not search for existing test helpers.
- If no helper exists, they create local one-off helpers.

Correct behavior:

Create shared test helpers:

```text
packages/core/src/__tests__/helpers/
  repo-paths.ts
  package-json.ts
  commands.ts
  temp-dir.ts
  database.ts
```

Command helper rule:

```ts
export function runNpmScript(script: string): string {
  return execFileSync('npm', ['run', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
```

Expected failure helper:

```ts
export function expectCommandToFail(command: string, args: string[]): CommandResult {
  try {
    execFileSync(command, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    return normalizeCommandError(error);
  }

  throw new Error(`Expected command to fail: ${command} ${args.join(' ')}`);
}
```

Rule:

Do not write `execSync`, repo-root discovery, temp-dir cleanup, or package-json parsing from scratch in every test file. Add or reuse a helper.

### 28. Mutating Tests Must Use Fixtures or Clean All Related State

Observed problem:

A build test runs `tsc` inside `packages/core`, asserts `dist`, then deletes `dist` but leaves `tsconfig.tsbuildinfo`.

Why it is wrong:

- It mutates the real workspace.
- It leaves incremental state inconsistent with output files.
- Later build commands can skip emit and still exit successfully.

Why local models make this mistake:

- They want tests to "clean up" after themselves.
- They do not know TypeScript incremental metadata affects emit.
- They assume deleting `dist` is enough.

Correct behavior:

Use a temp fixture:

```ts
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-build-'));
try {
  fs.mkdirSync(path.join(temp, 'src'));
  fs.writeFileSync(path.join(temp, 'src/index.ts'), 'export const ok = true;');
  fs.writeFileSync(path.join(temp, 'tsconfig.json'), JSON.stringify({
    extends: fromRoot('tsconfig.base.json'),
    compilerOptions: {
      rootDir: 'src',
      outDir: 'dist',
      tsBuildInfoFile: 'dist/.tsbuildinfo',
    },
    include: ['src/**/*.ts'],
  }));

  execFileSync('npx', ['tsc', '-p', 'tsconfig.json'], { cwd: temp });
  expect(fs.existsSync(path.join(temp, 'dist/index.js'))).toBe(true);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
```

If a test must touch a real package, clean all related state:

```bash
rm -rf packages/core/dist packages/core/tsconfig.tsbuildinfo
npx tsc -p packages/core/tsconfig.json
```

Rule:

Never delete real build output in a test unless you also restore or clean all compiler/cache state that refers to it.

### 29. Strong Types Should Connect Names to Payloads

Observed problem:

`EventBus` stores listeners as `Listener<any>` and the generic methods do not strongly bind event name to payload shape.

Why it is wrong:

- It lets event payloads drift.
- Compile-time safety exists in the type map but is weakened by the implementation.
- Future emitters can send the wrong payload and tests may not catch it.

Why local models make this mistake:

- They use `any` to satisfy generic collection storage.
- They type the map but not the relationship between key and value.
- They do not add negative type tests.

Correct behavior:

Bind event names to payloads:

```ts
export type EventName = keyof EventPayloadMap;
export type Listener<Name extends EventName> = (payload: EventPayloadMap[Name]) => void;

emit<Name extends EventName>(name: Name, payload: EventPayloadMap[Name]): void {
  for (const listener of this.listeners[name] ?? []) {
    listener(payload);
  }
}
```

Add type tests:

```ts
bus.emit('loop:start', { loopId: 'loop-1' });

// @ts-expect-error loop:start does not accept model payload
bus.emit('loop:start', { provider: 'openai', model: 'gpt-4' });
```

Rule:

If a TypeScript API has a key-to-value relationship, encode that relationship in the generic signature. Do not hide it behind `any`.

### 30. Do Not Create Fake Package Directories for Feature Tests

Observed problem:

`packages/feature007/test.test.ts` exists even though root workspaces are only:

- `packages/core`
- `packages/cli`
- `packages/ui`

Why it is wrong:

- It looks like a package but is not a workspace package.
- It can be picked up by global test globs.
- It hardcodes local paths.
- It tests comments instead of behavior.

Why local models make this mistake:

- They create a new folder named after the feature instead of placing tests near the code under test.
- They do not inspect workspaces before adding files under `packages/`.
- They search for "somewhere tests will run" instead of following repo structure.

Correct behavior:

- Put core tests under `packages/core/src/__tests__/`.
- Put CLI tests under `packages/cli/src/__tests__/` if/when CLI has tests.
- Put UI tests under `packages/ui/src/__tests__/` if/when UI has tests.
- Do not create new `packages/<feature>` directories unless adding a real workspace and updating `package.json`.

Rule:

Never add arbitrary directories under `packages/`. Every direct child of `packages/` must either be a declared workspace package or not exist.

### 31. Refactor in Mechanical, Behavior-Preserving Steps

Observed risk:

The requested refactors are valuable, but a local model may try to split modules, change SQL behavior, rename exports, and add new features in one pass.

Why it is wrong:

- It makes regressions impossible to isolate.
- It mixes bug fixes with architecture changes.
- It often breaks public API or tests silently.

Why local models make this mistake:

- They try to complete the whole refactor prompt at once.
- They interpret "improve" as permission to redesign.
- They do not create compatibility layers.

Correct behavior:

Use this sequence:

1. Add characterization tests for current behavior.
2. Move code without changing logic.
3. Keep compatibility exports.
4. Run tests.
5. Only then improve internals in a separate change.

Example:

```ts
// Step 1: old file remains public
export * from './queries/index.js';
```

Then move one domain:

```ts
// queries/loop-history.ts
export async function createLoop(...) { ...same SQL as before... }
```

Only after the move is green, change implementation details such as value serialization helpers.

Rule:

A refactor should first preserve behavior. Behavior changes need separate tests and a separate task.

### 32. Package Exports Must Match Runtime Intent

Observed problem:

CLI package exports point public imports to the binary-style `main` output, while `main.ts` runs `.parse()`.

Why it is wrong:

- Package consumers import the executable entrypoint instead of a side-effect-free API.
- Tests may import code and accidentally execute process behavior.
- Build output can exist but be semantically wrong.

Why local models make this mistake:

- They set `main` to whatever file has code.
- They make `bin`, `main`, and `exports["."]` point to the same file without considering side effects.

Correct behavior:

Use separate runtime roles:

```json
"bin": {
  "dev-loop": "./dist/main.js"
},
"main": "./dist/index.js",
"types": "./dist/index.d.ts",
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  }
}
```

Rule:

`bin` points to executable code. `main` and `exports["."]` point to import-safe library code.

### 33. Prefer Structured Warnings and Errors Over Human-Only Strings

Observed problem:

Some code emits human-only warning strings:

```ts
console.warn('Config validation warnings:', JSON.stringify(errors, null, 2));
```

Why it is wrong:

- Tests must match strings instead of structured fields.
- CLI/UI cannot format messages differently.
- Error codes cannot be used for docs or remediation.
- Secret redaction is harder.

Why local models make this mistake:

- They write what they would want to see in a terminal.
- They do not separate library data from presentation.

Correct behavior:

Use structured warnings:

```ts
interface ConfigWarning {
  code: 'config.validation.failed' | 'config.env.missing';
  message: string;
  details?: unknown;
}
```

Then presentation code formats it:

```ts
function formatWarning(warning: ConfigWarning): string {
  return `${warning.code}: ${warning.message}`;
}
```

Rule:

Core modules should expose machine-readable codes and structured details. CLI/UI modules convert them to text.

### 34. Keep Source, Build Output, Cache, and Tests Mentally Separate

Observed problem:

The repo has source files, `dist` outputs, `.tsbuildinfo`, Turbo cache logs, coverage output, and generated review/bug/refactor docs. Local models often treat all files as equal.

Why it is wrong:

- Build output can be stale.
- Cache files can hide missing emit.
- Coverage output should not be reviewed as source.
- Generated docs can be claims, not evidence.

Why local models make this mistake:

- They scan broad `find` output and do not classify files.
- They edit whatever file mentions the keyword.
- They verify from generated artifacts instead of source/commands.

Correct behavior:

Classify before editing:

- Source: `packages/*/src/**/*.ts`
- Config: `package.json`, `tsconfig*.json`, `turbo.json`, `eslint.config.js`, `vitest.config.ts`
- Generated output: `dist/`, `coverage/`, `.turbo/`, `*.tsbuildinfo`
- Work queues: `FEATURES/`, `REVIEW_FEATURES/`, `BUGS/`, `REFACTOR/`, `COMPLETED_*`

Rule:

Do not use generated output or review docs as proof. Use source plus commands.

### 35. Keep the Repository Tree Deliberate and Bounded

Observed tree hygiene problems from the 2026-07-09 scan:

- `packages/feature007/test.test.ts` exists under `packages/`, but root `package.json` workspaces only declare `packages/cli`, `packages/core`, and `packages/ui`.
- Root `dist/` exists and contains compiled copies of core source and test files, even though package builds should emit under `packages/*/dist`.
- Package-local generated folders exist, such as `packages/cli/dist`, `packages/ui/dist`, `packages/*/.turbo`, and `packages/*/tsconfig.tsbuildinfo`.
- `coverage/.tmp` and `.turbo/cache` contain many generated files.
- `REVIEW_FEATURES` contains both feature review files and a bug review file: `BUG028-eslint-typescript-config-review.md`.
- Work queue folders (`FEATURES`, `BUGS`, `REVIEW_FEATURES`, `COMPLETED_*`, `REFACTOR`) are prompt/process state, not source code, and should not be treated as implementation modules.

Why it is wrong:

- Tools may accidentally pick up fake packages, stale build output, or old test files.
- `packages/*` globs are broader than the actual workspace list.
- Root `dist/` can make imports or manual inspection look successful while package `dist/` is missing or stale.
- Review/bug documents mixed in the wrong queue confuse the local model about what is pending, done, or under review.
- Large generated directories waste context and cause the model to reason from artifacts instead of source.

Why local models make this mistake:

- They treat every folder under `packages/` as a workspace package.
- They add feature-specific scratch folders instead of using the existing test structure.
- They inspect `dist/` and generated files as if they were source.
- They rely on broad globs like `packages/*` without checking root `workspaces`.
- They move or create review documents based on names instead of queue semantics.
- They do not run a tree hygiene scan before declaring work complete.

Correct source-of-truth rules:

- The workspace package list comes from root `package.json` `workspaces`, not from `find packages -maxdepth 1`.
- The TypeScript build graph comes from `tsconfig.base.json` `references`.
- Package source lives under declared workspace `src/` directories.
- Build output lives under the owning package `dist/` only.
- Root `dist/` is suspicious unless a root build explicitly owns it.
- Tests should live under the real package that owns the behavior, usually `packages/core/src/__tests__/`.
- `FEATURES`, `BUGS`, `REVIEW_FEATURES`, `COMPLETED_FEATURES`, `COMPLETED_BUGS`, and `REFACTOR` are workflow queues. Do not import from them and do not use them as source modules.

Correct cleanup/refactor approach:

1. Inventory before editing:

```bash
find . -maxdepth 3 -type d -not -path './node_modules*' -not -path './.git*' -print | sort
find packages -maxdepth 2 -type f -name package.json -print | sort
```

2. Compare actual package directories against root `package.json` workspaces.
3. Remove or document non-workspace directories under `packages/`.
4. Keep generated outputs ignored and disposable:

```bash
find . -maxdepth 3 -type f \( -name '*.tsbuildinfo' -o -path './dist/*' -o -path './coverage/*' -o -path './.turbo/*' \) -print | sort
```

5. Narrow broad test globs when they accidentally include non-workspace scratch tests.
6. Do not move queue documents unless the exact acceptance commands pass.
7. If a cleanup is requested, delete generated artifacts only when they are ignored/disposable and never delete source or user-authored queue documents without explicit instruction.

Recommended tree hygiene checks:

```bash
# Real workspace declarations
node -e "const p=require('./package.json'); console.log(p.workspaces.join('\n'))"

# Package-looking directories that are not necessarily workspaces
find packages -maxdepth 1 -mindepth 1 -type d -print | sort

# Generated artifacts that should not guide implementation decisions
find . -maxdepth 3 -type f \( -name '*.tsbuildinfo' -o -path './dist/*' -o -path './coverage/*' -o -path './.turbo/*' \) -print | sort

# Tests outside declared package src trees
find . -path './node_modules' -prune -o -name '*.test.ts' -print | sort
```

Expected model behavior:

- Before adding a new folder, ask: "Which existing package owns this behavior?"
- Before using a glob, ask: "Does this include fake packages, build output, or workflow docs?"
- Before reading generated files, ask: "Can I read the source file instead?"
- Before marking a feature complete, ask: "Did I run the acceptance command from the queue document?"
- Before moving files between queues, ask: "Is this a source file, generated artifact, or workflow document?"

Suggested future cleanup tasks:

- Delete `packages/feature007` after moving any useful test assertion into `packages/core/src/__tests__/`.
- Delete root `dist/` unless a root package build intentionally owns it.
- Clean `coverage/`, `.turbo/`, package-local `.turbo/`, and `*.tsbuildinfo` before final verification when build/test output is confusing.
- Keep `REVIEW_FEATURES` limited to review artifacts for features, and move bug review artifacts to the appropriate bug queue.
- Consider narrowing `vitest.config.ts` include patterns to declared package source trees only.

### 36. ESLint Fix Reviews Must Prove Both the Command and the Regression Test

Observed problem from `REVIEW_FEATURES/BUG028-eslint-typescript-config-review.md`:

- The review says `npm run lint` passes, and this was true on the 2026-07-09 check: exit code `0`, `0 errors`, warnings only.
- The review also says `packages/core/src/__tests__/bug028-eslint-typescript.test.ts` validates the fix, but that targeted test failed.
- The failing test asserted a fragile regex against `eslint.config.js` text instead of proving ESLint behavior:

```text
expected eslint.config.js content to match /\*\/dist\*\//
```

- The actual config contains the correct ignore pattern `**/dist/**`, but the test regex is wrong.
- The config also emits duplicate unused-variable warnings because both core `no-unused-vars` and `@typescript-eslint/no-unused-vars` are active for `.ts` files.

Why it is wrong:

- A review document cannot claim a test was added successfully if that exact test does not pass.
- Text-matching config files is a weak proof and often fails on equivalent valid config syntax.
- Duplicate lint warnings make signal noisy and encourage future models to ignore lint output.
- Warning-only lint can be acceptable for an incremental bug fix, but the review must state that the command exits `0` with warnings and list the warnings as follow-up debt.

Why local models make this mistake:

- They stop after the acceptance command and forget to run the new regression test.
- They test config implementation details instead of running ESLint against a small TypeScript fixture or the real command.
- They add a TypeScript ESLint rule but forget to disable the overlapping core ESLint rule.
- They describe installed packages imprecisely, for example saying `@typescript-eslint/parser` was installed when the repo actually uses the `typescript-eslint` meta package import.

Correct fix/review pattern:

1. Verify the acceptance command exactly:

```bash
npm run lint
```

2. Verify the regression test exactly:

```bash
npm test -- packages/core/src/__tests__/bug028-eslint-typescript.test.ts
```

3. The regression test should prefer behavior over config-text regexes. Good options:

```ts
execSync('npm run lint', { cwd: rootDir, stdio: 'pipe' });
```

or create a temporary `.ts` fixture containing TypeScript-only syntax and run ESLint on that fixture with the repo config.

4. If config shape must be inspected, import the flat config or assert broad semantic facts. Do not require one exact glob spelling when `**/dist/**`, `dist/**`, and other equivalent patterns may be valid.
5. In the TypeScript override, disable the core rule when enabling the TypeScript-aware version:

```js
rules: {
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
}
```

6. Avoid empty override blocks like:

```js
{
  files: ['**/*.test.ts'],
}
```

Empty config entries do not communicate behavior. Add real test-specific rules/globals or delete the block.

7. Keep `no-undef` off for TypeScript files if TypeScript typechecking owns undefined-name detection, but make sure `npm run typecheck` is part of verification.

Review verdict rule:

- `PASSING`: `npm run lint` exits `0`, the bug regression test exits `0`, and any warnings are documented as non-blocking debt.
- `PARTIAL`: `npm run lint` exits `0` but the regression test fails or the config produces avoidable duplicate warnings.
- `FAIL`: `npm run lint` exits non-zero or TypeScript parsing errors remain.

### 37. Query God-Module Splits Must Preserve the Exact Public API

Observed problem from `REVIEW/REFACTOR001-split-db-query-god-module.md`:

`packages/core/src/db/queries.ts` was split into domain files under `packages/core/src/db/queries/`, but the compatibility re-export used the wrong relative path:

```ts
// Wrong from packages/core/src/db/queries.ts:
export * from './db/queries/index.js';

// Correct:
export * from './queries/index.js';
```

The split also dropped existing public exports and changed some function signatures. Missing exports found during audit:

```text
getBestModelForFeatureType
saveTicket
getTicket
logNotification
getNotificationLog
```

One concrete break: the original `updateModelProfile` accepted one params object:

```ts
await updateModelProfile({
  model: 'local-qwen',
  provider: 'ollama',
  featureType: 'api',
  successRate: 0.9,
});
```

The refactor changed it to an `id, updates` shape. That is a behavior/API change, not a mechanical split.

Why it is wrong:

- A compatibility file must preserve the old import path exactly.
- A refactor must not remove, rename, or reshape public exported functions.
- A refactor must not invent schema columns or new repository APIs while moving code.
- `npm run typecheck` is not enough in this repo; `npm run build` caught missing exports and the bad re-export path.

Why local models make this mistake:

- They treat a split as permission to redesign APIs.
- They compare file names instead of comparing exported symbols.
- They do not run import-path smoke tests from both the old path and the new index path.
- They do not build the package after moving files.

Correct fix:

1. Restore `packages/core/src/db/queries.ts` to:

```ts
export * from './queries/index.js';
```

2. Generate the old export list from `git show HEAD:packages/core/src/db/queries.ts` and compare it with the split modules.
3. Move every original exported function into a domain file without changing its name or signature.
4. Keep the original SQL behavior first; extract shared helpers only when the resulting SQL and bound values stay equivalent.
5. Add a compatibility test:

```ts
import * as oldQueries from '../db/queries.js';
import * as newQueries from '../db/queries/index.js';

it('keeps query public API stable during the split', () => {
  expect(newQueries.createLoop).toBe(oldQueries.createLoop);
  expect(newQueries.updateLoop).toBe(oldQueries.updateLoop);
  expect(newQueries.getBestModelForFeatureType).toBe(oldQueries.getBestModelForFeatureType);
  expect(newQueries.saveTicket).toBe(oldQueries.saveTicket);
  expect(newQueries.logNotification).toBe(oldQueries.logNotification);
});
```

Verification:

```bash
npx vitest run packages/core/src/__tests__/db-best-model.test.ts packages/core/src/__tests__/query-integration.test.ts packages/core/src/__tests__/db-create-loop.test.ts packages/core/src/__tests__/db-update-loop.test.ts packages/core/src/__tests__/db-order-by.test.ts
npm run build
npm run typecheck
```

Expected result: all commands exit `0`, and there are no missing-export or failed-url errors for `../db/queries.js`.

## REVIEW/FEATURE026-099 Audit Fixes (2026-07-10)

On 2026-07-09/10, all 74 pending items in `REVIEW/` (FEATURE026 through FEATURE099) were independently re-verified against the actual current source, not the self-reported "Implementation Notes" or a prior reviewer's "PASSING" verdict. 62 were genuinely correct. The 12 sections below (38-49) document the real defects found, fixed with TDD, and folded back into this knowledge base so the same mistakes are not repeated.

### 38. Optional interface method invoked without a guard in test

Observed problem:

In `packages/core/src/__tests__/models/feature041-model-provider.test.ts:96`, the test called `provider.streamGenerate({...})` directly in a `for await` loop. `ModelProvider.streamGenerate` is declared optional (`streamGenerate?(params): AsyncIterable<ModelStreamEvent>` in `packages/core/src/models/types.ts:94`), so `tsc --noEmit -p packages/core/tsconfig.json` failed with `TS2722: Cannot invoke an object which is possibly 'undefined'`.

Why it is wrong:

- Calling an optional method without narrowing violates `strictNullChecks`.
- Vitest (esbuild) doesn't type-check, so the bug was invisible at test-run time and only surfaced under real `tsc`.

Why local models make this mistake:

- They validate against the fast test runner, not the strict compiler, and treat a green `vitest run` as proof the code type-checks.
- They pattern-match "the interface says this field exists" and skip the optional-modifier (`?`) implication that callers must guard it.

Correct fix:

Add a runtime guard (or throw) before invoking the optional method, which also documents the "streaming is optional" contract being tested.

```typescript
expect(provider.streamGenerate).toEqual(expect.any(Function));
if (!provider.streamGenerate) {
  throw new Error('Expected FakeProvider to implement streamGenerate for this test.');
}
for await (const event of provider.streamGenerate({ model: 'fake-model', messages: [{ role: 'user', content: 'stream' }] })) {
  events.push(event);
}
```

Verification:

```bash
cd packages/core && npx vitest run models/feature041
npx tsc --noEmit -p packages/core/tsconfig.json
```

### 39. Direct `as Type` cast to an incompatible DOM shape

Observed problem:

In `packages/core/src/__tests__/lmstudio/feature044-lmstudio.test.ts:15-26`, the `streamResponse()` test helper built a partial fake `Response` (only `ok`, `status`, `statusText`, `body`) and force-cast it with `as Response`. `tsc --noEmit` failed with `TS2352: Conversion ... may be a mistake because neither type sufficiently overlaps with the other`, since the mock is missing `headers`, `type`, `url`, etc., and its `body` is an `AsyncGenerator` rather than a `ReadableStream<Uint8Array> | null`.

Why it is wrong:

- TypeScript only allows a direct assertion between two types when one is assignable to (or a subtype of) the other; a partial mock isn't "sufficiently overlapping" with the full DOM `Response` interface.
- Vitest's esbuild transform strips types, so the invalid cast never failed at test-run time, only under real `tsc`.

Why local models make this mistake:

- They generate minimal mocks matching only the fields actually read at runtime, and reach for `as Type` to silence the compiler without checking whether the assertion is structurally legal.
- They copy a "double-cast via unknown" idiom inconsistently, using a direct cast in one file and the safe form elsewhere.

Correct fix:

Route the assertion through `unknown` first, exactly as TypeScript's own error message suggests, since the test only needs to satisfy a narrower `FetchLike` contract, not the full `Response` shape.

```typescript
function streamResponse(chunks: string[]): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: (async function* () {
      for (const chunk of chunks) yield new TextEncoder().encode(chunk);
    })(),
  } as unknown as Response;
}
```

Verification:

```bash
cd packages/core && npx vitest run src/__tests__/lmstudio
npx tsc --noEmit -p packages/core/tsconfig.json
```

### 40. Implicit-return arrow callback leaks `Array.push`'s number return type

Observed problem:

In `packages/core/src/__tests__/vram/feature046-vram.test.ts:91-92`, test hooks were written as single-expression arrows `async model => hooks.push(...)`. Because `Array.prototype.push` returns the new array length (`number`), these hooks inferred as `(model: string) => Promise<number>`, which is not assignable to `VramManager`'s declared `onLoad`/`onUnload` signature `(model: string) => void | Promise<void>` (`packages/core/src/models/vram.ts:35-36`). `tsc --noEmit` reported two `TS2322` errors.

Why it is wrong:

- A single-expression arrow function's body value becomes its (wrapped-in-Promise) return value; `push`'s numeric return leaks into the inferred type even though the caller only wanted a side effect.
- `void`-returning callback types do not automatically discard mismatched non-void return values in this position — the assignability check still fails on `Promise<number>` vs `Promise<void>`.

Why local models make this mistake:

- They favor terse single-expression arrows for "fire and forget" callbacks without checking what the wrapped expression returns.
- They don't realize that satisfying a `(...) => void` parameter type by supplying a function that returns a non-`void` value requires either braces or an explicit discard, when the mismatch is wrapped in a `Promise`.

Correct fix:

Wrap the hook bodies in braces so the arrow explicitly resolves to `void` instead of `push`'s return value.

```typescript
onLoad: async model => { hooks.push(`load:${model}`); },
onUnload: async model => { hooks.push(`unload:${model}`); },
```

Verification:

```bash
cd packages/core && npx vitest run src/__tests__/vram
npx tsc --noEmit -p packages/core/tsconfig.json
```

### 41. Public method's declared parameter type narrower than what it internally force-casts to

Observed problem:

`ClaudeCodeCliVerifier.review()` in `packages/core/src/models/verifier/claude-code-cli.ts:37-38` was typed to accept `ReviewParams` but immediately did `const claudeParams = params as ClaudeReviewParams;` to reach the wider fields (`diff`, `testOutput`, `uncertainTags`, `mcpUsage`) that `buildClaudeReviewPrompt` requires. Any caller passing those fields as an object literal (as `packages/core/src/__tests__/claude-verifier/feature054-claude-verifier.test.ts:46-54` does) hit `TS2353: Object literal may only specify known properties, and 'diff' does not exist in type 'ReviewParams'`.

Why it is wrong:

- The public signature lied about what the method actually needed; the internal `as ClaudeReviewParams` cast is an unsafe escape hatch masking a real type mismatch, not a legitimate narrowing.
- Every realistic caller that needs to pass `diff`/`testOutput`/`uncertainTags`/`mcpUsage` — the entire point of this verifier — cannot legally construct the argument as an object literal.

Why local models make this mistake:

- They implement to satisfy an interface (`IVerifier.review(params: ReviewParams)`) literally, then patch the internal type gap with a cast instead of widening the concrete class's method signature (not realizing TypeScript checks method parameters bivariantly, so narrowing here is legal).
- Vitest's type-stripped transform hides the excess-property-check failure, so the cast "worked" under the test runner they used to self-verify.

Correct fix:

Widen the declared parameter type on the implementing class to `ClaudeReviewParams` and drop the internal cast.

```typescript
export class ClaudeCodeCliVerifier implements IVerifier {
  async review(params: ClaudeReviewParams): Promise<ReviewResult> {
    const prompt = buildClaudeReviewPrompt(params);
    // ...
  }
}
```

Verification:

```bash
cd packages/core
npx tsc --noEmit -p tsconfig.json
npx vitest run claude-verifier
```

### 42. A stated acceptance criterion with no implementation, and a naming trap in the fix

Observed problem:

FEATURE055's acceptance criterion "Verifier factory can choose any configured verifier" had no corresponding code. Four classes (`ClaudeCodeCliVerifier`, `ClaudeCliVerifier`, `CodexCliVerifier`, `ApiVerifier`) all implement `IVerifier` and are individually exported from `models/verifier/index.ts`, `models/index.ts`, and `src/index.ts`, but `grep -rn "factory\|Factory" packages/core/src` (excluding tests) returned nothing. `engine.ts`'s `selectVerifier` dependency hook picks a model/provider pair for generation — an unrelated concept — and never constructs any of the four verifier classes.

Why it is wrong:

- Every future caller (CLI, loop engine, config-driven selection) would have to independently import all four classes and hand-roll the same kind-to-class switch, defeating the point of a factory.
- The acceptance criterion was treated as satisfied by the review process even though no code path exercised it — a documentation/implementation gap.

Why local models make this mistake:

- They implement the concrete classes listed in "Implementation Notes" and stop, because those are the tangible, easy-to-verify units — a factory is an aggregation step that's easy to forget once the parts exist.
- They pattern-match "acceptance criteria" against the classes present rather than tracing whether a function actually satisfies the criterion's verb ("can choose") — no caller, no choice, no criterion met.

Correct fix:

Add `packages/core/src/models/verifier/factory.ts` exporting `createVerifier` over a discriminated union keyed by `kind`. Critically, the union type must NOT be named `VerifierConfig` — that name is already taken by an unrelated type in `src/types.ts` (a quality-gate config re-exported from `src/index.ts`). Reusing the name would produce a duplicate-export collision once wired through `models/index.ts` → `src/index.ts`. Name it `VerifierFactoryConfig` instead — always grep for an export name across the whole package's barrel files before introducing it, not just within the file being edited.

```typescript
export type VerifierFactoryConfig =
  | { kind: 'claude-code-cli'; options: ClaudeCliVerifierOptions }
  | { kind: 'claude-cli'; options: ClaudeCliVerifierOptions }
  | { kind: 'codex-cli'; options: CodexCliVerifierOptions }
  | { kind: 'api-verifier'; options: ApiVerifierOptions };

export function createVerifier(config: VerifierFactoryConfig): IVerifier {
  switch (config.kind) {
    case 'claude-code-cli': return new ClaudeCodeCliVerifier(config.options);
    case 'claude-cli': return new ClaudeCliVerifier(config.options);
    case 'codex-cli': return new CodexCliVerifier(config.options);
    case 'api-verifier': return new ApiVerifier(config.options);
    default: {
      const exhaustive: never = config;
      throw new Error(`Unknown verifier kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}
```

Verification:

```bash
cd packages/core
npx vitest run verifier-factory
npx tsc --noEmit -p tsconfig.json
```

### 43. Fallback provider used as fallback model name across four call sites

Observed problem:

`runFallbackPath()` in `packages/core/src/runtime/engine.ts` never read `options.config.fallback.model`. Instead it substituted `options.config.fallback.provider` — an enum of `'claude-code-cli' | 'codex-cli' | 'api'` — as the "model" in four places: the `fallbackGenerate()` request, the `createLoopTurn()` call for the fallback turn, `saveMcpScore()`, and `updateLoop()` on both the success and failure exit paths. A user configuring `fallback: { provider: api, model: gpt-4-turbo }` never got `gpt-4-turbo` used or recorded anywhere — every site silently stored the literal string `"api"`.

Why it is wrong:

- `provider` and `model` are distinct, independently-defined fields in `fallbackSectionSchema`; conflating them means a real adapter dispatching on `request.model.model` would try to call a model literally named `"api"`.
- Cost/quality analysis of "which model rescued this feature" becomes impossible since `loop_history.fallback_model` only ever contains the provider name, never the configured model.

Why local models make this mistake:

- `provider` and `model` are adjacent, same-typed (`string`) config fields with overlapping names, and it's easy to grab the one already in scope (`provider`, used earlier in the same object literal) rather than checking whether a sibling field exists.
- The bug is invisible in fake/mocked tests where `fallbackGenerate` and friends don't actually branch on the model string, so nothing fails until a real adapter or a DB inspection is involved.

Correct fix:

Compute `fallbackModelName` once from `options.config.fallback.model ?? options.config.fallback.provider`, and use that variable everywhere a fallback model name is needed instead of re-reading `.provider`.

```typescript
// before
model: { provider: options.config.fallback.provider, model: options.config.fallback.provider },
// ...model: options.config.fallback.provider (createLoopTurn, saveMcpScore)
// ...fallbackModel: options.config.fallback.provider (updateLoop x2)

// after
const fallbackModelName = options.config.fallback.model ?? options.config.fallback.provider;
model: { provider: options.config.fallback.provider, model: fallbackModelName },
// ...model: fallbackModelName (createLoopTurn, saveMcpScore)
// ...fallbackModel: fallbackModelName (updateLoop x2)
```

Verification:

```bash
cd packages/core && npx vitest run src/__tests__/feature066-engine-fallback.test.ts
npx tsc --noEmit -p packages/core/tsconfig.json
```

### 44. Fine-tune JSONL export only redacted `sk-` tokens

Observed problem:

`packages/core/src/context/prompt-evolution.ts`'s `redactPromptText` (used by `exportFineTuneJsonl`) was a one-line hand-rolled regex matching only `\bsk-[A-Za-z0-9_-]+\b`. It ignored the repo's existing shared redaction utility (`packages/core/src/utils/redaction.ts`), so GitHub PATs (`ghp_...`), Slack webhook URLs, and `Bearer ...` headers embedded in exported conversation messages were written verbatim into a durable, shareable JSONL training file.

Why it is wrong:

- Exported fine-tune data is explicitly meant to leave the local environment; any secret shape the narrow regex misses is a permanent leak.
- The repo already had `redactSecrets`/`safeJsonStringify` with a broader `SECRET_VALUE_PATTERNS` list — duplicating a narrower version instead of importing it is pure regression risk.

Why local models make this mistake:

- They pattern-match the one secret shape visible in the immediate task description (usually `sk-...`, the most iconic "API key" shape) and stop there instead of checking whether the codebase already has a canonical redaction utility.
- They don't cross-reference sibling files (`utils/redaction.ts`) for existing coverage before writing new logic, so the same narrow regex gets reinvented independently in multiple places (see #45).

Correct fix:

Route through the shared utility rather than a bespoke regex. Because `SECRET_VALUE_PATTERNS`'s webhook/Bearer patterns are anchored (`^...$`) for whole-field matching, they can't catch a secret embedded mid-sentence, so a new non-anchored, substring-replacing export (`redactFreeText`) was added to `utils/redaction.ts` for prose contexts, and both `prompt-evolution.ts` and `notifications/format.ts` (#45) now call it:

```typescript
// packages/core/src/utils/redaction.ts
const SECRET_TEXT_SCAN_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /https:\/\/hooks\.slack\.com\/services\/\S+/gi,
  /\bBearer\s+\S+/gi,
];

export function redactFreeText(text: string): string {
  let result = text;
  for (const pattern of SECRET_TEXT_SCAN_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

// packages/core/src/context/prompt-evolution.ts
import { redactFreeText } from '../utils/redaction.js';

function redactPromptText(value: string): string {
  return redactFreeText(value);
}
```

**Rule:** any new secret-redaction need in this repo must reuse `utils/redaction.ts` (`redactSecrets`, `safeJsonStringify`, `redactFreeText`), never a fresh regex. This exact bug was independently reinvented twice (#44, #45) before this fix.

Verification:

```bash
cd packages/core && npx vitest run src/__tests__/feature081-prompt-fine-tune.test.ts
```

### 45. Notification `detail`/`title` only redacted `sk-`/`password`

Observed problem:

`packages/core/src/notifications/format.ts`'s `redactNotificationText` (applied to `detail`/`title`) used a two-pattern regex (`sk-...` and `password \S+`) while `data` went through `safeJsonStringify`, which has broader coverage (GitHub tokens, Slack webhooks, Bearer headers, key-name-based redaction). A prior review's PASSING verdict claimed both `detail`/`title` and `data` used `safeJsonStringify` — factually wrong for the free-text path.

Why it is wrong:

- `detail`/`title` is exactly the field most likely to carry raw error text/stack traces (e.g. "Webhook delivery failed: https://hooks.slack.com/services/...") — the two-pattern regex left that live webhook URL, or any GitHub PAT, unredacted straight through to Telegram/Slack/email.
- A stale review claimed full coverage without checking that `detail`/`title` never touches `safeJsonStringify` at all — asserting "safe" without re-deriving the actual code path.

Why local models make this mistake:

- Same shallow pattern-matching failure as #44: the model sees "redact detail" as a small, self-contained task and writes a two-line regex instead of importing existing infrastructure.
- Review agents that assert "X uses the same mechanism as Y" without actually tracing the call graph rubber-stamp claims that sound plausible but are false — a review verdict is a claim, not evidence (see the Prime Directive at the top of this file).

Correct fix:

Use the shared `redactFreeText` (see #44) for the secret-shaped patterns, then layer the pre-existing `password <value>` word-scan on top since that's a field-shaped leak the token-pattern list doesn't cover in prose:

```typescript
import { redactFreeText } from '../utils/redaction.js';

function redactNotificationText(value: string): string {
  return redactFreeText(value)
    .replace(/\bpassword\s+\S+/gi, 'password [REDACTED]');
}
```

Verification:

```bash
cd packages/core && npx vitest run src/__tests__/feature087-notification-format.test.ts
```

### 46. Scheduled digest start/stop was never implemented

Observed problem:

`packages/core/src/notifications/channels.ts` defined `EmailChannelConfig.scheduled_digest: { enabled: boolean; cron: string }` and a `stopDigest(timerId)` that just calls `clearInterval` on a handle nothing ever created. `grep -rn "startDigest" packages/core/src` returned zero matches. `stopDigest` itself wasn't even exported from `packages/core/src/index.ts`, making it unreachable dead code. A prior review's Implementation Notes falsely claimed "Added scheduled digest `startDigest` and `stopDigest` helpers," and the paired review's acceptance-criteria checklist silently dropped the "Scheduled digest start/stop" scope item entirely rather than flag it missing.

Why it is wrong:

- The Scope explicitly required "Scheduled digest start/stop"; only half the pair existed, and that half was unreachable from any consumer since it wasn't re-exported at the package root.
- `scheduled_digest.enabled = true` in config was entirely inert — no code path ever read it, so enabling it silently did nothing, with no error to signal the gap.

Why local models make this mistake:

- Writing the "cleanup" half of a start/stop pair (`stopDigest`) is easy and self-contained; writing `startDigest` requires deciding how to interpret a `cron` string, which is genuinely more design work, so it gets skipped and the Implementation Notes are written as if it were done anyway.
- A review that checks "does `stopDigest` exist" without checking "is it ever called by anything that starts a matching timer" will pass code that's structurally present but functionally dead.

Correct fix:

Add `startDigest` plus a documented, intentionally-non-general `cronToIntervalMs` shorthand converter (not a full 5-field cron parser — `setInterval` can't express wall-clock alignment anyway), and export both alongside `stopDigest` from the package root:

```typescript
export function cronToIntervalMs(cron: string): number {
  const trimmed = cron.trim().toLowerCase();
  const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
  if (trimmed === '@hourly') return HOUR;
  if (trimmed === '@daily' || trimmed === '@midnight') return DAY;
  if (trimmed === '@weekly') return 7 * DAY;
  const m = trimmed.match(/^(?:every\s+)?(\d+)\s*(m|min|minutes?|h|hr|hours?|d|days?)$/);
  if (m) {
    const n = Number(m[1]);
    return m[2].startsWith('m') ? n * MINUTE : m[2].startsWith('h') ? n * HOUR : n * DAY;
  }
  return /^\d+$/.test(trimmed) ? Number(trimmed) : DAY;
}

export function startDigest(
  config: { enabled: boolean; cron: string },
  sendDigest: () => void | Promise<void>,
  scheduler: (fn: () => void, ms: number) => ReturnType<typeof setInterval> = setInterval,
): ReturnType<typeof setInterval> | undefined {
  if (!config.enabled) return undefined;
  return scheduler(() => { void sendDigest(); }, cronToIntervalMs(config.cron));
}
```

Both are exported from `packages/core/src/index.ts` alongside `stopDigest`.

Verification:

```bash
cd packages/core && npx vitest run src/__tests__/feature088-notifications-digest.test.ts
```

### 47. Missing `dev-loop ui` CLI command despite a working UI server module

Observed problem:

`packages/ui/src/server/index.ts` implemented a fully working `startUiServer`/`createUiServer` Fastify server with its own passing tests, but `packages/cli/src/cli.ts` (`createCli`) registered `init, setup, run, watch, verify, test, quality, resume, replay, config, logs, patterns, export, query, voice, codemap, db, config-check` — no `ui` command. `packages/cli/package.json` dependencies listed only `@dev-loop/core` and `commander`, not `@dev-loop/ui`, so the CLI package could not even import the server module.

Why it is wrong:

- The feature's stated acceptance criterion ("`dev-loop ui` can start backend") was structurally unmeetable — the binary built from `packages/cli/src/main.ts` had no code path to `startUiServer` at all.
- A passing unit test for the server module created a false sense that the feature was done, because it called `startUiServer` directly, not through the shipped CLI.

Why local models make this mistake:

- It's easy to treat "the server module works and has tests" as equivalent to "the CLI command works," when the two are only connected by an import and a `program.command(...)` registration that was simply never written.
- Cross-package wiring (adding a workspace dependency + importing it in a sibling package) is invisible from within a single package's test suite, so it's easy to skip when working file-by-file instead of end-to-end from the user-facing entry point.

Correct fix:

Add `@dev-loop/ui` to `packages/cli/package.json` dependencies, import `startUiServer` in `cli.ts`, and register a `ui` command that calls it with `--host`/`--port` options, following the existing `-p/--project-dir` option-declaration style used by every other command. Made the server starter injectable via `CreateCliOptions.startUiServer` (mirroring the existing `workflows`/`watchFactory` injection pattern) so tests never bind a real port.

```typescript
import { startUiServer as defaultStartUiServer } from '@dev-loop/ui';
import type { UiServerController, UiServerOptions } from '@dev-loop/ui';

export type StartUiServer = (options: UiServerOptions) => Promise<UiServerController>;
// CreateCliOptions gains: startUiServer?: StartUiServer;

const startUi = options.startUiServer ?? defaultStartUiServer;

program
  .command('ui')
  .description('Start the dev-loop web UI backend')
  .option('-p, --project-dir <dir>', 'project directory', process.cwd())
  .option('--host <host>', 'host to bind', '127.0.0.1')
  .option('--port <port>', 'port to bind', '3747')
  .action(async (commandOptions: { projectDir: string; host: string; port: string }) => {
    const server = await startUi({ host: commandOptions.host, port: Number(commandOptions.port) });
    console.log(`dev-loop UI backend listening on http://${server.address.host}:${server.address.port}`);
  });
```

Verification:

```bash
cd packages/cli && npx vitest run src/__tests__
npx tsc --noEmit -p packages/cli/tsconfig.json
```

### 48. No Vite/DOM entry point mounts the React app, and `useWebSocket`'s `onEvent` was dead code

Observed problem:

`packages/ui` had `vite` and `@vitejs/plugin-react` as devDependencies but no `vite.config.ts`, `index.html`, or `main.tsx` anywhere — `packages/ui/src/client/index.ts` only re-exported `AppShell`, `DashboardView`, `api`, `queryClient`, `useWebSocket` as library pieces, never assembling them into a page. Separately, `useWebSocket.ts` built a full event-registration system (`onEvent`, backed by `eventHandlersRef`, dispatched on message receipt) but its `return` statement omitted `onEvent` — defined and used internally but never exposed, so `const { onEvent } = useWebSocket()` would be `undefined`.

Why it is wrong:

- "UI starts and shows dashboard from API" was claimed as done, but there was no browser-loadable artifact — no HTML file, no bundler config, no code calling `ReactDOM.createRoot(...).render(...)`.
- `onEvent`'s cleanup-returning closure was fully implemented and unit-testable in isolation, but omitting it from the return object made the entire registration API unreachable by any consumer — pure dead code despite being "done."

Why local models make this mistake:

- Writing components and hooks in isolation (verified via `renderToStaticMarkup` in tests, which never exercises `useEffect` or the full return contract) can pass tests while never being wired into a real running app — the gap between "component renders" and "app boots in a browser" is easy to miss without an actual bootstrap step.
- Adding a new field to a function's return object requires touching two places (the value construction and the type declaration); it's an easy one-line omission that compiles fine until the interface is checked strictly against every call site.

Correct fix:

Add `onEvent` to both the `UseWebSocketResult` interface and the hook's return statement; add a minimal Vite bootstrap (`index.html` loading `/src/client/main.tsx`, `main.tsx` wrapping `AppShell` in `QueryClientProvider` using the existing `queryClient` export, and `vite.config.ts` using `@vitejs/plugin-react` with `build.outDir: 'dist-client'` so it doesn't collide with the `tsc`-driven library `dist/`).

```typescript
interface UseWebSocketResult<T = unknown> {
  data: T | null;
  isConnected: boolean;
  lastMessage: MessageEvent | null;
  sendMessage: (message: string) => void;
  clearData: () => void;
  onEvent: (event: WebSocketEvent, handler: EventHandler) => () => void;
}
// ...
return { data, isConnected, lastMessage, sendMessage, clearData, onEvent };
```

Verification:

```bash
cd packages/ui && npx vite build          # emits dist-client/index.html + JS bundle
npx vitest run                            # full suite, incl. new onEvent test
npx tsc --noEmit -p packages/ui/tsconfig.json
```

### 49. Ten operational UI pages had zero render tests despite a review claiming coverage

Observed problem:

`packages/ui/src/{loops,models,planning,uncertain,patterns,mcp,quality,benchmark,reports,settings}/` contained 10 fully-implemented page components (`LoopDetail`, `ModelsPage`, `PlanningPage`, `UncertainTags`, `PatternsPage`, `McpPanel`, `QualityPage`, `BenchmarkPage`, `ReportsPage`, `SettingsPage`) with no `__tests__` directories at all. The feature's review claimed "Test route rendering for each page" and included a "Test Results" block — but that block was a byte-for-byte copy of an unrelated feature's test output (same 3 files, same 8 tests, same duration). A repo-wide grep for any of the 10 component names inside a test file returned nothing.

Why it is wrong:

- A review marked "Test Results ✅" was pasted from a different feature's run rather than executed against the claimed components — the checklist item was never actually true.
- Real correctness logic went unverified: `QualityPage`'s inverse pass/fail semantics for lower-is-better metrics, `SettingsPage`'s recursive secret redaction, `BenchmarkPage`'s `Infinity` sentinel for missing-cost entries, and `UncertainTags`'s three-way Accept/Reject/Defer flow could all regress silently with `npm test` staying green.

Why local models make this mistake:

- It's far cheaper to copy a plausible-looking "Test Results" block from a nearby recent feature than to actually invoke the test runner and capture real output, especially when optimizing for review turnaround.
- A model reviewing its own claimed acceptance criteria doesn't independently re-derive "does a test file import this exact component," so a stale/copied result block passes an incurious self-check. This is the same failure mode as the "review documents are claims, not evidence" Prime Directive at the top of this file — it applies to a model's own reviews of its own work, not just to reading someone else's.

Correct fix:

Write real `renderToStaticMarkup` tests per component: default/empty-state render, populated-state render asserting real content strings, plus one assertion per genuine special-case behavior actually found in the source (never invented). Example, for `QualityPage`'s inverse metric semantics:

```typescript
it('applies inverse pass/fail semantics for metrics where lower is better', () => {
  const passing = renderToStaticMarkup(
    <QualityPage checks={[{ name: 'lint', passed: true }]} metrics={{ testCoverage: 90, lintErrors: 0, complexityAvg: 5 }} />,
  );
  const failing = renderToStaticMarkup(
    <QualityPage checks={[{ name: 'lint', passed: true }]} metrics={{ testCoverage: 90, lintErrors: 12, complexityAvg: 25 }} />,
  );
  expect(passing).toContain('metric-card pass');
  expect(passing).not.toContain('metric-card fail');
  expect(failing).toContain('metric-card fail');
});
```

Verification:

```bash
cd packages/ui && npx vitest run src/loops/__tests__ src/models/__tests__ src/planning/__tests__ src/uncertain/__tests__ src/patterns/__tests__ src/mcp/__tests__ src/quality/__tests__ src/benchmark/__tests__ src/reports/__tests__ src/settings/__tests__
npx tsc --noEmit -p packages/ui/tsconfig.json
```

## Testing Rules for This Repo

### Use Temporary Directories for Mutating Tests

Bad:

- Building real packages and deleting outputs.
- Writing config files into repo root.
- Modifying real package manifests during tests.

Good:

- Use `fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-...'))`.
- Copy only the minimal fixture.
- Clean up temp dirs, not real repo outputs.

### Test Failure Paths

Every feature needs at least one meaningful failure/edge test.

Examples:

- Invalid YAML.
- Missing DB initialization.
- Unsupported update field.
- Malicious SQL order field.
- Missing generated output.
- Unknown package export.
- Lint command failure.

### Do Not Use Placeholder Tests

Never leave:

```ts
expect(true).toBe(true);
```

Why it is wrong:

- It gives false confidence.
- It trains the local model to optimize for green instead of correctness.

Correct fix:

- Delete placeholder tests.
- Replace with a real behavior assertion before implementing.

### Avoid Pure Text-Matching Tests for Runtime Behavior

Text matching is acceptable only for static metadata that is itself the behavior, such as exact package manifest fields.

It is not enough for:

- ESLint functionality.
- TypeScript compilation.
- package imports.
- CLI behavior.
- server behavior.
- DB migrations.

## Command Verification Matrix

Use this matrix before saying "done".

For workspace metadata:

```bash
npm install
npm run build
npm run typecheck
```

For TypeScript config:

```bash
npm run typecheck
npm run build
```

For package exports:

```bash
npm run build
node -e "import('./packages/core/dist/index.js').then(m => console.log(Boolean(m)))"
node -e "import('./packages/cli/dist/main.js').then(m => console.log(Boolean(m.createCli)))"
```

For ESLint/formatting:

```bash
npm run lint
npx prettier --check package.json tsconfig.base.json 'packages/*/src/**/*.{ts,tsx}'
```

For DB changes:

```bash
npm test -- packages/core/src/__tests__/db
npm test -- packages/core/src/__tests__/query-integration.test.ts
```

For config loader:

```bash
npm test -- packages/core/src/__tests__/config-loader.test.ts
npm run typecheck
```

For UI:

```bash
npm test -- packages/ui
npm run build --workspace @dev-loop/ui
```

If a command is not available yet, document that fact and add the missing script only if it is in scope.

## Local Model General Failure Patterns

### Pattern: Hallucinating API Behavior

Mistake:

- Calling library APIs that do not exist.
- Assuming tool behavior from memory.
- Inventing config fields.

Why it happens:

- Local models often rely on stale training examples.

Correct behavior:

- Inspect installed package docs/types in `node_modules` when available.
- Prefer existing repo patterns.
- Add a compile/runtime test for the exact API call.

### Pattern: Fixing Symptoms Instead of Root Cause

Mistake:

- Disabling rules.
- Removing tests.
- Changing assertions to match broken behavior.
- Catching and ignoring errors.

Why it happens:

- The model optimizes for passing commands quickly.

Correct behavior:

- Preserve or strengthen the failing test.
- Explain the root cause.
- Fix the behavior that made the test fail.

### Pattern: Scope Creep

Mistake:

- Refactoring unrelated modules.
- Adding new architecture for a narrow bug.
- Changing public APIs without need.

Why it happens:

- The model tries to make the project "better" instead of satisfying the prompt.

Correct behavior:

- Keep changes inside the relevant feature/bug boundary.
- Do not modify unrelated files.
- If a needed change crosses boundaries, document why.

### Pattern: Ignoring Dirty Worktree State

Mistake:

- Reverting user changes.
- Overwriting generated or untracked files without checking.
- Assuming all modifications are model-owned.

Why it happens:

- The model treats the repo as a clean sandbox.

Correct behavior:

- Run `git status --short`.
- Do not revert unrelated changes.
- Work with user changes if they touch the same files.

### Pattern: Overusing `any` and `Record<string, unknown>`

Mistake:

- Replacing domain types with `any`.
- Making public APIs accept arbitrary records.
- Losing compile-time safety around DB updates/events/config.

Why it happens:

- It avoids TypeScript errors quickly.

Correct behavior:

- Define narrow input types.
- Validate unknown input at boundaries.
- Use explicit allow lists for dynamic behavior.
- Keep `any` limited to isolated adapters, with tests.

### Pattern: Treating `noEmit` as Build Verification

Mistake:

- Running only `tsc --noEmit` when the feature is about package outputs.

Why it is wrong:

- `noEmit` proves typechecking, not emitted files, declaration maps, package exports, or Turbo outputs.

Correct behavior:

- Run `npm run build`.
- Assert emitted JS and `.d.ts` files exist.
- Import emitted entrypoints.

### Pattern: Not Cleaning Stale Outputs Before Verification

Mistake:

- Running build after stale outputs already exist.

Why it is wrong:

- Existing files can make broken builds look correct.

Correct behavior:

- For build-output verification, clean first:

```bash
rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo tsconfig.base.tsbuildinfo
npm run build
```

Then assert outputs.

### Pattern: Swallowing Errors for "Resilience"

Mistake:

- Returning defaults after parse/validation failure.
- Catching all errors and returning empty arrays.
- Logging warnings instead of failing unsafe operations.

Why it happens:

- The model equates resilience with not throwing.

Correct behavior:

- Missing optional config can fallback.
- Invalid provided config should usually throw.
- Unsafe DB/file operations should fail loudly with actionable errors.

### Pattern: Unsafe File Writes

Mistake:

- Directly writing important project files without temp/atomic strategy.
- Partially writing files if a process crashes.

Correct behavior:

- Use existing `writeFileAtomic` helper where appropriate.
- For config saves, prefer write-to-temp then rename.
- Test idempotency: running the operation twice should not corrupt files.

### Pattern: Missing Secret Redaction

Mistake:

- Including API keys, webhook URLs, tokens, or env values in errors/logs/snapshots.

Correct behavior:

- Redact secret-like keys: `token`, `api_key`, `password`, `webhook`, `secret`, `authorization`.
- Test serialized errors and logs do not contain raw secrets.

### Pattern: Dynamic SQL With Interpolated Identifiers

Mistake:

- Building SQL with raw user-provided field names.

Correct behavior:

- Parameterize values.
- Allow-list identifiers.
- Reject unknown fields.
- Test malicious input.

### Pattern: Cross-Platform Blind Spots

Mistake:

- Hardcoding absolute local paths.
- Assuming shell commands like `rm -rf` work everywhere.
- Using path string comparisons with `/` on all platforms.

Correct behavior:

- Use `path.join`, `path.resolve`, and temp dirs.
- Keep package scripts cross-platform when possible.
- Normalize paths only at display/assertion boundaries.

### Pattern: Dependency Drift

Mistake:

- Updating `package.json` without updating lockfile.
- Adding packages not needed by the task.
- Choosing incompatible peer versions.

Correct behavior:

- Check installed versions.
- Use npm workspace-aware install commands.
- Commit package and lock changes together when dependencies change.

### Pattern: Public API Drift

Mistake:

- Exporting every internal module from `core/src/index.ts`.
- Changing exports without checking downstream packages.

Correct behavior:

- Keep public exports intentional.
- Add entrypoint import tests.
- Avoid exposing internals unless the feature requires it.

### Pattern: Duplicate Source of Truth

Mistake:

- Updating defaults in `defaults.ts` but not `schema.ts`.
- Updating migration SQL but not Drizzle schema.
- Updating package `exports` but not build output.

Correct behavior:

- Identify paired files before editing.
- Add alignment tests.
- Prefer deriving one representation from another when feasible.

## Repo-Specific File Pairings

When editing one of these, inspect the paired files too:

- `packages/core/src/config/schema.ts`
- `packages/core/src/config/defaults.ts`
- `packages/core/src/config/loader.ts`

Config changes must keep schema defaults, exported defaults, YAML creation, env overrides, and save/load behavior aligned.

- `packages/core/src/db/schema.ts`
- `packages/core/src/db/migrations.ts`
- `packages/core/src/db/queries.ts`

DB changes must keep Drizzle schema, SQLite migration SQL, and query helpers aligned.

- `package.json`
- `package-lock.json`
- `packages/*/package.json`
- `turbo.json`
- `tsconfig.base.json`
- `packages/*/tsconfig.json`

Workspace/build changes must keep scripts, lockfile, Turbo outputs, TypeScript references, and package exports aligned.

- `eslint.config.js`
- `.prettierrc`
- `.prettierignore`
- `package.json` scripts

Lint/formatting changes must be verified by running the actual tools.

## Feature Review Checklist

Before writing a `REVIEW_FEATURES/*-review.md` document:

1. List the acceptance criteria from the feature prompt.
2. For each criterion, list the exact command or code path proving it.
3. Run every command.
4. Include exit codes and important output.
5. If a command fails, mark the feature incomplete.
6. Do not write `PASSING` if only tests pass but acceptance command fails.
7. Do not claim a Red phase unless the failing output was captured before implementation.

## Bug Report Checklist

When creating a bug report:

1. Name the failing feature or module.
2. State "Not actually complete" if a review claimed success.
3. Include exact command and observed result.
4. Explain why the behavior violates acceptance criteria.
5. Explain why the local model likely made the mistake.
6. Provide minimal fix steps.
7. Provide verification commands.
8. Do not fix code unless the user asked for fixes.

## Prompt Template for Local Model

Use this shape when giving work to a local model:

```text
Read KNOWLEDBASE.md first and obey it.

Task:
<one narrow feature or bug>

Relevant files:
<list specific files>

Acceptance command:
<exact command>

Rules:
- Write a failing test first.
- Do not use `|| true`.
- Do not check comments as proof.
- Do not edit unrelated files.
- Do not leave generated files under `src`.
- Run the acceptance command exactly.
- Report command output if anything fails.
```

## Final Done Definition

A task is done only when all are true:

- The failing behavior is reproduced or a real missing-behavior test is added.
- The implementation changes are minimal and scoped.
- The targeted test passes.
- The acceptance command passes.
- `npm run typecheck` passes for TypeScript changes.
- `npm run lint` passes for lint/config/source changes.
- Generated files are not left under `packages/*/src`.
- Build output exists when package exports point to it.
- Any remaining failure is documented honestly.

If any item is false, do not claim completion.

## Completed Refactor Playbook: REFACTOR002-REFACTOR007

This section records how the 2026-07-09 refactor batch was completed and what future local-model prompts should copy.

### REFACTOR002: SQL Update Builders and Value Serialization

What changed:

- Kept `packages/core/src/db/queries.ts` as a compatibility barrel and fixed its relative re-export to `./queries/index.js`.
- Preserved the original public DB query API while using split modules under `packages/core/src/db/queries/`.
- Centralized dynamic update SQL in `packages/core/src/db/queries/updates.ts`.
- Centralized SQL value conversion in `packages/core/src/db/queries/sql-values.ts`.
- Fixed `packages/core/src/db/queries/db.ts` to use ESM `import { getDatabase }` instead of `require`.
- Restored old signatures that the previous split had accidentally changed:
  - `getBestModelForFeatureType(options)`
  - `updateModelProfile(params)`
  - `saveTicket(params)`
  - `getTicket(provider, ticketId)`
  - `logNotification(params)`
  - `getNotificationLog()`

Why:

- Refactors must preserve behavior and public API.
- SQL parameters protect values, not identifiers; dynamic column names must come from allow-lists.
- `0` and `false` are valid persisted values and must not become `null` or defaults.

How:

- `buildUpdate(updates, columns, { errorLabel, serialize })` maps public update keys to allow-listed DB columns and rejects unknown keys.
- Domain modules provide their own column maps and serializers.
- Boolean update values are serialized with `Number(value)`.
- Optional numeric/string values use nullish checks (`??`) instead of truthiness (`||`).
- Query compatibility is tested by importing both `../db/queries.js` and `../db/queries/index.js`.

Verification added:

```bash
npm test -- packages/core/src/__tests__/db-query-refactor-compat.test.ts
```

Future local-model rule:

- Before splitting any public module, generate the old export/function list and compare it with the new modules.
- Do not change function signatures during a mechanical split.
- Add import-identity compatibility tests before deleting or shrinking the old file.

### REFACTOR003: Config Loader Pipeline

What changed:

- Split config loading into focused modules:
  - `parse.ts`
  - `interpolate.ts`
  - `merge.ts`
  - `env-overrides.ts`
  - `writer.ts`
- Kept `loader.ts` as the public orchestration API.
- Added explicit `LoadConfigOptions`:
  - `projectDir`
  - `configPath`
  - `env`
  - `onWarning`
  - `invalidConfig`
- Kept legacy `loadConfig(projectDir, configPath)` compatibility.
- Made default options API behavior throw on invalid config.
- Kept intentional compatibility fallback via `invalidConfig: 'warn-and-default'`.
- Made env overrides testable without mutating `process.env`.

Why:

- The old loader mixed parsing, interpolation, merging, env overrides, validation, warnings, default file creation, and writing.
- Catching validation failures and silently returning defaults hides broken user config.
- Injected env makes tests deterministic and avoids global mutation.

How:

- `parseYamlObject` throws `ConfigError` for syntax errors and non-object YAML.
- `interpolateConfig` recursively interpolates `${ENV_VAR}` and reports missing env through `onWarning`.
- `mergeDefaults` owns recursive object merging.
- `applyEnvOverrides(config, { env })` applies only known `DEV_LOOP_*` paths.
- `loadConfig` orchestrates parse -> interpolate -> merge -> env override -> validate.

Verification added:

```bash
npm test -- packages/core/src/__tests__/config-loader.test.ts
```

Future local-model rule:

- Do not log or fallback inside low-level parse/merge/interpolate helpers.
- Make failure policy explicit at the loader boundary.
- Preserve old call signatures unless the task explicitly allows breaking API changes.

### REFACTOR004: Shared Test Harness

What changed:

- Added test helpers under `packages/core/src/__tests__/helpers/`:
  - `repo-paths.ts`
  - `package-json.ts`
  - `commands.ts`
  - `temp-dir.ts`
  - `database.ts`
- Migrated risky build/lint/package tests to use helpers.
- Reworked `feature005-build-pipeline.test.ts` so it builds temporary TypeScript fixtures instead of deleting real package `dist`.
- Replaced hardcoded `/Users/.../dev-loop` in `packages/feature007/test.test.ts` with `process.cwd()`.

Why:

- Tests must not depend on one developer's checkout path.
- Tests must not delete real package outputs or leave stale incremental state.
- Command helpers must never hide failures with `|| true`.
- Temp fixtures make build behavior provable without mutating the repo.

How:

- `fromRoot()` derives paths from the test process cwd.
- `readPackageJson()` centralizes JSON parsing.
- `runCommand()` and `runNpmScript()` use `execFileSync` with failure propagation.
- `expectCommandToFail()` catches expected failures and returns exit code/stdout/stderr for assertions.
- Temp fixture tests use the repo-local `node_modules/.bin/tsc` and override `types: []` so they do not depend on temp `node_modules`.

Verification:

```bash
npm test -- packages/core/src/__tests__/feature005-build-pipeline.test.ts
npm test -- packages/core/src/__tests__/feature007-loop-structure.test.ts
npm test -- packages/feature007/test.test.ts
```

Future local-model rule:

- Mutating tests should use temp directories by default.
- Never run `npx tsc` from a temp dir without pinning the repo-local TypeScript binary.
- Never add hardcoded absolute checkout paths.

### REFACTOR005: Import-Safe CLI Entrypoint

What changed:

- Added `packages/cli/src/cli.ts` for `createCli()`.
- Changed `packages/cli/src/index.ts` to export from `cli.ts`.
- Kept `packages/cli/src/main.ts` as the binary-only entrypoint that calls `parseAsync()`.
- Updated `packages/cli/package.json`:
  - `bin.dev-loop` remains `./dist/main.js`
  - `main` is `./dist/index.js`
  - `types` is `./dist/index.d.ts`
  - package export points to `dist/index`

Why:

- Importing a package must not parse `process.argv`.
- Public library entrypoints and executable entrypoints have different responsibilities.

How:

- `cli.ts` constructs Commander.
- `main.ts` imports `createCli`, runs `parseAsync`, and sets `process.exitCode` on errors.
- The import-safety test uses a dynamic module path string so `packages/core` build does not statically include `packages/cli/src` outside core `rootDir`.

Verification added:

```bash
npm test -- packages/core/src/__tests__/cli-import-safe.test.ts
npm run build
```

Future local-model rule:

- Do not export from files that execute side effects.
- Keep `main.ts` tiny and binary-only.
- Update package manifest paths whenever entrypoint roles change.

### REFACTOR006: EventBus Generics

What changed:

- Changed `Listener<T>` to `Listener<Name extends EventName>`.
- Bound `on`, `off`, and `emit` generics to the event name.
- Replaced `Map<EventName, Set<Listener<any>>>` with typed listener storage and one contained internal cast.
- Added compile-time negative tests with `@ts-expect-error`.

Why:

- The old API could pair one event name with another event's payload.
- A typed event bus must reject mismatched name/payload combinations at compile time.

How:

- `emit<Name extends EventName>(name: Name, payload: EventPayloadMap[Name])`.
- `on<Name extends EventName>(name: Name, listener: Listener<Name>)`.
- Internal listener set creation is isolated in `getListenerSet`.

Verification:

```bash
npm test -- packages/core/src/__tests__/feature010-typed-event-bus.test.ts
npm run typecheck
```

Future local-model rule:

- For typed maps, bind the key generic to the value type.
- Keep casts internal and narrow; do not put `any` in public method signatures.

### REFACTOR007: Explicit Core Public API

What changed:

- Replaced broad root exports in `packages/core/src/index.ts` with explicit stable exports:
  - config loader functions and config types
  - core error classes
  - `EventBus` and event types
  - stable domain types
  - token counter functions
- Added `packages/core/src/db/index.ts` for intentional DB subpath exports.
- Added `./db` to `packages/core/package.json` exports.
- Updated core entrypoint tests to assert stable root API and absence of raw DB internals.

Why:

- Root package exports are a contract.
- Raw schema tables and query internals should not leak accidentally from `@dev-loop/core`.
- Advanced DB access can live behind an explicit subpath.

How:

- Root `index.ts` uses named exports only.
- DB subpath exports only selected connection/migration/query functions.
- Tests import `../index.js` and `../db/index.js` rather than searching source text.

Verification:

```bash
npm test -- packages/core/src/__tests__/core-entrypoint.test.ts
npm run build
```

Future local-model rule:

- Do not use `export *` from package roots unless the task explicitly wants every symbol public.
- Add subpath exports before removing advanced APIs from root.
- Build the package after changing `package.json` exports.

### Batch Verification Result

The completed refactor batch was verified with:

```bash
npm test
npm run typecheck
npm run build
npm run lint
find packages/*/src -type f \( -name '*.js' -o -name '*.d.ts' -o -name '*.js.map' -o -name '*.d.ts.map' \) -print
```

Observed result:

- `npm test`: 30 files, 139 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed for core, cli, and ui.
- `npm run lint`: exit 0 with existing warnings only.
- Generated `.js`, `.d.ts`, `.js.map`, and `.d.ts.map` files under `packages/*/src`: none after cleanup and rebuild.

Important cleanup note:

- After build, always run the generated-file find command. If generated files appear under `src`, remove them and clean the matching `tsconfig.tsbuildinfo` before rebuilding.

## BUG030-BUG033 Batch: FEATURE007/FEATURE005/FEATURE011 Review Fixes

Date: 2026-07-09

Scope:

- `BUGS/BUG030-feature007-ad-hoc-hardcoded-test.md`
- `BUGS/BUG031-feature005-build-pipeline-currently-fails.md`
- `BUGS/BUG032-feature011-schema-skeleton-review-is-incomplete.md`
- `BUGS/BUG033-review-feature-audit-summary-2026-07-09.md`

What changed:

- Removed the ad-hoc `packages/feature007/test.test.ts` file and deleted the now-empty `packages/feature007` directory.
- Replaced the monolithic `packages/core/src/config/schema.ts` body with a composed `ConfigSchema` that imports all section schemas from `packages/core/src/config/sections/`.
- Added `packages/core/src/config/sections/observability-schema.ts` because the public config included `observability`, but the extracted section schema set did not.
- Strengthened `packages/core/src/__tests__/feature011-config-schema-skeleton.test.ts` so it verifies all section schemas parse defaults, includes `observability`, and asserts the public `schema.ts` imports every expected section file.
- Removed unused constants from `coding-schema.ts`, `mcp-schema.ts`, and `quality-gate-schema.ts`; they were not functional bugs, but they were noise in the lint output touched by this batch.
- Updated `BUGS/README.md` so the active bug map no longer points at the deleted BUG030 prompt.

Why:

- BUG030 was valid because `packages/feature007` was outside the declared workspaces and added duplicate, package-shaped test surface for FEATURE007. The real lint foundation proof belongs under the existing core test suite.
- BUG031 depended on FEATURE011 because the build-pipeline verification runs TypeScript compilation; if config schema tests fail to compile, FEATURE005 cannot be considered proven.
- BUG032 was the core production issue: section schema files existed, but the public `ConfigSchema` still duplicated the full object inline. That meant the extracted files could drift and production code would not notice.
- BUG033 was an audit summary of the same chain: no review artifact should be moved or trusted until `npm test`, `npm run typecheck`, `npm run build`, and `npm run lint` all match the claimed state.

How:

- `schema.ts` now keeps `version` locally and delegates each config section to its named section schema:
  - `planning: planningSectionSchema`
  - `coding: codingSectionSchema`
  - `verifier: verifierSectionSchema`
  - `fallback: fallbackSectionSchema`
  - `loop: loopSectionSchema`
  - `test_runner: testRunnerSectionSchema`
  - `quality_gate: qualityGateSectionSchema`
  - `mcp: mcpSectionSchema`
  - `context: contextSectionSchema`
  - `learning: learningSectionSchema`
  - `benchmark: benchmarkSectionSchema`
  - `notifications: notificationsSectionSchema`
  - `integrations: integrationsSectionSchema`
  - `git: gitSectionSchema`
  - `agents: agentsSectionSchema`
  - `ui: uiSectionSchema`
  - `voice: voiceSectionSchema`
  - `observability: observabilitySectionSchema`
- `observabilitySectionSchema` mirrors the previous inline defaults:
  - `anomaly_detection: true`
  - `sla_minutes: 0`
  - `trend_analysis: true`
  - `export_formats: ['csv', 'pdf', 'json']`
  - `natural_language_queries: true`
- The FEATURE011 regression test intentionally checks source imports. This is acceptable here because the bug was structural: a behavior-only default parse test could pass even when production code still ignored the section files.
- The invalid enum tests no longer need `as any`; `safeParse` accepts unknown input, so runtime invalid values can be tested without weakening TypeScript.
- Dynamic section module access is narrowed to exports ending with `SectionSchema`, then cast only to the small `parse(input: unknown): unknown` surface needed by the test.

Verification:

```bash
npm test -- packages/core/src/__tests__/feature011-config-schema-skeleton.test.ts
npm test -- packages/core/src/__tests__/feature007-loop-structure.test.ts
npm test -- packages/core/src/__tests__/feature005-build-pipeline.test.ts
cd packages/core && npx tsc -p tsconfig.json --pretty false
npm test
npm run typecheck
npm run lint
npm run build
```

Observed result:

- FEATURE011 targeted test: 7 tests passed.
- FEATURE007 targeted test: 6 tests passed.
- FEATURE005 targeted test: 10 tests passed.
- Direct `packages/core` TypeScript compile: passed.
- Full `npm test`: 29 files, 138 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed with cache misses for core, cli, and ui.
- `npm run lint`: exit 0 with 10 existing warnings.

Future local-model rules:

- Do not create new `packages/*` directories unless they are declared workspaces or explicitly requested.
- Feature tests for repository behavior should live in the existing test structure, not in ad-hoc package-like folders.
- When a feature says "extract" or "compose", production entry points must import and use the extracted modules; duplicate files are not completion.
- If a Zod schema is split into sections, every public config key needs exactly one section source of truth.
- For TypeScript tests, avoid `as any` unless the test is specifically about unsafe values; `safeParse` already accepts `unknown`.
- Run direct `tsc` or `npm run typecheck` after changing tests, not only Vitest.
- Treat review/audit bug files as stale until the exact acceptance commands have been re-run in the current checkout.

## BUG031-BUG033 Batch: Deterministic Build, Package Tarballs, and Zero-Warning Lint

Date: 2026-07-09

Scope:

- `BUGS/BUG031-core-build-does-not-repair-missing-dist-files.md`
- `BUGS/BUG032-core-package-tarball-omits-dist-and-ships-tests.md`
- `BUGS/BUG033-lint-command-passes-with-unused-code-warnings.md`

What changed:

- Made package builds deterministic by cleaning `dist` and package-level TypeScript build info before compiling.
- Added `packages/core/tsconfig.build.json` so the core runtime build excludes `src/**/__tests__/**` while the normal `tsconfig.json` can still typecheck the full package during root typecheck.
- Changed `@dev-loop/core` build to use `tsc -p tsconfig.build.json`.
- Added `files` whitelists to `packages/core/package.json`, `packages/cli/package.json`, and `packages/ui/package.json` so tarballs ship `dist` and `package.json`, not source/test trees.
- Added `prepack` scripts to core, cli, and ui so `npm pack --workspace ...` builds the package before tarball assembly.
- Added a build regression test in `feature005-build-pipeline.test.ts` that deletes `packages/core/dist/errors.js`, rebuilds, and imports the built core entry points.
- Added a package metadata regression test that runs `npm pack --workspace @dev-loop/core --dry-run --json` and asserts:
  - `dist/index.js` is included,
  - `dist/index.d.ts` is included,
  - `dist/db/index.js` is included,
  - `src/__tests__/` is excluded,
  - `dist/__tests__/` is excluded.
- Removed lint warning sources:
  - deleted unused `readJson()` helper from `bug028-eslint-typescript.test.ts`,
  - rewrote `feature008-shared-domain-types.test.ts` as type-level fixture assertions,
  - removed unused `nullableCreatedAt()` from `db/schema.ts`,
  - made `countTokensHeuristic()` actually use its `charPerToken` model-family ratio.

Why:

- `npm run build -- --force` could report success after a required emitted file was deleted, because stale incremental state could make `tsc` skip re-emitting missing outputs.
- A successful build is not enough if the built package cannot be imported. Runtime smoke imports must be part of the proof for package entry points.
- `npm pack --workspace @dev-loop/core --dry-run` originally omitted `dist` because `dist/` is ignored and there was no `files` whitelist. After adding `files`, the first attempt still included `dist/__tests__` because the production build emitted tests.
- Source tests and compiled test artifacts do not belong in the runtime package tarball.
- Lint warnings had become accepted background noise; removing them made `npm run lint` produce no warnings and restored its usefulness as a signal.

What was tried and learned:

- Tried relying on `npm run build -- --force` alone after deleting `packages/core/dist/errors.js`; it still exited `0` and did not restore the file. This proved Turbo force mode was not enough because the package-level TypeScript incremental state was stale.
- Tried `npm pack --workspace @dev-loop/core --dry-run --json` after adding package `files`; `dist` appeared, but `dist/__tests__` also appeared. This showed packaging was fixed only halfway and build output itself needed a runtime-only config.
- `npm pack --json` output includes lifecycle script logs before the JSON array when `prepack` runs. Tests parse from the first `[\n` before calling `JSON.parse`.
- Did not use a broad source deletion or move tests out of `src`; that would have been disruptive. A dedicated `tsconfig.build.json` kept the production emit clean while preserving the existing test layout.
- Did not make `lint` use `--max-warnings=0` in this batch. It is now safe to do later because current lint output is warning-free, but changing policy was not required to close the three bugs.

How:

- Build scripts now use explicit clean-then-compile:

```json
"build": "rm -rf dist tsconfig.tsbuildinfo tsconfig.build.tsbuildinfo && tsc -p tsconfig.build.json"
```

for core, and equivalent package-local clean builds for cli/ui.

- Core production emit uses:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "exclude": ["dist", "node_modules", "src/**/__tests__/**"]
}
```

- Package `files` whitelists use:

```json
"files": [
  "dist",
  "package.json"
]
```

- The build repair test intentionally mutates ignored `dist` output, not tracked source:
  1. run `npm run build -- --force`,
  2. delete `dist/errors.*`,
  3. assert the files are gone,
  4. run `npm run build -- --force`,
  5. assert `dist/errors.js` exists,
  6. import built core entry points with Node.

Verification:

```bash
npm test -- packages/core/src/__tests__/feature005-build-pipeline.test.ts
npm test -- packages/core/src/__tests__/package-metadata.test.ts
npm test -- packages/core/src/__tests__/feature008-shared-domain-types.test.ts packages/core/src/__tests__/token-counter.test.ts packages/core/src/__tests__/bug028-eslint-typescript.test.ts
npm run lint
npm run typecheck
npm run build -- --force
npm pack --workspace @dev-loop/core --dry-run --json
npm pack --workspace @dev-loop/cli --dry-run --json
npm pack --workspace @dev-loop/ui --dry-run --json
node packages/cli/dist/main.js --help
node -e "await import('./packages/core/dist/index.js'); await import('./packages/core/dist/db/index.js'); await import('./packages/cli/dist/index.js'); await import('./packages/ui/dist/index.js'); console.log('dist imports ok')"
npm test
find packages/*/src -type f \( -name '*.js' -o -name '*.d.ts' -o -name '*.js.map' -o -name '*.d.ts.map' \) -print
```

Observed result:

- FEATURE005 targeted test: 11 tests passed.
- Package metadata targeted test: 2 tests passed.
- Lint cleanup targeted tests: 17 tests passed.
- Full `npm test`: 29 files, 139 tests passed.
- `npm run lint`: exit 0 with no warnings.
- `npm run typecheck`: passed.
- `npm run build -- --force`: passed with cache bypass for core, cli, and ui.
- Core dry-run package: includes `dist/index.js`, `dist/index.d.ts`, `dist/db/index.js`; excludes `src/__tests__` and `dist/__tests__`.
- CLI dry-run package: includes `dist/main.js` and `dist/index.js`; excludes `src/`.
- UI dry-run package: includes `dist/index.js`; excludes `src/`.
- Built CLI help command passed.
- Built package imports passed.
- Generated source artifacts under `packages/*/src`: none.

Future local-model rules:

- Never trust a build command alone for publishable packages; import built entry points after building.
- If a package uses TypeScript incremental builds, a production build should clean ignored output or keep build info inside the cleaned output directory.
- Use a dedicated build tsconfig when tests live under `src` but should not be emitted or packed.
- Add `files` whitelists for packages whose runtime entry points live in ignored directories like `dist`.
- Test tarball contents with `npm pack --dry-run --json`; parse lifecycle-log-prefixed output carefully.
- Keep lint output warning-free before increasing lint strictness. A quiet lint command is easier for local models to reason about than "green with warnings."

FEATURE009 review lesson:

- For custom TypeScript `Error` subclasses, never force `Object.setPrototypeOf(this, DevLoopError.prototype)` in the base constructor. Use `Object.setPrototypeOf(this, new.target.prototype)` so `new ConfigError(...) instanceof ConfigError` remains true.
- A "safe to log" error API must test redaction of nested `details` keys such as `apiKey`, `token`, `password`, `secret`, and `authorization`. Checking only that `stack` is absent is a false positive.
- If a feature requires `code`, `action`, `details`, and `cause`, assert those fields on every exported subclass, including `DatabaseError`, not just on the base class.

## Session Learnings: FEATURE013/016/017/018 Batch (2026-07-09)

### Pattern A: Do Not Skip Reading Existing Code Before Implementing

**What happened:** For FEATURE016, I wrote tests that asserted `config.coding.primary.provider` should be `'openrouter'`, but the actual default in `defaults.ts` is `'auto'`. For FEATURE017, I assumed Zod would reject `api_key: 12345` (number for a string field), but it passed because the schema has `.default('${ANTHROPIC_API_KEY}')` which overrides invalid values.

**Why this mistake keeps happening:** The model tries to write tests based on the feature prompt's intent rather than reading what the code actually does. Feature prompts describe *desired* behavior; existing defaults may already differ from the spec.

**Correct approach (always before writing tests):**
1. Read `defaults.ts` to see actual default values.
2. Read `schema.ts` and relevant section schemas to understand which Zod rules apply.
3. Check if a module/file already exists (e.g., `config/errors.ts`).
4. Run the existing test suite to see current behavior.

### Pattern B: TypeScript Import Errors — Do Not Mix node:fs and node:fs/promises

**What happened:** Across FEATURE016, I repeatedly wrote `import fs from 'node:fs/promises'` then tried to use sync methods like `fs.existsSync()`, `fs.readFileSync()`, etc. The promises API does not expose these. I also mixed `fsSync.mkdtempSync()` with `fsPromises.mkdtemp()`.

**Why this mistake keeps happening:** The model conflates Node.js `fs` APIs — it knows the methods exist but forgets which API surface exposes them.

**Correct approach:**
- For **async** operations: `import * as fs from 'node:fs/promises'` or `import { readFile, writeFile } from 'node:fs/promises'`.
- For **sync** operations: `import * as fsSync from 'node:fs'`.
- Never mix them in the same import — use separate named imports.
- If you need both, import them separately with distinct names.

### Pattern C: Do Not Call `.catch()` on Non-Promise Return Values

**What happened:** For FEATURE017, I wrote `expect(msg.toLowerCase()).toContain('redacted').catch(() => true)`. Vitest's `toContain` returns void (not a Promise), so `.catch()` is TypeScript-invalid. This broke compilation.

**Why this mistake keeps happening:** The model overuses async patterns in sync test assertions. `expect().toContain()` is synchronous — no `.then()` or `.catch()`.

**Correct approach:**
- Assert synchronously: `expect(msg).toContain('redacted')`.
- Only use `.resolves` / `.rejects` with actual Promises (e.g., async functions that return Promise<T>).

### Pattern D: Zod Default Values Override Invalid Input Without Failing Validation

**What happened:** For FEATURE017's redaction test, I passed `api_key: 12345` expecting schema validation to fail. But the schema has `.default('${ANTHROPIC_API_KEY}')` which silently overrides invalid values, so Zod never reported an error and my redaction code was never tested.

**Why this mistake keeps happening:** The model assumes that any value not matching a type will trigger a Zod validation failure, but `.default()` intercepts invalid values before `safeParse` can report them as errors.

**Correct approach:**
1. Read the schema to see if fields have `.default()` applied — these silently override invalid values.
2. Use values that violate constraints beyond just type (e.g., negative numbers for `.positive()` or `.min()`, strings > 6 chars for redaction).
3. Test with a field that does NOT have `.default()` when testing validation failures.

### Pattern E: Never Leave Duplicate Function Implementations After Refactoring

**What happened:** For FEATURE017, I refactored `config/errors.ts` and left both old and new versions of `redactValue()`, `formatIssue()`, etc., causing TypeScript compilation errors ("Duplicate function implementation"). This wasted two iterations.

**Why this mistake keeps happening:** The model writes a replacement function but forgets to delete the original. SEARCH/REPLACE can miss parts of the file, leading to duplicates.

**Correct approach:**
- After writing new functions, always do a full read-back and verify no duplicates exist.
- Prefer `write_to_file` over `replace_in_file` when doing significant rewrites — it produces a clean single version.

### Pattern F: Run Tests Against Real Config Defaults, Not Spec Assumptions

**What happened:** For FEATURE016, I tested save/load with dot-notation keys and expected the saved value to appear in `coding.primary.provider`, but the YAML file had `provider: auto` (not `openrouter`). The test assertion was wrong because I assumed the prompt's spec matched reality.

**Why this mistake keeps happening:** Feature prompts describe *desired* configuration values, not what defaults actually are. Defaults may have changed since the feature was written.

**Correct approach:**
- Before asserting config values in tests, read `defaults.ts` to know actual values.
- Use assertions that check against actual defaults rather than hardcoded expected values.

## Session Learnings: FEATURE019/020/021/022 Batch (2026-07-10)

This section records mistakes, repeated fixes, red-phase failures, and working rules from the session that processed:

- `FEATURES/FEATURE019.md`
- `FEATURES/FEATURE020.md`
- `FEATURES/FEATURE021.md`
- `FEATURES/FEATURE022.md`

The user explicitly required reading this knowledge base first, processing one feature file at a time, updating the feature document with the implementation notes, then moving it from `FEATURES/` to `REVIEW/`. That workflow was followed for FEATURE019 through FEATURE022, but several local-model failure patterns appeared along the way.

### Pattern G: A Pre-existing Helper Can Be "Almost Right" But Still Write to the Wrong Place

**What happened:** FEATURE019 already had untracked test and production files in the working tree:

- `packages/core/src/__tests__/feature019-init-runtime.test.ts`
- `packages/core/src/context/init-runtime.ts`

The targeted command failed:

```bash
npm test -- init
```

Observed failure:

```text
expected 'undefined' to be 'string'
expected false to be true
```

The implementation returned `result.files.FEATURES`, but it created default file content by iterating this object:

```ts
const DEFAULT_FILE_CONTENTS: Record<string, string> = {
  [RUNTIME_FILES.FEATURES]: '# Dev-Loop Features\n',
  [RUNTIME_FILES.BUGS]: '# Known Bugs\n',
  ...
};

for (const [filePath, content] of Object.entries(DEFAULT_FILE_CONTENTS)) {
  if (!fsSync.existsSync(filePath)) {
    fsSync.writeFileSync(filePath, content, 'utf-8');
  }
}
```

That looked plausible but was wrong. The object keys were file names like `FEATURES.md`, not computed paths like `<project>/.dev-loop/FEATURES.md`. In a real working directory, this kind of bug can create or overwrite root-level workflow files instead of runtime files under `.dev-loop/`.

The test also expected `result.dirs.sandbox`, but the implementation returned uppercase keys because `RUNTIME_DIRS` used `SANDBOX`, `CHECKPOINTS`, and `LOGS`.

**Why this mistake happens:** The model sees a constant named like "runtime files" and treats file names as file paths. It also makes API key casing decisions from implementation convenience instead of from the test/user-facing result shape.

**How it was solved:**

- Added/exported `buildProjectRuntimePaths(projectDir)` as the path computation helper.
- Changed directory result keys to lower-case runtime API keys: `sandbox`, `checkpoints`, `logs`.
- Changed default content lookup to be keyed by logical file key (`FEATURES`, `BUGS`, etc.).
- Wrote defaults using `result.files[key]`, not raw file names.
- Exported `initProjectRuntime` and `buildProjectRuntimePaths` from `packages/core/src/index.ts`.
- Updated the core entrypoint test to prove the helper is an intentional public API.

Verification used:

```bash
npm test -- init
npm test -- packages/core/src/__tests__/core-entrypoint.test.ts
npm run typecheck
npm run build -- --force
node -e "const core = await import('./packages/core/dist/index.js'); console.log(typeof core.initProjectRuntime, typeof core.buildProjectRuntimePaths)"
find packages/*/src -type f \( -name '*.js' -o -name '*.d.ts' -o -name '*.js.map' -o -name '*.d.ts.map' \) -print
```

**Rule for future local models:** When creating files under a runtime directory, tests must assert the exact path on disk. Do not infer correctness from an object that merely contains names. If a helper returns path maps, write files through those maps.

### Pattern H: Do Not Treat Prompt Exclusion Lists as "Ignore the Whole Directory"

**What happened:** FEATURE020 asked for `.gitignore` and VS Code settings helpers. The important source of truth was the `dev-loop-prompt.md` section around `.gitignore Additions` and `VS Code Settings`. It says `.dev-loop/` is partially committed:

- Commit:
  - `dev-loop.yaml`
  - `.dev-loop/FEATURES.md`
  - `.dev-loop/BUGS.md`
  - `.dev-loop/CODE_MAP.md`
  - `.dev-loop/DECISIONS.md`
  - `.dev-loop/PATTERNS.md`
- Do not commit:
  - `.dev-loop/dev-loop.db`
  - `.dev-loop/dev-loop.db-shm`
  - `.dev-loop/dev-loop.db-wal`
  - `.dev-loop/sandbox/`
  - `.dev-loop/checkpoints/`
  - `.dev-loop/logs/`

The existing root `.gitignore` already ignored `.dev-loop/`, but FEATURE020 was about helpers for user projects, not about rewriting the repo root `.gitignore`. The implementation had to use temp directories and preserve the prompt's partial-commit semantics.

**Why this mistake happens:** It is tempting to see "runtime directory" and add `.dev-loop/` to `.gitignore`. That contradicts the prompt. Some files in `.dev-loop/` are workflow state and should be committed.

**How it was solved:**

- Added tests in `packages/core/src/__tests__/feature020-gitignore-vscode.test.ts` using temp project directories only.
- Implemented `mergeGitignore(projectDir)` in `packages/core/src/context/init-editor-support.ts`.
- The helper adds only the prompt-specified runtime data exclusions.
- The test explicitly asserts that `.dev-loop/`, `.dev-loop/FEATURES.md`, and `.dev-loop/BUGS.md` are not ignored.

**Rule for future local models:** For init helpers, never edit the current repo root as proof. Use a temp project and assert exact files/patterns. When a prompt says a directory is partially committed, do not simplify it into a whole-directory ignore.

### Pattern I: Substring-Based Duplicate Tests Can Produce False Failures

**What happened:** During FEATURE020, the duplicate gitignore test originally used this assertion:

```ts
expect(content.match(/\.dev-loop\/dev-loop\.db/g)).toHaveLength(1);
```

After implementation, the test failed:

```text
expected [ '.dev-loop/dev-loop.db', …(2) ] to have a length of 1 but got 3
```

The helper was not duplicating the exact `.dev-loop/dev-loop.db` line. The regex also matched the prefix inside:

```text
.dev-loop/dev-loop.db-shm
.dev-loop/dev-loop.db-wal
```

**Why this mistake happens:** Regexes that search for a pattern inside a whole file can accidentally match substrings of longer patterns. This is especially common with file names that share prefixes.

**How it was solved:**

The test was changed to count exact trimmed lines:

```ts
function countExactLine(content: string, line: string): number {
  return content
    .split(/\r?\n/)
    .filter(value => value.trim() === line).length;
}

expect(countExactLine(content, '.dev-loop/dev-loop.db')).toBe(1);
```

**Rule for future local models:** When testing `.gitignore`, config files, generated manifests, or line-based files, count exact lines unless substring matching is truly the behavior. Do not use broad regexes for duplicate prevention when entries share prefixes.

### Pattern J: `instanceof` Can Be Broken by the Base Error Constructor

**What happened:** FEATURE020 needed invalid `.vscode/settings.json` to throw an actionable `ConfigError`. The test used:

```ts
expect(() => mergeVSCodeSettings(projectDir)).toThrow(ConfigError);
```

The failure was surprising:

```text
expected error to be instance of ConfigError

Received:
[ConfigError: Invalid VS Code settings JSON.]
```

The error name was `ConfigError`, but `instanceof ConfigError` failed. The root cause was in `DevLoopError`:

```ts
Object.setPrototypeOf(this, DevLoopError.prototype);
```

That line forces every subclass instance back to the base prototype.

**Why this mistake happens:** A local model remembers that custom Error subclasses often need `Object.setPrototypeOf`, but uses the base class prototype instead of the actual subclass prototype. The bug can stay hidden if tests only check `name`, `message`, or `code`.

**How it was solved:**

Changed the base constructor to:

```ts
Object.setPrototypeOf(this, new.target.prototype);
```

Then re-ran:

```bash
npm test -- gitignore vscode
npm test -- packages/core/src/__tests__/feature009-core-error-classes.test.ts
```

Both passed.

**Rule for future local models:** For custom `Error` subclasses, always use `new.target.prototype` in the base constructor. If adding a new typed error path, test `toThrow(MyErrorClass)` or `error instanceof MyErrorClass`, not only `error.name`.

### Pattern K: Public Core Helper Exports Should Be Explicit and Tested

**What happened:** FEATURE019 and FEATURE020 added helpers meant for future `dev-loop init` behavior:

- `initProjectRuntime`
- `buildProjectRuntimePaths`
- `mergeGitignore`
- `mergeVSCodeSettings`

The repo has an explicit-root-API rule: do not add broad `export *` from package roots. The first instinct in many local-model sessions is to export whole directories or internals until imports work.

**How it was solved:**

Only named exports were added to `packages/core/src/index.ts`, and the existing core entrypoint test was expanded:

```ts
expect(core).toEqual(expect.objectContaining({
  buildProjectRuntimePaths: expect.any(Function),
  initProjectRuntime: expect.any(Function),
  mergeGitignore: expect.any(Function),
  mergeVSCodeSettings: expect.any(Function),
}));
```

**Rule for future local models:** When a feature creates reusable core helpers, export them deliberately by name and update the entrypoint test. Do not use `export *` from a package root to make tests pass.

### Pattern L: Schema Existing in Source Does Not Mean Drizzle Metadata Is Complete

**What happened:** FEATURE021 asked for real Drizzle SQLite table definitions, indexes, and inferred select/insert types for the first table group:

- `loop_history`
- `loop_turns`
- `error_patterns`
- `success_patterns`
- `model_profiles`

At first glance, `packages/core/src/db/schema.ts` already used `sqliteTable`, `integer`, `text`, and `real`. The initial schema tests passed. But the feature also required indexes and type exports. The new test failed:

```text
expected [] to deeply equal ArrayContaining [...]
```

`getTableConfig(loopHistory).indexes` was empty because the indexes existed only in raw migration SQL, not in Drizzle table metadata.

**Why this mistake happens:** The model confuses "the database migration creates indexes" with "the Drizzle schema declares indexes." FEATURE021 specifically wanted Drizzle schema foundation, so metadata matters.

**How it was solved:**

Added index builders as the third `sqliteTable` argument:

```ts
export const loopHistory = sqliteTable('loop_history', {
  ...
}, table => {
  return {
    createdAtIdx: index('idx_loop_history_created').on(table.createdAt),
    primaryModelIdx: index('idx_loop_history_model').on(table.primaryModel),
    successIdx: index('idx_loop_history_success').on(table.success),
  };
});
```

Also added first-group type exports:

```ts
export type LoopHistory = typeof loopHistory.$inferSelect;
export type NewLoopHistory = typeof loopHistory.$inferInsert;
export type ErrorPattern = typeof errorPatterns.$inferSelect;
export type NewErrorPattern = typeof errorPatterns.$inferInsert;
...
```

The migration was kept in lockstep by adding the missing model profile lookup index:

```sql
CREATE INDEX IF NOT EXISTS idx_model_profiles_lookup
ON model_profiles(model, provider, feature_type, language, hour_of_day);
```

**Rule for future local models:** If a feature mentions Drizzle indexes, test `getTableConfig(table).indexes`, not only `PRAGMA index_list` from migrated SQLite. If a feature mentions full DB behavior, test both Drizzle metadata and migration-created tables/indexes.

### Pattern M: Type-only Exports Need `npm run typecheck`, Not Just Vitest

**What happened:** FEATURE021 and FEATURE022 added many `export type` aliases based on `$inferSelect` and `$inferInsert`. Vitest can run tests even when type-only expectations are not fully meaningful at runtime. A test can import types and appear fine under transformation, while `tsc --noEmit` is the real proof.

**How it was solved:**

The feature tests used type-level assignments such as:

```ts
function expectType<T>(value: T): T {
  return value;
}

const newLoop = expectType<NewLoopHistory>({ featureId: 'feature-1' });
```

Then `npm run typecheck` was always run after the targeted schema test.

**Rule for future local models:** For TypeScript type exports, the acceptance proof must include `npm run typecheck`. Vitest is not enough for type-only API guarantees.

### Pattern N: Do Not Overfit Timestamp Tests to One Column Name

**What happened:** FEATURE022 added tests for remaining DB tables. The first version assumed every remaining table had a `createdAt` property:

```ts
expect(getTableColumns(table).createdAt.name).toBe('created_at');
```

The targeted command failed:

```text
Cannot read properties of undefined (reading 'name')
```

The schema had legitimate existing table shapes:

- Most tables use `created_at` exposed as `createdAt`.
- `flaky_tests` uses `first_seen` and `last_seen`.
- `agent_communication` uses `timestamp`.

**Why this mistake happens:** The prompt says "Do not omit created timestamps", and the model turns that into one exact property name everywhere. Existing schema and migration details matter more than a generic wording shortcut.

**How it was solved:**

The test was changed to accept the actual timestamp column shape for each table:

```ts
function timestampColumnName(table: Parameters<typeof getTableColumns>[0]): string {
  const columns = getTableColumns(table) as Record<string, { name: string } | undefined>;
  const timestampColumn = columns.createdAt ?? columns.firstSeen ?? columns.timestamp;
  if (!timestampColumn) {
    throw new Error(`Missing timestamp column on ${getTableName(table)}`);
  }
  return timestampColumn.name;
}
```

Then the test asserted `created_at`, `first_seen`, or `timestamp` depending on the table.

**Rule for future local models:** Before writing schema assertions, inspect actual table shapes. If the schema intentionally uses different timestamp names, assert the invariant ("has a timestamp") without forcing one property name everywhere.

### Pattern O: Raw `UNIQUE(...)` in Migration Is Not the Same as Named Drizzle Unique Index Metadata

**What happened:** FEATURE022 required important unique indexes. Existing migration SQL already had uniqueness:

```sql
UNIQUE(provider, ticket_id)
```

and some Drizzle columns used `.unique()`:

```ts
testName: text('test_name').notNull().unique()
filePath: text('file_path').notNull().unique()
```

But the new Drizzle metadata test failed:

```text
expected [] to include 'idx_tickets_provider_ticket_unique'
```

`getTableConfig(tickets).indexes` was empty. Column `.unique()` was visible as a column property, not as the named important index metadata the test expected.

**Why this mistake happens:** The model conflates three related but distinct things:

1. SQLite table-level `UNIQUE(...)`.
2. Drizzle column `.unique()`.
3. Drizzle `uniqueIndex('name').on(...)` metadata.

For feature tests that need named important unique indexes, only the third gives a named index in `getTableConfig(table).indexes`.

**How it was solved:**

Added explicit Drizzle unique indexes:

```ts
export const tickets = sqliteTable('tickets', {
  ...
}, table => {
  return {
    providerTicketUniqueIdx: uniqueIndex('idx_tickets_provider_ticket_unique').on(table.provider, table.ticketId),
  };
});
```

and matching SQLite migration SQL:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_provider_ticket_unique
ON tickets(provider, ticket_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_flaky_tests_test_name_unique
ON flaky_tests(test_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_golden_files_file_path_unique
ON golden_files(file_path);
```

**Rule for future local models:** If the prompt says "important unique indexes are declared," prefer explicit `uniqueIndex()` in Drizzle plus matching migration SQL. Do not rely only on table-level `UNIQUE` or `.unique()` unless the test explicitly checks those semantics.

### Pattern P: Keep Schema and Migration in Lockstep Even When the Test Only Fails on One Side

**What happened:** FEATURE021 and FEATURE022 failures were initially visible through Drizzle metadata tests. It would have been easy to fix only `schema.ts`. But this repo requires schema and migration lockstep.

**How it was solved:**

Every new Drizzle index declaration was mirrored in `packages/core/src/db/migrations.ts`:

- `idx_model_profiles_lookup`
- `idx_tickets_provider_ticket_unique`
- `idx_flaky_tests_test_name_unique`
- `idx_golden_files_file_path_unique`

Verification included:

```bash
npm test -- schema
npm run typecheck
npm run build -- --force
```

**Rule for future local models:** Any DB table/index/column change touches both `schema.ts` and `migrations.ts` unless there is a documented reason not to. Add or update tests that prove both source-of-truth files agree.

### Pattern Q: Lint Exit 0 With Warnings Must Be Reported Precisely

**What happened:** During FEATURE020, FEATURE021, and FEATURE022, `npm run lint` exited `0` but printed two warnings:

```text
packages/core/src/__tests__/feature010-typed-event-bus.test.ts
  'EventName' is defined but never used

packages/core/src/__tests__/feature018-config-coverage.test.ts
  'assertion' is defined but never used
```

These warnings were unrelated to the touched feature files, and lint still exited `0`.

**Why this matters:** Saying "lint passed" without mentioning warnings can recreate the old false-signal problem. Saying "lint failed" would also be inaccurate because the exit code was `0`.

**How it was handled:**

The review notes for completed features stated:

```text
npm run lint: exit 0 with two pre-existing warnings in unrelated tests.
```

**Rule for future local models:** Always report lint as command + exit behavior + warnings. If warnings are unrelated and exit code is 0, do not block the feature, but record them as residual debt.

### Pattern R: Moving Feature Files Is Part of the Done State, But Only After Verification

**What happened:** For each completed feature, the prompt required appending implementation notes to the feature file and moving it to `REVIEW/`:

- `FEATURES/FEATURE019.md` -> `REVIEW/FEATURE019.md`
- `FEATURES/FEATURE020.md` -> `REVIEW/FEATURE020.md`
- `FEATURES/FEATURE021.md` -> `REVIEW/FEATURE021.md`
- `FEATURES/FEATURE022.md` -> `REVIEW/FEATURE022.md`

This was done only after targeted tests and required verification commands passed.

**Why this matters:** Queue files are process state, not source code. Moving them early creates a stale review claim. The knowledge base already says not to trust review files without commands; this session confirmed that discipline still matters.

**Rule for future local models:** Do not move a feature prompt to `REVIEW/` until:

1. The red phase was observed or the missing behavior was proven.
2. The implementation is complete.
3. The targeted verification command passes.
4. Required TypeScript/build/lint/source-artifact checks have been run as applicable.
5. The feature MD contains what changed, how it was solved, commands run, and any remaining warnings.

### Pattern S: Do Not Continue the Feature Queue After the User Interrupts With a New Instruction

**What happened:** After FEATURE022 was moved to `REVIEW/`, the user interrupted the turn and asked to update `KNOWLEDBASE.md` with every repeated or mistaken action from the session.

**Correct behavior:** Stop reading the next feature file and switch to the newest user instruction. Do not continue the feature queue in the background.

**Rule for future local models:** When the user interrupts with a meta-instruction, treat it as the active task. Do not keep advancing `FEATURES/` until the new request is complete.

## Review Audit Batch: BUG035-BUG039 (2026-07-10)

A follow-up session re-audited every file sitting in `REVIEW/` (FEATURE013, FEATURE016, FEATURE017, FEATURE018, FEATURE019, FEATURE020, FEATURE021, FEATURE022 — FEATURE023/024/025 were produced and verified in the same session and were already solid). Six of eleven review claims were accurate and were deleted. Five were **not** actually done despite being marked `PASSING` or moved into `REVIEW/` — every single one passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run lint` at the time it was written, and every single one still had a real, concrete gap that those four commands cannot detect. This section exists so that a model reading this file **stops treating "the four commands passed" as proof of "the acceptance criteria are met."** They are two different claims. The four commands prove the code compiles and the tests that exist pass. Only reading the acceptance criteria one by one, against the actual code, proves the feature is done.

Each pattern below is a distinct failure mode. Read all of them before writing or reviewing anything in this repo — they are exactly the mistakes this file exists to prevent, and they still slipped through twice.

### Pattern T: Monorepo Hoisting Hides a Missing Package Dependency (BUG035)

**What happened:** FEATURE013 required using the real `yaml` library instead of a hand-written parser. `packages/core/src/config/parse.ts` does `import YAML from 'yaml'` in production source. Every verification command passed: `npm test`, `npm run typecheck`, `npm run build`, `npm run lint`. The review declared "FEATURE013 requirements are fully satisfied."

But `packages/core/package.json` never listed `yaml` as a dependency at all:

```bash
$ grep -n yaml packages/core/package.json
# (no output — nothing there)
```

`yaml` only resolved because the **root** `package.json` happened to list it under `devDependencies` (for unrelated tooling reasons), and npm workspaces hoist all workspace dependencies into one shared root `node_modules/`. Proof the package doesn't actually own it:

```bash
$ cd packages/core && npm ls yaml
dev-loop@0.1.0 /Users/hasanislamoglu/dev-loop
└── (empty)
```

**Why it is wrong:** `@dev-loop/core`'s published tarball ships only `dist/` + `package.json` (per the packaging rules established in the BUG031-033 batch above). Someone who installs `@dev-loop/core` on its own — not inside this monorepo — will not get `yaml` installed, and the built `dist/config/parse.js` will throw `ERR_MODULE_NOT_FOUND` at runtime. Every command the review ran works fine *inside the monorepo* precisely because hoisting papers over the missing declaration. This is a blind spot specific to npm/pnpm/yarn workspaces: **a working `import` inside the monorepo is not evidence that the importing package declares the dependency it needs.**

**Why local models make this mistake:** They see the import resolve and the tests pass and stop there. They do not distinguish "this module can be found right now, in this checkout" from "this package's own manifest declares everything it imports."

**Correct behavior — whenever a package's `src/` imports a new package from npm:**

```bash
# 1. Check the package's OWN manifest, not the root one.
grep -n '"<package-name>"' packages/<workspace>/package.json

# 2. Check what the workspace itself sees as resolved for it — not root, not `node_modules` existence.
cd packages/<workspace> && npm ls <package-name>
# A correct result names the version. "(empty)" or an error means the package doesn't
# own that dependency even though the import currently works by accident of hoisting.
```

If step 2 prints `(empty)`, add the dependency directly to that workspace's `package.json` `dependencies` (or `devDependencies` if it's dev/test-only), then run `npm install` at the root so the lockfile records it correctly per-workspace.

**Rule:** Every `import`/`require` of a third-party package inside `packages/<workspace>/src/**` must have a corresponding entry in that exact `packages/<workspace>/package.json` — never assume the root manifest or another workspace's manifest covers it. Verify with `npm ls <pkg>` run *from inside that workspace directory*, not from root.

### Pattern U: An Error That Computes a Path but Doesn't Use It (BUG036)

**What happened:** FEATURE016's acceptance criteria explicitly included "Errors include config path." `packages/core/src/config/loader.ts` does compute the real resolved path:

```ts
const filePath = options.configPath ?? path.join(projectDir, 'dev-loop.yaml');
```

But the `ConfigError` thrown later never receives it:

```ts
// Bad — filePath was computed above but never passed in:
throw new ConfigError(
  'dev-loop.yaml failed validation.',
  'Fix the reported config keys and run the command again.',
  { issues: validated.error.errors },
);
```

The message hardcodes the literal string `"dev-loop.yaml"` — which is simply wrong whenever a caller supplies a custom `configPath` pointing somewhere else. The existing test only checked a fixed substring (`/Invalid dev-loop.yaml syntax/`), never the actual resolved path, so nothing caught this.

**Why it is wrong:** A user who points `configPath` at `config/staging.yaml` and gets a validation error that says "dev-loop.yaml failed validation" will look in the wrong file. An acceptance criterion that says "errors include X" is not satisfied by an error that includes a hardcoded guess at X — it must include the actual runtime value.

**Why local models make this mistake:** They see a plausible-sounding hardcoded string that matches the common case (default path) and mentally check off the criterion without asking "what if the value that matters here is a variable, not a constant?" They also write tests only against the default path, never against a custom one — which is exactly the input that would have exposed the bug.

**Correct fix pattern:**

```ts
// Good — the same variable already in scope is threaded through:
throw new ConfigError(
  `Config at ${filePath} failed validation.`,
  'Fix the reported config keys and run the command again.',
  { path: filePath, issues: validated.error.errors },
);
```

**Correct test pattern — always test the non-default case for "includes X" criteria:**

```ts
it('includes the resolved config path in a validation error', async () => {
  const projectDir = await tempProjectDir();
  const customPath = path.join(projectDir, 'custom-config.yaml'); // NOT the default dev-loop.yaml
  await fsPromises.writeFile(customPath, 'ui:\n  port: "not-a-number"\n');

  await expect(loadConfig({ projectDir, configPath: customPath, invalidConfig: 'throw' }))
    .rejects.toThrow(new RegExp(customPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
```

**Rule:** When an acceptance criterion says an error must "include" some piece of runtime information (a path, an ID, a key name), write the regression test using a value that is *different from the common/default case*. If a test only ever exercises the default value, a hardcoded string in the implementation will pass it undetected.

### Pattern V: A Library Function Isn't "Done" Until Something Actually Calls It (BUG037)

**What happened:** FEATURE017 required a formatter for Zod validation errors with acceptance criterion #5: "CLI can print helpful validation failures." `packages/core/src/config/errors.ts` defines `safeParseWithMessage()`, has 6 passing unit tests, and the review marked all 5 acceptance criteria satisfied.

```bash
$ grep -rn "safeParseWithMessage" packages/cli/src packages/core/src/index.ts
# no matches — the function is never imported anywhere outside its own file and its own test
```

Nothing in `packages/cli/src` calls it. Nothing in `packages/core/src/index.ts` re-exports it. It is a fully-tested, fully-typed, completely orphaned function — a library capability that no caller can reach.

Additionally, criterion #2 required "key path, received value summary, expected kind, **and suggested fix**." The implementation produces path, received value, and expected kind — and stops. There is no suggested-fix text anywhere, and the review's own "Implementation Summary" quietly lists only the three things that *were* built, without noticing the fourth thing was dropped.

**Why it is wrong:** "Export a helper" and "the CLI can use the helper" are two different acceptance criteria, and only the first was met. A unit test on an isolated function proves the function works in isolation — it proves nothing about whether any caller in the actual product uses it. Similarly, when an acceptance criterion lists N required elements ("path, received, expected, suggested fix"), each element needs its own assertion; a review that says "includes path, received value, expected kind" without mentioning the fourth item is silently telling you it wasn't built, even though it reads as a plausible summary.

**Why local models make this mistake:** They treat "exported from the module" and "used by the feature" as the same milestone. They summarize what they built by listing what's easy to list, and an omitted item quietly vanishes from the summary rather than triggering a "wait, is this actually done?" check. They also don't grep for consumers of the new function before calling the feature complete.

**Correct behavior for any feature whose criteria mention a downstream consumer (CLI/UI/etc.), not just a library function:**

1. After writing the library function, grep for its usage outside its own file and test:
   ```bash
   grep -rn "<newFunctionName>" packages/cli/src packages/ui/src packages/core/src/index.ts
   ```
   If that returns nothing and the feature's acceptance criteria mention "CLI can..." or "UI shows...", the feature is not done — wire it in.
2. When an acceptance criterion enumerates a list of required elements, write one assertion per element and name the test after that exact element, e.g. `it('includes a suggested fix for invalid enum values', ...)`. If you cannot write that specific test because the behavior doesn't exist yet, that is the red phase — implement it, don't skip it.
3. Before writing a completion summary, re-read the acceptance criteria list line by line and match each one to a specific test name and a specific line of production code. Any criterion you cannot point to a test for is not done.

**Rule:** A helper function with passing unit tests is not "integrated" or "usable by the CLI" until something outside its own module and test file actually imports and calls it. Grep for real callers before declaring a feature complete whenever the prompt names a consumer.

### Pattern W: `describe.each`/`it.each` Rows That Never Use Their Own Parameters (BUG038)

**What happened:** FEATURE018 needed tests for "every config section default" — i.e., that `DEFAULT_CONFIG.loop.max_retry === 5`, `DEFAULT_CONFIG.ui.port === 3747`, etc. The test file built exactly that table:

```ts
// Bad — assertion is captured but never evaluated:
describe.each([
  ['version', 'DEFAULT_CONFIG.version === "1"'],
  ['planning.primary.provider', 'DEFAULT_CONFIG.planning.primary.provider === "anthropic"'],
  ['loop.max_retry', 'DEFAULT_CONFIG.loop.max_retry === 5'],
  ['ui.port', 'DEFAULT_CONFIG.ui.port === 3747'],
  // ...16 more rows
])('Default value for %s', (_label, assertion) => {
  it(`has all required sections in DEFAULT_CONFIG`, () => {
    expect(DEFAULT_CONFIG).toHaveProperty('version');
    expect(DEFAULT_CONFIG).toHaveProperty('planning');
    expect(DEFAULT_CONFIG).toHaveProperty('loop');
    expect(DEFAULT_CONFIG).toHaveProperty('ui');
    // ...same 19 toHaveProperty checks, verbatim, on every single row
  });
});
```

The second column of every row (`assertion`) — the part that actually encodes "what value should this key have" — is destructured into the test callback and then **never referenced**. All 20 generated test cases run the identical, generic "does this top-level key exist" check, regardless of which row produced them. The suite reported "31 tests passed" for this file, which reads as thorough coverage; in reality zero of those tests check an actual default *value* like `max_retry === 5`. ESLint even flagged this — `'assertion' is defined but never used` — and a prior review batch filed that warning away as harmless pre-existing debt instead of recognizing it as a symptom of a broken test.

**Why it is wrong:** A parameterized test whose body ignores its own parameters isn't testing N different things — it's testing the same one thing N times while *looking* like N things were verified. This is a more insidious version of "Do Not Use Placeholder Tests" (see above) because it doesn't look like a placeholder; it has real, specific-looking row data that never gets used.

**Why local models make this mistake:** They build the data table first (which requires real thought — reading `defaults.ts`, writing each expected value), then write a generic test body as a starting skeleton, and never go back to make the body actually consume the per-row data. The table looks complete, so the feature looks complete.

**Correct fix — make every declared parameter load-bearing, or don't declare it:**

```ts
// Good — the second element is a real getter/expected-value pair that gets evaluated:
describe.each([
  ['version', (c: DevLoopConfig) => c.version, '1'],
  ['loop.max_retry', (c: DevLoopConfig) => c.loop.max_retry, 5],
  ['ui.port', (c: DevLoopConfig) => c.ui.port, 3747],
  ['voice.enabled', (c: DevLoopConfig) => c.voice.enabled, false],
])('%s default', (_label, getValue, expected) => {
  it('matches the documented default', () => {
    expect(getValue(DEFAULT_CONFIG)).toBe(expected);
  });
});
```

or, more simply, skip the table entirely and write one direct `it()` per default — more verbose, but impossible to write without actually checking the value:

```ts
it('defaults loop.max_retry to 5', () => {
  expect(DEFAULT_CONFIG.loop.max_retry).toBe(5);
});
```

**Verification rule specific to this failure mode:** After writing any `describe.each`/`it.each` table, deliberately break one of the real values being tested (e.g. temporarily change `max_retry: 5` to `max_retry: 4` in `defaults.ts`) and re-run the test. If it still passes, the parameterization is decorative and the test body needs to be fixed before it proves anything. Revert the deliberate break afterward.

**Separately:** the `REVIEW/FEATURE018-*.md` file for this feature was the bare, unedited prompt template — no verdict, no command output, no "what changed" section — yet it was already sitting in `REVIEW/`. Combined with "Pattern R" above (a feature MD must contain what changed/how it was solved/commands run before moving to `REVIEW/`), this means the process rule was skipped *and* the underlying test was broken — two independent failures compounding into one false "done" signal.

### Pattern X: Drizzle Schema Metadata Must Mirror Every Constraint the Migration Enforces, Including Foreign Keys (BUG039)

**What happened:** FEATURE021/FEATURE022's own "Common Local Model Mistakes" section says, in as many words: "Do not forget foreign key references where prompt requires them." Earlier in this same feature pair, the equivalent gap for **indexes** (Pattern L above) and **unique constraints** (Pattern O above) was caught and fixed — Drizzle `index()` and `uniqueIndex()` builders were added so the ORM's own metadata matched the raw migration SQL. Foreign keys were not given the same treatment:

```bash
$ grep -n "references(" packages/core/src/db/schema.ts
# zero matches, across the entire file
```

Every FK-bearing column — `loop_turns.loop_id`, `mcp_usage.loop_id`, `mcp_errors.loop_id`, `mcp_scores.loop_id`, `quality_history.loop_id`, `uncertain_tags.loop_id`, `notification_log.loop_id`, `user_ratings.loop_id`, `tickets.loop_id`, and more — is declared as a bare, unconstrained integer column in Drizzle:

```ts
// Bad — no .references(), even though the real database enforces this relationship:
export const mcpUsage = sqliteTable('mcp_usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  loopId: integer('loop_id').notNull(),
  // ...
});
```

while `db/migrations.ts` creates the actual constraint:

```sql
CREATE TABLE IF NOT EXISTS mcp_usage (
  ...
  FOREIGN KEY (loop_id) REFERENCES loop_history(id)
);
```

**Why it is wrong:** This is the exact same "raw migration SQL is not the same as Drizzle schema metadata" trap as Pattern L (indexes) and Pattern O (unique constraints) — except this time for foreign keys specifically, despite the feature prompt naming that exact risk. Anything that introspects the Drizzle schema for relationships (Drizzle's relational query builder, ER-diagram tooling, future codegen) will see none of these FK relationships, even though the database genuinely enforces them.

**Why local models make this mistake:** Once the *specific* named gap in a prompt ("don't forget X") has already been fixed for a sibling concept (indexes, unique constraints) earlier in the same batch, it is easy to feel like "the metadata-vs-migration lesson" has been applied and stop checking for the one item the prompt called out by name for *this* feature. The lesson was learned generically but not applied to the specific noun (foreign keys) the prompt used.

**Correct fix:**

```ts
export const mcpUsage = sqliteTable('mcp_usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  loopId: integer('loop_id').notNull().references(() => loopHistory.id),
  // ...
});
```

**Correct regression test — mirrors the existing index/unique-index metadata tests, using `getTableConfig(...).foreignKeys` instead:**

```ts
import { getTableConfig } from 'drizzle-orm/sqlite-core';

it('declares the loop_id foreign key on mcp_usage', () => {
  expect(getTableConfig(mcpUsage).foreignKeys.length).toBeGreaterThan(0);
});
```

**Rule:** Whenever a feature prompt names a specific constraint category ("indexes", "unique constraints", "foreign keys", "defaults", "timestamps"), audit *that exact category* across *every* table the feature touches — do not assume that fixing one category (e.g. indexes) means a sibling category named in the same sentence (foreign keys) was also covered. Grep for the Drizzle builder that encodes it (`index(`, `uniqueIndex(`, `.references(`) across the whole schema file as a final check, and compare the count against how many `FOREIGN KEY` / `CREATE INDEX` / `CREATE UNIQUE INDEX` statements exist in the migration for the same tables — the counts should match.

### Pattern Y: A "PASSING" Verdict Is a Claim About the Past, Not a Fact About Now — Audits Must Re-Derive Every Criterion From Source

**The unifying lesson across BUG035-BUG039:** every one of these five features had a review document claiming completion, and every one of those review documents had genuinely run `npm test`, `npm run typecheck`, `npm run build`, and `npm run lint` and gotten a clean result. None of the review authors lied about the commands they ran. All five were still wrong, because:

- BUG035 needed a check *outside* the monorepo's hoisted `node_modules` (per-workspace `npm ls`).
- BUG036 needed a test using a *non-default* input value, not just the happy path.
- BUG037 needed a grep for *external callers* of a new function, not just its own unit test.
- BUG038 needed someone to *read the test body*, not just its pass/fail count, and notice a captured variable was unused.
- BUG039 needed a category-by-category diff between the Drizzle schema and the raw migration SQL, specifically for the one category (foreign keys) the prompt named.

None of these gaps show up in a green `npm test` / `npm run typecheck` / `npm run build` / `npm run lint` run. **A clean run of the four standard commands is necessary but never sufficient.** When auditing a `REVIEW/*.md` file (or any "done" claim), the actual audit procedure is:

1. Re-run the exact commands the review claims to have run — confirm they still pass. This only rules out regressions since the review was written; it does not confirm the review was ever correct.
2. Open the feature prompt's acceptance criteria list and, for every single bullet, find the specific test and the specific line of production code that satisfies it. If a criterion has no test pointing at it, treat the feature as unproven for that criterion, no matter what else passes.
3. For every enumerated list inside a criterion ("path, received value, expected kind, **and suggested fix**"), check each item individually — a summary that silently drops one item from a four-item list is a strong signal that item was never built.
4. Grep for real external callers whenever a criterion mentions a consumer ("CLI can...", "UI shows...").
5. For dependency changes, verify from inside the specific workspace (`cd packages/<x> && npm ls <pkg>`), never from the repo root, since monorepo hoisting hides missing per-workspace declarations.
6. For parameterized tests (`describe.each`/`it.each`), read the test body and confirm every destructured parameter is actually used in an assertion — an unused parameter (and the matching lint warning) means the parameterization is decorative.
7. For schema/migration features, diff constraint categories (indexes, unique constraints, foreign keys, defaults) between the ORM schema and the raw migration SQL, one category at a time — fixing one category is not evidence the sibling category was fixed too.
8. Only after all of the above: delete the review file (if correct) or file a `BUGS/BUG0XX-*.md` report (if not), quoting the exact command/grep output that proves the gap, not just a description of it.

**Rule:** Treat "all four commands passed" and "every acceptance criterion is actually met" as two separate claims that must be independently verified. The first is cheap to check and was already true for all five buggy features above. The second requires reading the acceptance criteria line by line against the real code and is the only thing that actually justifies deleting a review file or moving a feature out of the queue.

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

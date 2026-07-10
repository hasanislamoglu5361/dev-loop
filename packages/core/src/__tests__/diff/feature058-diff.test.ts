import { describe, expect, it } from 'vitest';
import { analyzeDiffRisk, parseUnifiedDiff } from '../../models/verifier/diff-risk.js';

describe('FEATURE058 - Diff Parsing and Semantic Risk', () => {
  it('parses added and removed lines by file and hunk without treating headers as code', () => {
    const parsed = parseUnifiedDiff(`diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
-export const a = 1;
+export const a = 2;
`);

    expect(parsed.files).toEqual([
      {
        oldPath: 'src/a.ts',
        newPath: 'src/a.ts',
        hunks: [{
          header: '@@ -1,2 +1,2 @@',
          added: ['export const a = 2;'],
          removed: ['export const a = 1;'],
        }],
      },
    ]);
  });

  it('scores formatting-only diffs as low risk', () => {
    const analysis = analyzeDiffRisk(`diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-const value={ok:true};
+const value = { ok: true };
`);

    expect(analysis).toMatchObject({
      riskLevel: 'low',
      exportedApiRemoved: false,
      behaviorChange: false,
    });
    expect(analysis.riskScore).toBeLessThan(30);
  });

  it('detects removed exported API as high risk', () => {
    const analysis = analyzeDiffRisk(`diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,2 +1 @@
-export function publicApi() { return true; }
 export function kept() { return true; }
`);

    expect(analysis).toMatchObject({
      riskLevel: 'high',
      exportedApiRemoved: true,
    });
    expect(analysis.riskScore).toBeGreaterThanOrEqual(80);
    expect(analysis.summary).toContain('removed exported API');
  });

  it('detects return/throw/control-flow behavior changes as medium risk', () => {
    const analysis = analyzeDiffRisk(`diff --git a/src/run.ts b/src/run.ts
--- a/src/run.ts
+++ b/src/run.ts
@@ -1,4 +1,5 @@
 function run(value: boolean) {
-  return value;
+  if (!value) throw new Error('bad');
+  return true;
 }
`);

    expect(analysis).toMatchObject({
      riskLevel: 'medium',
      behaviorChange: true,
    });
    expect(analysis.riskScore).toBeGreaterThanOrEqual(50);
  });
});

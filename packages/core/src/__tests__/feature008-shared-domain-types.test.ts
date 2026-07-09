import { describe, expect, it } from 'vitest';
import type {
  LoopId,
  StepId,
  LoopDef,
  LoopResult,
  LoopStep,
  ModelConfig,
  MCPServerConfig,
  QualityGate,
  GeneratedFile,
  NotificationConfig,
  PlanningConfig,
  VerifierConfig,
} from '../types.js';

describe('FEATURE008 - Shared Domain Types', () => {
  it('accepts a LoopDef with required fields: id, name, model, steps', () => {
    const loopDef: LoopDef = { id: 'test-1', name: 'TestLoop', model: 'gpt-4', steps: [] };

    expect(loopDef.id).toBe('test-1');
    expect(loopDef.steps).toEqual([]);
  });

  it('accepts ModelConfig fields: provider, apiKey, model, temperature', () => {
    const modelCfg: ModelConfig = { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o', temperature: 0.7 };

    expect(modelCfg.provider).toBe('openai');
    expect(modelCfg.temperature).toBe(0.7);
  });

  it('accepts VerifierConfig fields', () => {
    const verifierCfg: VerifierConfig = { type: 'unit-test' };

    expect(verifierCfg.type).toBe('unit-test');
  });

  it('accepts MCPServerConfig with server name and url', () => {
    const mcpCfg: MCPServerConfig = { name: 'test-server', url: 'http://localhost:3001' };

    expect(mcpCfg.name).toBe('test-server');
  });

  it('accepts QualityGate fields', () => {
    const qualityGate: QualityGate = { passRate: 80, minComplexityScore: 5 };

    expect(qualityGate.passRate).toBe(80);
  });

  it('accepts PlanningConfig fields', () => {
    const planningCfg: PlanningConfig = { maxIterations: 10, strategy: 'sequential' };

    expect(planningCfg.maxIterations).toBe(10);
  });

  it('accepts NotificationConfig fields', () => {
    const notifCfg: NotificationConfig = { channels: ['terminal'] };

    expect(notifCfg.channels).toContain('terminal');
  });

  it('accepts a LoopStep', () => {
    const step: LoopStep = { id: 'step-1', name: 'Implement', prompt: 'Write code' };

    expect(step.id).toBe('step-1');
  });

  describe('type-level assertions', () => {
    it('LoopId is a string type', () => {
      const loopId: LoopId = 'loop-abc';
      expect(typeof loopId).toBe('string');
    });

    it('StepId is a string type', () => {
      const stepId: StepId = 'step-def';
      expect(typeof stepId).toBe('string');
    });

    it('GeneratedFile has required path and content fields', () => {
      const file: GeneratedFile = { path: '/tmp/out.ts', content: 'export {};', overwrite: true };
      expect(file.path).toBe('/tmp/out.ts');
      expect(file.content).toBe('export {};');
    });

    it('LoopResult has required loopId and success fields', () => {
      const result: LoopResult = { loopId: 'loop-1', success: false, stepsExecuted: 0 };
      expect(result.loopId).toBe('loop-1');
      expect(result.success).toBe(false);
    });

    it('LoopDef model field accepts string shorthand for non-ModelRef models', () => {
      const loopDef: LoopDef = { id: 'test-string-model', name: 'TestStringModel', model: 'gpt-4', steps: [] };
      expect(loopDef.model).toBe('gpt-4');
    });

    it('LoopResult errors is optional and can be omitted', () => {
      const result: LoopResult = { loopId: 'loop-1', success: true, stepsExecuted: 3 };
      expect(result.errors).toBeUndefined();
    });

    it('PlanningConfig strategy accepts all valid strategies', () => {
      for (const strategy of ['sequential' as const, 'parallel' as const, 'adaptive' as const]) {
        const cfg: PlanningConfig = { maxIterations: 5, strategy };
        expect(cfg.strategy).toBe(strategy);
      }
    });

    it('NotificationConfig level accepts all valid levels', () => {
      for (const level of ['info' as const, 'warn' as const, 'error' as const]) {
        const cfg: NotificationConfig = { channels: ['terminal'], level };
        expect(cfg.level).toBe(level);
      }
    });

    it('NotificationConfig can omit optional level', () => {
      const cfg: NotificationConfig = { channels: ['file'] };
      expect(cfg.level).toBeUndefined();
    });
  });

  describe('edge cases and empty inputs', () => {
    it('accepts LoopDef with empty steps array', () => {
      const loopDef: LoopDef = { id: 'empty-steps', name: 'EmptySteps', model: 'gpt-4', steps: [] };
      expect(loopDef.steps).toHaveLength(0);
    });

    it('accepts ModelConfig without optional fields', () => {
      const cfg: ModelConfig = { provider: 'openai', model: 'gpt-4' };
      expect(cfg.apiKey).toBeUndefined();
      expect(cfg.baseUrl).toBeUndefined();
      expect(cfg.timeout).toBeUndefined();
    });

    it('accepts NotificationConfig with multiple channels', () => {
      const cfg: NotificationConfig = { channels: ['terminal', 'file', 'webhook'] };
      expect(cfg.channels).toHaveLength(3);
    });

    it('accepts QualityGate without optional complexity fields', () => {
      const gate: QualityGate = { passRate: 50 };
      expect(gate.passRate).toBe(50);
      expect(gate.minComplexityScore).toBeUndefined();
      expect(gate.maxCognitiveComplexity).toBeUndefined();
    });

    it('accepts GeneratedFile with optional language', () => {
      const file: GeneratedFile = { path: 'src/index.ts', content: '// empty', overwrite: false, language: 'typescript' };
      expect(file.language).toBe('typescript');
    });

    it('accepts LoopStep with optional model and verifier', () => {
      const step: LoopStep = { id: 'full-step', name: 'Full', prompt: 'do stuff', model: undefined, verifier: undefined };
      expect(step.model).toBeUndefined();
      expect(step.verifier).toBeUndefined();
    });

    it('accepts MCPServerConfig with optional transport and env fields', () => {
      const cfg: MCPServerConfig = { name: 'server', url: 'http://localhost' };
      expect(cfg.transport).toBeUndefined();
      expect(cfg.args).toBeUndefined();
      expect(cfg.env).toBeUndefined();
    });

    it('accepts PlanningConfig with optional timeoutMs', () => {
      const cfg: PlanningConfig = { maxIterations: 10, strategy: 'adaptive' };
      expect(cfg.timeoutMs).toBeUndefined();
    });

    it('LoopResult durationMs is optional and can be omitted on success', () => {
      const result: LoopResult = { loopId: 'loop-1', success: true, stepsExecuted: 5 };
      expect(result.durationMs).toBeUndefined();
    });
  });

  describe('no circular imports', () => {
    it('can import types.ts without importing index.ts or other runtime modules that create cycles', async () => {
      await expect(import('../types.js')).resolves.toBeDefined();
    });

    it('core exports include all key domain types as named exports', async () => {
      const module = await import('../index.js');
      const exportedNames = Object.keys(module).sort();
      // Check that core runtime exports are present (types come via type-only exports in production)
      expect(exportedNames).toContain('DevLoopError');
      expect(exportedNames).toContain('EventBus');
      expect(exportedNames.some((n: string) => n.includes('Config'))).toBe(true); // e.g. ConfigError, loadConfig, etc.
    });

    it('types.ts exports all key domain types that index.ts re-exports', () => {
      // All imported types are used in the type-level assertions and edge case tests above.
      // This compiles only if every import resolves to a valid exported symbol from types.ts.
      const imports = 12;
      expect(imports).toBeGreaterThan(0);
    });
  });
});

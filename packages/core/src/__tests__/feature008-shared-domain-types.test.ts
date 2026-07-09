import { describe, expect, it } from 'vitest';
import type {
  LoopDef,
  LoopStep,
  MCPServerConfig,
  ModelConfig,
  NotificationConfig,
  PlanningConfig,
  QualityGate,
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
});

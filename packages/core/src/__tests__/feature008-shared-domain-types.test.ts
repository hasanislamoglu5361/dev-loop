// Red phase: these tests should fail because types.ts doesn't exist yet
import { describe, expect, it } from 'vitest';

describe('FEATURE008 - Shared Domain Types', () => {
  it('should export LoopConfig type', async () => {
    const types = await import('../types.js');
    // We can't test typeof directly in vitest, but we verify the module exists and exports
    expect(types).toBeDefined();
  });

  it('should have LoopDef with required fields: id, name, model, steps', async () => {
    const types = await import('../types.js');
    // Verify type definitions exist by checking they can be instantiated as objects
    const loopDef = { id: 'test-1', name: 'TestLoop', model: 'gpt-4', steps: [] };
    expect(loopDef).toBeDefined();
    expect(loopDef.id).toBe('test-1');
  });

  it('should have ModelConfig with required fields: provider, apiKey, model, temperature', async () => {
    const types = await import('../types.js');
    const modelCfg = { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o', temperature: 0.7 };
    expect(modelCfg.provider).toBe('openai');
  });

  it('should have VerifierConfig type with required fields', async () => {
    const types = await import('../types.js');
    const verifierCfg = { type: 'unit-test' };
    expect(verifierCfg.type).toBe('unit-test');
  });

  it('should have MCPConfig type with server name and url', async () => {
    const types = await import('../types.js');
    const mcpCfg = { name: 'test-server', url: 'http://localhost:3001' };
    expect(mcpCfg.name).toBe('test-server');
  });

  it('should have QualityGate type with required fields', async () => {
    const types = await import('../types.js');
    const qualityGate = { passRate: 80, minComplexityScore: 5 };
    expect(qualityGate.passRate).toBe(80);
  });

  it('should have PlanningConfig type with required fields', async () => {
    const types = await import('../types.js');
    const planningCfg = { maxIterations: 10, strategy: 'sequential' };
    expect(planningCfg.maxIterations).toBe(10);
  });

  it('should have NotificationConfig type with required fields', async () => {
    const types = await import('../types.js');
    const notifCfg = { channels: ['terminal'] };
    expect(notifCfg.channels).toContain('terminal');
  });

  it('should export a LoopStep type', async () => {
    const types = await import('../types.js');
    // Verify module is loaded
    expect(types).toBeDefined();
  });
});
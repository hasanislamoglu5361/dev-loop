import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoopDetail } from '../LoopDetail.js';

describe('FEATURE098 - LoopDetail', () => {
  it('renders an empty-state loop with no turns', () => {
    const html = renderToStaticMarkup(<LoopDetail loopId="loop-empty" turns={[]} />);

    expect(html).toContain('Loop: loop-empty');
    expect(html).toContain('No turns recorded.');
    expect(html).toContain('Total Turns');
  });

  it('renders a populated loop with turns, feature, model, and error', () => {
    const html = renderToStaticMarkup(
      <LoopDetail
        loopId="loop-42"
        status="failed"
        feature="FEATURE098"
        model="claude-sonnet"
        error="Verifier timeout"
        turns={[
          { id: 't1', model: 'claude-sonnet', inputTokens: 1200, outputTokens: 800, success: true, durationMs: 1500 },
          { id: 't2', model: 'claude-haiku', inputTokens: 500, outputTokens: 100, success: false, durationMs: 500 },
          { id: 't3', success: null },
        ]}
      />,
    );

    expect(html).toContain('FEATURE098');
    expect(html).toContain('claude-sonnet');
    expect(html).toContain('Verifier timeout');
    expect(html).toContain('status-failed');
    // Success rate only counts turns with a defined result (t1 pass, t2 fail => 50%)
    expect(html).toContain('50%');
    expect(html).toContain('Pending');
    expect(html).toContain('✓ Pass');
    expect(html).toContain('✗ Fail');
  });
});

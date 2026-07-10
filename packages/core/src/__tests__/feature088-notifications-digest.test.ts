import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cronToIntervalMs, startDigest, stopDigest } from '../notifications/channels.js';

describe('FEATURE088 - Scheduled digest start/stop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not create a timer when the digest is disabled', () => {
    const sendDigest = vi.fn();

    const timer = startDigest({ enabled: false, cron: '@hourly' }, sendDigest);

    expect(timer).toBeUndefined();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(sendDigest).not.toHaveBeenCalled();
  });

  it('fires the digest callback on the configured interval when enabled', () => {
    const sendDigest = vi.fn();

    const timer = startDigest({ enabled: true, cron: '@hourly' }, sendDigest);

    expect(timer).toBeDefined();
    expect(sendDigest).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(sendDigest).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(sendDigest).toHaveBeenCalledTimes(2);

    stopDigest(timer);
  });

  it('stopDigest clears the timer and no further firing occurs', () => {
    const sendDigest = vi.fn();

    const timer = startDigest({ enabled: true, cron: '@hourly' }, sendDigest);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(sendDigest).toHaveBeenCalledTimes(1);

    const stopped = stopDigest(timer);
    expect(stopped).toBe(true);

    vi.advanceTimersByTime(10 * 60 * 60 * 1000);
    expect(sendDigest).toHaveBeenCalledTimes(1);
  });

  it('stopDigest returns false when given no timer', () => {
    expect(stopDigest(undefined)).toBe(false);
  });

  it('cronToIntervalMs converts common shorthand cadences', () => {
    expect(cronToIntervalMs('@hourly')).toBe(60 * 60 * 1000);
    expect(cronToIntervalMs('@daily')).toBe(24 * 60 * 60 * 1000);
    expect(cronToIntervalMs('@weekly')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(cronToIntervalMs('every 15m')).toBe(15 * 60 * 1000);
    expect(cronToIntervalMs('2h')).toBe(2 * 60 * 60 * 1000);
    expect(cronToIntervalMs('30000')).toBe(30000);
    expect(cronToIntervalMs('not-a-real-cron')).toBe(24 * 60 * 60 * 1000);
  });

  it('supports async sendDigest callbacks without unhandled rejections', async () => {
    const sendDigest = vi.fn(async () => undefined);

    const timer = startDigest({ enabled: true, cron: 'every 5m' }, sendDigest);
    vi.advanceTimersByTime(5 * 60 * 1000);
    await Promise.resolve();

    expect(sendDigest).toHaveBeenCalledTimes(1);
    stopDigest(timer);
  });

  it('uses a stoppable wall-clock scheduler for five-field cron expressions', () => {
    const sendDigest = vi.fn();

    const timer = startDigest({ enabled: true, cron: '0 8 * * *' }, sendDigest);
    expect(timer).toEqual(expect.objectContaining({ start: expect.any(Function), stop: expect.any(Function) }));
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(sendDigest).toHaveBeenCalledTimes(1);
    expect(stopDigest(timer)).toBe(true);
  });
});

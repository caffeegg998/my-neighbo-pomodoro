import { describe, expect, it } from 'vitest';
import { formatTime, remainingFor } from './types';

describe('timer display', () => {
  it('recomputes the remaining time from the deadline after a long sleep', () => {
    const timer = {
      phase: 'focus' as const, status: 'running' as const, remainingSeconds: 1500,
      durationSeconds: 1500, deadlineMs: 100_000, taskId: null, focusCycle: 0,
    };
    expect(remainingFor(timer, 70_000)).toBe(30);
    expect(remainingFor(timer, 180_000)).toBe(0);
    expect(formatTime(0)).toBe('00:00');
  });
});

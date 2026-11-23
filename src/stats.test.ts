import { describe, expect, it } from 'vitest';
import { dailyStats, dateKey, startOfWeek } from './stats';
import type { Session } from './types';

describe('dailyStats', () => {
  it('starts a selected calendar week on Monday, including across years', () => {
    expect(dateKey(startOfWeek(new Date(2026, 10, 29)))).toBe('2026-11-23');
    expect(dateKey(startOfWeek(new Date(2027, 0, 1)))).toBe('2026-12-28');
  });

  it('counts completed focus on its local completion date and ignores breaks', () => {
    const today = new Date(2026, 10, 22, 10);
    const yesterday = new Date(2026, 10, 21, 23, 59);
    const sessions: Session[] = [
      { id: '1', kind: 'focus', taskId: null, startedAtMs: yesterday.getTime() - 25 * 60_000, endedAtMs: yesterday.getTime(), durationSeconds: 1500 },
      { id: '2', kind: 'shortBreak', taskId: null, startedAtMs: today.getTime() - 5 * 60_000, endedAtMs: today.getTime(), durationSeconds: 300 },
    ];
    const result = dailyStats(sessions, 2, today);
    expect(result[0]).toMatchObject({ key: dateKey(yesterday), count: 1, minutes: 25 });
    expect(result[1]).toMatchObject({ key: dateKey(today), count: 0, minutes: 0 });
  });
});

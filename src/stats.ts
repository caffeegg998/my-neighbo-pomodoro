import type { Session } from './types';

export interface DailyStat { key: string; date: Date; minutes: number; count: number }

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function startOfWeek(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return monday;
}

export function dailyStats(sessions: Session[], days = 7, now = new Date()): DailyStat[] {
  const output: DailyStat[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    output.push({ key: dateKey(date), date, minutes: 0, count: 0 });
  }
  const byKey = new Map(output.map((entry) => [entry.key, entry]));
  for (const session of sessions) {
    if (session.kind !== 'focus') continue;
    const entry = byKey.get(dateKey(new Date(session.endedAtMs)));
    if (!entry) continue;
    entry.minutes += session.durationSeconds / 60;
    entry.count += 1;
  }
  return output;
}

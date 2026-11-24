export type Phase = 'focus' | 'shortBreak' | 'longBreak';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished';
export type Language = 'en' | 'vi';
export type Theme = 'system' | 'light' | 'dark';
export type TimerStyle = 'travel' | 'classic' | 'amply' | 'drum';

export interface Task {
  id: string;
  title: string;
  createdAtMs: number;
  completedAtMs: number | null;
}

export interface Session {
  id: string;
  kind: Phase;
  taskId: string | null;
  startedAtMs: number;
  endedAtMs: number;
  durationSeconds: number;
}

export interface Settings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: number;
  language: Language | '';
  theme: Theme;
  soundEnabled: boolean;
  testMode: boolean;
  timerStyle: TimerStyle;
  travelSizePercent: number;
  travelClockPercent: number;
  classicSizePercent: number;
  classicClockPercent: number;
  amplySizePercent: number;
  amplyClockPercent: number;
  drumSizePercent: number;
  drumClockPercent: number;
}

export interface TimerSnapshot {
  phase: Phase;
  status: TimerStatus;
  remainingSeconds: number;
  durationSeconds: number;
  deadlineMs: number | null;
  taskId: string | null;
  focusCycle: number;
}

export interface Bootstrap {
  tasks: Task[];
  sessions: Session[];
  settings: Settings;
  timer: TimerSnapshot;
}

export const defaultSettings: Settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  language: '',
  theme: 'system',
  soundEnabled: true,
  testMode: false,
  timerStyle: 'travel',
  travelSizePercent: 100,
  travelClockPercent: 100,
  classicSizePercent: 100,
  classicClockPercent: 100,
  amplySizePercent: 100,
  amplyClockPercent: 100,
  drumSizePercent: 100,
  drumClockPercent: 100,
};

export function durationFor(phase: Phase, settings: Settings): number {
  if (phase === 'shortBreak') return settings.shortBreakMinutes * 60;
  if (phase === 'longBreak') return settings.longBreakMinutes * 60;
  return settings.focusMinutes * 60;
}

export function remainingFor(timer: TimerSnapshot, now = Date.now()): number {
  if (timer.status === 'running' && timer.deadlineMs !== null) {
    return Math.max(0, Math.ceil((timer.deadlineMs - now) / 1000));
  }
  return timer.remainingSeconds;
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

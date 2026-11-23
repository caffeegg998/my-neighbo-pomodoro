import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { effectiveLanguage } from './i18n';
import { defaultSettings, durationFor } from './types';
import type { Bootstrap, Phase, Session, Settings, Task, TimerSnapshot } from './types';

type MockState = Bootstrap & { activeSession: { id: string; startedAtMs: number } | null; sampleTasksSeeded?: boolean };
const mockKey = 'pomodoro-vibe:preview';
const native = isTauri();

function freshMock(): MockState {
  return {
    tasks: [], sessions: [], settings: { ...defaultSettings }, activeSession: null, sampleTasksSeeded: false,
    timer: { phase: 'focus', status: 'idle', remainingSeconds: 1500, durationSeconds: 1500, deadlineMs: null, taskId: null, focusCycle: 0 },
  };
}

function readMock(): MockState {
  try {
    const stored = localStorage.getItem(mockKey);
    const state = stored ? JSON.parse(stored) as MockState : freshMock();
    state.settings.testMode ??= false;
    if (!['travel', 'classic'].includes(state.settings.timerStyle)) state.settings.timerStyle = 'travel';
    const legacySize = (state.settings as Settings & { timerSizePercent?: number }).timerSizePercent;
    state.settings.travelSizePercent ??= legacySize ?? defaultSettings.travelSizePercent;
    state.settings.classicSizePercent ??= legacySize ?? defaultSettings.classicSizePercent;
    state.settings.travelClockPercent ??= defaultSettings.travelClockPercent;
    state.settings.classicClockPercent ??= defaultSettings.classicClockPercent;
    delete (state.settings as Settings & { timerSizePercent?: number }).timerSizePercent;
    return state;
  } catch { return freshMock(); }
}

function writeMock(state: MockState): void {
  localStorage.setItem(mockKey, JSON.stringify(state));
}

function mockEvent<T>(name: string, detail: T): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function completeMockSession(state: MockState): TimerSnapshot {
  const phase = state.timer.phase;
  if (state.activeSession) {
    state.sessions.unshift({
      id: state.activeSession.id, kind: phase, taskId: state.timer.taskId,
      startedAtMs: state.activeSession.startedAtMs, endedAtMs: Date.now(),
      durationSeconds: state.timer.durationSeconds,
    });
  }
  state.activeSession = null;
  if (phase === 'focus') state.timer.focusCycle = (state.timer.focusCycle + 1) % state.settings.longBreakEvery;
  state.timer.phase = phase === 'focus' ? (state.timer.focusCycle === 0 ? 'longBreak' : 'shortBreak') : 'focus';
  state.timer.status = 'finished';
  state.timer.durationSeconds = durationFor(state.timer.phase, state.settings);
  state.timer.remainingSeconds = state.timer.durationSeconds;
  state.timer.deadlineMs = null;
  state.timer.taskId = null;
  writeMock(state);
  mockEvent('timer-state', state.timer);
  mockEvent('session-completed', phase);
  return state.timer;
}

function refreshMockTimer(): void {
  const state = readMock();
  if (state.timer.status !== 'running' || state.timer.deadlineMs === null || state.timer.deadlineMs > Date.now()) return;
  completeMockSession(state);
}

if (!native) window.setInterval(refreshMockTimer, 300);

function mockBootstrap(systemLanguage: 'en' | 'vi'): Bootstrap {
  refreshMockTimer();
  const state = readMock();
  if (!state.sampleTasksSeeded) {
    if (state.tasks.length === 0) {
      const titles = effectiveLanguage(state.settings.language || systemLanguage) === 'vi'
        ? [
          'Lên kế hoạch 3 việc quan trọng hôm nay',
          'Tập trung 25 phút cho việc ưu tiên nhất',
          'Hoàn thành một đầu việc đang trì hoãn',
          'Tổng kết kết quả cuối ngày',
        ]
        : [
          "Plan today's three priorities",
          'Focus 25 minutes on the top priority',
          'Make progress on a postponed task',
          "Review today's progress",
        ];
      const createdAtMs = Date.now();
      state.tasks = titles.map((title, index) => ({
        id: `${crypto.randomUUID()}-${index}`, title, createdAtMs: createdAtMs - index, completedAtMs: null,
      }));
    }
    state.sampleTasksSeeded = true;
    writeMock(state);
  }
  const { activeSession: _activeSession, sampleTasksSeeded: _seeded, ...bootstrap } = state;
  void _activeSession; void _seeded;
  return bootstrap;
}

function mockTask(title: string): Task {
  const state = readMock();
  const task = { id: crypto.randomUUID(), title: title.trim(), createdAtMs: Date.now(), completedAtMs: null };
  state.tasks.unshift(task);
  writeMock(state);
  return task;
}

function mockUpdateTask(id: string, title: string, completed: boolean): Task {
  const state = readMock();
  const task = state.tasks.find((item) => item.id === id);
  if (!task) throw new Error('Task not found');
  task.title = title.trim();
  task.completedAtMs = completed ? task.completedAtMs ?? Date.now() : null;
  writeMock(state);
  return task;
}

function mockTimerAction(action: 'start' | 'pause' | 'resume' | 'skip' | 'reset' | 'finishTest', kind?: Phase, taskId?: string | null): TimerSnapshot {
  refreshMockTimer();
  const state = readMock();
  const timer = state.timer;
  if (action === 'start') {
    if (timer.status === 'running' || timer.status === 'paused') throw new Error('A session is already active');
    timer.phase = kind ?? timer.phase;
    timer.durationSeconds = durationFor(timer.phase, state.settings);
    timer.remainingSeconds = timer.durationSeconds;
    timer.status = 'running';
    timer.deadlineMs = Date.now() + timer.durationSeconds * 1000;
    timer.taskId = timer.phase === 'focus' ? taskId ?? null : null;
    state.activeSession = { id: crypto.randomUUID(), startedAtMs: Date.now() };
  } else if (action === 'pause') {
    if (timer.status !== 'running') throw new Error('Timer is not running');
    timer.remainingSeconds = Math.max(1, Math.ceil(((timer.deadlineMs ?? Date.now()) - Date.now()) / 1000));
    timer.status = 'paused'; timer.deadlineMs = null;
  } else if (action === 'resume') {
    if (timer.status !== 'paused') throw new Error('Timer is not paused');
    timer.status = 'running'; timer.deadlineMs = Date.now() + timer.remainingSeconds * 1000;
  } else if (action === 'finishTest') {
    if (!state.settings.testMode) throw new Error('Test mode is disabled');
    if (timer.status !== 'running' && timer.status !== 'paused') throw new Error('No active session to finish');
    return completeMockSession(state);
  } else if (action === 'skip') {
    const current = timer.status === 'running' || timer.status === 'paused' ? timer.phase : kind ?? timer.phase;
    timer.phase = current === 'focus' ? 'shortBreak' : 'focus';
    timer.status = 'idle'; timer.durationSeconds = durationFor(timer.phase, state.settings);
    timer.remainingSeconds = timer.durationSeconds; timer.deadlineMs = null; timer.taskId = null;
    state.activeSession = null;
  } else {
    timer.phase = kind ?? timer.phase;
    timer.status = 'idle'; timer.durationSeconds = durationFor(timer.phase, state.settings);
    timer.remainingSeconds = timer.durationSeconds; timer.deadlineMs = null; timer.taskId = null;
    state.activeSession = null;
  }
  writeMock(state);
  mockEvent('timer-state', timer);
  return timer;
}

export const api = {
  isNative: native,
  setTrayLanguage: (language: 'en' | 'vi'): Promise<void> => native ? invoke('set_tray_language', { language }) : Promise.resolve(),
  setTitleBarColor: (background: string, foreground: string): Promise<void> => native
    ? invoke('set_title_bar_color', { background, foreground }) : Promise.resolve(),
  bootstrap: (): Promise<Bootstrap> => {
    const systemLanguage = effectiveLanguage('');
    return native ? invoke('bootstrap', { systemLanguage }) : Promise.resolve(mockBootstrap(systemLanguage));
  },
  createTask: (title: string): Promise<Task> => native ? invoke('create_task', { title }) : Promise.resolve(mockTask(title)),
  updateTask: (id: string, title: string, completed: boolean): Promise<Task> => native
    ? invoke('update_task', { id, title, completed }) : Promise.resolve(mockUpdateTask(id, title, completed)),
  deleteTask: (id: string): Promise<void> => {
    if (native) return invoke('delete_task', { id });
    const state = readMock();
    state.tasks = state.tasks.filter((task) => task.id !== id);
    state.sessions = state.sessions.map((session) => session.taskId === id ? { ...session, taskId: null } : session);
    if (state.timer.taskId === id) state.timer.taskId = null;
    writeMock(state);
    return Promise.resolve();
  },
  saveSettings: (settings: Settings): Promise<Settings> => {
    if (native) return invoke('save_settings', { settings });
    const state = readMock();
    state.settings = settings;
    if (state.timer.status === 'idle' || state.timer.status === 'finished') {
      state.timer.durationSeconds = durationFor(state.timer.phase, settings);
      state.timer.remainingSeconds = state.timer.durationSeconds;
    }
    writeMock(state);
    return Promise.resolve(settings);
  },
  startTimer: (kind: Phase, taskId: string | null): Promise<TimerSnapshot> => native
    ? invoke('start_timer', { kind, taskId }) : Promise.resolve(mockTimerAction('start', kind, taskId)),
  pauseTimer: (): Promise<TimerSnapshot> => native ? invoke('pause_timer') : Promise.resolve(mockTimerAction('pause')),
  resumeTimer: (): Promise<TimerSnapshot> => native ? invoke('resume_timer') : Promise.resolve(mockTimerAction('resume')),
  skipTimer: (kind: Phase): Promise<TimerSnapshot> => native ? invoke('skip_timer', { kind }) : Promise.resolve(mockTimerAction('skip', kind)),
  resetTimer: (kind: Phase): Promise<TimerSnapshot> => native ? invoke('reset_timer', { kind }) : Promise.resolve(mockTimerAction('reset', kind)),
  finishTestSession: (): Promise<TimerSnapshot> => native ? invoke('finish_test_session') : Promise.resolve(mockTimerAction('finishTest')),
  subscribe: async (onTimer: (timer: TimerSnapshot) => void, onComplete: (phase: Phase) => void): Promise<() => void> => {
    if (native) {
      const offTimer = await listen<TimerSnapshot>('timer-state', (event) => onTimer(event.payload));
      const offComplete = await listen<Phase>('session-completed', (event) => onComplete(event.payload));
      return () => { offTimer(); offComplete(); };
    }
    const timerHandler = (event: Event) => onTimer((event as CustomEvent<TimerSnapshot>).detail);
    const completeHandler = (event: Event) => onComplete((event as CustomEvent<Phase>).detail);
    window.addEventListener('timer-state', timerHandler);
    window.addEventListener('session-completed', completeHandler);
    return () => {
      window.removeEventListener('timer-state', timerHandler);
      window.removeEventListener('session-completed', completeHandler);
    };
  },
};

export function sessionsToday(sessions: Session[]): Session[] {
  const today = new Date();
  return sessions.filter((session) => {
    const date = new Date(session.endedAtMs);
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  });
}

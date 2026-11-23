// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { api } from './api';
import { dateKey } from './stats';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => { values.clear(); },
  });
  vi.stubGlobal('matchMedia', () => ({
    matches: false, addEventListener: () => {}, removeEventListener: () => {},
  }));
  vi.stubGlobal('crypto', { randomUUID: () => 'task-1' });
});

afterEach(cleanup);

describe('main workflow', () => {
  it('shows Travel by default and saves the classic timer style', async () => {
    render(<App />);
    await screen.findByText('Your focus space');
    expect(document.querySelector('.timer-card-travel .travel-art')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect((screen.getByRole('radio', { name: 'Travel' }) as HTMLInputElement).checked).toBe(true);
    expect(document.querySelector('.timer-style-preview-travel .travel-art')).not.toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Classic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    await waitFor(() => expect(document.querySelector('.timer-card-classic')).not.toBeNull());
    expect(document.querySelector('.timer-card-classic .travel-scene')).toBeNull();
    expect((await api.bootstrap()).settings.timerStyle).toBe('classic');
  });

  it('migrates an existing Aquarium preference to Travel', async () => {
    const state = await api.bootstrap();
    localStorage.setItem('pomodoro-vibe:preview', JSON.stringify({
      ...state, settings: { ...state.settings, timerStyle: 'aquarium', travelSizePercent: undefined,
        classicSizePercent: undefined, travelClockPercent: undefined, classicClockPercent: undefined, timerSizePercent: 80 },
    }));
    const migrated = (await api.bootstrap()).settings;
    expect(migrated.timerStyle).toBe('travel');
    expect([migrated.travelSizePercent, migrated.classicSizePercent]).toEqual([80, 80]);
    expect([migrated.travelClockPercent, migrated.classicClockPercent]).toEqual([100, 100]);
  });

  it('keeps overall and clock sizes separately for each style', async () => {
    render(<App />);
    await screen.findByText('Your focus space');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const overall = screen.getByRole('slider', { name: 'Overall size' }) as HTMLInputElement;
    const clock = screen.getByRole('slider', { name: 'Clock digits size' }) as HTMLInputElement;
    fireEvent.change(overall, { target: { value: '80' } });
    fireEvent.change(clock, { target: { value: '110' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Classic' }));
    expect(overall.value).toBe('100');
    expect(clock.value).toBe('100');
    fireEvent.change(overall, { target: { value: '90' } });
    fireEvent.change(clock, { target: { value: '75' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Travel' }));
    expect(overall.value).toBe('80');
    expect(clock.value).toBe('110');
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    await waitFor(() => expect(document.querySelector<HTMLElement>('.timer-card-travel .timer-stage')?.style.getPropertyValue('--timer-stage-px')).toBe('272px'));
    const travelStage = document.querySelector<HTMLElement>('.timer-card-travel .timer-stage');
    expect(travelStage?.style.getPropertyValue('--timer-digits-large')).toBe('35px');
    expect(travelStage?.querySelector('.timer-digits')?.children[1].className).toBe('timer-separator');
    const saved = (await api.bootstrap()).settings;
    expect([saved.travelSizePercent, saved.travelClockPercent, saved.classicSizePercent, saved.classicClockPercent]).toEqual([80, 110, 90, 75]);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Classic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    await waitFor(() => expect(document.querySelector<HTMLElement>('.timer-card-classic .timer-stage')?.style.getPropertyValue('--timer-stage-px')).toBe('288px'));
    expect(document.querySelector<HTMLElement>('.timer-card-classic .timer-stage')?.style.getPropertyValue('--timer-digits-large')).toBe('51px');
  });

  it('counts a test mode focus completion in statistics', async () => {
    render(<App />);
    await screen.findByText('Your focus space');
    expect(screen.queryByRole('button', { name: 'Next session' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Test mode/ }));
    const footer = screen.getByRole('contentinfo', { name: 'Status bar' });
    const footerNext = await within(footer).findByRole('button', { name: 'Next session · Status bar' });
    expect((footerNext as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    const nextSession = await screen.findByRole('button', { name: 'Next session' });
    expect((nextSession as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    await waitFor(() => expect((footerNext as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(footerNext);
    await screen.findByText('Session complete');
    const state = await api.bootstrap();
    expect(state.timer.phase).toBe('shortBreak');
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].kind).toBe('focus');
    expect(state.sessions[0].durationSeconds).toBe(1500);
    expect(state.settings.testMode).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));
    const completedCard = screen.getByText('Completed sessions').closest('.stat-card');
    expect(completedCard).not.toBeNull();
    await waitFor(() => expect(within(completedCard as HTMLElement).getByText('1')).toBeTruthy());
    expect(screen.getByText('Focus time').closest('.stat-card')?.querySelector('strong')?.textContent).toBe('25 min');
  });

  it('shows a status bar with working navigation and theme control', async () => {
    render(<App />);
    await screen.findByText('Your focus space');
    const statusBar = screen.getByRole('contentinfo', { name: 'Status bar' });
    expect(within(statusBar).getByText('25:00')).toBeTruthy();
    fireEvent.click(within(statusBar).getByRole('button', { name: /to do/i }));
    await screen.findByText('Your tasks');
    fireEvent.click(within(statusBar).getByRole('button', { name: 'Theme: Dark' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });

  it('paginates recent focus sessions from the last 30 days', async () => {
    await api.bootstrap();
    const stored = JSON.parse(localStorage.getItem('pomodoro-vibe:preview')!);
    const now = Date.now();
    stored.tasks = Array.from({ length: 14 }, (_, index) => ({
      id: `recent-task-${index}`, title: `Recent task ${index + 1}`,
      createdAtMs: now, completedAtMs: null,
    }));
    stored.sessions = [
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `recent-session-${index}`, kind: 'focus', taskId: `recent-task-${index}`,
        startedAtMs: now - index * 60_000 - 1500_000,
        endedAtMs: now - index * 60_000, durationSeconds: 1500,
      })),
      { id: 'old-session', kind: 'focus', taskId: 'recent-task-12', startedAtMs: now - 31 * 86_400_000 - 1500_000,
        endedAtMs: now - 31 * 86_400_000, durationSeconds: 1500 },
      { id: 'break-session', kind: 'shortBreak', taskId: 'recent-task-13', startedAtMs: now - 300_000,
        endedAtMs: now - 20_000, durationSeconds: 300 },
    ];
    localStorage.setItem('pomodoro-vibe:preview', JSON.stringify(stored));

    render(<App />);
    await screen.findByText('Your focus space');
    fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));
    const panel = screen.getByText('Recent sessions').closest('.recent-panel') as HTMLElement;
    const pager = within(panel).getByRole('navigation', { name: 'Recent session pages' });
    expect(panel.querySelectorAll('.recent-row')).toHaveLength(5);
    expect(within(panel).getByText('Recent task 1')).toBeTruthy();
    expect(within(panel).queryByText('Recent task 6')).toBeNull();
    expect((within(pager).getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(pager).getByRole('button', { name: 'Next' }));
    expect(within(pager).getByText('Page 2 / 3')).toBeTruthy();
    expect(within(panel).getByText('Recent task 6')).toBeTruthy();
    expect(within(panel).queryByText('Recent task 1')).toBeNull();
    fireEvent.click(within(pager).getByRole('button', { name: 'Next' }));
    expect(panel.querySelectorAll('.recent-row')).toHaveLength(2);
    expect((within(pager).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(panel).queryByText('Recent task 13')).toBeNull();
    expect(within(panel).queryByText('Recent task 14')).toBeNull();

    const chartWeeks = screen.getByRole('navigation', { name: 'Chart weeks' });
    const nextWeek = within(chartWeeks).getByRole('button', { name: 'Next week' }) as HTMLButtonElement;
    expect(nextWeek.disabled).toBe(true);
    const currentRange = within(chartWeeks).getByText(/–/).textContent;
    fireEvent.click(within(chartWeeks).getByRole('button', { name: 'Previous week' }));
    expect(within(chartWeeks).getByText(/–/).textContent).not.toBe(currentRange);
    expect(nextWeek.disabled).toBe(false);

    fireEvent.change(screen.getByLabelText('Choose date'), { target: { value: dateKey(new Date(now - 31 * 86_400_000)) } });
    const completedCard = screen.getByText('Completed sessions').closest('.stat-card');
    await waitFor(() => expect(completedCard?.querySelector('strong')?.textContent).toBe('1'));
    expect(screen.getByRole('img', { name: 'Focus minutes by day' })).toBeTruthy();
  });

  it('adds sample tasks once to an empty preview', async () => {
    const first = await api.bootstrap();
    expect(first.tasks).toHaveLength(4);
    for (const task of first.tasks) await api.deleteTask(task.id);
    expect((await api.bootstrap()).tasks).toHaveLength(0);
  });

  it('creates a task, selects it for focus, and can pause the timer', async () => {
    render(<App />);
    await screen.findByText('Your focus space');
    const input = screen.getByPlaceholderText('What will you work on?');
    fireEvent.change(input, { target: { value: 'Write proposal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add a task' }));
    expect(await within(screen.getByRole('main')).findAllByText('Write proposal')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'vi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await screen.findByRole('button', { name: 'Lưu cài đặt' });
  });
});

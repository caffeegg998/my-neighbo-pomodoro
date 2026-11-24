import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  AirplaneTilt, ArrowCounterClockwise, ChartBar, Check, CheckSquare, Clock, Coffee, GearSix,
  Moon, Pause, PencilSimple, Play, Plus, SkipForward, Sun, Timer, Trash, X,
} from '@phosphor-icons/react';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api } from './api';
import { TravelScene } from './TravelScene';
import { AmplyGuitar, AmplyScene } from './AmplyScene';
import { DrumScene } from './DrumScene';
import { UpdatePanel } from './UpdatePanel';
import { effectiveLanguage, strings } from './i18n';
import type { TranslationKey } from './i18n';
import { dailyStats, dateKey, startOfWeek } from './stats';
import { defaultSettings, durationFor, formatTime, remainingFor } from './types';
import type { Phase, Session, Settings, Task, TimerSnapshot, TimerStyle } from './types';

type View = 'focus' | 'tasks' | 'stats' | 'settings';
const initialTimer: TimerSnapshot = {
  phase: 'focus', status: 'idle', remainingSeconds: 1500, durationSeconds: 1500,
  deadlineMs: null, taskId: null, focusCycle: 0,
};
const phaseKeys: Phase[] = ['focus', 'shortBreak', 'longBreak'];
const recentPageSize = 5;
let audioContext: AudioContext | null = null;
let guitarNoteIndex = 0;
const guitarNotes = [196, 233.08, 261.63, 196, 233.08, 277.18, 261.63, 196, 233.08, 261.63, 233.08, 196];

function timerStyleSizes(settings: Settings, style: TimerStyle = settings.timerStyle) {
  if (style === 'travel') return { stage: settings.travelSizePercent, clock: settings.travelClockPercent };
  if (style === 'amply') return { stage: settings.amplySizePercent, clock: settings.amplyClockPercent };
  if (style === 'drum') return { stage: settings.drumSizePercent, clock: settings.drumClockPercent };
  return { stage: settings.classicSizePercent, clock: settings.classicClockPercent };
}

function timerStageStyle(settings: Settings): CSSProperties {
  const sizes = timerStyleSizes(settings);
  const stageScale = sizes.stage / 100;
  const clockScale = sizes.clock / 100;
  const baseWidth = settings.timerStyle === 'travel' ? 340 : settings.timerStyle === 'amply' || settings.timerStyle === 'drum' ? 440 : 320;
  const digits = settings.timerStyle === 'travel'
    ? [40, 40, 34]
    : settings.timerStyle === 'amply' ? [30, 28, 25] : settings.timerStyle === 'drum' ? [32, 30, 26] : [76, 69, 61];
  return {
    '--timer-stage-px': `${Math.round(baseWidth * stageScale)}px`,
    '--timer-stage-percent': `${sizes.stage}%`,
    '--timer-digits-large': `${Math.round(digits[0] * stageScale * clockScale)}px`,
    '--timer-digits-medium': `${Math.round(digits[1] * stageScale * clockScale)}px`,
    '--timer-digits-small': `${Math.round(digits[2] * stageScale * clockScale)}px`,
  } as CSSProperties;
}

function unlockAudio(): void {
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume();
  } catch { /* Audio is optional. */ }
}

function playCompletionSound(): void {
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume().then(() => {
      if (!audioContext) return;
      for (const [index, frequency] of [587.33, 783.99].entries()) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const at = audioContext.currentTime + index * 0.18;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.13, at + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.48);
      }
    });
  } catch { /* Audio is optional. */ }
}

function playGuitarSound(): void {
  try {
    audioContext ??= new AudioContext();
    const context = audioContext;
    const frequency = guitarNotes[guitarNoteIndex++ % guitarNotes.length];
    void context.resume().then(() => {
      const at = context.currentTime;
      const string = context.createOscillator();
      const tone = context.createBiquadFilter();
      const volume = context.createGain();
      string.type = 'sawtooth';
      string.frequency.setValueAtTime(frequency, at);
      tone.type = 'lowpass';
      tone.frequency.setValueAtTime(1800, at);
      tone.frequency.exponentialRampToValueAtTime(450, at + .5);
      volume.gain.setValueAtTime(.0001, at);
      volume.gain.exponentialRampToValueAtTime(.08, at + .012);
      volume.gain.exponentialRampToValueAtTime(.0001, at + .62);
      string.connect(tone).connect(volume).connect(context.destination);
      string.start(at);
      string.stop(at + .65);
    }).catch(() => { /* Guitar audio is optional. */ });
  } catch { /* Guitar audio is optional. */ }
}

async function requestMacNotification(): Promise<void> {
  if (!api.isNative || !/Mac/i.test(navigator.userAgent)) return;
  try {
    if (!(await isPermissionGranted())) await requestPermission();
  } catch { /* The timer still works without notifications. */ }
}

function IconMark({ small = false }: { small?: boolean }) {
  return <span className={`icon-mark${small ? ' icon-mark-small' : ''}`} aria-hidden="true"><span /></span>;
}

function App() {
  const [view, setView] = useState<View>('focus');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [recentPage, setRecentPage] = useState(1);
  const [chartDate, setChartDate] = useState(() => new Date());
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [draft, setDraft] = useState<Settings>(defaultSettings);
  const [timer, setTimer] = useState<TimerSnapshot>(initialTimer);
  const [selectedPhase, setSelectedPhase] = useState<Phase>('focus');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => localStorage.getItem('pomodoro-vibe:selected-task'));
  const [now, setNow] = useState(Date.now());
  const [newTask, setNewTask] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [testModeBusy, setTestModeBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [amplyStrumCount, setAmplyStrumCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const language = effectiveLanguage(settings.language);
  const t = strings(language);
  const text = (key: TranslationKey) => t[key];
  const draftSizes = timerStyleSizes(draft);
  const stageSizeField = draft.timerStyle === 'travel' ? 'travelSizePercent' : draft.timerStyle === 'amply' ? 'amplySizePercent' : draft.timerStyle === 'drum' ? 'drumSizePercent' : 'classicSizePercent';
  const clockSizeField = draft.timerStyle === 'travel' ? 'travelClockPercent' : draft.timerStyle === 'amply' ? 'amplyClockPercent' : draft.timerStyle === 'drum' ? 'drumClockPercent' : 'classicClockPercent';
  const timerDescriptions: Record<TimerStyle, string> = { travel: t.travelDescription, classic: t.classicDescription, amply: t.amplyDescription, drum: t.drumDescription };
  const activeTasks = tasks.filter((task) => !task.completedAtMs);
  const completedTasks = tasks.filter((task) => task.completedAtMs);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId && !task.completedAtMs) ?? null;
  const displayedTask = timer.status === 'running' || timer.status === 'paused'
    ? tasks.find((task) => task.id === timer.taskId) ?? null : selectedTask;
  const phase = timer.status === 'running' || timer.status === 'paused' ? timer.phase : selectedPhase;
  const totalSeconds = timer.phase === phase ? timer.durationSeconds : durationFor(phase, settings);
  const remainingSeconds = timer.phase === phase ? remainingFor(timer, now) : totalSeconds;
  const [remainingMinutes, remainingSecondsText] = formatTime(remainingSeconds).split(':');
  const progress = totalSeconds > 0 ? 1 - remainingSeconds / totalSeconds : 0;
  const chartWeekStart = startOfWeek(chartDate);
  const chartWeekEnd = new Date(chartWeekStart.getFullYear(), chartWeekStart.getMonth(), chartWeekStart.getDate() + 6);
  const currentWeekStart = startOfWeek(new Date(now));
  const isCurrentChartWeek = chartWeekStart.getTime() >= currentWeekStart.getTime();
  const days = useMemo(() => dailyStats(sessions, 7, chartWeekEnd), [sessions, chartWeekEnd.getTime()]);
  const todayKey = dateKey(new Date(now));
  const todayStat = useMemo(() => dailyStats(sessions, 1, new Date(now))[0], [sessions, todayKey]);
  const weekRange = `${new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric' }).format(chartWeekStart)} – ${new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', year: 'numeric' }).format(chartWeekEnd)}`;
  const selectedWeekLabel = isCurrentChartWeek ? t.thisWeek : weekRange;
  const weekMinutes = days.reduce((sum, day) => sum + day.minutes, 0);
  const weekSessions = days.reduce((sum, day) => sum + day.count, 0);
  const recentCutoff = Math.floor(now / 60_000) * 60_000 - 30 * 24 * 60 * 60 * 1000;
  const recentSessions = useMemo(() => sessions
    .filter((session) => session.kind === 'focus' && session.endedAtMs >= recentCutoff)
    .sort((a, b) => b.endedAtMs - a.endedAtMs), [sessions, recentCutoff]);
  const recentPageCount = Math.ceil(recentSessions.length / recentPageSize);
  const currentRecentPage = Math.min(recentPage, Math.max(1, recentPageCount));
  const visibleRecentSessions = recentSessions.slice((currentRecentPage - 1) * recentPageSize, currentRecentPage * recentPageSize);
  const upcomingPhase: Phase = timer.status === 'finished' ? phase
    : phase === 'focus' ? ((timer.focusCycle + 1) % settings.longBreakEvery === 0 ? 'longBreak' : 'shortBreak') : 'focus';
  const shortcutPrefix = /Mac/i.test(navigator.userAgent) ? '⌘' : 'Ctrl+';
  const darkThemeActive = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    let alive = true;
    void api.bootstrap().then((data) => {
      if (!alive) return;
      setTasks(data.tasks); setSessions(data.sessions); setSettings(data.settings);
      setDraft(data.settings); setTimer(data.timer); setSelectedPhase(data.timer.phase);
      setLoading(false);
    }).catch(() => { if (alive) { setToast(strings(effectiveLanguage('')).error); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let alive = true;
    void api.subscribe((snapshot) => {
      if (!alive) return;
      setTimer(snapshot);
      if (snapshot.status === 'finished' || snapshot.status === 'idle') setSelectedPhase(snapshot.phase);
    }, () => {
      if (!alive) return;
      if (settingsRef.current.soundEnabled && (!api.isNative || !/Win/i.test(navigator.userAgent))) playCompletionSound();
      void api.bootstrap().then((data) => {
        if (alive) { setSessions(data.sessions); setRecentPage(1); setTimer(data.timer); setSelectedPhase(data.timer.phase); }
      });
    }).then((off) => { if (alive) cleanup = off; else off(); });
    return () => { alive = false; cleanup?.(); };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem('pomodoro-vibe:selected-task', selectedTaskId ?? '');
  }, [selectedTaskId]);

  useEffect(() => {
    if (!loading && selectedTaskId && !tasks.some((task) => task.id === selectedTaskId && !task.completedAtMs)) setSelectedTaskId(null);
  }, [loading, tasks, selectedTaskId]);

  useEffect(() => {
    document.documentElement.lang = language;
    if (!loading) void api.setTrayLanguage(language);
  }, [language, loading]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    let active = true;
    const apply = async () => {
      const nativeWindow = api.isNative ? getCurrentWindow() : null;
      if (nativeWindow) {
        try { await nativeWindow.setTheme(settings.theme === 'system' ? null : settings.theme); }
        catch (error) { console.warn('Could not update window theme:', error); }
      }
      if (!active) return;
      const theme = settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme;
      document.documentElement.dataset.theme = theme;
      if (nativeWindow) {
        const style = getComputedStyle(document.documentElement);
        const color = style.getPropertyValue('--titlebar').trim();
        try {
          await nativeWindow.setBackgroundColor(color);
          if (/Win/i.test(navigator.userAgent)) {
            await api.setTitleBarColor(color, style.getPropertyValue('--text').trim());
          }
        }
        catch (error) { console.warn('Could not update title bar color:', error); }
      }
    };
    const onSystemThemeChange = () => { void apply(); };
    void apply();
    media.addEventListener('change', onSystemThemeChange);
    return () => { active = false; media.removeEventListener('change', onSystemThemeChange); };
  }, [settings.theme]);

  useEffect(() => {
    document.title = timer.status === 'running' ? `${formatTime(remainingSeconds)} · My Neighbor Pomodoro` : 'My Neighbor Pomodoro';
  }, [remainingSeconds, timer.status]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.metaKey || event.ctrlKey) && ['1', '2', '3', '4'].includes(event.key)) {
        event.preventDefault();
        setView((['focus', 'tasks', 'stats', 'settings'] as View[])[Number(event.key) - 1]);
      } else if (event.code === 'Space' && view === 'focus' && !event.repeat && !target?.closest('button, a, [role="button"]')) {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('[data-primary-timer]')?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function runTimerAction(action: () => Promise<TimerSnapshot>) {
    setBusy(true);
    try { setTimer(await action()); }
    catch (error) { setToast(String(error) || t.error); }
    finally { setBusy(false); }
  }

  function primaryTimerAction() {
    if (timer.status === 'running') { void runTimerAction(api.pauseTimer); return; }
    if (timer.status === 'paused') { void runTimerAction(api.resumeTimer); return; }
    unlockAudio();
    void requestMacNotification();
    void runTimerAction(() => api.startTimer(phase, phase === 'focus' ? selectedTaskId : null));
  }

  async function addTask(event: React.FormEvent) {
    event.preventDefault();
    if (!newTask.trim()) return;
    try {
      const task = await api.createTask(newTask);
      setTasks((old) => [task, ...old]); setNewTask('');
      if (!selectedTaskId) setSelectedTaskId(task.id);
    } catch (error) { setToast(String(error) || t.error); }
  }

  async function toggleTask(task: Task) {
    try {
      const updated = await api.updateTask(task.id, task.title, !task.completedAtMs);
      setTasks((old) => old.map((item) => item.id === task.id ? updated : item));
      if (updated.completedAtMs && selectedTaskId === task.id) setSelectedTaskId(null);
    } catch (error) { setToast(String(error) || t.error); }
  }

  async function saveTaskEdit(task: Task) {
    if (!editTitle.trim()) return;
    try {
      const updated = await api.updateTask(task.id, editTitle, !!task.completedAtMs);
      setTasks((old) => old.map((item) => item.id === task.id ? updated : item));
      setEditingId(null);
    } catch (error) { setToast(String(error) || t.error); }
  }

  async function removeTask(task: Task) {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      await api.deleteTask(task.id);
      setTasks((old) => old.filter((item) => item.id !== task.id));
      if (selectedTaskId === task.id) setSelectedTaskId(null);
    } catch (error) { setToast(String(error) || t.error); }
  }

  async function persistSettings(event: React.FormEvent) {
    event.preventDefault();
    try {
      const saved = await api.saveSettings(draft);
      setSettings(saved); setDraft(saved);
      if (timer.status === 'idle' || timer.status === 'finished') {
        setTimer((old) => ({ ...old, durationSeconds: durationFor(old.phase, saved), remainingSeconds: durationFor(old.phase, saved) }));
      }
      setToast(strings(effectiveLanguage(saved.language)).saved);
    } catch (error) { setToast(String(error) || t.error); }
  }

  async function toggleFooterTheme() {
    setThemeBusy(true);
    try {
      const saved = await api.saveSettings({ ...settings, theme: darkThemeActive ? 'light' : 'dark' });
      setSettings(saved);
      setDraft((current) => ({ ...current, theme: saved.theme }));
    } catch (error) { setToast(String(error) || t.error); }
    finally { setThemeBusy(false); }
  }

  async function setTestMode(enabled: boolean) {
    setTestModeBusy(true);
    try {
      const saved = await api.saveSettings({ ...settings, testMode: enabled });
      if (saved.testMode !== enabled) throw new Error(t.testModeRequiresUpdate);
      setSettings(saved);
      setDraft((current) => ({ ...current, testMode: saved.testMode }));
    } catch (error) { setToast(String(error) || t.error); }
    finally { setTestModeBusy(false); }
  }

  function taskRows(list: Task[], compact = false) {
    return list.map((task) => (
      <div className={`task-row${task.completedAtMs ? ' task-done' : ''}${selectedTaskId === task.id ? ' task-selected' : ''}`} key={task.id}>
        <button className="task-check" type="button" onClick={() => void toggleTask(task)} aria-label={`${task.completedAtMs ? t.openTasks : t.doneTasks}: ${task.title}`}>
          {task.completedAtMs ? <Check size={14} weight="bold" /> : null}
        </button>
        {editingId === task.id && !compact ? (
          <form className="task-edit" onSubmit={(event) => { event.preventDefault(); void saveTaskEdit(task); }}>
            <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={160} autoFocus aria-label={t.edit} />
            <button type="submit" className="icon-button" aria-label={t.save}><Check size={17} /></button>
            <button type="button" className="icon-button" onClick={() => setEditingId(null)} aria-label={t.cancel}><X size={17} /></button>
          </form>
        ) : (
          <>
            <button className="task-title" type="button" onClick={() => { if (!task.completedAtMs) setSelectedTaskId(task.id); }} disabled={!!task.completedAtMs}>
              <span>{task.title}</span>
              {!compact && selectedTaskId === task.id && !task.completedAtMs && <span className="selected-label">{t.focus}</span>}
            </button>
            {!compact && <div className="task-actions">
              <button className="icon-button" type="button" onClick={() => { setEditingId(task.id); setEditTitle(task.title); }} aria-label={`${t.edit}: ${task.title}`}><PencilSimple size={17} /></button>
              <button className="icon-button danger" type="button" onClick={() => void removeTask(task)} aria-label={`${t.delete}: ${task.title}`}><Trash size={17} /></button>
            </div>}
          </>
        )}
      </div>
    ));
  }

  const nav: { id: View; icon: typeof Timer; label: string; shortcut: string }[] = [
    { id: 'focus', icon: Timer, label: t.focus, shortcut: '1' },
    { id: 'tasks', icon: CheckSquare, label: t.tasks, shortcut: '2' },
    { id: 'stats', icon: ChartBar, label: t.stats, shortcut: '3' },
    { id: 'settings', icon: GearSix, label: t.settings, shortcut: '4' },
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><IconMark /><div><strong>{t.appName}</strong><span>{t.tagline}</span></div></div>
      <div className="sidebar-label">{t.workspace.toUpperCase()}</div>
      <nav className="nav-list" aria-label={t.navigation}>
        {nav.map(({ id, icon: Icon, label, shortcut }) => <button key={id} className={`nav-item${view === id ? ' active' : ''}`} onClick={() => setView(id)} type="button" aria-label={label} aria-keyshortcuts={`${shortcutPrefix === '⌘' ? 'Meta' : 'Control'}+${shortcut}`}>
          <Icon size={19} weight={view === id ? 'duotone' : 'regular'} /><span>{label}</span><kbd aria-hidden="true">{shortcutPrefix}{shortcut}</kbd>
        </button>)}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-today">
        <div className="sidebar-today-head"><Sun size={16} /><span>{t.today}</span></div>
        <strong>{Math.round(todayStat.minutes)} <small>{t.minutes}</small></strong>
        <span>{todayStat.count} {t.focusSessions.toLowerCase()}</span>
      </div>
    </aside>

    <main className={`main-area${view === 'focus' ? ` focus-view focus-theme-${settings.timerStyle}` : ''}`}>
      <header className="topbar"><div className="breadcrumb"><span>{t.appName}</span><span className="crumb-slash">/</span><strong>{t[view]}</strong></div><div className="topbar-right"><span className="topbar-date">{new Intl.DateTimeFormat(language, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(now))}</span><span className="avatar">PV</span></div></header>
      {loading ? <div className="loading"><IconMark />{t.appName}</div> : <div className="page-content">
        {view === 'focus' && <>
          <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />{t.today.toUpperCase()}</div><h1>{t.focusSpace}</h1><p>{t.focusSubtitle}</p></div><div className="header-cycle"><span>{t.focusSessions}</span><strong>{timer.focusCycle} / {settings.longBreakEvery}</strong></div></div>
          <div className="focus-grid">
            <section className={`timer-card timer-card-${settings.timerStyle}`}>
              <div className="phase-tabs" role="tablist" aria-label={t.timerSettings}>{phaseKeys.map((item) => <button role="tab" aria-selected={phase === item} key={item} type="button" disabled={timer.status === 'running' || timer.status === 'paused'} className={phase === item ? 'selected' : ''} onClick={() => setSelectedPhase(item)}>{item === 'focus' ? t.focus : t[item]}</button>)}</div>
              <div className="timer-stage" style={timerStageStyle(settings)}>
                {settings.timerStyle === 'travel' && <TravelScene />}
                {settings.timerStyle === 'amply' && <AmplyScene />}
                {settings.timerStyle === 'drum' && <DrumScene language={language} />}
                <svg className="timer-ring" viewBox="0 0 320 320" aria-hidden="true"><circle className="ring-track" cx="160" cy="160" r="143" /><circle className="ring-progress" cx="160" cy="160" r="143" strokeDasharray={`${Math.max(0, progress) * 898.5} 898.5`} /></svg>
                {settings.timerStyle === 'amply' && amplyStrumCount > 0 && <span className="amply-speaker-pulse" key={amplyStrumCount} aria-hidden="true" />}
                <div className="timer-center"><span className="timer-phase-icon">{phase === 'focus' ? <Clock size={22} weight="duotone" /> : <Coffee size={22} weight="duotone" />}</span><strong className="timer-digits"><span className="timer-number">{remainingMinutes}</span><span className="timer-separator">:</span><span className="timer-number">{remainingSecondsText}</span></strong><span className="timer-state">{timer.status === 'running' ? t.running : timer.status === 'paused' ? t.paused : timer.status === 'finished' ? t.finished : t.ready}</span></div>
                {settings.timerStyle === 'amply' && <AmplyGuitar label={t.strumGuitar} onStrum={() => { playGuitarSound(); setAmplyStrumCount((count) => count + 1); }} />}
              </div>
              <div className="timer-controls">
                <button data-primary-timer className="primary-button" type="button" disabled={busy} onClick={primaryTimerAction}>{timer.status === 'running' ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}{timer.status === 'running' ? t.pause : timer.status === 'paused' ? t.resume : phase === 'focus' ? t.startFocus : t.startBreak}</button>
                <button className="control-button" type="button" disabled={busy} onClick={() => void runTimerAction(() => api.resetTimer(phase))} title={t.reset} aria-label={t.reset}><ArrowCounterClockwise size={19} /></button>
                <button className="control-button" type="button" disabled={busy} onClick={() => void runTimerAction(() => api.skipTimer(phase))} title={t.skip} aria-label={t.skip}><SkipForward size={19} /></button>
              </div>
              {settings.testMode && <button className="test-next-button" type="button" disabled={busy || (timer.status !== 'running' && timer.status !== 'paused')} onClick={() => void runTimerAction(api.finishTestSession)}><SkipForward size={17} />{t.nextTestSession}</button>}
              <div className="timer-footer"><span className="subtle-icon"><CheckSquare size={16} /></span><span>{phase === 'focus' ? displayedTask?.title ?? t.noTask : t.startNext}</span></div>
            </section>
            <div className="focus-aside">
              <section className="panel plan-panel"><div className="panel-heading"><div><span className="panel-kicker">{t.yourDay.toUpperCase()}</span><h2>{t.todayPlan}</h2></div><button type="button" className="text-button" onClick={() => setView('tasks')}>{t.viewAll} →</button></div>
                <form className="add-task-form" onSubmit={(event) => void addTask(event)}><Plus size={18} /><input value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder={t.taskPlaceholder} maxLength={160} aria-label={t.addTask} /><button className="add-task-button" type="submit" disabled={!newTask.trim()} aria-label={t.addTask}><Check size={16} weight="bold" /></button></form>
                <div className="task-list compact">{activeTasks.length ? taskRows(activeTasks.slice(0, 6), true) : <p className="empty-small">{t.noTasks}</p>}</div>
                <div className="plan-foot"><span>{activeTasks.length} {t.openTasks.toLowerCase()}</span><span>{completedTasks.length} {t.doneTasks.toLowerCase()}</span></div>
              </section>
              <section className="panel next-panel"><div className="next-icon"><Coffee size={21} weight="duotone" /></div><div><span className="panel-kicker">{t.upNext.toUpperCase()}</span><h3>{upcomingPhase === 'focus' ? t.focus : t[upcomingPhase]}</h3><p>{t.startNext}</p></div></section>
            </div>
          </div>
          <p className="below-hint">{t.closeHint}</p>
        </>}

        {view === 'tasks' && <><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />{t.tasks.toUpperCase()}</div><h1>{t.taskList}</h1><p>{t.taskListSubtitle}</p></div><div className="header-cycle"><span>{t.openTasks}</span><strong>{activeTasks.length}</strong></div></div>
          <section className="panel tasks-page-panel"><form className="add-task-form large" onSubmit={(event) => void addTask(event)}><Plus size={20} /><input value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder={t.taskPlaceholder} maxLength={160} aria-label={t.addTask} /><button className="add-task-button" type="submit" disabled={!newTask.trim()}>{t.addTask}</button></form>
            <div className="section-heading"><h2>{t.openTasks}</h2><span>{activeTasks.length}</span></div><div className="task-list">{activeTasks.length ? taskRows(activeTasks) : <p className="empty-large">{t.noTasks}</p>}</div>
            {completedTasks.length > 0 && <><div className="section-heading completed-section"><h2>{t.doneTasks}</h2><span>{completedTasks.length}</span></div><div className="task-list">{taskRows(completedTasks)}</div></>}
          </section></>}

        {view === 'stats' && <><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />{t.weekView.toUpperCase()}</div><h1>{t.stats}</h1><p>{t.insights}</p></div></div>
          <div className="stat-cards"><div className="stat-card"><div className="stat-icon"><Clock size={22} /></div><span>{t.focusTime}</span><strong>{Math.round(weekMinutes)} <small>{t.minutes}</small></strong><p>{selectedWeekLabel}</p></div><div className="stat-card"><div className="stat-icon peach"><CheckSquare size={22} /></div><span>{t.completedSessions}</span><strong>{weekSessions}</strong><p>{selectedWeekLabel}</p></div></div>
          <section className="panel chart-panel">
            <div className="panel-heading chart-panel-heading"><div><span className="panel-kicker">{t.weekView.toUpperCase()}</span><h2>{t.dailyFocus}</h2></div>
              <label className="chart-date-picker"><span>{t.chooseDate}</span><input type="date" value={dateKey(chartDate)} max={todayKey} onChange={(event) => { if (event.target.value) { const [year, month, day] = event.target.value.split('-').map(Number); setChartDate(new Date(year, month - 1, day)); } }} /></label>
            </div>
            <nav className="chart-week-pager" aria-label={t.weekNavigation}>
              <button type="button" onClick={() => setChartDate((date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7))}>{t.previousWeek}</button>
              <strong aria-live="polite">{weekRange}</strong>
              <button type="button" disabled={isCurrentChartWeek} onClick={() => setChartDate((date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7))}>{t.nextWeek}</button>
            </nav>
            {weekSessions ? <div className="chart" role="img" aria-label={t.dailyFocus}>{days.map((day) => <div className="chart-column" key={day.key}><span className="bar-value">{day.minutes ? Math.round(day.minutes) : ''}</span><div className="bar-track"><span className={day.key === todayStat.key ? 'bar today-bar' : 'bar'} style={{ height: `${day.minutes ? Math.max(7, day.minutes / Math.max(120, ...days.map((item) => item.minutes)) * 100) : 0}%` }} /></div><span className="bar-label">{new Intl.DateTimeFormat(language, { weekday: 'short' }).format(day.date)}</span></div>)}</div> : <div className="empty-chart"><ChartBar size={30} weight="light" /><strong>{t.noWeekSessions}</strong><span>{t.chooseAnotherWeek}</span></div>}
          </section>
          {recentSessions.length > 0 && <section className="panel recent-panel"><div className="panel-heading"><div><span className="panel-kicker">{t.last30Days.toUpperCase()}</span><h2>{t.recentSessions}</h2></div></div>
            {visibleRecentSessions.map((session) => <div className="recent-row" key={session.id}><span className="recent-dot" /><span>{tasks.find((task) => task.id === session.taskId)?.title ?? t.focus}</span><strong>{Math.round(session.durationSeconds / 60)} {t.minutes}</strong><time dateTime={new Date(session.endedAtMs).toISOString()}>{new Intl.DateTimeFormat(language, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(session.endedAtMs)}</time></div>)}
            {recentPageCount > 1 && <nav className="recent-pagination" aria-label={t.recentPages}><span>{t.page} {currentRecentPage} / {recentPageCount}</span><div><button type="button" disabled={currentRecentPage === 1} onClick={() => setRecentPage(currentRecentPage - 1)}>{t.previousPage}</button><button type="button" disabled={currentRecentPage === recentPageCount} onClick={() => setRecentPage(currentRecentPage + 1)}>{t.nextPage}</button></div></nav>}
          </section>}
        </>}

        {view === 'settings' && <><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />{t.settings.toUpperCase()}</div><h1>{t.settings}</h1><p>{t.preferences}</p></div></div>
          <form className="settings-form" onSubmit={(event) => void persistSettings(event)}><section className="panel settings-panel"><div className="settings-header"><span className="settings-icon"><Timer size={21} /></span><div><h2>{t.timerSettings}</h2><p>Pomodoro</p></div></div><div className="settings-rows">
            {([['focusMinutes', 'focusDuration', 1, 180], ['shortBreakMinutes', 'shortBreakDuration', 1, 60], ['longBreakMinutes', 'longBreakDuration', 1, 180], ['longBreakEvery', 'longBreakEvery', 2, 12]] as const).map(([key, label, min, max]) => <label className="setting-row" key={key}><span>{text(label)}{key === 'longBreakEvery' && <small>{t.cycles}</small>}</span><span className="number-input"><input type="number" min={min} max={max} value={draft[key]} onChange={(event) => setDraft((old) => ({ ...old, [key]: Number(event.target.value) }))} required />{key !== 'longBreakEvery' && <span>{t.minutes}</span>}</span></label>)}
            <label className="setting-row"><span>{t.testMode}<small>{t.testModeHint}</small></span><input className="toggle" type="checkbox" checked={!!settings.testMode} disabled={testModeBusy} onChange={(event) => void setTestMode(event.target.checked)} /></label>
          </div></section>
          <section className="panel settings-panel timer-style-panel">
            <div className="settings-header"><span className="settings-icon"><AirplaneTilt size={21} /></span><div><h2>{t.timerStyle}</h2><p>{t.timerStyleHint}</p></div></div>
            <div className="timer-style-options" role="radiogroup" aria-label={t.timerStyle}>
              {(['travel', 'classic', 'amply', 'drum'] as TimerStyle[]).map((style) => {
                const sizes = timerStyleSizes(draft, style);
                return <label className={`timer-style-option${draft.timerStyle === style ? ' selected' : ''}`} key={style}>
                <input type="radio" name="timerStyle" value={style} checked={draft.timerStyle === style} onChange={() => setDraft((old) => ({ ...old, timerStyle: style }))} aria-label={t[style]} />
                {style === 'travel' ? <div className="timer-style-preview timer-style-preview-travel" aria-hidden="true"><div className="timer-style-preview-content" style={{ transform: `scale(${sizes.stage / 100})` }}><TravelScene mini /><span className="style-preview-time" style={{ fontSize: `${10 * sizes.clock / 100}px` }}>{formatTime(draft.focusMinutes * 60)}</span></div></div> : style === 'amply' ? <div className="timer-style-preview timer-style-preview-amply" aria-hidden="true"><div className="timer-style-preview-content" style={{ transform: `scale(${sizes.stage / 100})` }}><AmplyScene mini /><span className="amply-preview-time" style={{ transform: "translate(-50%, -50%)", fontSize: `${7 * sizes.clock / 100}px` }}>{formatTime(draft.focusMinutes * 60)}</span><AmplyGuitar /></div></div> : style === 'drum' ? <div className="timer-style-preview timer-style-preview-drum" aria-hidden="true"><div className="timer-style-preview-content" style={{ transform: `scale(${sizes.stage / 100})` }}><DrumScene mini language={language} /><span className="drum-preview-time" style={{ transform: "translate(-50%, -50%)", fontSize: `${7 * sizes.clock / 100}px` }}>{formatTime(draft.focusMinutes * 60)}</span></div></div> : <div className="timer-style-preview timer-style-preview-classic" aria-hidden="true"><span className="classic-mini-ring" style={{ transform: `scale(${sizes.stage / 100})` }}><span className="classic-preview-time" style={{ fontSize: `${20 * sizes.clock / 100}px` }}>{formatTime(draft.focusMinutes * 60)}</span></span></div>}
                <div className="timer-style-caption"><span><strong>{t[style]}</strong><small>{timerDescriptions[style]}</small></span>{draft.timerStyle === style && <Check size={16} weight="bold" aria-hidden="true" />}</div>
              </label>; })}
            </div>
            <div className="timer-size-control">
              <div className="timer-size-summary"><strong>{t[draft.timerStyle]}</strong><small>{t.styleSizeHint}</small></div>
              <div className="timer-size-field"><div className="timer-size-heading"><label htmlFor="timer-size">{t.timerSize}</label><output htmlFor="timer-size">{draftSizes.stage}%</output></div>
                <input id="timer-size" type="range" min="70" max="120" step="5" value={draftSizes.stage} onChange={(event) => setDraft((old) => ({ ...old, [stageSizeField]: Number(event.target.value) }))} />
                <div className="timer-size-scale"><span>70% · {t.smaller}</span><span>120% · {t.larger}</span></div></div>
              <div className="timer-size-field"><div className="timer-size-heading"><label htmlFor="clock-size">{t.clockSize}</label><output htmlFor="clock-size">{draftSizes.clock}%</output></div>
                <input id="clock-size" type="range" min="70" max="120" step="5" value={draftSizes.clock} onChange={(event) => setDraft((old) => ({ ...old, [clockSizeField]: Number(event.target.value) }))} />
                <div className="timer-size-scale"><span>70% · {t.smaller}</span><span>120% · {t.larger}</span></div></div>
            </div>
          </section>
          <section className="panel settings-panel"><div className="settings-header"><span className="settings-icon"><Moon size={21} /></span><div><h2>{t.appearance}</h2><p>{t.localOnly}</p></div></div><div className="settings-rows"><label className="setting-row"><span>{t.language}</span><select value={draft.language} onChange={(event) => setDraft((old) => ({ ...old, language: event.target.value as Settings['language'] }))}><option value="">{t.followSystem}</option><option value="en">{t.english}</option><option value="vi">{t.vietnamese}</option></select></label><label className="setting-row"><span>{t.theme}</span><select value={draft.theme} onChange={(event) => setDraft((old) => ({ ...old, theme: event.target.value as Settings['theme'] }))}><option value="system">{t.followSystem}</option><option value="light">{t.light}</option><option value="dark">{t.dark}</option></select></label><label className="setting-row"><span>{t.sound}</span><input className="toggle" type="checkbox" checked={draft.soundEnabled} onChange={(event) => setDraft((old) => ({ ...old, soundEnabled: event.target.checked }))} /></label></div></section>
          <UpdatePanel language={language} native={api.isNative} timerActive={timer.status === 'running' || timer.status === 'paused'} />
          <button className="primary-button save-preferences" type="submit"><Check size={18} />{t.saveSettings}</button></form>
        </>}
      </div>}
    </main>
    <footer className="status-bar" aria-label={t.statusBar} data-test-mode={settings.testMode ? 'on' : 'off'}>
      <div className="status-bar-primary">
        <button className="status-bar-action status-bar-timer" type="button" onClick={() => setView('focus')} title={`${t[phase]} · ${t[timer.status === 'finished' ? 'finished' : timer.status === 'running' ? 'running' : timer.status === 'paused' ? 'paused' : 'ready']}`}>
          <span className={`status-bar-indicator ${timer.status}`} aria-hidden="true" />
          <span>{t[phase]}</span><strong>{formatTime(remainingSeconds)}</strong>
        </button>
        <span className="status-bar-divider" aria-hidden="true" />
        <span className="status-bar-task" title={displayedTask?.title ?? t.noTask}>{displayedTask?.title ?? t.noTask}</span>
      </div>
      <div className="status-bar-secondary">
        {settings.testMode && <button className="status-bar-test-button" type="button" disabled={busy || (timer.status !== 'running' && timer.status !== 'paused')} onClick={() => { setView('focus'); void runTimerAction(api.finishTestSession); }} title={t.nextTestSession} aria-label={`${t.nextTestSession} · ${t.statusBar}`}><SkipForward size={13} />{t.nextTestSession}</button>}
        <button className="status-bar-action status-bar-count" type="button" onClick={() => setView('tasks')} title={t.tasks}><CheckSquare size={13} /><span>{activeTasks.length} {t.openTasks.toLowerCase()}</span></button>
        <button className="status-bar-action status-bar-count" type="button" onClick={() => setView('stats')} title={t.stats}><Clock size={13} /><span>{todayStat.count} {t.focusSessions.toLowerCase()}</span></button>
        <span className="status-bar-divider" aria-hidden="true" />
        <span className="status-bar-local" title={t.localOnly}><span className="online-dot" aria-hidden="true" />{t.localStatus}</span>
        <button className="status-bar-icon" type="button" onClick={() => void toggleFooterTheme()} disabled={themeBusy} title={darkThemeActive ? t.light : t.dark} aria-label={`${t.theme}: ${darkThemeActive ? t.light : t.dark}`}>{darkThemeActive ? <Sun size={15} /> : <Moon size={15} />}</button>
        <button className="status-bar-icon" type="button" onClick={() => setView('settings')} title={t.settings} aria-label={`${t.settings} · ${t.statusBar}`}><GearSix size={15} /></button>
      </div>
    </footer>
    {toast && <div className="toast" role="status">{toast}<button onClick={() => setToast('')} aria-label={t.cancel}><X size={16} /></button></div>}
  </div>;
}

export default App;

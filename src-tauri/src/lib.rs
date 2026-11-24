use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    focus_minutes: u32,
    short_break_minutes: u32,
    long_break_minutes: u32,
    long_break_every: u32,
    language: String,
    theme: String,
    sound_enabled: bool,
    #[serde(default)]
    test_mode: bool,
    #[serde(default = "default_timer_style")]
    timer_style: String,
    #[serde(default = "default_timer_size_percent")]
    travel_size_percent: u32,
    #[serde(default = "default_timer_size_percent")]
    travel_clock_percent: u32,
    #[serde(default = "default_timer_size_percent")]
    classic_size_percent: u32,
    #[serde(default = "default_timer_size_percent")]
    classic_clock_percent: u32,
    #[serde(default = "default_timer_size_percent")]
    amply_size_percent: u32,
    #[serde(default = "default_timer_size_percent")]
    amply_clock_percent: u32,
    #[serde(default = "default_timer_size_percent")]
    drum_size_percent: u32,
    #[serde(default = "default_timer_size_percent")]
    drum_clock_percent: u32,
    #[serde(default, skip_serializing)]
    timer_size_percent: Option<u32>,
}

fn default_timer_style() -> String {
    "travel".into()
}

fn default_timer_size_percent() -> u32 {
    100
}

fn migrate_settings(mut settings: Settings) -> Settings {
    if settings.timer_style == "aquarium" {
        settings.timer_style = default_timer_style();
    }
    if let Some(size) = settings.timer_size_percent.take() {
        settings.travel_size_percent = size;
        settings.classic_size_percent = size;
    }
    settings
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            focus_minutes: 25,
            short_break_minutes: 5,
            long_break_minutes: 15,
            long_break_every: 4,
            language: String::new(),
            theme: "system".into(),
            sound_enabled: true,
            test_mode: false,
            timer_style: default_timer_style(),
            travel_size_percent: default_timer_size_percent(),
            travel_clock_percent: default_timer_size_percent(),
            classic_size_percent: default_timer_size_percent(),
            classic_clock_percent: default_timer_size_percent(),
            amply_size_percent: default_timer_size_percent(),
            amply_clock_percent: default_timer_size_percent(),
            drum_size_percent: default_timer_size_percent(),
            drum_clock_percent: default_timer_size_percent(),
            timer_size_percent: None,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Task {
    id: String,
    title: String,
    created_at_ms: i64,
    completed_at_ms: Option<i64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    id: String,
    kind: String,
    task_id: Option<String>,
    started_at_ms: i64,
    ended_at_ms: i64,
    duration_seconds: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TimerSnapshot {
    phase: String,
    status: String,
    remaining_seconds: i64,
    duration_seconds: i64,
    deadline_ms: Option<i64>,
    task_id: Option<String>,
    focus_cycle: u32,
}

impl TimerSnapshot {
    fn new(settings: &Settings, focus_cycle: u32) -> Self {
        let duration_seconds = settings.focus_minutes as i64 * 60;
        Self {
            phase: "focus".into(),
            status: "idle".into(),
            remaining_seconds: duration_seconds,
            duration_seconds,
            deadline_ms: None,
            task_id: None,
            focus_cycle,
        }
    }

    fn display(&self) -> Self {
        let mut snapshot = self.clone();
        if snapshot.status == "running" {
            if let Some(deadline) = snapshot.deadline_ms {
                snapshot.remaining_seconds = ((deadline - now_ms() + 999) / 1000).max(0);
            }
        }
        snapshot
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Bootstrap {
    tasks: Vec<Task>,
    sessions: Vec<Session>,
    settings: Settings,
    timer: TimerSnapshot,
}

struct Inner {
    db: Connection,
    settings: Settings,
    effective_language: String,
    timer: TimerSnapshot,
    session_id: Option<String>,
}

struct AppState {
    inner: Mutex<Inner>,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn duration_for(kind: &str, settings: &Settings) -> i64 {
    let minutes = match kind {
        "shortBreak" => settings.short_break_minutes,
        "longBreak" => settings.long_break_minutes,
        _ => settings.focus_minutes,
    };
    minutes as i64 * 60
}

fn valid_kind(kind: &str) -> bool {
    matches!(kind, "focus" | "shortBreak" | "longBreak")
}

#[cfg(windows)]
fn windows_color_ref(color: &str) -> Result<u32, String> {
    let hex = color
        .strip_prefix('#')
        .filter(|value| value.len() == 6)
        .ok_or_else(|| "Invalid title bar color".to_string())?;
    let rgb = u32::from_str_radix(hex, 16).map_err(|_| "Invalid title bar color".to_string())?;
    Ok(((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff))
}

#[tauri::command]
fn set_title_bar_color(
    window: tauri::Window,
    background: String,
    foreground: String,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::ffi::c_void;

        #[link(name = "dwmapi")]
        unsafe extern "system" {
            fn DwmSetWindowAttribute(
                hwnd: *mut c_void,
                attribute: u32,
                value: *const c_void,
                size: u32,
            ) -> i32;
        }

        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
        for (attribute, color) in [(35, background), (36, foreground)] {
            let color_ref = windows_color_ref(&color)?;
            let result = unsafe {
                DwmSetWindowAttribute(
                    hwnd,
                    attribute,
                    &color_ref as *const u32 as *const c_void,
                    std::mem::size_of::<u32>() as u32,
                )
            };
            // Windows 10 does not support custom caption colors; setTheme still follows the UI.
            if result < 0 {
                break;
            }
        }
    }
    #[cfg(not(windows))]
    let _ = (window, background, foreground);
    Ok(())
}

fn lock(state: &AppState) -> Result<std::sync::MutexGuard<'_, Inner>, String> {
    state
        .inner
        .lock()
        .map_err(|_| "Application state is unavailable".into())
}

impl AppState {
    fn new(path: &Path) -> Result<Self, String> {
        let db = Connection::open(path).map_err(|e| e.to_string())?;
        db.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS tasks (
               id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at_ms INTEGER NOT NULL,
               completed_at_ms INTEGER
             );
             CREATE TABLE IF NOT EXISTS sessions (
               id TEXT PRIMARY KEY, kind TEXT NOT NULL, task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
               started_at_ms INTEGER NOT NULL, ended_at_ms INTEGER,
               duration_seconds INTEGER NOT NULL, remaining_seconds INTEGER NOT NULL,
               status TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS sessions_by_end ON sessions(ended_at_ms);
             CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             UPDATE sessions SET status = 'interrupted', ended_at_ms = NULL
               WHERE status IN ('running', 'paused');",
        ).map_err(|e| e.to_string())?;

        let settings = db
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'settings'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .and_then(|value| serde_json::from_str::<Settings>(&value).ok())
            .map(migrate_settings)
            .unwrap_or_default();
        let cycle = db
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'focus_cycle'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or(0);
        Ok(Self {
            inner: Mutex::new(Inner {
                timer: TimerSnapshot::new(&settings, cycle),
                db,
                settings,
                effective_language: "en".into(),
                session_id: None,
            }),
        })
    }
}

fn read_tasks(db: &Connection) -> Result<Vec<Task>, String> {
    let mut stmt = db
        .prepare(
            "SELECT id, title, created_at_ms, completed_at_ms FROM tasks
         ORDER BY completed_at_ms IS NOT NULL, created_at_ms DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at_ms: row.get(2)?,
                completed_at_ms: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

fn read_sessions(db: &Connection) -> Result<Vec<Session>, String> {
    let mut stmt = db
        .prepare(
            "SELECT id, kind, task_id, started_at_ms, ended_at_ms, duration_seconds
         FROM sessions WHERE status IN ('completed', 'test_completed')
         ORDER BY ended_at_ms DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                kind: row.get(1)?,
                task_id: row.get(2)?,
                started_at_ms: row.get(3)?,
                ended_at_ms: row.get(4)?,
                duration_seconds: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

fn ensure_sample_tasks(db: &mut Connection, language: &str) -> Result<(), String> {
    let transaction = db.transaction().map_err(|error| error.to_string())?;
    let seeded: i64 = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM app_meta WHERE key = 'sample_tasks_v1')",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if seeded == 0 {
        let task_count: i64 = transaction
            .query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        if task_count == 0 {
            let titles = if language == "vi" {
                [
                    "Lên kế hoạch 3 việc quan trọng hôm nay",
                    "Tập trung 25 phút cho việc ưu tiên nhất",
                    "Hoàn thành một đầu việc đang trì hoãn",
                    "Tổng kết kết quả cuối ngày",
                ]
            } else {
                [
                    "Plan today's three priorities",
                    "Focus 25 minutes on the top priority",
                    "Make progress on a postponed task",
                    "Review today's progress",
                ]
            };
            let created_at = now_ms();
            for (index, title) in titles.iter().enumerate() {
                transaction
                    .execute(
                        "INSERT INTO tasks(id, title, created_at_ms) VALUES (?1, ?2, ?3)",
                        params![Uuid::new_v4().to_string(), title, created_at - index as i64],
                    )
                    .map_err(|error| error.to_string())?;
            }
        }
        transaction
            .execute(
                "INSERT INTO app_meta(key, value) VALUES ('sample_tasks_v1', '1')",
                [],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}

#[tauri::command]
fn bootstrap(state: State<'_, AppState>, system_language: String) -> Result<Bootstrap, String> {
    let mut inner = lock(&state)?;
    let language = if inner.settings.language.is_empty() {
        system_language.as_str()
    } else {
        inner.settings.language.as_str()
    }
    .to_string();
    ensure_sample_tasks(&mut inner.db, &language)?;
    Ok(Bootstrap {
        tasks: read_tasks(&inner.db)?,
        sessions: read_sessions(&inner.db)?,
        settings: inner.settings.clone(),
        timer: inner.timer.display(),
    })
}

#[tauri::command]
fn create_task(state: State<'_, AppState>, title: String) -> Result<Task, String> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 160 {
        return Err("Task title must be 1–160 characters".into());
    }
    let task = Task {
        id: Uuid::new_v4().to_string(),
        title: title.into(),
        created_at_ms: now_ms(),
        completed_at_ms: None,
    };
    let inner = lock(&state)?;
    inner
        .db
        .execute(
            "INSERT INTO tasks (id, title, created_at_ms) VALUES (?1, ?2, ?3)",
            params![task.id, task.title, task.created_at_ms],
        )
        .map_err(|e| e.to_string())?;
    Ok(task)
}

#[tauri::command]
fn update_task(
    state: State<'_, AppState>,
    id: String,
    title: String,
    completed: bool,
) -> Result<Task, String> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 160 {
        return Err("Task title must be 1–160 characters".into());
    }
    let inner = lock(&state)?;
    let (created_at_ms, previous_completed_at_ms): (i64, Option<i64>) = inner
        .db
        .query_row(
            "SELECT created_at_ms, completed_at_ms FROM tasks WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Task not found".to_string())?;
    let completed_at_ms: Option<i64> = if completed {
        previous_completed_at_ms.or_else(|| Some(now_ms()))
    } else {
        None
    };
    inner
        .db
        .execute(
            "UPDATE tasks SET title = ?2, completed_at_ms = ?3 WHERE id = ?1",
            params![id, title, completed_at_ms],
        )
        .map_err(|e| e.to_string())?;
    Ok(Task {
        id,
        title: title.into(),
        created_at_ms,
        completed_at_ms,
    })
}

#[tauri::command]
fn delete_task(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut inner = lock(&state)?;
    inner
        .db
        .execute("DELETE FROM tasks WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    if inner.timer.task_id.as_deref() == Some(id.as_str()) {
        inner.timer.task_id = None;
    }
    Ok(())
}

#[tauri::command]
fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<Settings, String> {
    if !(1..=180).contains(&settings.focus_minutes)
        || !(1..=60).contains(&settings.short_break_minutes)
        || !(1..=180).contains(&settings.long_break_minutes)
        || !(2..=12).contains(&settings.long_break_every)
        || !matches!(settings.language.as_str(), "" | "en" | "vi")
        || !matches!(settings.theme.as_str(), "system" | "light" | "dark")
        || !matches!(
            settings.timer_style.as_str(),
            "travel" | "classic" | "amply" | "drum"
        )
        || !(70..=120).contains(&settings.travel_size_percent)
        || !(70..=120).contains(&settings.travel_clock_percent)
        || !(70..=120).contains(&settings.classic_size_percent)
        || !(70..=120).contains(&settings.classic_clock_percent)
        || !(70..=120).contains(&settings.amply_size_percent)
        || !(70..=120).contains(&settings.amply_clock_percent)
        || !(70..=120).contains(&settings.drum_size_percent)
        || !(70..=120).contains(&settings.drum_clock_percent)
    {
        return Err("Invalid settings".into());
    }
    let mut inner = lock(&state)?;
    let value = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
    inner
        .db
        .execute(
            "INSERT INTO app_meta(key, value) VALUES('settings', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [&value],
        )
        .map_err(|e| e.to_string())?;
    if inner.timer.status == "idle" || inner.timer.status == "finished" {
        let duration = duration_for(&inner.timer.phase, &settings);
        inner.timer.duration_seconds = duration;
        inner.timer.remaining_seconds = duration;
    }
    inner.settings = settings.clone();
    Ok(settings)
}

fn interrupt(inner: &mut Inner) -> Result<(), String> {
    if let Some(id) = inner.session_id.clone() {
        inner
            .db
            .execute(
                "UPDATE sessions SET status = 'interrupted', ended_at_ms = NULL WHERE id = ?1",
                [id],
            )
            .map_err(|e| e.to_string())?;
        inner.session_id = None;
    }
    Ok(())
}

fn set_tray(app: &AppHandle, finished: bool) {
    if let Some(tray) = app.tray_by_id("main") {
        let bytes: &[u8] = if finished {
            include_bytes!("../icons/tray-done.png")
        } else {
            include_bytes!("../icons/tray-idle.png")
        };
        if let Ok(icon) = Image::from_bytes(bytes) {
            let _ = tray.set_icon(Some(icon));
        }
        let _ = tray.set_tooltip(Some(if finished {
            "Pomodoro Vibe — session finished"
        } else {
            "Pomodoro Vibe"
        }));
    }
}

fn emit_timer(app: &AppHandle, timer: &TimerSnapshot) {
    let _ = app.emit("timer-state", timer.display());
}

#[tauri::command]
fn start_timer(
    app: AppHandle,
    state: State<'_, AppState>,
    kind: String,
    task_id: Option<String>,
) -> Result<TimerSnapshot, String> {
    if !valid_kind(&kind) {
        return Err("Invalid timer phase".into());
    }
    let mut inner = lock(&state)?;
    if inner.timer.status == "running" || inner.timer.status == "paused" {
        return Err("A session is already active".into());
    }
    if let Some(ref id) = task_id {
        let exists: bool = inner
            .db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM tasks WHERE id = ?1 AND completed_at_ms IS NULL)",
                [id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !exists {
            return Err("Task is unavailable".into());
        }
    }
    let task_id = if kind == "focus" { task_id } else { None };
    let duration = duration_for(&kind, &inner.settings);
    let id = Uuid::new_v4().to_string();
    let started = now_ms();
    inner.db.execute(
        "INSERT INTO sessions(id, kind, task_id, started_at_ms, duration_seconds, remaining_seconds, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, 'running')",
        params![id, kind, task_id, started, duration],
    ).map_err(|e| e.to_string())?;
    inner.session_id = Some(id);
    inner.timer.phase = kind;
    inner.timer.status = "running".into();
    inner.timer.duration_seconds = duration;
    inner.timer.remaining_seconds = duration;
    inner.timer.deadline_ms = Some(started + duration * 1000);
    inner.timer.task_id = task_id;
    let snapshot = inner.timer.clone();
    drop(inner);
    set_tray(&app, false);
    emit_timer(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
fn pause_timer(app: AppHandle, state: State<'_, AppState>) -> Result<TimerSnapshot, String> {
    let mut inner = lock(&state)?;
    if inner.timer.status != "running" {
        return Err("Timer is not running".into());
    }
    let remaining = inner.timer.display().remaining_seconds;
    if remaining <= 0 {
        drop(inner);
        check_timer(&app);
        return Ok(lock(&state)?.timer.display());
    }
    if let Some(ref id) = inner.session_id {
        inner
            .db
            .execute(
                "UPDATE sessions SET status = 'paused', remaining_seconds = ?2 WHERE id = ?1",
                params![id, remaining],
            )
            .map_err(|e| e.to_string())?;
    }
    inner.timer.status = "paused".into();
    inner.timer.remaining_seconds = remaining;
    inner.timer.deadline_ms = None;
    let snapshot = inner.timer.clone();
    drop(inner);
    emit_timer(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
fn resume_timer(app: AppHandle, state: State<'_, AppState>) -> Result<TimerSnapshot, String> {
    let mut inner = lock(&state)?;
    if inner.timer.status != "paused" {
        return Err("Timer is not paused".into());
    }
    if let Some(ref id) = inner.session_id {
        inner
            .db
            .execute("UPDATE sessions SET status = 'running' WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
    }
    inner.timer.status = "running".into();
    inner.timer.deadline_ms = Some(now_ms() + inner.timer.remaining_seconds * 1000);
    let snapshot = inner.timer.clone();
    drop(inner);
    emit_timer(&app, &snapshot);
    Ok(snapshot)
}

fn next_phase(kind: &str, cycle: u32) -> &'static str {
    if kind == "focus" {
        if cycle == 0 {
            "longBreak"
        } else {
            "shortBreak"
        }
    } else {
        "focus"
    }
}

#[tauri::command]
fn skip_timer(
    app: AppHandle,
    state: State<'_, AppState>,
    kind: String,
) -> Result<TimerSnapshot, String> {
    if !valid_kind(&kind) {
        return Err("Invalid timer phase".into());
    }
    let mut inner = lock(&state)?;
    let old_phase = if inner.timer.status == "running" || inner.timer.status == "paused" {
        inner.timer.phase.clone()
    } else {
        kind
    };
    interrupt(&mut inner)?;
    let next = if old_phase == "focus" {
        "shortBreak"
    } else {
        "focus"
    };
    let duration = duration_for(next, &inner.settings);
    inner.timer.phase = next.into();
    inner.timer.status = "idle".into();
    inner.timer.duration_seconds = duration;
    inner.timer.remaining_seconds = duration;
    inner.timer.deadline_ms = None;
    inner.timer.task_id = None;
    let snapshot = inner.timer.clone();
    drop(inner);
    set_tray(&app, false);
    emit_timer(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
fn reset_timer(
    app: AppHandle,
    state: State<'_, AppState>,
    kind: String,
) -> Result<TimerSnapshot, String> {
    if !valid_kind(&kind) {
        return Err("Invalid timer phase".into());
    }
    let mut inner = lock(&state)?;
    interrupt(&mut inner)?;
    inner.timer.phase = kind;
    let duration = duration_for(&inner.timer.phase, &inner.settings);
    inner.timer.status = "idle".into();
    inner.timer.duration_seconds = duration;
    inner.timer.remaining_seconds = duration;
    inner.timer.deadline_ms = None;
    inner.timer.task_id = None;
    let snapshot = inner.timer.clone();
    drop(inner);
    set_tray(&app, false);
    emit_timer(&app, &snapshot);
    Ok(snapshot)
}

fn complete_session(inner: &mut Inner, simulated: bool) -> Result<(TimerSnapshot, String), String> {
    if simulated {
        if !inner.settings.test_mode {
            return Err("Test mode is disabled".into());
        }
        if inner.timer.status != "running" && inner.timer.status != "paused" {
            return Err("No active session to finish".into());
        }
    } else if inner.timer.status != "running"
        || inner.timer.deadline_ms.unwrap_or(i64::MAX) > now_ms()
    {
        return Err("Timer has not finished".into());
    }
    let id = inner
        .session_id
        .clone()
        .ok_or_else(|| "No active session to finish".to_string())?;
    let phase = inner.timer.phase.clone();
    let next_cycle = if phase == "focus" {
        (inner.timer.focus_cycle + 1) % inner.settings.long_break_every
    } else {
        inner.timer.focus_cycle
    };
    let session_status = if simulated {
        "test_completed"
    } else {
        "completed"
    };
    (|| -> rusqlite::Result<()> {
        let transaction = inner.db.transaction()?;
        transaction.execute(
            "UPDATE sessions SET status = ?2, ended_at_ms = ?3, remaining_seconds = 0 WHERE id = ?1",
            params![id, session_status, now_ms()],
        )?;
        if phase == "focus" {
            transaction.execute(
                "INSERT INTO app_meta(key, value) VALUES('focus_cycle', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [next_cycle.to_string()],
            )?;
        }
        transaction.commit()
    })()
    .map_err(|error| error.to_string())?;
    inner.session_id = None;
    inner.timer.focus_cycle = next_cycle;
    let next = next_phase(&phase, inner.timer.focus_cycle);
    let duration = duration_for(next, &inner.settings);
    inner.timer.phase = next.into();
    inner.timer.status = "finished".into();
    inner.timer.duration_seconds = duration;
    inner.timer.remaining_seconds = duration;
    inner.timer.deadline_ms = None;
    inner.timer.task_id = None;
    let snapshot = inner.timer.clone();
    Ok((snapshot, phase))
}

fn finish_active_session(app: &AppHandle, simulated: bool) -> Result<TimerSnapshot, String> {
    let state = app.state::<AppState>();
    let mut inner = lock(&state)?;
    let (snapshot, phase) = complete_session(&mut inner, simulated)?;
    #[cfg(target_os = "macos")]
    let effective_language = inner.effective_language.clone();
    #[cfg(target_os = "windows")]
    let sound_enabled = inner.settings.sound_enabled;
    drop(inner);
    set_tray(app, true);
    emit_timer(app, &snapshot);
    let _ = app.emit("session-completed", phase);
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_notification::NotificationExt;
        let (title, body) = if effective_language == "vi" {
            (
                "Phiên đã hoàn thành",
                "Bắt đầu phiên tiếp theo khi bạn sẵn sàng.",
            )
        } else {
            (
                "Session complete",
                "Start the next session when you are ready.",
            )
        };
        let _ = app.notification().builder().title(title).body(body).show();
    }
    #[cfg(target_os = "windows")]
    if sound_enabled {
        unsafe {
            message_beep(0xFFFF_FFFF);
        }
    }
    Ok(snapshot)
}

fn check_timer(app: &AppHandle) {
    let _ = finish_active_session(app, false);
}

#[tauri::command]
fn finish_test_session(app: AppHandle) -> Result<TimerSnapshot, String> {
    finish_active_session(&app, true)
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    #[link_name = "MessageBeep"]
    fn message_beep(sound_type: u32) -> i32;
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn set_tray_language(app: AppHandle, language: String) -> Result<(), String> {
    if !matches!(language.as_str(), "en" | "vi") {
        return Err("Invalid language".into());
    }
    let Some(tray) = app.tray_by_id("main") else {
        return Ok(());
    };
    let (show_text, quit_text) = if language == "vi" {
        ("Mở Pomodoro Vibe", "Thoát")
    } else {
        ("Show Pomodoro Vibe", "Quit")
    };
    let show = MenuItem::with_id(&app, "show", show_text, true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(&app, "quit", quit_text, true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let menu = Menu::with_items(&app, &[&show, &quit]).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    let state = app.state::<AppState>();
    lock(&state)?.effective_language = language;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let state =
                AppState::new(&dir.join("pomodoro-vibe.sqlite")).map_err(std::io::Error::other)?;
            app.manage(state);

            let show = MenuItem::with_id(app, "show", "Show Pomodoro Vibe", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let icon = Image::from_bytes(include_bytes!("../icons/tray-idle.png"))?;
            TrayIconBuilder::with_id("main")
                .icon(icon)
                .tooltip("Pomodoro Vibe")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_window(tray.app_handle());
                    }
                })
                .build(app)?;

            let handle = app.handle().clone();
            thread::spawn(move || loop {
                thread::sleep(Duration::from_millis(300));
                check_timer(&handle);
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            create_task,
            update_task,
            delete_task,
            save_settings,
            start_timer,
            pause_timer,
            resume_timer,
            skip_timer,
            reset_timer,
            finish_test_session,
            set_tray_language,
            set_title_bar_color,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Pomodoro Vibe");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_settings_receive_new_defaults() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        value.as_object_mut().unwrap().remove("testMode");
        value.as_object_mut().unwrap().remove("timerStyle");
        value.as_object_mut().unwrap().remove("travelSizePercent");
        value.as_object_mut().unwrap().remove("travelClockPercent");
        value.as_object_mut().unwrap().remove("classicSizePercent");
        value.as_object_mut().unwrap().remove("classicClockPercent");
        value.as_object_mut().unwrap().remove("amplySizePercent");
        value.as_object_mut().unwrap().remove("amplyClockPercent");
        value.as_object_mut().unwrap().remove("drumSizePercent");
        value.as_object_mut().unwrap().remove("drumClockPercent");
        let settings: Settings = serde_json::from_value(value).unwrap();
        assert!(!settings.test_mode);
        assert_eq!(settings.timer_style, "travel");
        assert_eq!(settings.travel_size_percent, 100);
        assert_eq!(settings.travel_clock_percent, 100);
        assert_eq!(settings.classic_size_percent, 100);
        assert_eq!(settings.classic_clock_percent, 100);
        assert_eq!(settings.amply_size_percent, 100);
        assert_eq!(settings.amply_clock_percent, 100);
        assert_eq!(settings.drum_size_percent, 100);
        assert_eq!(settings.drum_clock_percent, 100);
    }

    #[test]
    fn old_timer_size_is_copied_to_both_styles() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        let object = value.as_object_mut().unwrap();
        object.remove("travelSizePercent");
        object.remove("classicSizePercent");
        object.insert("timerSizePercent".into(), serde_json::json!(80));
        let settings: Settings = serde_json::from_value(value).unwrap();
        let settings = migrate_settings(settings);
        assert_eq!(settings.travel_size_percent, 80);
        assert_eq!(settings.classic_size_percent, 80);
        assert_eq!(settings.travel_clock_percent, 100);
        assert_eq!(settings.classic_clock_percent, 100);
        assert!(settings.timer_size_percent.is_none());
    }

    #[test]
    fn old_aquarium_preference_becomes_travel() {
        let mut settings = Settings::default();
        settings.timer_style = "aquarium".into();
        assert_eq!(migrate_settings(settings).timer_style, "travel");
    }

    #[test]
    fn test_mode_finishes_paused_session_and_counts_in_statistics() {
        let path =
            std::env::temp_dir().join(format!("pomodoro-vibe-test-mode-{}.sqlite", Uuid::new_v4()));
        let state = AppState::new(&path).unwrap();
        let mut inner = lock(&state).unwrap();
        let id = Uuid::new_v4().to_string();
        inner.db.execute(
            "INSERT INTO sessions(id, kind, started_at_ms, duration_seconds, remaining_seconds, status)
             VALUES (?1, 'focus', ?2, 1500, 900, 'paused')",
            params![id, now_ms() - 1000],
        ).unwrap();
        inner.session_id = Some(id.clone());
        inner.timer.status = "paused".into();
        inner.timer.remaining_seconds = 900;
        inner.timer.deadline_ms = None;

        assert!(complete_session(&mut inner, true).is_err());
        inner.settings.test_mode = true;
        let (snapshot, completed_phase) = complete_session(&mut inner, true).unwrap();
        assert_eq!(completed_phase, "focus");
        assert_eq!(snapshot.status, "finished");
        assert_eq!(snapshot.phase, "shortBreak");
        assert_eq!(snapshot.focus_cycle, 1);
        let sessions = read_sessions(&inner.db).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].kind, "focus");
        assert_eq!(sessions[0].duration_seconds, 1500);
        let status: String = inner
            .db
            .query_row("SELECT status FROM sessions WHERE id = ?1", [&id], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(status, "test_completed");

        drop(inner);
        drop(state);
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(format!("{}-wal", path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", path.display()));
    }

    #[test]
    fn natural_completion_still_counts_focus_session() {
        let path =
            std::env::temp_dir().join(format!("pomodoro-vibe-natural-{}.sqlite", Uuid::new_v4()));
        let state = AppState::new(&path).unwrap();
        let mut inner = lock(&state).unwrap();
        let id = Uuid::new_v4().to_string();
        inner.db.execute(
            "INSERT INTO sessions(id, kind, started_at_ms, duration_seconds, remaining_seconds, status)
             VALUES (?1, 'focus', ?2, 1500, 1500, 'running')",
            params![id, now_ms() - 1000],
        ).unwrap();
        inner.session_id = Some(id);
        inner.timer.status = "running".into();
        inner.timer.deadline_ms = Some(now_ms() + 60_000);
        assert!(complete_session(&mut inner, false).is_err());

        inner.timer.deadline_ms = Some(now_ms() - 1);
        let (snapshot, completed_phase) = complete_session(&mut inner, false).unwrap();
        assert_eq!(completed_phase, "focus");
        assert_eq!(snapshot.phase, "shortBreak");
        assert_eq!(read_sessions(&inner.db).unwrap().len(), 1);

        drop(inner);
        drop(state);
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(format!("{}-wal", path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", path.display()));
    }

    #[test]
    fn read_sessions_includes_history_older_than_thirty_days() {
        let path =
            std::env::temp_dir().join(format!("pomodoro-vibe-history-{}.sqlite", Uuid::new_v4()));
        let state = AppState::new(&path).unwrap();
        let inner = lock(&state).unwrap();
        let ended_at_ms = now_ms() - 45 * 24 * 60 * 60 * 1000;
        inner.db.execute(
            "INSERT INTO sessions(id, kind, started_at_ms, ended_at_ms, duration_seconds, remaining_seconds, status)
             VALUES ('historical-focus', 'focus', ?1, ?2, 1500, 0, 'completed')",
            params![ended_at_ms - 1500_000, ended_at_ms],
        ).unwrap();
        let sessions = read_sessions(&inner.db).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, "historical-focus");

        drop(inner);
        drop(state);
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(format!("{}-wal", path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", path.display()));
    }

    #[test]
    fn sample_tasks_are_added_only_once() {
        let path =
            std::env::temp_dir().join(format!("pomodoro-vibe-samples-{}.sqlite", Uuid::new_v4()));
        let state = AppState::new(&path).unwrap();
        let mut inner = lock(&state).unwrap();

        ensure_sample_tasks(&mut inner.db, "vi").unwrap();
        let tasks = read_tasks(&inner.db).unwrap();
        assert_eq!(tasks.len(), 4);
        assert_eq!(tasks[0].title, "Lên kế hoạch 3 việc quan trọng hôm nay");

        ensure_sample_tasks(&mut inner.db, "vi").unwrap();
        assert_eq!(read_tasks(&inner.db).unwrap().len(), 4);
        inner.db.execute("DELETE FROM tasks", []).unwrap();
        ensure_sample_tasks(&mut inner.db, "vi").unwrap();
        assert!(read_tasks(&inner.db).unwrap().is_empty());

        drop(inner);
        drop(state);
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(format!("{}-wal", path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", path.display()));
    }

    #[test]
    fn an_unfinished_session_is_not_counted_after_restart() {
        let path =
            std::env::temp_dir().join(format!("pomodoro-vibe-test-{}.sqlite", Uuid::new_v4()));
        {
            let state = AppState::new(&path).unwrap();
            let inner = lock(&state).unwrap();
            inner.db.execute(
                "INSERT INTO sessions(id, kind, started_at_ms, duration_seconds, remaining_seconds, status)
                 VALUES ('unfinished', 'focus', 1000, 1500, 800, 'running')",
                [],
            ).unwrap();
        }
        let state = AppState::new(&path).unwrap();
        let inner = lock(&state).unwrap();
        let status: String = inner
            .db
            .query_row(
                "SELECT status FROM sessions WHERE id = 'unfinished'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "interrupted");
        assert!(read_sessions(&inner.db).unwrap().is_empty());
        drop(inner);
        drop(state);
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(format!("{}-wal", path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", path.display()));
    }
}

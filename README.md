# Pomodoro Vibe

A local-first Pomodoro desktop app for macOS and Windows. Built with Tauri 2, React and TypeScript. The interface supports English and Vietnamese.

## Requirements

- Node.js 20 or newer and npm
- Rust stable and Cargo
- Tauri's [macOS or Windows prerequisites](https://v2.tauri.app/start/prerequisites/)

## Run

```sh
npm ci
npm run tauri -- dev
```

`npm run dev` opens a browser preview with localStorage-backed sample behavior. The desktop app stores tasks, settings and completed sessions in SQLite inside the operating system's application data directory. Closing the desktop window hides it in the tray; use the tray menu's **Quit** command to exit.

An empty task list receives four editable sample tasks once, in the app's active language. Deleting them does not create them again.

## Check and build

```sh
npm test
npm run build
npm run tauri -- build --no-bundle
```

The app defaults to 25-minute focus, 5-minute short break and 15-minute long break after four completed focus sessions. After each session, the next phase waits for a manual start. macOS can show a native notification once permission is granted. When running Windows from source, completion is indicated by sound and a changed tray icon; opening the window shows the completed state.

Settings includes a Test mode that saves as soon as its switch is changed. When enabled, a **Next session** button appears on the Focus screen and footer bar. It finishes an active or paused session immediately and follows the normal phase sequence. Simulated focus sessions count in statistics for the full configured duration, including sessions completed with Test mode before this update.

The Focus timer uses the animated Travel style by default, adapted from `travel.html` and `travel.scss`. Settings → Timer style also offers Classic, Amply, and Drum. Amply adapts the supplied `amply.html` illustration: click or tap the guitar to pluck its strings and play a synthesized riff. Drum adapts `drum.html` and `drum.js`, with the countdown in the kick drum. Click or tap any drum or cymbal, or use **F** (crash), **T/Y** (toms), **G** (floor tom), **B** (kick), **H** (snare), and **J** (hi-hat). Every eighth hi-hat hit uses the open sound. Drum samples are bundled for offline playback. Both interactive styles support light and dark palettes. Each style stores its own overall size and clock digits size (70%–120%). Existing Aquarium preferences migrate to Travel; an older shared size is copied to Travel and Classic, and unset sizes default to 100%. Animations stop when the operating system requests reduced motion. The supplied Travel artwork credits Jose Aguinaga; the Amply and Drum artwork credits Josh Ellis in their source files.

The Statistics chart shows the selected Monday–Sunday week, with previous/next week controls and a date picker for historical weeks. Its summary cards follow the selected week. The recent sessions list covers the last 30 days, five per page. For the rules behind Statistics and a one-minute verification walkthrough, see the [Vietnamese Statistics guide](docs/statistics.vi.md).

Keyboard shortcuts: **Space** starts or pauses on the Focus screen; **Cmd/Ctrl+1–4** switches screens outside text fields.

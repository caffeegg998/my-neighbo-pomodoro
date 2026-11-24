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

## Installers

On an Apple Silicon Mac, `npm run package:mac` builds an ad-hoc-signed app and a `.pkg` installer in `src-tauri/target/release/bundle/pkg/`. On Windows, `npm run package:windows` builds a setup `.exe` and an `.msi` in `src-tauri/target/release/bundle/nsis/` and `src-tauri/target/release/bundle/msi/`.

The **Build desktop installers** GitHub Actions workflow runs on pushes to `main` and can also be started manually. It builds a macOS Arm DMG and Windows x64 `.exe`/`.msi` installers. Download them from the workflow run's **Artifacts** section. The Windows installers have no publisher signature; the macOS app uses an ad-hoc signature and is not notarized. The local `.pkg` is unsigned.

To publish a test prerelease with all three installers, push a release-candidate tag such as `v0.1.0-rc.1`. The same workflow builds both platforms, checks that the `.exe`, `.msi`, and `.dmg` exist, then publishes them as GitHub Release assets.

Desktop icons use `src-tauri/icons/icon.svg` for Windows and PNG sizes; the smaller macOS Dock icon comes from `src-tauri/icons/icon-dock.svg` and is bundled as `icon-dock.icns`.

The app defaults to 25-minute focus, 5-minute short break and 15-minute long break after four completed focus sessions. After each session, the next phase waits for a manual start. macOS can show a native notification once permission is granted. When running Windows from source, completion is indicated by sound and a changed tray icon; opening the window shows the completed state.

Settings includes a Test mode that saves as soon as its switch is changed. When enabled, a **Next session** button appears on the Focus screen and footer bar. It finishes an active or paused session immediately and follows the normal phase sequence. Simulated focus sessions count in statistics for the full configured duration, including sessions completed with Test mode before this update.

The Focus timer uses the animated Travel style by default, adapted from `travel.html` and `travel.scss`. Settings → Timer style also offers Classic, Amply, and Drum. Amply adapts the supplied `amply.html` illustration: click or tap the guitar to pluck its strings and play a synthesized riff. Drum adapts `drum.html` and `drum.js`, with the countdown in the kick drum. Click or tap any drum or cymbal, or use **F** (crash), **T/Y** (toms), **G** (floor tom), **B** (kick), **H** (snare), and **J** (hi-hat). Every eighth hi-hat hit uses the open sound. Drum samples are bundled for offline playback. Both interactive styles support light and dark palettes. Each style stores its own overall size and clock digits size (70%–120%). Existing Aquarium preferences migrate to Travel; an older shared size is copied to Travel and Classic, and unset sizes default to 100%. Animations stop when the operating system requests reduced motion. The supplied Travel artwork credits Jose Aguinaga; the Amply and Drum artwork credits Josh Ellis in their source files.

The selected timer style colors the entire Focus view, including its header and task panels. Other views keep the application's regular background.

The Statistics chart shows the selected Monday–Sunday week, with previous/next week controls and a date picker for historical weeks. Its summary cards follow the selected week. The recent sessions list covers the last 30 days, five per page. For the rules behind Statistics and a one-minute verification walkthrough, see the [Vietnamese Statistics guide](docs/statistics.vi.md).

Keyboard shortcuts: **Space** starts or pauses on the Focus screen; **Cmd/Ctrl+1–4** switches screens outside text fields.

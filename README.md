# Prompt Playground

Prompt Playground is a local-first, single-user AI chat application for
transparent prompt experimentation. Messages visible on the active branch are
the messages sent to the model: the product must not inject hidden system
prompts or templates.

The complete product contract is in [doc/spec](doc/spec/README.md). The current
revision provides the Vue 3 and Tauri 2 application foundation. Session trees,
SQLite schema, model transport and the finished chat workflows are intentionally
left for subsequent iterations.

## Technology

- Vue 3, TypeScript, Vite, Pinia and Vue Router
- Element Plus for foundational controls
- Tauri 2 and Rust for desktop/mobile commands
- SQLite through `tauri-plugin-sql`
- Vitest, Rust unit tests and Playwright

## Prerequisites

### All development

- Node.js 22+ and npm
- Rust stable with the MSVC toolchain

### Windows desktop

- Visual Studio 2022 C++ Build Tools
- Microsoft Edge WebView2 Runtime

### Android

- JDK 17 with `JAVA_HOME` configured
- Android SDK and Command-line Tools with `ANDROID_HOME` configured
- Android SDK Platform and Build Tools
- Android NDK `30.0.15729638`
- A connected device or configured emulator for `android:dev`

The repository's `rust-toolchain.toml` declares the Android targets. Install
them on a fresh machine with:

```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

## First Run

```powershell
npm install
npx playwright install chromium
npm run dev
```

The browser development server normally listens on
`http://127.0.0.1:1420`. If that port is occupied, pass another port, for
example `npm run dev -- --port 1421`.

To run the desktop shell instead of the browser frontend:

```powershell
npm run tauri:dev
```

The Tauri command is a local development dependency; no global Tauri CLI is
required.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the browser frontend. |
| `npm run build` | Type-check and build the frontend to `frontend/dist`. |
| `npm run lint` | Check TypeScript, Vue and configuration files. |
| `npm run test` | Run Vitest unit tests. |
| `npm run test:e2e` | Run Playwright browser tests. |
| `npm run tauri:dev` | Run the Windows desktop app in development mode. |
| `npm run tauri:build` | Build Windows bundles. |
| `npm run android:init` | Generate the ignored Android project under `src-tauri/gen/android`. |
| `npm run android:dev` | Build and deploy to an Android device or emulator. |
| `npm run android:build` | Build an Android application package. |

For a fast Windows Tauri compilation check without installers:

```powershell
npm run tauri -- build --debug --no-bundle
```

Run Rust tests directly with:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

## Verification

Before submitting changes, run:

```powershell
npm run lint
npm run build
npm run test
npm run test:e2e
cargo test --manifest-path src-tauri/Cargo.toml
```

Android environment checks:

```powershell
sdkmanager --list_installed
adb devices -l
rustup target list --installed
```

## Project Layout

```text
doc/spec/          Product contracts and TDD specifications
frontend/src/      Vue views, components, domain code, stores and repositories
src-tauri/src/     Tauri commands, migrations, repositories, networking and secrets
src-tauri/gen/     Generated platform projects (ignored by Git)
e2e/               Playwright end-to-end tests
```

Components and Pinia stores must not issue SQL. Persistence flows through the
session, message and settings repository boundaries. API keys remain behind the
Rust `SecretStore` abstraction and must never be logged or rendered.

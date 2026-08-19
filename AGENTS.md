# Repository Guidelines

## Project Structure & Module Organization

This repository currently contains product and implementation specifications under `doc/`:

- `doc/spec/` contains the feature contracts for sessions, chat UI, messages, branches, generation, and architecture.
- `doc/spec/tests/` contains data-structure test specifications and shared fixtures/invariants.
- `doc/idea.md` contains early product notes.

The application source tree has not been scaffolded yet. When implementation begins, keep Vue/TypeScript UI and Pinia state in the frontend, Rust/Tauri commands and migrations in the backend, and route persistence through the three repository abstractions; do not scatter SQL through components.

## Build, Test, and Development Commands

No package manifest, build script, or test runner is present yet, so no project commands are currently runnable. Treat the Markdown specifications as the source of truth during scaffolding. Document commands here when added, including entries such as `npm run dev`, `npm run build`, `npm run test`, and `npm run test:e2e`.

## Coding Style & Naming Conventions

Use the planned stack: Vue 3, TypeScript, Vite, Pinia, and Tauri 2 with Rust commands. Follow the formatter and linter configuration introduced with the app scaffold; use two-space indentation for TypeScript/Vue and standard `rustfmt` formatting for Rust. Name Vue components in PascalCase, composables with `use...`, stores by domain, Rust functions/modules in `snake_case`, and repositories/services in PascalCase. Keep persisted message text unchanged between Raw and Markdown display modes.

## Testing Guidelines

Use Vitest for domain logic, Pinia, repository mappings, and settings persistence; Rust unit tests for SSE parsing, cancellation, timeouts, and error mapping; and Playwright for end-to-end workflows and responsive layouts. Follow the specs' Given/When/Then style and names such as `[branch] delete [preserves tree invariants]`. Use static IDs and fixed `createdOrder`; avoid random or time-dependent fixtures. Assert complete state for accepted and rejected operations, including that rejected operations do not mutate inputs.

## Commit & Pull Request Guidelines

There is no commit history yet, so no existing convention can be inferred. Use short, imperative subjects (for example, `Add message tree domain model`). Pull requests should explain the behavior changed, link the relevant specification or issue, describe tests run, and include screenshots for UI changes. Keep specifications synchronized with implementation and call out migration or platform impacts.

## Security & Configuration

API keys are prototype-local configuration only. Access them through the `SecretStore` abstraction, never hard-code or log them, and keep model requests in the Rust network layer. Use parameterized SQL and transactional, uniquely versioned SQLite migrations.

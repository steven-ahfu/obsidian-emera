---
name: obsidian-emera
description: Contributor guide for the steven-ahfu/obsidian-emera plugin. Use when implementing features, fixing bugs, reviewing changes, updating docs/examples, or planning work in this repository. Also use when you need repository-specific architecture, constraints, verification steps, and roadmap-aware execution.
---

# Obsidian Emera skill

Use this skill when work targets `steven-ahfu/obsidian-emera`.

## Ground truth sources

Read sources in this order before making decisions:

1. `.agents/AGENTS.md` in repo root (authoritative private instructions, if present)
2. `AGENTS.md` in repo root (tracked pointer/fallback)
3. `README.md`
4. `package.json`
5. `manifest.json`
6. `src/` implementation files relevant to the task

If these conflict, follow `.agents/AGENTS.md`, then `AGENTS.md`, then code.

## Current main snapshot (baseline)

Baseline is the public `main` branch state of
`https://github.com/steven-ahfu/obsidian-emera` as of February 20, 2026.

- Plugin: `emera` version `1.4.5`
- Min Obsidian version: `1.6.5`
- Runtime target: desktop + mobile (`isDesktopOnly: false`)
- Node/tooling baseline: Node.js `>=24.13.1`
- Core promise: MDX-like React components + inline JavaScript in notes

### Main capabilities

- Inline and block React component rendering
- JSX blocks and shorthand markdown-wrapper blocks (`emmd:<ComponentName>`)
- Inline JS (`emjs:`) and JS blocks with exports/scope chaining
- Reading mode + live preview support
- Canvas + mobile support
- Components loaded from vault JS/TS module entrypoint
- Auto refresh user module with settings toggle + debounce
- Verbose debug logging mode with quieter default logging
- Command to show last debug report; debug report persisted at
  `.obsidian/plugins/emera/last-error.json`
- Browser-only bundling/transpilation (no Node runtime in plugin execution)

### Main limitations

- No Node built-ins in user component code
- No direct npm package install usage inside component runtime
- Prefer ESM CDN imports or local files in components folder

### File layout

- `main.ts`: plugin entrypoint
- `src/plugin.ts`: plugin lifecycle and settings wiring
- `src/settings.ts`: plugin settings tab UI
- `src/bundler.ts`: browser-side transpile/bundle pipeline + debug report writes
- `src/logger.ts`: central logger with debug gating
- `src/processors/`: markdown/code block processing
- `src/emera-module/`: public module exports/hooks/storage helpers
- `styles.css`: plugin styles
- `examples/`: runnable notes + component examples for manual verification
- `.agents/docs/`: roadmap + handoff state

## Working rules for this repo

1. Keep compatibility first for existing notes and code block behavior.
2. Preserve browser/mobile constraints; avoid Node-dependent runtime patterns.
3. Keep settings defaults safe and non-breaking.
4. Treat docs/examples as part of feature completeness when behavior changes.
5. Minimize invasive refactors unless explicitly requested.
6. Include a version bump on every feature branch before merge.
7. Use feature branches named `codex/<nn>-<feature-slug>`.

## Standard execution flow

1. Create/switch to the requested feature branch.
2. Read `.agents/docs/emera-priority-roadmap.md` and
   `.agents/docs/emera-priority-handoff.md`.
3. Research current implementation paths before editing.
4. Implement in small, reviewable steps with backward compatibility.
5. Verify with repository quality gate.
6. Add/update tests where practical.
7. Update README/examples when user-facing behavior changes.
8. Update roadmap/handoff docs with status + next item.
9. Ensure branch version bump updates `package.json`, `manifest.json`, and
   `versions.json`.

## Verification checklist

Run these from repo root:

```bash
yarn typecheck
yarn test
yarn lint
yarn format
yarn build
```

Useful scripts:

```bash
yarn hooks:install
yarn deploy:vault
yarn sync:vault
```

Use example notes for quick manual smoke checks in Obsidian:

- `examples/notes/01-components.md`
- `examples/notes/02-inline-js.md`
- `examples/notes/04-storage.md`

## Roadmap-aware behavior

If `AGENTS.md` / `.agents/AGENTS.md` define a priority list, implement items in
that order unless explicitly reprioritized by the user. Keep roadmap state in
`.agents/docs/` files.

## Skill maintenance protocol (required)

Update this skill whenever merged changes alter repository behavior, workflow,
or verification expectations.

Mandatory update triggers:

1. `README.md` user-facing feature/usage changes
2. `package.json` script/tooling/engine changes
3. `manifest.json` version/minAppVersion/runtime changes
4. Public API or settings behavior changes in `src/`
5. Roadmap/process updates in `AGENTS.md` / `.agents/AGENTS.md`

When triggered:

1. Refresh the "Current main snapshot" section.
2. Update capability/limitation/workflow bullets.
3. Update verification checklist if commands changed.
4. Keep this skill concise; avoid unrelated auxiliary docs.

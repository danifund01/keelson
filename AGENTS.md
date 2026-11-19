# Agent instructions

keelson: local CLI that stores anchored, hash-verified memory for coding agents. Design: `docs/specs/`. Plans: `docs/plans/`. Format contract: `spec/FORMAT.md`.

- TypeScript strict. No `any`, no `@ts-ignore`, no `console.log` debugging left behind.
- TDD: write the failing test, watch it fail, then implement. Every bug fix adds a regression test.
- No network and no telemetry in any command.
- No new dependency without a written justification and user approval.
- The on-disk format is a versioned contract. Changing it means updating `spec/FORMAT.md`, `docs/es/FORMAT.md` and bumping `format_version` when old readers would misread it.
- Never read or anchor denied files (`.env*`, `.dev.vars*`, `*.pem`, `*.key`, `certificate.json`, `deployment-info.json`, `backups/**`, gitignored paths).
- Windows is first-class: normalize paths to POSIX and line endings to LF before hashing.
- Code, identifiers, commits and English docs in English; Spanish translations live in `README.es.md` and `docs/es/`.
- `git push`, publishing and installing dependencies need explicit user confirmation each time.

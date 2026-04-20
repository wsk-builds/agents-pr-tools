# Round 3 Ergonomics And CI Plan

## Goal

Make `agents-pr-tools` easier to use in day-to-day contributor workflows while improving repository readiness for collaboration and publishing.

## Findings From Scan

- The core CLI is small, readable, and already covered by basic tests.
- The most common self-reporting workflow still requires users to manually type their own login even when GitHub authentication is already available.
- Report generation only writes to stdout, which adds friction when the output is meant for a README, release notes draft, or application materials.
- The repository lacks basic CI automation and package metadata that would make the project easier to trust and publish.

## Scope

1. Add authenticated self-resolution for authors.
   - Support `--author @me` to resolve the currently authenticated GitHub login.
   - Reuse the existing token flow (`GITHUB_TOKEN`, `GH_TOKEN`, or `gh auth token`).
   - Fail clearly when `@me` is requested without authentication.
2. Add report file output support.
   - Support `--output <path>` to write the rendered report directly to disk.
   - Create parent directories automatically.
   - Preserve stdout behavior when `--output` is omitted or set to `-`.
3. Improve repository quality signals.
   - Add package metadata useful for publishing and discovery.
   - Add a lightweight GitHub Actions CI workflow for Node tests.
4. Update tests and docs.
   - Cover argument parsing, `@me` resolution, file output, and error cases.
   - Document the new workflow in `README.md`.

## Execution Order

1. Extend CLI argument parsing and rendering output flow.
2. Add authenticated author resolution helpers in the library.
3. Expand tests for the new behavior.
4. Refresh README examples and option reference.
5. Add package metadata and CI.
6. Run tests and live smoke checks.

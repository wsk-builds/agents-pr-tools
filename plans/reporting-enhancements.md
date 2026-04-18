# Reporting Enhancements Plan

## Goal

Improve `agents-pr-tools` so the generated PR reports are more reliable for real contributor workflows: stable ordering, accurate merged/closed state handling, date window filtering, and lighter-weight summary output.

## Scope

1. Make API fetching deterministic and scalable.
   - Add explicit sorting and ordering controls.
   - Fetch multiple result pages when `--limit` exceeds a single page.
2. Improve PR state accuracy.
   - Hydrate PR details from the pull request API so merged PRs are reported as `merged`, not just `closed`.
   - Treat `closed` as closed-but-not-merged to make the filter more useful.
3. Add reporting filters and output controls.
   - Add `--since` and `--until` ISO date filters.
   - Add `--summary-only` to emit a compact report without the full PR list.
   - Include state totals in summary output when mixed states are present.
4. Update tests and documentation.
   - Cover argument parsing, date filtering, canonical state handling, rendering, and pagination behavior.
   - Document the new options and show an example focused on recent work.

## Execution Order

1. Extend the library helpers and fetch pipeline.
2. Update CLI argument parsing and usage text.
3. Add and expand tests around the new behavior.
4. Refresh the README examples and option reference.
5. Run the test suite and a real CLI smoke check.

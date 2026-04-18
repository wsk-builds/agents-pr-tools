# Round 2 Reporting And Publish Plan

## Goal

Ship a more complete contributor-reporting CLI, then publish the work to GitHub on a dedicated branch.

## Scope

1. Add richer report outputs.
   - Support `csv` export for spreadsheet workflows.
   - Support a `release-notes` format optimized for changelog and application summaries.
2. Add more precise filtering.
   - Support filtering by one or more inferred work areas.
   - Support one or more authors in a single report run.
3. Keep the interface coherent.
   - Update help text, README examples, and tests for all new options and formats.
4. Publish the work.
   - Create a feature branch.
   - Commit with a Conventional Commit message.
   - Push the branch to `origin`.

## Execution Order

1. Create the branch for this work.
2. Extend the library fetch/filter/render pipeline.
3. Update CLI parsing and output wiring.
4. Expand tests for parsing, aggregation, filtering, and new formats.
5. Refresh README examples.
6. Run tests and live smoke checks.
7. Commit and push.

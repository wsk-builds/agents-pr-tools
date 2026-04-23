# Round 4 Auth Fallback And Label Filter Plan

## Goal

Make `agents-pr-tools` more resilient in real GitHub environments and more precise for maintainer reporting workflows.

## Scope

1. Fix optional authentication behavior.
   - Keep supporting `GITHUB_TOKEN`, `GH_TOKEN`, and `gh auth token`.
   - When a token is present but invalid, retry public repository reads without authentication instead of failing immediately.
   - Preserve strict authentication requirements for `--author @me`.
2. Add label-aware filtering.
   - Support `--label <name[,name...]>` to include only PRs that contain one or more matching labels.
   - Keep label matching case-insensitive.
   - Include labels in normalized PR data and machine-readable exports.
3. Update user-facing surfaces.
   - Document the new filtering mode and the anonymous fallback behavior.
   - Add tests for invalid-token fallback, label parsing, label filtering, and rendered output shape.

## Execution Order

1. Extend shared parsing and normalization helpers.
2. Add request retry logic for optional authentication failures.
3. Thread label data through fetching, filtering, and output.
4. Update CLI help and README examples.
5. Run tests and a CLI help smoke check.

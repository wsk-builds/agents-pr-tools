# agents-pr-tools

Maintainer-grade, dependency-free GitHub pull request reporting for upstream SDK work.

`agents-pr-tools` turns public GitHub PR history into Markdown summaries, tables, JSON, CSV, release-note style output, or maintainer handoff briefs. It is designed for cases where you need a fast, verifiable summary of upstream work: review triage, profile README updates, maintainer applications, weekly reports, changelog drafts, or lightweight OSS contribution audits.

## Highlights

- Query pull requests by repository and one or more authors.
- Resolve the authenticated GitHub user with `--author @me`.
- Distinguish merged PRs from closed-but-unmerged PRs.
- Filter by state, date window, inferred work area, and GitHub labels.
- Render Markdown, plain-text tables, JSON, CSV, or release-notes Markdown.
- Generate maintainer briefs with a maintenance snapshot, open review queue, release-note candidates, and handoff notes.
- Write reports directly to disk with `--output`.
- Generate compact summary-only reports for Markdown, table, and JSON output.
- Use `GITHUB_TOKEN`, `GH_TOKEN`, or `gh auth token` automatically when available.
- Retry public reads without authentication when a saved token is stale.
- Harden GitHub API reads with request timeouts, transient retries, and rate-limit-aware error messages.
- Run without third-party runtime dependencies.

## Requirements

- Node.js 22 or newer.
- Optional GitHub authentication through one of:
  - `GITHUB_TOKEN`
  - `GH_TOKEN`
  - `gh auth login`

Authentication is recommended because GitHub rate limits anonymous API requests more aggressively. `--author @me` always requires valid authentication because the tool must resolve the current GitHub user.

## Quick Start

Run from a local checkout:

```bash
node src/cli.mjs --repo openai/openai-agents-js --author wsk-builds
```

Generate a compact summary for the authenticated account:

```bash
node src/cli.mjs \
  --repo openai/openai-agents-js \
  --author @me \
  --state merged \
  --summary-only
```

Write the report to a file:

```bash
node src/cli.mjs \
  --repo openai/openai-agents-js \
  --author @me \
  --state merged \
  --summary-only \
  --output reports/openai-agents-js-summary.md
```

## Examples

### Maintainer brief

```bash
node src/cli.mjs \
  --repo openai/openai-agents-js \
  --author wsk-builds \
  --state all \
  --since 2026-04-01 \
  --until 2026-04-30 \
  --format maintainer-brief \
  --output reports/openai-agents-js-maintainer-brief.md
```

`maintainer-brief` is optimized for review handoffs. It includes work-area coverage, open review queue, release-note candidates, and concrete maintainer next steps. See [examples/openai-agents-maintainer-brief.md](./examples/openai-agents-maintainer-brief.md) for a representative output.

### Recent merged work

```bash
node src/cli.mjs \
  --repo openai/openai-agents-js \
  --author wsk-builds \
  --state merged \
  --since 2026-01-01 \
  --until 2026-04-30 \
  --summary-only \
  --format markdown
```

For `merged` reports, the date window is applied to the PR merged timestamp.

### Multi-author release notes

```bash
node src/cli.mjs \
  --repo openai/openai-agents-js \
  --author wsk-builds,openai \
  --state merged \
  --area docs,tests \
  --format release-notes
```

`release-notes` groups matching PRs by inferred work area and renders Markdown suitable for changelogs or status reports.

### Label-focused table

```bash
node src/cli.mjs \
  --repo openai/openai-agents-js \
  --author wsk-builds \
  --state merged \
  --label docs,bug \
  --format table
```

Label filters are case-insensitive and use normalized label names.

### Machine-readable summary

```bash
node src/cli.mjs \
  --repo openai/openai-agents-js \
  --author wsk-builds \
  --state all \
  --format json \
  --summary-only
```

Full JSON output returns the normalized PR list. Summary-only JSON returns totals by area, state, author, and label.

### Spreadsheet export

```bash
node src/cli.mjs \
  --repo openai/openai-agents-js \
  --author wsk-builds \
  --state merged \
  --format csv \
  --output reports/prs.csv
```

CSV output always renders full row data.

## CLI Reference

```text
Usage:
  agents-pr-tools --repo owner/name --author login[,login...] [options]

Options:
  --repo <owner/name>                     Target repository.
  --author <login[,login...]>            One or more GitHub author logins. Use @me for the authenticated viewer.
  --state <merged|open|closed|all>       Pull request state filter. Default: merged.
  --limit <n>                            Maximum number of PRs to fetch. Default: 20.
  --format <markdown|table|json|csv|release-notes|maintainer-brief>
                                         Output format. Default: markdown.
  --sort <created|updated>               Search sort field. Default: created.
  --order <desc|asc>                     Search order. Default: desc.
  --since <date>                         Start date filter in ISO-8601 format.
  --until <date>                         End date filter in ISO-8601 format.
  --area <name[,name...]>                Filter by inferred area.
  --label <name[,name...]>               Filter by one or more GitHub labels.
  --output <path>                        Write the report to a file. Use - for stdout.
  --summary-only                         Omit the full PR list and render only summaries.
  --help                                 Show help text.
```

Known inferred areas:

- `agents-extensions`
- `agents-realtime`
- `agents-core`
- `docs`
- `tests`
- `maintenance`
- `other`

## Reporting Behavior

- `merged` reports include PRs that GitHub reports as merged.
- `closed` reports mean closed but not merged.
- `open` reports include currently open PRs.
- `all` reports include open, closed, and merged PRs.
- `merged` date filters use the merged timestamp.
- `closed` date filters use the closed timestamp.
- `open` and `all` date filters use the created timestamp.
- `csv`, `release-notes`, and `maintainer-brief` always render full output and do not support `--summary-only`.
- `--summary-only` is supported only with `markdown`, `table`, and `json`.
- `--output` creates parent directories automatically.

Area detection is heuristic. The tool looks at normalized labels first, then PR title prefixes and keywords. Unknown work is grouped as `other`.

## Authentication and Reliability

The CLI automatically looks for credentials in this order:

1. `GITHUB_TOKEN`
2. `GH_TOKEN`
3. `gh auth token`

When a token is present, GitHub API calls include it as a bearer token. If a public repository read fails because the token is expired, revoked, or otherwise invalid, the tool retries that public read without authentication. This makes local reports more resilient when an old `gh` token is still configured.

GitHub API requests are hardened with:

- a default request timeout
- retries for transient network failures
- retries for `408`, `429`, `5xx`, and secondary rate-limit responses
- `Retry-After` support when GitHub provides it
- error messages that include rate-limit reset details when available

## Output Shape

Normalized PR rows include:

- PR number
- title
- URL
- author
- inferred area
- normalized labels
- normalized state
- created, updated, closed, and merged timestamps

Summary output includes:

- repository
- authors
- state filter
- total PR count
- sort order
- totals by work area
- totals by state
- totals by author
- totals by label
- optional date, area, and label filters

Maintainer brief output adds:

- maintenance snapshot
- work-area coverage
- open review queue
- release-note candidates
- maintainer handoff notes

## Development

Run syntax checks:

```bash
npm run check
```

Run tests:

```bash
npm test
```

Run tests with Node's built-in coverage report:

```bash
npm run test:coverage
```

Smoke-test the CLI help output:

```bash
node src/cli.mjs --help
```

## CI

The GitHub Actions workflow runs on Node.js 22 and 24. It validates syntax, runs the test suite, runs the built-in Node coverage report, and smoke-tests the CLI help command.

## Design Notes

- The project intentionally avoids runtime dependencies.
- The CLI and library code are written as native ES modules.
- Tests use the built-in `node:test` runner.
- Network behavior is tested with injected fake `fetch` implementations, so the test suite does not require live GitHub API calls.

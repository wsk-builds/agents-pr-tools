# agents-pr-tools

Small GitHub PR reporting utilities for upstream contributors and maintainers.

## Why this exists

When you contribute to an upstream repository through a working fork, you often need a fast way to turn your public PR history into a short, verifiable summary for a profile README, an application, or release notes.

This project provides a zero-dependency Node.js CLI that:

- fetches PRs for one or more authors in a given repository
- paginates and sorts results for stable reporting
- distinguishes merged PRs from closed-but-unmerged PRs
- filters reports to a date window and one or more inferred work areas
- groups work by rough area inferred from the PR title
- renders output as Markdown, a plain-text table, raw JSON, CSV, or release-notes Markdown
- supports compact summary-only reports

## Use cases

- profile README updates
- upstream contribution summaries
- maintainer application notes
- lightweight OSS activity reporting

## Quick start

```bash
node src/cli.mjs --repo openai/openai-agents-js --author wsk-builds --state merged --limit 20 --format markdown
```

Recent merged work only:

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

Multi-author release notes for docs and tests work:

```bash
node src/cli.mjs \
  --repo openai/openai-agents-js \
  --author wsk-builds,openai \
  --state merged \
  --area docs,tests \
  --format release-notes
```

The CLI will use `GITHUB_TOKEN` or `GH_TOKEN` when present. If neither is set, it will try `gh auth token`.

## Example output

```md
# Pull Request Summary for wsk-builds

- Repository: openai/openai-agents-js
- Author: wsk-builds
- State filter: merged
- Total PRs: 7
- Sort: created desc

## Work areas
- agents-extensions: 3
- docs: 3
- agents-realtime: 1
```

## CLI options

- `--repo <owner/name>`: target repository
- `--author <login[,login...]>`: one or more GitHub author logins
- `--state <merged|open|closed|all>`: PR state filter
- `--limit <n>`: maximum number of PRs to fetch
- `--format <markdown|table|json|csv|release-notes>`: output format
- `--sort <created|updated>`: GitHub search sort field
- `--order <desc|asc>`: sort direction
- `--since <date>`: start date in ISO-8601 format
- `--until <date>`: end date in ISO-8601 format
- `--area <name[,name...]>`: filter by inferred area
- `--summary-only`: render only the summary sections
- `--help`: show usage

Known inferred areas:

- `agents-extensions`
- `agents-realtime`
- `agents-core`
- `docs`
- `tests`
- `maintenance`
- `other`

## Reporting behavior

- `merged` reports use the PR merged timestamp for `--since` and `--until`.
- `closed` means closed but not merged.
- `open` and `all` date filters use the PR created timestamp.
- Full JSON output remains a raw PR list. Summary-only JSON emits a compact summary object instead.
- `csv` exports full row data for spreadsheet workflows.
- `release-notes` emits grouped Markdown suitable for changelogs or application materials.

## Development

```bash
node --test
node src/cli.mjs --help
```

## Notes

- Area grouping is heuristic and based on PR title prefixes and keywords.
- The tool is intentionally dependency-free so it can run in minimal environments.

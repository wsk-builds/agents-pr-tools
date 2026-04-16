# agents-pr-tools

Small GitHub PR reporting utilities for upstream contributors and maintainers.

## Why this exists

When you contribute to an upstream repository through a working fork, you often need a fast way to turn your public PR history into a short, verifiable summary for a profile README, an application, or release notes.

This project provides a zero-dependency Node.js CLI that:

- fetches PRs for a given author and repository
- groups work by rough area inferred from the PR title
- renders output as Markdown, a plain-text table, or raw JSON

## Use cases

- profile README updates
- upstream contribution summaries
- maintainer application notes
- lightweight OSS activity reporting

## Quick start

```bash
node src/cli.mjs --repo openai/openai-agents-js --author wsk-builds --state merged --limit 20 --format markdown
```

The CLI will use `GITHUB_TOKEN` or `GH_TOKEN` when present. If neither is set, it will try `gh auth token`.

## Example output

```md
# Pull Request Summary for wsk-builds

- Repository: openai/openai-agents-js
- State filter: merged
- Total PRs: 7

## Work areas
- agents-extensions: 3
- docs: 3
- agents-realtime: 1
```

## CLI options

- `--repo <owner/name>`: target repository
- `--author <login>`: GitHub author login
- `--state <merged|open|closed|all>`: PR state filter
- `--limit <n>`: maximum number of PRs to fetch
- `--format <markdown|table|json>`: output format
- `--help`: show usage

## Development

```bash
node --test
node src/cli.mjs --help
```

## Notes

- Area grouping is heuristic and based on PR title prefixes and keywords.
- The tool is intentionally dependency-free so it can run in minimal environments.

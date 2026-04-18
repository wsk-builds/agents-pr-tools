#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  buildSummaryPayload,
  fetchPullRequestsForAuthors,
  getAccessToken,
  getKnownAreas,
  normalizeDateRange,
  normalizeFormat,
  normalizeOrder,
  normalizeSort,
  normalizeState,
  parseAreaFilter,
  parseAuthorLogins,
  parseRepo,
  toCsv,
  toMarkdown,
  toReleaseNotes,
  toTable
} from './lib.mjs';

export function usage() {
  return [
    'Usage:',
    '  agents-pr-tools --repo owner/name --author login[,login...] [options]',
    '',
    'Options:',
    '  --repo <owner/name>                     Target repository.',
    '  --author <login[,login...]>            One or more GitHub author logins.',
    '  --state <merged|open|closed|all>       Pull request state filter. Default: merged.',
    '  --limit <n>                            Maximum number of PRs to fetch. Default: 20.',
    '  --format <markdown|table|json|csv|release-notes>',
    '                                         Output format. Default: markdown.',
    '  --sort <created|updated>               Search sort field. Default: created.',
    '  --order <desc|asc>                     Search order. Default: desc.',
    '  --since <date>                         Start date filter in ISO-8601 format.',
    '  --until <date>                         End date filter in ISO-8601 format.',
    `  --area <name[,name...]>                Filter by inferred area. Known areas: ${getKnownAreas().join(', ')}.`,
    '  --summary-only                         Omit the full PR list and render only summaries.',
    '  --help                                 Show this help text.',
    '',
    'Notes:',
    '  - merged reports filter by merged date when --since/--until is used.',
    '  - closed reports mean closed but not merged.',
    '  - open and all reports filter by created date.',
    '  - csv and release-notes always render full output.'
  ].join('\n');
}

export function parseArgs(argv) {
  const options = {
    state: 'merged',
    limit: 20,
    format: 'markdown',
    sort: 'created',
    order: 'desc',
    summaryOnly: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--summary-only') {
      options.summaryOnly = true;
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument "${arg}".`);
    }

    const value = argv[index + 1];

    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}.`);
    }

    index += 1;

    if (arg === '--repo') {
      options.repo = value;
    } else if (arg === '--author') {
      options.author = value;
    } else if (arg === '--state') {
      options.state = value;
    } else if (arg === '--limit') {
      const parsed = Number.parseInt(value, 10);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid limit "${value}".`);
      }

      options.limit = parsed;
    } else if (arg === '--format') {
      options.format = value;
    } else if (arg === '--sort') {
      options.sort = value;
    } else if (arg === '--order') {
      options.order = value;
    } else if (arg === '--since') {
      options.since = value;
    } else if (arg === '--until') {
      options.until = value;
    } else if (arg === '--area') {
      options.area = value;
    } else {
      throw new Error(`Unknown option "${arg}".`);
    }
  }

  return options;
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);

  if (options.help) {
    (dependencies.stdout || process.stdout).write(`${usage()}\n`);
    return;
  }

  if (!options.repo || !options.author) {
    throw new Error('Both --repo and --author are required.');
  }

  const repo = parseRepo(options.repo).fullName;
  const authors = parseAuthorLogins(options.author);
  const areas = parseAreaFilter(options.area);
  const state = normalizeState(options.state);
  const format = normalizeFormat(options.format);
  const sort = normalizeSort(options.sort);
  const order = normalizeOrder(options.order);
  const dateRange = normalizeDateRange({
    since: options.since,
    until: options.until
  });

  if (options.summaryOnly && !['markdown', 'table', 'json'].includes(format)) {
    throw new Error('--summary-only is only supported with markdown, table, or json output.');
  }

  const execFileSyncImpl = dependencies.execFileSync || execFileSync;
  const fetchImpl = dependencies.fetchImpl || fetch;
  const stdout = dependencies.stdout || process.stdout;
  const token = await getAccessToken({ execFileSync: execFileSyncImpl });
  const pullRequests = await fetchPullRequestsForAuthors({
    repo,
    authors,
    state,
    limit: options.limit,
    sort,
    order,
    since: dateRange.since,
    until: dateRange.until,
    areas,
    fetchImpl,
    token
  });

  const payload = {
    repo,
    authors,
    state,
    pullRequests,
    since: options.since,
    until: options.until,
    sort,
    order,
    areas,
    summaryOnly: options.summaryOnly
  };

  if (format === 'json') {
    const jsonPayload = options.summaryOnly ? buildSummaryPayload(payload) : pullRequests;
    stdout.write(`${JSON.stringify(jsonPayload, null, 2)}\n`);
    return;
  }

  if (format === 'table') {
    stdout.write(toTable(payload));
    return;
  }

  if (format === 'csv') {
    stdout.write(toCsv(payload));
    return;
  }

  if (format === 'release-notes') {
    stdout.write(toReleaseNotes(payload));
    return;
  }

  stdout.write(toMarkdown(payload));
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (import.meta.url === entryUrl) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n\n${usage()}\n`);
    process.exitCode = 1;
  });
}

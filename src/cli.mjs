#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  fetchPullRequests,
  getAccessToken,
  normalizeState,
  parseRepo,
  toMarkdown,
  toTable
} from './lib.mjs';

function usage() {
  return [
    'Usage:',
    '  agents-pr-tools --repo owner/name --author login [options]',
    '',
    'Options:',
    '  --repo <owner/name>                 Target repository.',
    '  --author <login>                   GitHub author login.',
    '  --state <merged|open|closed|all>   Pull request state filter. Default: merged.',
    '  --limit <n>                        Maximum number of PRs to fetch. Default: 20.',
    '  --format <markdown|table|json>     Output format. Default: markdown.',
    '  --help                             Show this help text.'
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    state: 'merged',
    limit: 20,
    format: 'markdown'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      options.help = true;
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
    } else {
      throw new Error(`Unknown option "${arg}".`);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (!options.repo || !options.author) {
    throw new Error('Both --repo and --author are required.');
  }

  const repo = parseRepo(options.repo).fullName;
  const state = normalizeState(options.state);
  const format = String(options.format || 'markdown').toLowerCase();

  if (!['markdown', 'table', 'json'].includes(format)) {
    throw new Error(`Invalid format "${options.format}". Use markdown, table, or json.`);
  }

  const token = await getAccessToken({ execFileSync });
  const pullRequests = await fetchPullRequests({
    repo,
    author: options.author,
    state,
    limit: options.limit,
    fetchImpl: fetch,
    token
  });

  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(pullRequests, null, 2)}\n`);
    return;
  }

  const payload = {
    repo,
    author: options.author,
    state,
    pullRequests
  };

  if (format === 'table') {
    process.stdout.write(`${toTable(payload)}\n`);
    return;
  }

  process.stdout.write(toMarkdown(payload));
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n\n${usage()}\n`);
  process.exitCode = 1;
});

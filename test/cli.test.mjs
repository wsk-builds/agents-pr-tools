import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main, parseArgs } from '../src/cli.mjs';

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test('parseArgs handles multi-author, area, and label filter options', () => {
  assert.deepEqual(
    parseArgs([
      '--repo',
      'acme/demo',
      '--author',
      'alice,bob',
      '--state',
      'all',
      '--limit',
      '5',
      '--format',
      'json',
      '--sort',
      'updated',
      '--order',
      'asc',
      '--since',
      '2026-04-01',
      '--until',
      '2026-04-30',
      '--area',
      'docs,tests',
      '--label',
      'bug,docs',
      '--output',
      'reports/out.md',
      '--summary-only'
    ]),
    {
      repo: 'acme/demo',
      author: 'alice,bob',
      state: 'all',
      limit: 5,
      format: 'json',
      sort: 'updated',
      order: 'asc',
      since: '2026-04-01',
      until: '2026-04-30',
      area: 'docs,tests',
      label: 'bug,docs',
      output: 'reports/out.md',
      summaryOnly: true
    }
  );
});

test('main resolves @me and renders summary-only json through injected dependencies', async () => {
  const chunks = [];
  const stdout = {
    write(value) {
      chunks.push(value);
    }
  };

  const fetchImpl = async (url) => {
    const requestUrl = new URL(url);

    if (requestUrl.pathname === '/user') {
      return jsonResponse({ login: 'alice' });
    }

    if (requestUrl.pathname === '/search/issues') {
      return jsonResponse({
        items: [{ number: 42, labels: [{ name: 'docs' }] }]
      });
    }

    return jsonResponse({
      number: 42,
      title: 'docs: tighten README examples',
      html_url: 'https://github.com/acme/demo/pull/42',
      user: { login: 'alice' },
      state: 'closed',
      created_at: '2026-04-10T00:00:00.000Z',
      updated_at: '2026-04-11T00:00:00.000Z',
      closed_at: '2026-04-12T00:00:00.000Z',
      merged_at: '2026-04-12T00:00:00.000Z'
    });
  };

  await main(
    [
      '--repo',
      'acme/demo',
      '--author',
      '@me',
      '--format',
      'json',
      '--summary-only'
    ],
    {
      fetchImpl,
      execFileSync() {
        return 'fake-token';
      },
      stdout
    }
  );

  assert.deepEqual(JSON.parse(chunks.join('')), {
    repo: 'acme/demo',
    authors: ['alice'],
    state: 'merged',
    totalPullRequests: 1,
    sort: 'created',
    order: 'desc',
    byArea: [{ area: 'docs', count: 1 }],
    byState: [{ state: 'merged', count: 1 }],
    byAuthor: [{ author: 'alice', count: 1 }],
    byLabel: [{ label: 'docs', count: 1 }]
  });
});

test('main writes rendered output to --output targets', async () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'agents-pr-tools-'));
  const outputPath = join(outputDir, 'reports', 'summary.md');
  const stdout = {
    write() {
      throw new Error('stdout should not be used when --output writes to a file');
    }
  };

  const fetchImpl = async (url) => {
    const requestUrl = new URL(url);

    if (requestUrl.pathname === '/search/issues') {
      return jsonResponse({
        items: [{ number: 42, labels: [{ name: 'docs' }] }]
      });
    }

    return jsonResponse({
      number: 42,
      title: 'docs: tighten README examples',
      html_url: 'https://github.com/acme/demo/pull/42',
      user: { login: 'alice' },
      state: 'closed',
      created_at: '2026-04-10T00:00:00.000Z',
      updated_at: '2026-04-11T00:00:00.000Z',
      closed_at: '2026-04-12T00:00:00.000Z',
      merged_at: '2026-04-12T00:00:00.000Z'
    });
  };

  await main(
    [
      '--repo',
      'acme/demo',
      '--author',
      'alice',
      '--summary-only',
      '--output',
      outputPath
    ],
    {
      fetchImpl,
      execFileSync() {
        return 'fake-token';
      },
      stdout
    }
  );

  assert.match(readFileSync(outputPath, 'utf8'), /# Pull Request Summary for alice/);
});

test('main rejects summary-only with csv output', async () => {
  await assert.rejects(
    () =>
      main([
        '--repo',
        'acme/demo',
        '--author',
        'alice',
        '--format',
        'csv',
        '--summary-only'
      ]),
    /--summary-only is only supported/
  );
});

test('main rejects @me when authentication is unavailable', async () => {
  await assert.rejects(
    () =>
      main(
        [
          '--repo',
          'acme/demo',
          '--author',
          '@me',
          '--summary-only'
        ],
        {
          fetchImpl: async () => {
            throw new Error('fetch should not be called without authentication');
          }
        }
      ),
    /--author @me requires GitHub authentication/
  );
});

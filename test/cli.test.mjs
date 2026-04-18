import test from 'node:test';
import assert from 'node:assert/strict';

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

test('parseArgs handles multi-author and area filter options', () => {
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
      summaryOnly: true
    }
  );
});

test('main renders summary-only json through injected dependencies', async () => {
  const chunks = [];
  const stdout = {
    write(value) {
      chunks.push(value);
    }
  };

  const fetchImpl = async (url) => {
    const requestUrl = new URL(url);

    if (requestUrl.pathname === '/search/issues') {
      return jsonResponse({
        items: [{ number: 42 }]
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
    byAuthor: [{ author: 'alice', count: 1 }]
  });
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

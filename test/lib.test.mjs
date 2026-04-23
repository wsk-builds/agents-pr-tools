import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSearchQuery,
  buildSummaryPayload,
  canonicalizeState,
  fetchPullRequests,
  fetchPullRequestsForAuthors,
  fetchViewerLogin,
  filterPullRequestsByArea,
  filterPullRequestsByDateRange,
  filterPullRequestsByLabels,
  getKnownAreas,
  inferArea,
  normalizeDateRange,
  normalizeFormat,
  normalizeOrder,
  normalizeSort,
  normalizeState,
  parseAreaFilter,
  parseAuthorLogins,
  parseLabelFilter,
  resolveAuthorLogins,
  summarizeAuthors,
  summarizeLabels,
  summarizePullRequests,
  summarizeStates,
  toCsv,
  toMarkdown,
  toReleaseNotes,
  toTable
} from '../src/lib.mjs';

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

test('normalizers and parsers validate inputs and support multiple authors, areas, and labels', () => {
  assert.equal(normalizeState('merged'), 'merged');
  assert.equal(normalizeFormat('release-notes'), 'release-notes');
  assert.equal(normalizeSort('updated'), 'updated');
  assert.equal(normalizeOrder('asc'), 'asc');
  assert.deepEqual(parseAuthorLogins('Alice,bob'), ['alice', 'bob']);
  assert.deepEqual(parseAreaFilter('docs,tests'), ['docs', 'tests']);
  assert.deepEqual(parseLabelFilter('Docs,Bug,docs'), ['docs', 'bug']);
  assert.ok(getKnownAreas().includes('docs'));
  assert.throws(() => normalizeState('draft'), /Invalid state/);
  assert.throws(() => normalizeFormat('yaml'), /Invalid format/);
  assert.throws(() => parseAreaFilter('unknown'), /Invalid area/);
});

test('resolveAuthorLogins expands @me through the authenticated GitHub viewer', async () => {
  const fetchImpl = async (url) => {
    const requestUrl = new URL(url);
    assert.equal(requestUrl.pathname, '/user');
    return jsonResponse({ login: 'Wsk-Builds' });
  };

  assert.equal(await fetchViewerLogin({ fetchImpl, token: 'fake-token' }), 'wsk-builds');
  assert.deepEqual(
    await resolveAuthorLogins({
      authors: ['@me', 'alice', '@me'],
      fetchImpl,
      token: 'fake-token'
    }),
    ['wsk-builds', 'alice']
  );
});

test('resolveAuthorLogins rejects @me without authentication', async () => {
  await assert.rejects(
    () =>
      resolveAuthorLogins({
        authors: ['@me'],
        fetchImpl: async () => jsonResponse({ login: 'alice' })
      }),
    /--author @me requires GitHub authentication/
  );
});

test('inferArea, canonicalizeState, and summaries stay meaningful across multiple authors', () => {
  const pullRequests = [
    {
      number: 1,
      title: 'fix: fail fast on unsupported SIP VAD fields',
      author: 'alice',
      labels: ['Realtime', 'Voice'],
      state: 'merged',
      mergedAt: '2026-04-01T00:00:00.000Z'
    },
    {
      number: 2,
      title: 'docs: fix tools example commands',
      author: 'bob',
      area: 'docs',
      labels: ['docs'],
      state: 'closed',
      mergedAt: null
    }
  ];

  assert.equal(inferArea(pullRequests[0].title, pullRequests[0].labels), 'agents-realtime');
  assert.equal(canonicalizeState({ state: 'closed', mergedAt: '2026-04-01T00:00:00.000Z' }), 'merged');
  assert.equal(canonicalizeState({ state: 'closed', mergedAt: null }), 'closed');
  assert.deepEqual(summarizePullRequests(pullRequests), [
    { area: 'agents-realtime', count: 1 },
    { area: 'docs', count: 1 }
  ]);
  assert.deepEqual(summarizeStates(pullRequests), [
    { state: 'closed', count: 1 },
    { state: 'merged', count: 1 }
  ]);
  assert.deepEqual(summarizeAuthors(pullRequests), [
    { author: 'alice', count: 1 },
    { author: 'bob', count: 1 }
  ]);
  assert.deepEqual(summarizeLabels(pullRequests), [
    { label: 'docs', count: 1 },
    { label: 'realtime', count: 1 },
    { label: 'voice', count: 1 }
  ]);
});

test('buildSearchQuery composes repo, author, and state filters', () => {
  assert.equal(
    buildSearchQuery({
      repo: 'openai/openai-agents-js',
      author: 'wsk-builds',
      state: 'merged'
    }),
    'repo:openai/openai-agents-js type:pr author:wsk-builds is:merged'
  );

  assert.equal(
    buildSearchQuery({
      repo: 'openai/openai-agents-js',
      author: 'wsk-builds',
      state: 'all'
    }),
    'repo:openai/openai-agents-js type:pr author:wsk-builds'
  );
});

test('date, area, and label filtering use state-specific timestamps and inferred areas', () => {
  const dateRange = normalizeDateRange({
    since: '2026-04-01',
    until: '2026-04-30'
  });

  const pullRequests = [
    {
      number: 1,
      title: 'docs: clarify README',
      author: 'alice',
      area: 'docs',
      labels: ['docs', 'bug'],
      state: 'merged',
      createdAt: '2026-03-20T00:00:00.000Z',
      closedAt: '2026-04-10T00:00:00.000Z',
      mergedAt: '2026-04-10T00:00:00.000Z'
    },
    {
      number: 2,
      title: 'fix(agents-core): another change',
      author: 'alice',
      area: 'agents-core',
      labels: ['enhancement'],
      state: 'merged',
      createdAt: '2026-03-21T00:00:00.000Z',
      closedAt: '2026-05-02T00:00:00.000Z',
      mergedAt: '2026-05-02T00:00:00.000Z'
    }
  ];

  assert.equal(dateRange.since, '2026-04-01T00:00:00.000Z');
  assert.equal(dateRange.until, '2026-04-30T23:59:59.999Z');
  assert.throws(
    () => normalizeDateRange({ since: '2026-05-01', until: '2026-04-01' }),
    /Invalid date range/
  );
  assert.deepEqual(
    filterPullRequestsByDateRange(pullRequests, {
      state: 'merged',
      since: dateRange.since,
      until: dateRange.until
    }).map((pr) => pr.number),
    [1]
  );
  assert.deepEqual(
    filterPullRequestsByArea(pullRequests, { areas: ['docs'] }).map((pr) => pr.number),
    [1]
  );
  assert.deepEqual(
    filterPullRequestsByLabels(pullRequests, { labels: ['BUG'] }).map((pr) => pr.number),
    [1]
  );
});

test('renderers cover markdown, table, csv, release-notes, and summary payloads', () => {
  const pullRequests = [
    {
      number: 1171,
      title: 'fix(agents-extensions): preserve nested audio config',
      url: 'https://github.com/openai/openai-agents-js/pull/1171',
      author: 'alice',
      area: 'agents-extensions',
      labels: ['bug', 'extensions'],
      state: 'merged',
      createdAt: '2026-04-10T12:00:00.000Z',
      updatedAt: '2026-04-10T13:00:00.000Z',
      closedAt: '2026-04-11T12:00:00.000Z',
      mergedAt: '2026-04-11T12:00:00.000Z'
    },
    {
      number: 1158,
      title: 'docs: fix tools, example commands',
      url: 'https://github.com/openai/openai-agents-js/pull/1158',
      author: 'bob',
      area: 'docs',
      labels: ['docs'],
      state: 'closed',
      createdAt: '2026-04-08T12:00:00.000Z',
      updatedAt: '2026-04-08T13:00:00.000Z',
      closedAt: '2026-04-09T12:00:00.000Z',
      mergedAt: null
    }
  ];

  const markdown = toMarkdown({
    repo: 'openai/openai-agents-js',
    authors: ['alice', 'bob'],
    state: 'all',
    pullRequests,
    sort: 'created',
    order: 'desc',
    areas: ['docs', 'agents-extensions'],
    labels: ['bug', 'docs'],
    summaryOnly: true
  });

  assert.match(markdown, /# Pull Request Summary for alice, bob/);
  assert.match(markdown, /## Author totals/);
  assert.match(markdown, /## Labels/);
  assert.match(markdown, /Label filter: bug, docs/);
  assert.doesNotMatch(markdown, /## Pull requests/);

  const table = toTable({
    repo: 'openai/openai-agents-js',
    authors: ['alice', 'bob'],
    state: 'all',
    pullRequests,
    sort: 'created',
    order: 'desc'
  });

  assert.match(table, /Author totals/);
  assert.match(table, /Label totals/);
  assert.match(table, /Labels/);
  assert.match(table, /Number/);
  assert.match(table, /alice/);

  const csv = toCsv({ pullRequests });
  assert.match(csv, /^number,author,area,labels,state,/);
  assert.match(csv, /bug, extensions/);
  assert.match(csv, /"docs: fix tools, example commands"/);

  const releaseNotes = toReleaseNotes({
    repo: 'openai/openai-agents-js',
    authors: ['alice', 'bob'],
    state: 'all',
    pullRequests,
    sort: 'created',
    order: 'desc'
  });

  assert.match(releaseNotes, /# Release Notes for openai\/openai-agents-js/);
  assert.match(releaseNotes, /## agents-extensions/);
  assert.match(releaseNotes, /@bob/);

  assert.deepEqual(buildSummaryPayload({
    repo: 'openai/openai-agents-js',
    authors: ['alice', 'bob'],
    state: 'all',
    pullRequests,
    since: '2026-04-01',
    until: '2026-04-30',
    sort: 'created',
    order: 'desc',
    areas: ['docs'],
    labels: ['docs']
  }), {
    repo: 'openai/openai-agents-js',
    authors: ['alice', 'bob'],
    state: 'all',
    totalPullRequests: 2,
    sort: 'created',
    order: 'desc',
    byArea: [
      { area: 'agents-extensions', count: 1 },
      { area: 'docs', count: 1 }
    ],
    byState: [
      { state: 'closed', count: 1 },
      { state: 'merged', count: 1 }
    ],
    byAuthor: [
      { author: 'alice', count: 1 },
      { author: 'bob', count: 1 }
    ],
    byLabel: [
      { label: 'bug', count: 1 },
      { label: 'docs', count: 1 },
      { label: 'extensions', count: 1 }
    ],
    dateRange: {
      field: 'created',
      since: '2026-04-01',
      until: '2026-04-30'
    },
    areaFilter: ['docs'],
    labelFilter: ['docs']
  });
});

test('fetchPullRequests paginates and filters merged PRs out of the closed view', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const requestUrl = new URL(url);
    calls.push(requestUrl.toString());

    if (requestUrl.pathname === '/search/issues') {
      const page = requestUrl.searchParams.get('page');

      if (page === '1') {
        return jsonResponse({
          items: [
            { number: 11, labels: [{ name: 'skip' }] },
            { number: 10, labels: [{ name: 'docs' }] }
          ]
        });
      }

      if (page === '2') {
        return jsonResponse({
          items: [{ number: 9, labels: [{ name: 'tests' }] }]
        });
      }

      return jsonResponse({ items: [] });
    }

    const number = Number.parseInt(requestUrl.pathname.split('/').pop(), 10);

    if (number === 11) {
      return jsonResponse({
        number,
        title: 'fix(agents-core): merged change',
        html_url: `https://github.com/acme/demo/pull/${number}`,
        user: { login: 'alice' },
        state: 'closed',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
        closed_at: '2026-04-03T00:00:00.000Z',
        merged_at: '2026-04-03T00:00:00.000Z'
      });
    }

    if (number === 10) {
      return jsonResponse({
        number,
        title: 'docs: closed docs change',
        html_url: `https://github.com/acme/demo/pull/${number}`,
        user: { login: 'alice' },
        state: 'closed',
        created_at: '2026-04-04T00:00:00.000Z',
        updated_at: '2026-04-05T00:00:00.000Z',
        closed_at: '2026-04-06T00:00:00.000Z',
        merged_at: null
      });
    }

    return jsonResponse({
      number,
      title: 'fix(agents-core): closed non-docs change',
      html_url: `https://github.com/acme/demo/pull/${number}`,
      user: { login: 'alice' },
      state: 'closed',
      created_at: '2026-04-07T00:00:00.000Z',
      updated_at: '2026-04-08T00:00:00.000Z',
      closed_at: '2026-04-09T00:00:00.000Z',
      merged_at: null
    });
  };

  const pullRequests = await fetchPullRequests({
    repo: 'acme/demo',
    author: 'alice',
    state: 'closed',
    limit: 1,
    sort: 'created',
    order: 'desc',
    areas: ['docs'],
    labels: ['docs'],
    fetchImpl
  });

  assert.deepEqual(
    pullRequests.map((pr) => ({
      number: pr.number,
      state: pr.state,
      author: pr.author,
      area: pr.area,
      labels: pr.labels
    })),
    [
      { number: 10, state: 'closed', author: 'alice', area: 'docs', labels: ['docs'] }
    ]
  );

  assert.equal(
    calls.filter((call) => call.includes('/search/issues')).length,
    1
  );
});

test('fetchPullRequests retries public API reads without auth when the token is invalid', async () => {
  const authHeaders = [];
  const fetchImpl = async (url, { headers }) => {
    const requestUrl = new URL(url);
    authHeaders.push(headers.Authorization || null);

    if (requestUrl.pathname === '/search/issues') {
      if (headers.Authorization) {
        return jsonResponse({ message: 'Bad credentials' }, 401);
      }

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

  const pullRequests = await fetchPullRequests({
    repo: 'acme/demo',
    author: 'alice',
    state: 'merged',
    limit: 1,
    sort: 'created',
    order: 'desc',
    fetchImpl,
    token: 'expired-token'
  });

  assert.deepEqual(
    pullRequests.map((pr) => ({ number: pr.number, labels: pr.labels })),
    [{ number: 42, labels: ['docs'] }]
  );
  assert.deepEqual(authHeaders, ['Bearer expired-token', null, null]);
});

test('fetchPullRequestsForAuthors merges and globally sorts multiple author streams', async () => {
  const fetchImpl = async (url) => {
    const requestUrl = new URL(url);

    if (requestUrl.pathname === '/search/issues') {
      const query = requestUrl.searchParams.get('q');

      if (query.includes('author:alice')) {
        return jsonResponse({ items: [{ number: 21 }] });
      }

      return jsonResponse({ items: [{ number: 22 }] });
    }

    const number = Number.parseInt(requestUrl.pathname.split('/').pop(), 10);

    if (number === 21) {
      return jsonResponse({
        number,
        title: 'docs: alice change',
        html_url: 'https://github.com/acme/demo/pull/21',
        user: { login: 'alice' },
        state: 'closed',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
        closed_at: '2026-04-03T00:00:00.000Z',
        merged_at: '2026-04-03T00:00:00.000Z'
      });
    }

    return jsonResponse({
      number: 22,
      title: 'fix(agents-core): bob change',
      html_url: 'https://github.com/acme/demo/pull/22',
      user: { login: 'bob' },
      state: 'closed',
      created_at: '2026-04-04T00:00:00.000Z',
      updated_at: '2026-04-05T00:00:00.000Z',
      closed_at: '2026-04-06T00:00:00.000Z',
      merged_at: '2026-04-06T00:00:00.000Z'
    });
  };

  const pullRequests = await fetchPullRequestsForAuthors({
    repo: 'acme/demo',
    authors: ['alice', 'bob'],
    state: 'merged',
    limit: 2,
    sort: 'created',
    order: 'desc',
    fetchImpl
  });

  assert.deepEqual(
    pullRequests.map((pr) => ({ number: pr.number, author: pr.author })),
    [
      { number: 22, author: 'bob' },
      { number: 21, author: 'alice' }
    ]
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSearchQuery,
  inferArea,
  normalizeState,
  summarizePullRequests,
  toMarkdown,
  toTable
} from '../src/lib.mjs';

test('inferArea groups known PR title prefixes and keywords', () => {
  assert.equal(inferArea('fix(agents-realtime): fail fast on unsupported SIP VAD fields'), 'agents-realtime');
  assert.equal(inferArea('docs: fix tools example commands'), 'docs');
  assert.equal(inferArea('test(agents-extensions): add AI SDK UI boundary coverage'), 'agents-extensions');
  assert.equal(inferArea('fix(husky): disable trufflehog auto-update in pre-commit'), 'maintenance');
});

test('normalizeState rejects unsupported filters', () => {
  assert.equal(normalizeState('merged'), 'merged');
  assert.throws(() => normalizeState('draft'), /Invalid state/);
});

test('buildSearchQuery composes repo, author, and state', () => {
  assert.equal(
    buildSearchQuery({
      repo: 'openai/openai-agents-js',
      author: 'wsk-builds',
      state: 'merged'
    }),
    'repo:openai/openai-agents-js type:pr author:wsk-builds is:merged'
  );
});

test('summaries and renderers stay stable', () => {
  const pullRequests = [
    {
      number: 1171,
      title: 'fix(agents-extensions): preserve nested audio config',
      url: 'https://github.com/openai/openai-agents-js/pull/1171',
      state: 'closed'
    },
    {
      number: 1170,
      title: 'fix(agents-realtime): fail fast on unsupported SIP VAD fields',
      url: 'https://github.com/openai/openai-agents-js/pull/1170',
      state: 'closed'
    },
    {
      number: 1158,
      title: 'docs: fix tools example commands',
      url: 'https://github.com/openai/openai-agents-js/pull/1158',
      state: 'closed'
    }
  ];

  assert.deepEqual(summarizePullRequests(pullRequests), [
    { area: 'agents-extensions', count: 1 },
    { area: 'agents-realtime', count: 1 },
    { area: 'docs', count: 1 }
  ]);

  const markdown = toMarkdown({
    repo: 'openai/openai-agents-js',
    author: 'wsk-builds',
    state: 'merged',
    pullRequests
  });

  assert.match(markdown, /# Pull Request Summary for wsk-builds/);
  assert.match(markdown, /- Repository: openai\/openai-agents-js/);
  assert.match(markdown, /\[#1171\]/);

  const table = toTable({ pullRequests });
  assert.match(table, /Number/);
  assert.match(table, /agents-realtime/);
});

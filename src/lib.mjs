const AREA_RULES = [
  { area: 'agents-extensions', patterns: [/agents-extensions/i, /ai sdk/i] },
  { area: 'agents-realtime', patterns: [/agents-realtime/i, /\brealtime\b/i, /\bvad\b/i, /\bsip\b/i] },
  { area: 'agents-core', patterns: [/agents-core/i, /\bmcp\b/i, /\brunstate\b/i] },
  { area: 'docs', patterns: [/^docs\b/i, /readme/i, /example/i] },
  { area: 'tests', patterns: [/^test\b/i, /\bcoverage\b/i, /\bflaky\b/i] },
  { area: 'maintenance', patterns: [/^chore\b/i, /\bhusky\b/i, /\bworkflow\b/i, /\bci\b/i] }
];

export function parseRepo(value) {
  const trimmed = String(value || '').trim();
  const parts = trimmed.split('/');

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repository "${value}". Expected owner/name.`);
  }

  return { owner: parts[0], name: parts[1], fullName: trimmed };
}

export function inferArea(title) {
  for (const rule of AREA_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(title))) {
      return rule.area;
    }
  }

  return 'other';
}

export function summarizePullRequests(pullRequests) {
  const byArea = new Map();

  for (const pr of pullRequests) {
    const area = inferArea(pr.title);
    byArea.set(area, (byArea.get(area) || 0) + 1);
  }

  return Array.from(byArea.entries())
    .map(([area, count]) => ({ area, count }))
    .sort((left, right) => right.count - left.count || left.area.localeCompare(right.area));
}

export function toMarkdown({ repo, author, state, pullRequests }) {
  const lines = [
    `# Pull Request Summary for ${author}`,
    '',
    `- Repository: ${repo}`,
    `- State filter: ${state}`,
    `- Total PRs: ${pullRequests.length}`,
    ''
  ];

  const summary = summarizePullRequests(pullRequests);

  if (summary.length > 0) {
    lines.push('## Work areas');

    for (const item of summary) {
      lines.push(`- ${item.area}: ${item.count}`);
    }

    lines.push('');
  }

  lines.push('## Pull requests');

  for (const pr of pullRequests) {
    lines.push(`- [#${pr.number}](${pr.url}): ${pr.title}`);
  }

  return `${lines.join('\n')}\n`;
}

export function toTable({ pullRequests }) {
  const rows = [['Number', 'Area', 'State', 'Title']];

  for (const pr of pullRequests) {
    rows.push([`#${pr.number}`, inferArea(pr.title), pr.state, pr.title]);
  }

  const widths = rows[0].map((_, columnIndex) =>
    Math.max(...rows.map((row) => row[columnIndex].length))
  );

  return rows
    .map((row, rowIndex) => {
      const padded = row.map((cell, columnIndex) => cell.padEnd(widths[columnIndex])).join(' | ');
      if (rowIndex === 0) {
        const separator = widths.map((width) => '-'.repeat(width)).join('-|-');
        return `${padded}\n${separator}`;
      }

      return padded;
    })
    .join('\n');
}

export function normalizeState(value) {
  const state = String(value || 'merged').trim().toLowerCase();

  if (!['merged', 'open', 'closed', 'all'].includes(state)) {
    throw new Error(`Invalid state "${value}". Use merged, open, closed, or all.`);
  }

  return state;
}

export function buildSearchQuery({ repo, author, state }) {
  const parts = [`repo:${repo}`, 'type:pr', `author:${author}`];

  if (state === 'merged') {
    parts.push('is:merged');
  } else if (state === 'open') {
    parts.push('is:open');
  } else if (state === 'closed') {
    parts.push('is:closed');
  }

  return parts.join(' ');
}

export async function getAccessToken({ execFileSync }) {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  if (process.env.GH_TOKEN) {
    return process.env.GH_TOKEN;
  }

  if (!execFileSync) {
    return undefined;
  }

  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function fetchPullRequests({
  repo,
  author,
  state,
  limit,
  fetchImpl,
  token
}) {
  const url = new URL('https://api.github.com/search/issues');
  url.searchParams.set('q', buildSearchQuery({ repo, author, state }));
  url.searchParams.set('per_page', String(limit));

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'agents-pr-tools'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetchImpl(url, { headers });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed with ${response.status}: ${body}`);
  }

  const payload = await response.json();

  return (payload.items || []).slice(0, limit).map((item) => ({
    number: item.number,
    title: item.title,
    url: item.html_url,
    state: item.state,
    createdAt: item.created_at,
    closedAt: item.closed_at
  }));
}

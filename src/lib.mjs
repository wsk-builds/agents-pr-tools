const AREA_RULES = [
  { area: 'agents-extensions', patterns: [/agents-extensions/i, /ai sdk/i] },
  { area: 'agents-realtime', patterns: [/agents-realtime/i, /\brealtime\b/i, /\bvad\b/i, /\bsip\b/i] },
  { area: 'agents-core', patterns: [/agents-core/i, /\bmcp\b/i, /\brunstate\b/i] },
  { area: 'docs', patterns: [/^docs\b/i, /readme/i, /example/i] },
  { area: 'tests', patterns: [/^test\b/i, /\bcoverage\b/i, /\bflaky\b/i] },
  { area: 'maintenance', patterns: [/^chore\b/i, /\bhusky\b/i, /\bworkflow\b/i, /\bci\b/i] }
];

const KNOWN_AREAS = [...new Set([...AREA_RULES.map((rule) => rule.area), 'other'])];
const VALID_STATES = new Set(['merged', 'open', 'closed', 'all']);
const VALID_FORMATS = new Set(['markdown', 'table', 'json', 'csv', 'release-notes']);
const VALID_SORTS = new Set(['created', 'updated']);
const VALID_ORDERS = new Set(['desc', 'asc']);

function splitCommaSeparated(value, fieldName) {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    throw new Error(`Missing ${fieldName} value.`);
  }

  const items = trimmed
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    throw new Error(`Missing ${fieldName} value.`);
  }

  return [...new Set(items)];
}

function formatList(values) {
  return values.join(', ');
}

function compareStrings(left, right, order) {
  const comparison = left.localeCompare(right);
  return order === 'asc' ? comparison : -comparison;
}

function normalizeAreaList(areas) {
  if (!areas) {
    return [];
  }

  if (Array.isArray(areas)) {
    const normalized = areas.map((area) => String(area || '').trim().toLowerCase()).filter(Boolean);
    const invalid = normalized.find((area) => !KNOWN_AREAS.includes(area));

    if (invalid) {
      throw new Error(`Invalid area "${invalid}". Known areas: ${KNOWN_AREAS.join(', ')}.`);
    }

    return [...new Set(normalized)];
  }

  return parseAreaFilter(areas);
}

export function getKnownAreas() {
  return [...KNOWN_AREAS];
}

export function parseRepo(value) {
  const trimmed = String(value || '').trim();
  const parts = trimmed.split('/');

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repository "${value}". Expected owner/name.`);
  }

  return { owner: parts[0], name: parts[1], fullName: trimmed };
}

export function parseAuthorLogins(value) {
  return splitCommaSeparated(value, 'author').map((author) => author.toLowerCase());
}

export async function fetchViewerLogin({ fetchImpl, token }) {
  if (!token) {
    throw new Error(
      '--author @me requires GitHub authentication via GITHUB_TOKEN, GH_TOKEN, or gh auth login.'
    );
  }

  const payload = await readJson(
    await fetchImpl(new URL('https://api.github.com/user'), {
      headers: buildHeaders(token)
    })
  );

  const login = String(payload.login || '')
    .trim()
    .toLowerCase();

  if (!login) {
    throw new Error('Unable to resolve the authenticated GitHub login for --author @me.');
  }

  return login;
}

export async function resolveAuthorLogins({ authors, fetchImpl, token }) {
  const normalizedAuthors = Array.isArray(authors) ? authors : parseAuthorLogins(authors);

  if (!normalizedAuthors.includes('@me')) {
    return normalizedAuthors;
  }

  const viewerLogin = await fetchViewerLogin({ fetchImpl, token });
  return [...new Set(normalizedAuthors.map((author) => (author === '@me' ? viewerLogin : author)))];
}

export function parseAreaFilter(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return [];
  }

  const areas = splitCommaSeparated(value, 'area').map((area) => area.toLowerCase());
  const invalid = areas.find((area) => !KNOWN_AREAS.includes(area));

  if (invalid) {
    throw new Error(`Invalid area "${invalid}". Known areas: ${KNOWN_AREAS.join(', ')}.`);
  }

  return areas;
}

export function inferArea(title) {
  for (const rule of AREA_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(title))) {
      return rule.area;
    }
  }

  return 'other';
}

export function canonicalizeState(pullRequest) {
  if (pullRequest.mergedAt) {
    return 'merged';
  }

  return pullRequest.state === 'open' ? 'open' : 'closed';
}

export function summarizePullRequests(pullRequests) {
  const byArea = new Map();

  for (const pr of pullRequests) {
    const area = pr.area || inferArea(pr.title);
    byArea.set(area, (byArea.get(area) || 0) + 1);
  }

  return Array.from(byArea.entries())
    .map(([area, count]) => ({ area, count }))
    .sort((left, right) => right.count - left.count || left.area.localeCompare(right.area));
}

export function summarizeStates(pullRequests) {
  const byState = new Map();

  for (const pr of pullRequests) {
    const state = canonicalizeState(pr);
    byState.set(state, (byState.get(state) || 0) + 1);
  }

  return Array.from(byState.entries())
    .map(([state, count]) => ({ state, count }))
    .sort((left, right) => right.count - left.count || left.state.localeCompare(right.state));
}

export function summarizeAuthors(pullRequests) {
  const byAuthor = new Map();

  for (const pr of pullRequests) {
    const author = pr.author || 'unknown';
    byAuthor.set(author, (byAuthor.get(author) || 0) + 1);
  }

  return Array.from(byAuthor.entries())
    .map(([author, count]) => ({ author, count }))
    .sort((left, right) => right.count - left.count || left.author.localeCompare(right.author));
}

export function normalizeFormat(value) {
  const format = String(value || 'markdown').trim().toLowerCase();

  if (!VALID_FORMATS.has(format)) {
    throw new Error(`Invalid format "${value}". Use markdown, table, json, csv, or release-notes.`);
  }

  return format;
}

export function normalizeState(value) {
  const state = String(value || 'merged').trim().toLowerCase();

  if (!VALID_STATES.has(state)) {
    throw new Error(`Invalid state "${value}". Use merged, open, closed, or all.`);
  }

  return state;
}

export function normalizeSort(value) {
  const sort = String(value || 'created').trim().toLowerCase();

  if (!VALID_SORTS.has(sort)) {
    throw new Error(`Invalid sort "${value}". Use created or updated.`);
  }

  return sort;
}

export function normalizeOrder(value) {
  const order = String(value || 'desc').trim().toLowerCase();

  if (!VALID_ORDERS.has(order)) {
    throw new Error(`Invalid order "${value}". Use desc or asc.`);
  }

  return order;
}

export function parseDateInput(value, { fieldName, endOfDay = false } = {}) {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    throw new Error(`Missing ${fieldName || 'date'} value.`);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    return new Date(`${trimmed}${suffix}`).toISOString();
  }

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${fieldName || 'date'} "${value}". Use ISO-8601 like 2026-04-01.`);
  }

  return date.toISOString();
}

export function normalizeDateRange({ since, until } = {}) {
  const normalized = {
    since: since ? parseDateInput(since, { fieldName: 'since' }) : undefined,
    until: until ? parseDateInput(until, { fieldName: 'until', endOfDay: true }) : undefined
  };

  if (normalized.since && normalized.until && normalized.since > normalized.until) {
    throw new Error(`Invalid date range: since "${since}" is after until "${until}".`);
  }

  return normalized;
}

export function getDateFieldForState(state) {
  if (state === 'merged') {
    return 'mergedAt';
  }

  if (state === 'closed') {
    return 'closedAt';
  }

  return 'createdAt';
}

export function getDateLabelForState(state) {
  if (state === 'merged') {
    return 'merged';
  }

  if (state === 'closed') {
    return 'closed';
  }

  return 'created';
}

export function filterPullRequestsByDateRange(pullRequests, { state, since, until }) {
  const dateField = getDateFieldForState(state);

  return pullRequests.filter((pr) => {
    const value = pr[dateField];

    if (!value) {
      return false;
    }

    if (since && value < since) {
      return false;
    }

    if (until && value > until) {
      return false;
    }

    return true;
  });
}

export function filterPullRequestsByArea(pullRequests, { areas }) {
  const normalizedAreas = normalizeAreaList(areas);

  if (normalizedAreas.length === 0) {
    return pullRequests;
  }

  const areaSet = new Set(normalizedAreas);
  return pullRequests.filter((pr) => areaSet.has(pr.area || inferArea(pr.title)));
}

export function sortPullRequests(pullRequests, { sort, order }) {
  const dateField = sort === 'updated' ? 'updatedAt' : 'createdAt';

  return [...pullRequests].sort((left, right) => {
    const primary = compareStrings(left[dateField] || '', right[dateField] || '', order);

    if (primary !== 0) {
      return primary;
    }

    return order === 'asc' ? left.number - right.number : right.number - left.number;
  });
}

export function buildSummaryPayload({
  repo,
  authors,
  state,
  pullRequests,
  since,
  until,
  sort,
  order,
  areas
}) {
  const payload = {
    repo,
    authors,
    state,
    totalPullRequests: pullRequests.length,
    sort,
    order,
    byArea: summarizePullRequests(pullRequests),
    byState: summarizeStates(pullRequests),
    byAuthor: summarizeAuthors(pullRequests)
  };

  if (since || until) {
    payload.dateRange = {
      field: getDateLabelForState(state),
      since: since || null,
      until: until || null
    };
  }

  if (areas && areas.length > 0) {
    payload.areaFilter = [...areas];
  }

  return payload;
}

function appendMarkdownSummary(lines, { authors, state, pullRequests }) {
  const stateSummary = summarizeStates(pullRequests);
  const authorSummary = summarizeAuthors(pullRequests);
  const areaSummary = summarizePullRequests(pullRequests);

  if (authorSummary.length > 1 || authors.length > 1) {
    lines.push('## Author totals');

    for (const item of authorSummary) {
      lines.push(`- ${item.author}: ${item.count}`);
    }

    lines.push('');
  }

  if (stateSummary.length > 1 || state === 'all') {
    lines.push('## State totals');

    for (const item of stateSummary) {
      lines.push(`- ${item.state}: ${item.count}`);
    }

    lines.push('');
  }

  if (areaSummary.length > 0) {
    lines.push('## Work areas');

    for (const item of areaSummary) {
      lines.push(`- ${item.area}: ${item.count}`);
    }

    lines.push('');
  }
}

export function toMarkdown({
  repo,
  authors,
  state,
  pullRequests,
  since,
  until,
  sort,
  order,
  areas = [],
  summaryOnly = false
}) {
  const lines = [
    `# Pull Request Summary for ${formatList(authors)}`,
    '',
    `- Repository: ${repo}`,
    `${authors.length > 1 ? '- Authors' : '- Author'}: ${formatList(authors)}`,
    `- State filter: ${state}`,
    `- Total PRs: ${pullRequests.length}`,
    `- Sort: ${sort} ${order}`
  ];

  if (areas.length > 0) {
    lines.push(`- Area filter: ${formatList(areas)}`);
  }

  if (since || until) {
    lines.push(
      `- Date window (${getDateLabelForState(state)}): ${since || '...'} -> ${until || '...'}`
    );
  }

  lines.push('');
  appendMarkdownSummary(lines, { authors, state, pullRequests });

  if (summaryOnly) {
    return `${lines.join('\n')}\n`;
  }

  lines.push('## Pull requests');

  if (pullRequests.length === 0) {
    lines.push('- No pull requests matched.');
    return `${lines.join('\n')}\n`;
  }

  for (const pr of pullRequests) {
    lines.push(`- [#${pr.number}](${pr.url}) [${pr.state}] [${pr.area}] @${pr.author}: ${pr.title}`);
  }

  return `${lines.join('\n')}\n`;
}

function renderTable(rows) {
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

export function toTable({
  repo,
  authors,
  state,
  pullRequests,
  since,
  until,
  sort,
  order,
  areas = [],
  summaryOnly = false
}) {
  const sections = [
    `Pull Request Summary for ${formatList(authors)}`,
    `Repository: ${repo}`,
    `${authors.length > 1 ? 'Authors' : 'Author'}: ${formatList(authors)}`,
    `State filter: ${state}`,
    `Total PRs: ${pullRequests.length}`,
    `Sort: ${sort} ${order}`
  ];

  if (areas.length > 0) {
    sections.push(`Area filter: ${formatList(areas)}`);
  }

  if (since || until) {
    sections.push(`Date window (${getDateLabelForState(state)}): ${since || '...'} -> ${until || '...'}`);
  }

  const authorSummary = summarizeAuthors(pullRequests);
  const stateSummary = summarizeStates(pullRequests);
  const areaSummary = summarizePullRequests(pullRequests);

  if (authorSummary.length > 1 || authors.length > 1) {
    sections.push('');
    sections.push('Author totals');
    sections.push(
      renderTable([
        ['Author', 'Count'],
        ...authorSummary.map((item) => [item.author, String(item.count)])
      ])
    );
  }

  if (stateSummary.length > 1 || state === 'all') {
    sections.push('');
    sections.push('State totals');
    sections.push(
      renderTable([
        ['State', 'Count'],
        ...stateSummary.map((item) => [item.state, String(item.count)])
      ])
    );
  }

  if (areaSummary.length > 0) {
    sections.push('');
    sections.push('Work areas');
    sections.push(
      renderTable([
        ['Area', 'Count'],
        ...areaSummary.map((item) => [item.area, String(item.count)])
      ])
    );
  }

  if (summaryOnly) {
    return `${sections.join('\n')}\n`;
  }

  sections.push('');
  sections.push('Pull requests');

  if (pullRequests.length === 0) {
    sections.push('No pull requests matched.');
    return `${sections.join('\n')}\n`;
  }

  sections.push(
    renderTable([
      ['Number', 'Author', 'Area', 'State', 'Created', 'Title'],
      ...pullRequests.map((pr) => [
        `#${pr.number}`,
        pr.author,
        pr.area,
        pr.state,
        pr.createdAt.slice(0, 10),
        pr.title
      ])
    ])
  );

  return `${sections.join('\n')}\n`;
}

function escapeCsvCell(value) {
  const stringValue = String(value ?? '');

  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

export function toCsv({ pullRequests }) {
  const rows = [
    [
      'number',
      'author',
      'area',
      'state',
      'createdAt',
      'updatedAt',
      'closedAt',
      'mergedAt',
      'title',
      'url'
    ],
    ...pullRequests.map((pr) => [
      pr.number,
      pr.author,
      pr.area,
      pr.state,
      pr.createdAt,
      pr.updatedAt,
      pr.closedAt || '',
      pr.mergedAt || '',
      pr.title,
      pr.url
    ])
  ];

  return `${rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n')}\n`;
}

export function toReleaseNotes({
  repo,
  authors,
  state,
  pullRequests,
  since,
  until,
  sort,
  order,
  areas = []
}) {
  const lines = [
    `# Release Notes for ${repo}`,
    '',
    `${authors.length > 1 ? '- Authors' : '- Author'}: ${formatList(authors)}`,
    `- State filter: ${state}`,
    `- Total PRs: ${pullRequests.length}`,
    `- Sort: ${sort} ${order}`
  ];

  if (areas.length > 0) {
    lines.push(`- Area filter: ${formatList(areas)}`);
  }

  if (since || until) {
    lines.push(
      `- Date window (${getDateLabelForState(state)}): ${since || '...'} -> ${until || '...'}`
    );
  }

  lines.push('');

  if (pullRequests.length === 0) {
    lines.push('No pull requests matched.');
    return `${lines.join('\n')}\n`;
  }

  const grouped = new Map();

  for (const pr of pullRequests) {
    const area = pr.area || inferArea(pr.title);

    if (!grouped.has(area)) {
      grouped.set(area, []);
    }

    grouped.get(area).push(pr);
  }

  for (const { area } of summarizePullRequests(pullRequests)) {
    lines.push(`## ${area}`);

    for (const pr of grouped.get(area) || []) {
      const authorSuffix = authors.length > 1 ? `, @${pr.author}` : '';
      lines.push(`- ${pr.title} ([#${pr.number}](${pr.url})${authorSuffix})`);
    }

    lines.push('');
  }

  return `${lines.join('\n')}\n`;
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

async function readJson(response) {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed with ${response.status}: ${body}`);
  }

  return response.json();
}

function buildHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'agents-pr-tools'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function fetchSearchPage({
  repo,
  author,
  state,
  page,
  perPage,
  sort,
  order,
  fetchImpl,
  headers
}) {
  const url = new URL('https://api.github.com/search/issues');
  url.searchParams.set('q', buildSearchQuery({ repo, author, state }));
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('page', String(page));
  url.searchParams.set('sort', sort);
  url.searchParams.set('order', order);

  const payload = await readJson(await fetchImpl(url, { headers }));
  return payload.items || [];
}

async function fetchPullRequestDetail({ repo, number, fetchImpl, headers }) {
  const detailUrl = new URL(`https://api.github.com/repos/${repo}/pulls/${number}`);
  return readJson(await fetchImpl(detailUrl, { headers }));
}

function normalizePullRequest(detail) {
  return {
    number: detail.number,
    title: detail.title,
    url: detail.html_url,
    author: detail.user?.login || 'unknown',
    area: inferArea(detail.title),
    state: canonicalizeState({
      state: detail.state,
      mergedAt: detail.merged_at
    }),
    createdAt: detail.created_at,
    updatedAt: detail.updated_at,
    closedAt: detail.closed_at,
    mergedAt: detail.merged_at
  };
}

export async function fetchPullRequests({
  repo,
  author,
  state,
  limit,
  sort = 'created',
  order = 'desc',
  since,
  until,
  areas = [],
  fetchImpl,
  token
}) {
  const normalizedLimit = Number.parseInt(String(limit), 10);

  if (!Number.isInteger(normalizedLimit) || normalizedLimit <= 0) {
    throw new Error(`Invalid limit "${limit}".`);
  }

  const headers = buildHeaders(token);
  const dateRange = normalizeDateRange({ since, until });
  const normalizedAreas = normalizeAreaList(areas);
  const results = [];
  const seen = new Set();
  const pageSize = Math.min(normalizedLimit, 100);
  let page = 1;

  while (results.length < normalizedLimit) {
    const items = await fetchSearchPage({
      repo,
      author,
      state,
      page,
      perPage: pageSize,
      sort,
      order,
      fetchImpl,
      headers
    });

    if (items.length === 0) {
      break;
    }

    const nextNumbers = items
      .map((item) => item.number)
      .filter((number) => !seen.has(number));

    for (const number of nextNumbers) {
      seen.add(number);
    }

    const detailedPullRequests = await Promise.all(
      nextNumbers.map((number) => fetchPullRequestDetail({ repo, number, fetchImpl, headers }))
    );

    const normalizedPullRequests = detailedPullRequests
      .map((detail) => normalizePullRequest(detail))
      .filter((pr) => state === 'all' || pr.state === state);

    const filteredPullRequests = filterPullRequestsByArea(
      filterPullRequestsByDateRange(normalizedPullRequests, {
        state,
        ...dateRange
      }),
      { areas: normalizedAreas }
    );

    for (const pr of filteredPullRequests) {
      results.push(pr);

      if (results.length >= normalizedLimit) {
        break;
      }
    }

    if (items.length < pageSize) {
      break;
    }

    page += 1;
  }

  return sortPullRequests(results, { sort, order });
}

export async function fetchPullRequestsForAuthors({
  repo,
  authors,
  state,
  limit,
  sort = 'created',
  order = 'desc',
  since,
  until,
  areas = [],
  fetchImpl,
  token
}) {
  const normalizedAuthors = Array.isArray(authors) ? authors : parseAuthorLogins(authors);
  const normalizedLimit = Number.parseInt(String(limit), 10);

  if (!Number.isInteger(normalizedLimit) || normalizedLimit <= 0) {
    throw new Error(`Invalid limit "${limit}".`);
  }

  const resultsByAuthor = await Promise.all(
    normalizedAuthors.map((author) =>
      fetchPullRequests({
        repo,
        author,
        state,
        limit: normalizedLimit,
        sort,
        order,
        since,
        until,
        areas,
        fetchImpl,
        token
      })
    )
  );

  const deduped = new Map();

  for (const pr of resultsByAuthor.flat()) {
    if (!deduped.has(pr.number)) {
      deduped.set(pr.number, pr);
    }
  }

  return sortPullRequests([...deduped.values()], { sort, order }).slice(0, normalizedLimit);
}

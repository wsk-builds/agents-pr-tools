const AREA_RULES = [
  { area: 'agents-extensions', patterns: [/agents-extensions/i, /ai sdk/i] },
  { area: 'agents-realtime', patterns: [/agents-realtime/i, /\brealtime\b/i, /\bvad\b/i, /\bsip\b/i] },
  { area: 'agents-openai', patterns: [/agents-openai/i, /\bresponses?\b/i, /\bchat completions?\b/i] },
  { area: 'agents-core', patterns: [/agents-core/i, /\bmcp\b/i, /\brunstate\b/i] },
  { area: 'docs', patterns: [/^docs\b/i, /readme/i, /example/i] },
  { area: 'tests', patterns: [/^test\b/i, /\bcoverage\b/i, /\bflaky\b/i] },
  { area: 'maintenance', patterns: [/^chore\b/i, /\bhusky\b/i, /\bworkflow\b/i, /\bci\b/i] }
];

const KNOWN_AREAS = [...new Set([...AREA_RULES.map((rule) => rule.area), 'other'])];
const VALID_STATES = new Set(['merged', 'open', 'closed', 'all']);
const VALID_FORMATS = new Set([
  'markdown',
  'table',
  'json',
  'csv',
  'release-notes',
  'maintainer-brief'
]);
const VALID_SORTS = new Set(['created', 'updated']);
const VALID_ORDERS = new Set(['desc', 'asc']);
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function normalizeLabelList(labels) {
  if (!labels) {
    return [];
  }

  const values = Array.isArray(labels) ? labels : splitCommaSeparated(labels, 'label');

  return [
    ...new Set(
      values
        .map((label) => {
          if (typeof label === 'string') {
            return label;
          }

          return label?.name;
        })
        .map((label) => String(label || '').trim().toLowerCase())
        .filter(Boolean)
    )
  ];
}

function hasExactOrScopedLabel(labels, candidates) {
  return labels.some((label) =>
    candidates.some((candidate) => label === candidate || label === `package:${candidate}`)
  );
}

function inferAreaFromTitlePriority(title) {
  const normalizedTitle = String(title || '').trim();

  if (/^docs\b/i.test(normalizedTitle)) {
    return 'docs';
  }

  if (/^test\b/i.test(normalizedTitle)) {
    return 'tests';
  }

  return undefined;
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

  const payload = await requestJson({
    url: new URL('https://api.github.com/user'),
    fetchImpl,
    requestState: {
      token,
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS
    }
  });

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

export function parseLabelFilter(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return [];
  }

  return normalizeLabelList(value);
}

export function inferArea(title, labels = []) {
  const normalizedLabels = normalizeLabelList(labels);
  const normalizedTitle = String(title || '').trim();
  const titlePriorityArea = inferAreaFromTitlePriority(normalizedTitle);

  if (titlePriorityArea) {
    return titlePriorityArea;
  }

  if (hasExactOrScopedLabel(normalizedLabels, ['agents-extensions'])) {
    return 'agents-extensions';
  }

  if (
    hasExactOrScopedLabel(normalizedLabels, ['agents-realtime']) ||
    normalizedLabels.some((label) => ['realtime', 'vad', 'sip', 'voice'].includes(label))
  ) {
    return 'agents-realtime';
  }

  if (
    hasExactOrScopedLabel(normalizedLabels, ['agents-core']) ||
    normalizedLabels.some((label) => ['core', 'mcp', 'runstate'].includes(label))
  ) {
    return 'agents-core';
  }

  if (hasExactOrScopedLabel(normalizedLabels, ['agents-openai'])) {
    return 'agents-openai';
  }

  if (
    normalizedLabels.some((label) => ['docs', 'documentation', 'readme', 'examples'].includes(label))
  ) {
    return 'docs';
  }

  if (normalizedLabels.some((label) => ['test', 'tests', 'coverage', 'qa'].includes(label))) {
    return 'tests';
  }

  if (
    normalizedLabels.some((label) =>
      ['maintenance', 'chore', 'ci', 'workflow', 'dependencies'].includes(label)
    )
  ) {
    return 'maintenance';
  }

  for (const rule of AREA_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalizedTitle))) {
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
    const area = pr.area || inferArea(pr.title, pr.labels);
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

export function summarizeLabels(pullRequests) {
  const byLabel = new Map();

  for (const pr of pullRequests) {
    for (const label of normalizeLabelList(pr.labels)) {
      byLabel.set(label, (byLabel.get(label) || 0) + 1);
    }
  }

  return Array.from(byLabel.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function normalizeFormat(value) {
  const format = String(value || 'markdown').trim().toLowerCase();

  if (!VALID_FORMATS.has(format)) {
    throw new Error(
      `Invalid format "${value}". Use markdown, table, json, csv, release-notes, or maintainer-brief.`
    );
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
  return pullRequests.filter((pr) => areaSet.has(pr.area || inferArea(pr.title, pr.labels)));
}

export function filterPullRequestsByLabels(pullRequests, { labels }) {
  const normalizedLabels = normalizeLabelList(labels);

  if (normalizedLabels.length === 0) {
    return pullRequests;
  }

  const labelSet = new Set(normalizedLabels);

  return pullRequests.filter((pr) => normalizeLabelList(pr.labels).some((label) => labelSet.has(label)));
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
  areas,
  labels
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
    byAuthor: summarizeAuthors(pullRequests),
    byLabel: summarizeLabels(pullRequests)
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

  if (labels && labels.length > 0) {
    payload.labelFilter = [...labels];
  }

  return payload;
}

function appendMarkdownSummary(lines, { authors, state, pullRequests }) {
  const stateSummary = summarizeStates(pullRequests);
  const authorSummary = summarizeAuthors(pullRequests);
  const areaSummary = summarizePullRequests(pullRequests);
  const labelSummary = summarizeLabels(pullRequests);

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

  if (labelSummary.length > 0) {
    lines.push('## Labels');

    for (const item of labelSummary) {
      lines.push(`- ${item.label}: ${item.count}`);
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
  labels = [],
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

  if (labels.length > 0) {
    lines.push(`- Label filter: ${formatList(labels)}`);
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
    const labelSuffix = pr.labels?.length ? ` [labels: ${formatList(pr.labels)}]` : '';
    lines.push(
      `- [#${pr.number}](${pr.url}) [${pr.state}] [${pr.area}]${labelSuffix} @${pr.author}: ${pr.title}`
    );
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
  labels = [],
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

  if (labels.length > 0) {
    sections.push(`Label filter: ${formatList(labels)}`);
  }

  if (since || until) {
    sections.push(`Date window (${getDateLabelForState(state)}): ${since || '...'} -> ${until || '...'}`);
  }

  const authorSummary = summarizeAuthors(pullRequests);
  const stateSummary = summarizeStates(pullRequests);
  const areaSummary = summarizePullRequests(pullRequests);
  const labelSummary = summarizeLabels(pullRequests);

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

  if (labelSummary.length > 0) {
    sections.push('');
    sections.push('Label totals');
    sections.push(
      renderTable([
        ['Label', 'Count'],
        ...labelSummary.map((item) => [item.label, String(item.count)])
      ])
    );
  }

  if (summaryOnly) {
    return `${sections.join('\n')}\n`;
  }

  const includeLabelsColumn = pullRequests.some((pr) => pr.labels && pr.labels.length > 0);

  sections.push('');
  sections.push('Pull requests');

  if (pullRequests.length === 0) {
    sections.push('No pull requests matched.');
    return `${sections.join('\n')}\n`;
  }

  sections.push(
    renderTable([
      includeLabelsColumn
        ? ['Number', 'Author', 'Area', 'Labels', 'State', 'Created', 'Title']
        : ['Number', 'Author', 'Area', 'State', 'Created', 'Title'],
      ...pullRequests.map((pr) =>
        includeLabelsColumn
          ? [
              `#${pr.number}`,
              pr.author,
              pr.area,
              formatList(pr.labels || []),
              pr.state,
              pr.createdAt.slice(0, 10),
              pr.title
            ]
          : [`#${pr.number}`, pr.author, pr.area, pr.state, pr.createdAt.slice(0, 10), pr.title]
      )
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
      'labels',
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
      formatList(pr.labels || []),
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
  areas = [],
  labels = []
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

  if (labels.length > 0) {
    lines.push(`- Label filter: ${formatList(labels)}`);
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
    const area = pr.area || inferArea(pr.title, pr.labels);

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

function latestDateForPullRequest(pr) {
  return pr.mergedAt || pr.closedAt || pr.updatedAt || pr.createdAt || '';
}

function formatPullRequestLine(pr) {
  const date = latestDateForPullRequest(pr).slice(0, 10) || 'unknown date';
  const labels = pr.labels?.length ? `; labels: ${formatList(pr.labels)}` : '';
  return [
    `- [#${pr.number}](${pr.url})`,
    `[${pr.area}]`,
    `[${pr.state}]`,
    `${pr.title} (@${pr.author}, ${date}${labels})`
  ].join(' ');
}

function appendTopPullRequests(lines, { title, pullRequests, limit = 5 }) {
  lines.push(`## ${title}`);

  if (pullRequests.length === 0) {
    lines.push('- No matching pull requests.');
    lines.push('');
    return;
  }

  for (const pr of pullRequests.slice(0, limit)) {
    lines.push(formatPullRequestLine(pr));
  }

  lines.push('');
}

export function toMaintainerBrief({
  repo,
  authors,
  state,
  pullRequests,
  since,
  until,
  sort,
  order,
  areas = [],
  labels = []
}) {
  const mergedPullRequests = pullRequests.filter((pr) => pr.state === 'merged');
  const mergedMaintenancePullRequests = mergedPullRequests.filter((pr) => pr.area === 'maintenance');
  const openPullRequests = pullRequests.filter((pr) => pr.state === 'open');
  const areaSummary = summarizePullRequests(pullRequests);
  const labelSummary = summarizeLabels(pullRequests);
  const lines = [
    `# Maintainer Brief for ${repo}`,
    '',
    `- ${authors.length > 1 ? 'Authors' : 'Author'}: ${formatList(authors)}`,
    `- State filter: ${state}`,
    `- Total PRs analyzed: ${pullRequests.length}`,
    `- Sort: ${sort} ${order}`
  ];

  if (areas.length > 0) {
    lines.push(`- Area filter: ${formatList(areas)}`);
  }

  if (labels.length > 0) {
    lines.push(`- Label filter: ${formatList(labels)}`);
  }

  if (since || until) {
    lines.push(
      `- Date window (${getDateLabelForState(state)}): ${since || '...'} -> ${until || '...'}`
    );
  }

  lines.push('');
  lines.push('## Maintenance Snapshot');
  lines.push(`- Merged pull requests: ${mergedPullRequests.length}`);
  lines.push(`- Merged maintenance work: ${mergedMaintenancePullRequests.length}`);
  lines.push(`- Open review queue: ${openPullRequests.length}`);
  lines.push(`- Covered work areas: ${areaSummary.map((item) => item.area).join(', ') || 'none'}`);

  if (labelSummary.length > 0) {
    const topLabels = labelSummary
      .slice(0, 6)
      .map((item) => `${item.label} (${item.count})`)
      .join(', ');
    lines.push(`- Top labels: ${topLabels}`);
  }

  lines.push('');
  lines.push('## Work Area Coverage');

  if (areaSummary.length === 0) {
    lines.push('- No matching pull requests.');
  } else {
    for (const item of areaSummary) {
      lines.push(`- ${item.area}: ${item.count}`);
    }
  }

  lines.push('');
  appendTopPullRequests(lines, {
    title: 'Open Review Queue',
    pullRequests: openPullRequests,
    limit: 10
  });
  appendTopPullRequests(lines, {
    title: 'Release-Note Candidates',
    pullRequests: mergedPullRequests,
    limit: 10
  });
  lines.push('## Maintainer Handoff');
  lines.push('- Use the open queue to decide what needs review, validation, or follow-up.');
  lines.push('- Use release-note candidates to prepare changelog entries grouped by SDK area.');
  lines.push('- Use work-area coverage to spot runtime, docs, tests, and workflow concentration.');

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

function getHeader(headers, name) {
  if (!headers) {
    return undefined;
  }

  if (typeof headers.get === 'function') {
    return headers.get(name) || undefined;
  }

  const lowerName = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === lowerName);
  return entry ? String(entry[1]) : undefined;
}

function getRateLimitDetails(response) {
  const retryAfter = getHeader(response.headers, 'retry-after');
  const remaining = getHeader(response.headers, 'x-ratelimit-remaining');
  const reset = getHeader(response.headers, 'x-ratelimit-reset');
  const details = [];

  if (retryAfter) {
    details.push(`retry-after=${retryAfter}s`);
  }

  if (remaining) {
    details.push(`rate-limit-remaining=${remaining}`);
  }

  if (reset) {
    const resetTime = new Date(Number.parseInt(reset, 10) * 1000);
    details.push(
      Number.isNaN(resetTime.getTime())
        ? `rate-limit-reset=${reset}`
        : `rate-limit-reset=${resetTime.toISOString()}`
    );
  }

  return details.join(', ');
}

function parseRetryAfterMs(value) {
  if (!value) {
    return undefined;
  }

  const seconds = Number.parseFloat(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return undefined;
}

async function readJson(response) {
  const body = await response.text();
  let payload;

  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const rateLimitDetails = getRateLimitDetails(response);
    const suffix = rateLimitDetails ? ` (${rateLimitDetails})` : '';
    const error = new Error(`GitHub API request failed with ${response.status}: ${body}${suffix}`);
    error.status = response.status;
    error.body = body;
    error.retryAfterMs = parseRetryAfterMs(getHeader(response.headers, 'retry-after'));
    error.rateLimitRemaining = getHeader(response.headers, 'x-ratelimit-remaining');
    throw error;
  }

  if (payload === null) {
    throw new Error('GitHub API returned an empty or invalid JSON response.');
  }

  return payload;
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
  requestState
}) {
  const url = new URL('https://api.github.com/search/issues');
  url.searchParams.set('q', buildSearchQuery({ repo, author, state }));
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('page', String(page));
  url.searchParams.set('sort', sort);
  url.searchParams.set('order', order);

  const payload = await requestJson({ url, fetchImpl, requestState, allowAnonymousFallback: true });
  return payload.items || [];
}

async function fetchPullRequestDetail({ repo, number, fetchImpl, requestState }) {
  const detailUrl = new URL(`https://api.github.com/repos/${repo}/pulls/${number}`);
  return requestJson({
    url: detailUrl,
    fetchImpl,
    requestState,
    allowAnonymousFallback: true
  });
}

function normalizePullRequest(detail, { labels = [] } = {}) {
  const normalizedTitle = String(detail.title || '').trim();
  const normalizedLabels = normalizeLabelList(detail.labels?.length ? detail.labels : labels);

  return {
    number: detail.number,
    title: normalizedTitle,
    url: detail.html_url,
    author: detail.user?.login || 'unknown',
    area: inferArea(normalizedTitle, normalizedLabels),
    labels: normalizedLabels,
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
  labels = [],
  fetchImpl,
  token,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS
}) {
  const normalizedLimit = Number.parseInt(String(limit), 10);

  if (!Number.isInteger(normalizedLimit) || normalizedLimit <= 0) {
    throw new Error(`Invalid limit "${limit}".`);
  }

  const dateRange = normalizeDateRange({ since, until });
  const normalizedAreas = normalizeAreaList(areas);
  const normalizedLabels = normalizeLabelList(labels);
  const requestState = { token, requestTimeoutMs, maxRetries, retryDelayMs };
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
      requestState
    });

    if (items.length === 0) {
      break;
    }

    const nextItems = items.filter((item) => !seen.has(item.number));

    for (const item of nextItems) {
      seen.add(item.number);
    }

    const detailedPullRequests = await Promise.all(
      nextItems.map(async (item) => {
        const detail = await fetchPullRequestDetail({
          repo,
          number: item.number,
          fetchImpl,
          requestState
        });

        return normalizePullRequest(detail, { labels: item.labels });
      })
    );

    const normalizedPullRequests = detailedPullRequests.filter((pr) => state === 'all' || pr.state === state);

    const filteredPullRequests = filterPullRequestsByLabels(
      filterPullRequestsByArea(
        filterPullRequestsByDateRange(normalizedPullRequests, {
          state,
          ...dateRange
        }),
        { areas: normalizedAreas }
      ),
      { labels: normalizedLabels }
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
  labels = [],
  fetchImpl,
  token,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS
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
        labels,
        fetchImpl,
        token,
        requestTimeoutMs,
        maxRetries,
        retryDelayMs
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

function shouldRetryWithoutAuth(error, token) {
  if (!token) {
    return false;
  }

  if (error.status === 401) {
    return true;
  }

  if (error.status !== 403) {
    return false;
  }

  return /bad credentials|token.*expired|token.*revoked|authentication/i.test(error.body);
}

function shouldRetryRequest(error) {
  if (error.name === 'AbortError') {
    return true;
  }

  if (
    error.name === 'TypeError' ||
    ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error.code)
  ) {
    return true;
  }

  if (typeof error.status !== 'number') {
    return false;
  }

  if (error.status === 408 || error.status === 429 || error.status >= 500) {
    return true;
  }

  if (error.status !== 403) {
    return false;
  }

  if (error.rateLimitRemaining === '0') {
    return true;
  }

  return /secondary rate limit|rate limit exceeded|abuse detection/i.test(error.body);
}

function getRetryDelayMs(error, attempt, requestState) {
  if (typeof error.retryAfterMs === 'number') {
    return error.retryAfterMs;
  }

  return requestState.retryDelayMs * 2 ** attempt;
}

async function fetchWithTimeout(url, { fetchImpl, requestState }) {
  const timeoutMs = requestState.requestTimeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(url, {
      headers: buildHeaders(requestState.token),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`GitHub API request timed out after ${timeoutMs}ms.`);
      timeoutError.name = 'AbortError';
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestJson({ url, fetchImpl, requestState, allowAnonymousFallback = false }) {
  for (let attempt = 0; attempt <= requestState.maxRetries; attempt += 1) {
    let response;

    try {
      response = await fetchWithTimeout(url, { fetchImpl, requestState });
      return await readJson(response);
    } catch (error) {
      if (typeof error.status === 'number') {
        const responseError = {
          status: error.status,
          body: String(error.body || '').trim()
        };

        if (allowAnonymousFallback && shouldRetryWithoutAuth(responseError, requestState.token)) {
          requestState.token = undefined;
          response = await fetchWithTimeout(url, { fetchImpl, requestState });
          return readJson(response);
        }
      }

      if (attempt < requestState.maxRetries && shouldRetryRequest(error)) {
        await sleep(getRetryDelayMs(error, attempt, requestState));
        continue;
      }

      throw error;
    }
  }
}

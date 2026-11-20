#!/usr/bin/env node
const username = process.env.GH_USERNAME || process.env.GITHUB_REPOSITORY_OWNER || 'Arun-kushwaha007';
const statsStartYear = Number(process.env.GH_STATS_START_YEAR || 2023);
const token = process.env.GITHUB_TOKEN;

const headers = {
  Accept: 'application/vnd.github+json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': `${username}-stats-generator`,
};

async function gh(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status} for ${url}: ${text}`);
  }
  return res.json();
}

async function gql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub GraphQL error ${res.status}: ${text}`);
  }

  const body = await res.json();
  if (body.errors?.length) {
    throw new Error(`GitHub GraphQL returned errors: ${JSON.stringify(body.errors)}`);
  }
  return body.data;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function n(num) {
  return new Intl.NumberFormat('en-US').format(num || 0);
}

async function getAllRepos(user) {
  let page = 1;
  const out = [];
  while (true) {
    const repos = await gh(`https://api.github.com/users/${user}/repos?per_page=100&page=${page}&type=owner&sort=updated`);
    if (!Array.isArray(repos) || repos.length === 0) break;
    out.push(...repos);
    if (repos.length < 100) break;
    page += 1;
  }
  return out;
}

function palette(i) {
  const colors = ['#58a6ff', '#ff6b35', '#3fb950', '#d2a8ff', '#f2cc60', '#7ee787', '#ffa657', '#79c0ff'];
  return colors[i % colors.length];
}

function dayIso(d) {
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d, days) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function addUtcYears(d, years) {
  const x = new Date(d);
  x.setUTCFullYear(x.getUTCFullYear() + years);
  return x;
}

function minDate(a, b) {
  return a <= b ? a : b;
}

function calcStreaks(contributionByDate) {
  const entries = [...contributionByDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  let longest = 0;
  let running = 0;

  for (const [, count] of entries) {
    if (count > 0) {
      running += 1;
      if (running > longest) longest = running;
    } else {
      running = 0;
    }
  }

  let current = 0;
  let cursor = startOfUtcDay(new Date());
  if ((contributionByDate.get(dayIso(cursor)) || 0) <= 0) {
    cursor = addUtcDays(cursor, -1);
  }
  for (;;) {
    const key = dayIso(cursor);
    const count = contributionByDate.get(key) || 0;
    if (count <= 0) break;
    current += 1;
    cursor = addUtcDays(cursor, -1);
  }

  return { currentStreak: current, longestStreak: longest };
}

async function getContributionMetrics(login, startYear) {
  if (!token) {
    try {
      const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${login}?y=last`);
      if (res.ok) {
        const data = await res.json();
        const days = data.contributions || [];
        let totalCommits = 0;
        const contributionByDate = new Map();
        for (const d of days) {
          const c = Number(d.count) || 0;
          totalCommits += c;
          contributionByDate.set(d.date, c);
        }
        const { currentStreak, longestStreak } = calcStreaks(contributionByDate);
        const last31 = days.slice(-31).map((d) => ({ date: d.date, count: Number(d.count) || 0 }));
        return { totalCommits, currentStreak, longestStreak, last31 };
      }
    } catch (e) {
      console.warn('Fallback contributions API error:', e.message);
    }
  }

  const query = `
    query ContributionSlice($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          totalCommitContributions
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const safeStartYear = Number.isFinite(startYear) ? Math.floor(startYear) : 2023;
  const firstDay = startOfUtcDay(new Date(Date.UTC(safeStartYear, 0, 1)));
  const today = startOfUtcDay(new Date());

  let sliceStart = firstDay;
  let totalCommits = 0;
  const contributionByDate = new Map();

  while (sliceStart <= today) {
    const yearStart = startOfUtcDay(new Date(Date.UTC(sliceStart.getUTCFullYear(), 0, 1)));
    const oneYearMinusOneDay = addUtcDays(addUtcYears(yearStart, 1), -1);
    const sliceEnd = minDate(oneYearMinusOneDay, today);

    const from = new Date(Date.UTC(sliceStart.getUTCFullYear(), sliceStart.getUTCMonth(), sliceStart.getUTCDate(), 0, 0, 0)).toISOString();
    const to = new Date(Date.UTC(sliceEnd.getUTCFullYear(), sliceEnd.getUTCMonth(), sliceEnd.getUTCDate(), 23, 59, 59)).toISOString();

    const data = await gql(query, { login, from, to });
    const cc = data.user.contributionsCollection;

    totalCommits += cc.totalCommitContributions || 0;

    const weeks = cc.contributionCalendar?.weeks || [];
    for (const week of weeks) {
      for (const day of week.contributionDays || []) {
        contributionByDate.set(day.date, Number(day.contributionCount) || 0);
      }
    }

    sliceStart = startOfUtcDay(new Date(Date.UTC(sliceStart.getUTCFullYear() + 1, 0, 1)));
  }

  const { currentStreak, longestStreak } = calcStreaks(contributionByDate);
  const sortedDays = [...contributionByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
  const last31 = sortedDays.slice(-31);
  return { totalCommits, currentStreak, longestStreak, last31 };
}

function statsSvg({
  username,
  publicRepos,
  followers,
  following,
  totalStars,
  totalForks,
  totalWatchers,
  totalCommits,
  currentStreak,
  longestStreak,
  updatedAt,
}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="600" height="372" viewBox="0 0 600 372" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub stats card">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" rx="16" ry="16" width="599" height="371" fill="url(#bg)" stroke="#30363d"/>
  <text x="24" y="36" fill="#f0f6fc" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700">${esc(username)} • GitHub Snapshot</text>

  <rect x="24" y="54" width="176" height="84" rx="10" fill="#1f2937" stroke="#30363d"/>
  <text x="36" y="78" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="13">Total Commits</text>
  <text x="36" y="112" fill="#58a6ff" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(totalCommits)}</text>

  <rect x="212" y="54" width="176" height="84" rx="10" fill="#1f2937" stroke="#30363d"/>
  <text x="224" y="78" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="13">Current Streak</text>
  <text x="224" y="112" fill="#ff6b35" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(currentStreak)} days</text>

  <rect x="400" y="54" width="176" height="84" rx="10" fill="#1f2937" stroke="#30363d"/>
  <text x="412" y="78" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="13">Longest Streak</text>
  <text x="412" y="112" fill="#ff6b35" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(longestStreak)} days</text>

  <rect x="24" y="150" width="176" height="84" rx="10" fill="#111827" stroke="#30363d"/>
  <text x="36" y="174" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="13">Public Repos</text>
  <text x="36" y="208" fill="#7ee787" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(publicRepos)}</text>

  <rect x="212" y="150" width="176" height="84" rx="10" fill="#111827" stroke="#30363d"/>
  <text x="224" y="174" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="13">Followers</text>
  <text x="224" y="208" fill="#7ee787" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(followers)}</text>

  <rect x="400" y="150" width="176" height="84" rx="10" fill="#111827" stroke="#30363d"/>
  <text x="412" y="174" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="13">Following</text>
  <text x="412" y="208" fill="#7ee787" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(following)}</text>

  <rect x="24" y="246" width="176" height="84" rx="10" fill="#1a2230" stroke="#30363d"/>
  <text x="36" y="270" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="13">Total Stars</text>
  <text x="36" y="304" fill="#d2a8ff" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(totalStars)}</text>

  <rect x="212" y="246" width="176" height="84" rx="10" fill="#1a2230" stroke="#30363d"/>
  <text x="224" y="270" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="13">Total Forks</text>
  <text x="224" y="304" fill="#d2a8ff" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(totalForks)}</text>

  <rect x="400" y="246" width="176" height="84" rx="10" fill="#1a2230" stroke="#30363d"/>
  <text x="412" y="270" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="13">Watchers</text>
  <text x="412" y="304" fill="#d2a8ff" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(totalWatchers)}</text>

  <text x="24" y="354" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="12">Auto-generated from GitHub API • Updated: ${esc(updatedAt)}</text>
</svg>`;
}

function langsSvg({ username, items, totalBytes, updatedAt }) {
  const top = items.slice(0, 8);
  const barX = 28;
  const barY = 70;
  const barW = 544;
  const barH = 18;
  let x = barX;

  const segments = top.map((it, i) => {
    const pct = totalBytes ? (it.bytes / totalBytes) * 100 : 0;
    const w = Math.max(1, (barW * pct) / 100);
    const rect = `<rect x="${x.toFixed(2)}" y="${barY}" width="${w.toFixed(2)}" height="${barH}" fill="${palette(i)}"/>`;
    x += w;
    return rect;
  }).join('\n    ');

  const legend = top.map((it, i) => {
    const pct = totalBytes ? ((it.bytes / totalBytes) * 100).toFixed(1) : '0.0';
    const row = i % 4;
    const col = Math.floor(i / 4);
    const lx = 28 + col * 275;
    const ly = 132 + row * 34;
    return `<rect x="${lx}" y="${ly - 11}" width="10" height="10" rx="2" fill="${palette(i)}"/>
    <text x="${lx + 16}" y="${ly}" fill="#c9d1d9" font-family="Segoe UI, Arial, sans-serif" font-size="14">${esc(it.name)} ${pct}%</text>`;
  }).join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="600" height="320" viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Top languages card">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" rx="16" ry="16" width="599" height="319" fill="url(#bg)" stroke="#30363d"/>
  <text x="28" y="42" fill="#f0f6fc" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="700">${esc(username)} • Top Languages</text>
  <rect x="28" y="70" width="544" height="18" rx="9" fill="#21262d"/>
  ${segments}

  ${legend}

  <text x="28" y="286" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="13">Based on repo language bytes • Updated: ${esc(updatedAt)}</text>
</svg>`;
}

function activityGraphSvg({ username, dailyContributions, updatedAt }) {
  const width = 840;
  const height = 340;
  const plotX = 65;
  const plotY = 70;
  const plotW = 735;
  const plotH = 220;
  const baselineY = plotY + plotH;

  const counts = (dailyContributions || []).map((d) => Number(d.count) || 0);
  const maxVal = Math.max(...counts, 4);
  const totalContr = counts.reduce((sum, c) => sum + c, 0);

  const yTicks = 4;
  let niceStep = Math.ceil(maxVal / yTicks);
  if (niceStep < 1) niceStep = 1;
  else if (niceStep <= 5) niceStep = Math.ceil(niceStep);
  else if (niceStep <= 20) niceStep = Math.ceil(niceStep / 5) * 5;
  else niceStep = Math.ceil(niceStep / 10) * 10;
  const yMax = niceStep * yTicks;

  const pts = (dailyContributions || []).map((d, i) => {
    const x = plotX + (i / Math.max(1, dailyContributions.length - 1)) * plotW;
    const y = baselineY - ((Number(d.count) || 0) / yMax) * plotH;
    return { x, y, date: d.date, count: Number(d.count) || 0 };
  });

  let pathD = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[0];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < pts.length ? pts[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = Math.min(baselineY, Math.max(plotY - 10, p1.y + (p2.y - p0.y) / 6));
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = Math.min(baselineY, Math.max(plotY - 10, p2.y - (p3.y - p1.y) / 6));

    pathD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  const areaD = `${pathD} L ${pts[pts.length - 1].x.toFixed(1)} ${baselineY} L ${pts[0].x.toFixed(1)} ${baselineY} Z`;

  let gridLines = '';
  for (let t = 0; t <= yTicks; t++) {
    const val = t * niceStep;
    const y = baselineY - (val / yMax) * plotH;
    gridLines += `
    <line x1="${plotX}" y1="${y.toFixed(1)}" x2="${(plotX + plotW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#21262d" stroke-dasharray="3,3" stroke-width="1" />
    <text x="${(plotX - 12).toFixed(1)}" y="${(y + 4).toFixed(1)}" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="11" text-anchor="end">${val}</text>`;
  }

  let xLabels = '';
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  pts.forEach((p, i) => {
    xLabels += `
    <line x1="${p.x.toFixed(1)}" y1="${baselineY}" x2="${p.x.toFixed(1)}" y2="${baselineY + 5}" stroke="#30363d" stroke-width="1" />`;
    if (i % 5 === 0 || i === pts.length - 1) {
      const parts = String(p.date || '').split('-');
      const mName = monthNames[(parseInt(parts[1], 10) || 1) - 1] || 'Day';
      const dLabel = `${mName} ${parts[2] || ''}`;
      xLabels += `
    <text x="${p.x.toFixed(1)}" y="${baselineY + 22}" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="11" text-anchor="middle">${dLabel}</text>`;
    }
  });

  let points = '';
  pts.forEach((p) => {
    points += `
    <circle class="graph-point" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.count > 0 ? 3.5 : 2}" fill="${p.count > 0 ? '#ff6b35' : '#30363d'}" stroke="#0d1117" stroke-width="1.5">
      <title>${p.date}: ${p.count} contribution${p.count === 1 ? '' : 's'}</title>
    </circle>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contribution Activity Graph">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#58a6ff" stop-opacity="0.32" />
      <stop offset="100%" stop-color="#58a6ff" stop-opacity="0.0" />
    </linearGradient>
    <style>
      @keyframes dash {
        to { stroke-dashoffset: 0; }
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .graph-line {
        stroke-dasharray: 4000;
        stroke-dashoffset: 4000;
        animation: dash 2.5s ease-out forwards;
      }
      .graph-area {
        animation: fadeIn 1.2s ease-in forwards;
      }
      .graph-point {
        animation: fadeIn 1.2s ease-in forwards;
      }
    </style>
  </defs>

  <!-- Background Card -->
  <rect x="0.5" y="0.5" rx="16" ry="16" width="${width - 1}" height="${height - 1}" fill="url(#bg)" stroke="#30363d"/>

  <!-- Header -->
  <text x="24" y="38" fill="#ff6b35" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="700">${esc(username)} • Contribution Graph</text>
  <text x="${width - 24}" y="36" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="13" text-anchor="end">
    Last 31 Days • <tspan fill="#58a6ff" font-weight="600">${n(totalContr)}</tspan> Total • Peak: <tspan fill="#ff6b35" font-weight="600">${n(maxVal)}</tspan>/day
  </text>

  <!-- Grid lines & Y Axis -->
  ${gridLines}

  <!-- X Axis labels -->
  ${xLabels}
  <text x="${(plotX + plotW / 2).toFixed(1)}" y="${baselineY + 40}" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="11" text-anchor="middle">Days (Last 31 Days)</text>

  <!-- Area under curve -->
  <path class="graph-area" d="${areaD}" fill="url(#areaGradient)" />

  <!-- Smooth Line -->
  <path class="graph-line" d="${pathD}" fill="none" stroke="#58a6ff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />

  <!-- Data Points -->
  ${points}
</svg>`;
}

function utcNowStamp() {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

async function main() {
  const user = await gh(`https://api.github.com/users/${username}`);
  const repos = await getAllRepos(username);
  const ownRepos = repos.filter((r) => !r.fork);

  const totals = {
    stars: 0,
    forks: 0,
    watchers: 0,
  };

  for (const r of ownRepos) {
    totals.stars += r.stargazers_count || 0;
    totals.forks += r.forks_count || 0;
    totals.watchers += r.watchers_count || 0;
  }

  const langBytes = new Map();
  for (const r of ownRepos) {
    if (!r.languages_url) continue;
    const langs = await gh(r.languages_url);
    for (const [name, bytes] of Object.entries(langs)) {
      langBytes.set(name, (langBytes.get(name) || 0) + Number(bytes));
    }
  }

  const langItems = [...langBytes.entries()]
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((a, b) => b.bytes - a.bytes);

  const totalBytes = langItems.reduce((sum, l) => sum + l.bytes, 0);
  const updatedAt = utcNowStamp();

  const contribution = await getContributionMetrics(username, statsStartYear);

  const fs = await import('node:fs/promises');
  await fs.mkdir('assets', { recursive: true });

  await fs.writeFile(
    'assets/activity-graph.svg',
    activityGraphSvg({
      username,
      dailyContributions: contribution.last31,
      updatedAt,
    }),
    'utf8'
  );

  await fs.writeFile(
    'assets/github-stats.svg',
    statsSvg({
      username,
      publicRepos: user.public_repos || 0,
      followers: user.followers || 0,
      following: user.following || 0,
      totalStars: totals.stars,
      totalForks: totals.forks,
      totalWatchers: totals.watchers,
      totalCommits: contribution.totalCommits,
      currentStreak: contribution.currentStreak,
      longestStreak: contribution.longestStreak,
      updatedAt,
    }),
    'utf8'
  );

  await fs.writeFile(
    'assets/top-langs.svg',
    langsSvg({ username, items: langItems, totalBytes, updatedAt }),
    'utf8'
  );

  console.log('Generated assets/activity-graph.svg, assets/github-stats.svg, and assets/top-langs.svg');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

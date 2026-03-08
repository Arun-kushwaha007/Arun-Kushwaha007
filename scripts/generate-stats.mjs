#!/usr/bin/env node
const username = process.env.GH_USERNAME || process.env.GITHUB_REPOSITORY_OWNER || 'Arun-kushwaha007';
const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.error('Missing GITHUB_TOKEN');
  process.exit(1);
}

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
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

function statsSvg({ username, publicRepos, followers, following, totalStars, totalForks, totalWatchers, updatedAt }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="600" height="320" viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub stats card">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" rx="16" ry="16" width="599" height="319" fill="url(#bg)" stroke="#30363d"/>
  <text x="28" y="42" fill="#f0f6fc" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="700">${esc(username)} • GitHub Stats</text>

  <text x="28" y="88" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="15">Public Repos</text>
  <text x="28" y="116" fill="#58a6ff" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(publicRepos)}</text>

  <text x="220" y="88" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="15">Followers</text>
  <text x="220" y="116" fill="#58a6ff" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(followers)}</text>

  <text x="390" y="88" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="15">Following</text>
  <text x="390" y="116" fill="#58a6ff" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(following)}</text>

  <text x="28" y="170" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="15">Total Stars</text>
  <text x="28" y="198" fill="#ff6b35" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(totalStars)}</text>

  <text x="220" y="170" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="15">Total Forks</text>
  <text x="220" y="198" fill="#ff6b35" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(totalForks)}</text>

  <text x="390" y="170" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="15">Watchers</text>
  <text x="390" y="198" fill="#ff6b35" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${n(totalWatchers)}</text>

  <text x="28" y="278" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="13">Auto-generated via GitHub Actions • Updated: ${esc(updatedAt)}</text>
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

  const fs = await import('node:fs/promises');
  await fs.mkdir('assets', { recursive: true });

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
      updatedAt,
    }),
    'utf8'
  );

  await fs.writeFile(
    'assets/top-langs.svg',
    langsSvg({ username, items: langItems, totalBytes, updatedAt }),
    'utf8'
  );

  console.log('Generated assets/github-stats.svg and assets/top-langs.svg');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

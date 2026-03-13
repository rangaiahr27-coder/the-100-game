const fetch = require('node-fetch');

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';

const COUNTING_STATS = [
  { label: 'Home Runs',           group: 'hitting',  stat: 'homeRuns',    leaderCategory: 'homeRuns',                  display: 'HR',   higherBetter: true },
  { label: 'RBI',                 group: 'hitting',  stat: 'rbi',         leaderCategory: 'rbi',                       display: 'RBI',  higherBetter: true },
  { label: 'Stolen Bases',        group: 'hitting',  stat: 'stolenBases', leaderCategory: 'stolenBases',               display: 'SB',   higherBetter: true },
  { label: 'Hits',                group: 'hitting',  stat: 'hits',        leaderCategory: 'hits',                      display: 'H',    higherBetter: true },
  { label: 'Runs',                group: 'hitting',  stat: 'runs',        leaderCategory: 'runs',                      display: 'R',    higherBetter: true },
  { label: 'Strikeouts (Pitching)', group: 'pitching', stat: 'strikeOuts', leaderCategory: 'strikeoutsPitching',       display: 'K',    higherBetter: true },
  { label: 'Wins',                group: 'pitching', stat: 'wins',        leaderCategory: 'wins',                      display: 'W',    higherBetter: true },
  { label: 'Saves',               group: 'pitching', stat: 'saves',       leaderCategory: 'saves',                     display: 'SV',   higherBetter: true },
];

// Rate stats now support variable timeframes — weighted averages are computed per-season
const RATE_STATS = [
  { label: 'ERA',             group: 'pitching', stat: 'era',  display: 'ERA',  higherBetter: false },
  { label: 'Batting Average', group: 'hitting',  stat: 'avg',  display: 'AVG',  higherBetter: true  },
  { label: 'WHIP',            group: 'pitching', stat: 'whip', display: 'WHIP', higherBetter: false },
  { label: 'OPS',             group: 'hitting',  stat: 'ops',  display: 'OPS',  higherBetter: true  },
];

const ALL_STATS = [...COUNTING_STATS, ...RATE_STATS];
const ALL_TIME_START = 1960;
const CURRENT_YEAR = 2024;

function randomTimeframe() {
  if (Math.random() < 0.2) {
    return { startSeason: ALL_TIME_START, endSeason: CURRENT_YEAR, label: '1960–present', allTime: true };
  }
  const minSpan = 5;
  const maxSpan = 15;
  const span = minSpan + Math.floor(Math.random() * (maxSpan - minSpan + 1));
  const latestStart = CURRENT_YEAR - span;
  const startSeason = ALL_TIME_START + Math.floor(Math.random() * (latestStart - ALL_TIME_START + 1));
  const endSeason = startSeason + span;
  return { startSeason, endSeason, label: `${startSeason}–${endSeason}`, allTime: false };
}

function randomCategory() {
  return ALL_STATS[Math.floor(Math.random() * ALL_STATS.length)];
}

function generateChallenge() {
  const category = randomCategory();
  const timeframe = randomTimeframe();
  return { category, timeframe };
}

// Parse MLB innings-pitched string: "200.1" = 200⅓ innings = 200.333
function parseInnings(ip) {
  if (!ip && ip !== 0) return 0;
  const s = String(ip);
  const dot = s.indexOf('.');
  if (dot === -1) return parseInt(s) || 0;
  const full = parseInt(s.slice(0, dot)) || 0;
  const thirds = parseInt(s.slice(dot + 1)) || 0;
  return full + thirds / 3;
}

// Fetch leaders for a single stat/season (used for counting stats)
async function fetchSingleSeasonLeaders(leaderCategory, season) {
  const url = `${MLB_BASE}/stats/leaders?leaderCategories=${leaderCategory}&season=${season}&limit=300&sportId=1`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MLB API error: ${response.status} for season ${season}`);
  const data = await response.json();
  const leaders = data?.leagueLeaders?.[0]?.leaders ?? [];
  return leaders.map(l => ({
    id: l.person?.id,
    name: l.person?.fullName ?? 'Unknown',
    value: parseFloat(l.value) || 0,
  }));
}

// Fetch full season stats for a group (used for weighted rate stat averages)
async function fetchSeasonStatsRaw(group, season) {
  const url = `${MLB_BASE}/stats?stats=season&group=${group}&season=${season}&limit=1000&sportId=1`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data?.stats?.[0]?.splits ?? []).map(s => ({
    id: s.player?.id,
    name: s.player?.fullName ?? 'Unknown',
    ...s.stat,
  }));
}

// Counting stats: sum each player's totals across all seasons in the window
async function fetchMultiYearLeaderboard(category, startSeason, endSeason) {
  const { leaderCategory, stat, higherBetter } = category;
  const years = [];
  for (let y = startSeason; y <= endSeason; y++) years.push(y);

  const seasonResults = await Promise.all(
    years.map(yr => fetchSingleSeasonLeaders(leaderCategory, yr).catch(() => []))
  );

  const totals = {};
  seasonResults.forEach(leaders => {
    leaders.forEach(p => {
      if (!p.id) return;
      if (!totals[p.id]) totals[p.id] = { name: p.name, total: 0 };
      totals[p.id].total += p.value;
    });
  });

  const sorted = Object.values(totals)
    .sort((a, b) => higherBetter ? b.total - a.total : a.total - b.total)
    .slice(0, 300);

  return sorted.map((entry, index) => ({
    rank: index + 1,
    playerName: entry.name,
    statValue: String(Math.round(entry.total)),
  }));
}

// Rate stats: compute IP-weighted or AB-weighted average across seasons
async function fetchMultiYearRateLeaderboard(category, startSeason, endSeason) {
  const { stat, group, higherBetter } = category;
  const years = [];
  for (let y = startSeason; y <= endSeason; y++) years.push(y);
  const yearSpan = years.length;

  const seasonData = await Promise.all(
    years.map(yr => fetchSeasonStatsRaw(group, yr).catch(() => []))
  );

  const acc = {};
  seasonData.forEach(players => {
    players.forEach(p => {
      if (!p.id) return;
      if (!acc[p.id]) acc[p.id] = { name: p.name, weight: 0, numerator: 0 };

      if (stat === 'era' || stat === 'whip') {
        const ip = parseInnings(p.inningsPitched);
        const val = parseFloat(p[stat]) || 0;
        if (ip > 0 && val > 0) {
          acc[p.id].weight += ip;
          acc[p.id].numerator += val * ip;
        }
      } else if (stat === 'avg') {
        const ab = parseInt(p.atBats) || 0;
        const val = parseFloat(p.avg) || 0;
        if (ab > 0 && val > 0) {
          acc[p.id].weight += ab;
          acc[p.id].numerator += val * ab;
        }
      } else if (stat === 'ops') {
        const pa = parseInt(p.plateAppearances) || 0;
        const val = parseFloat(p.ops) || 0;
        if (pa > 0 && val > 0) {
          acc[p.id].weight += pa;
          acc[p.id].numerator += val * pa;
        }
      }
    });
  });

  // Minimum qualifier to filter out tiny samples
  const minWeight = (stat === 'era' || stat === 'whip')
    ? Math.max(60, yearSpan * 20)   // IP minimum (e.g. 5 yrs → 100 IP)
    : Math.max(200, yearSpan * 60); // AB/PA minimum (e.g. 5 yrs → 300 AB)

  let ranked = Object.entries(acc)
    .filter(([, d]) => d.weight >= minWeight && d.numerator > 0)
    .map(([id, d]) => ({
      id: parseInt(id),
      name: d.name,
      value: d.numerator / d.weight,
    }));

  // Restrict to post-1960 players via cache
  if (cacheReady) {
    ranked = ranked.filter(p => playerCache.has(p.id));
  }

  ranked.sort((a, b) => higherBetter ? b.value - a.value : a.value - b.value);

  return ranked.slice(0, 300).map((entry, i) => ({
    rank: i + 1,
    playerName: entry.name,
    statValue: formatStatValue(stat, entry.value),
  }));
}

function formatStatValue(stat, raw) {
  if (raw === null || raw === undefined) return null;
  const v = parseFloat(raw);
  if (['avg', 'ops', 'era', 'whip'].includes(stat)) return v.toFixed(3);
  return String(Math.round(v));
}

// Main entry point: fetch leaderboard for a challenge
async function fetchLeaderboard(category, timeframe) {
  const isRateStat = ['era', 'whip', 'avg', 'ops'].includes(category.stat);
  if (isRateStat) {
    return fetchMultiYearRateLeaderboard(category, timeframe.startSeason, timeframe.endSeason);
  }
  return fetchMultiYearLeaderboard(category, timeframe.startSeason, timeframe.endSeason);
}

// Look up a player's rank by name (case-insensitive) — returns entry even for rank > 100
function lookupPlayerRank(leaderboard, playerName) {
  const normalized = playerName.trim().toLowerCase();
  return leaderboard.find(e => e.playerName.toLowerCase() === normalized) ?? null;
}

// ── Historical player cache ──────────────────────────────────────────────────
const CACHE_SEASONS = [1960, 1965, 1969, 1974, 1979, 1984, 1989, 1994, 1999, 2004, 2009, 2014, 2019, 2024];
const playerCache = new Map(); // id → fullName
let cacheReady = false;

async function buildPlayerCache() {
  console.log('[mlbApi] Building historical player cache…');
  const results = await Promise.all(
    CACHE_SEASONS.map(season =>
      fetch(`${MLB_BASE}/sports/1/players?season=${season}&fields=people,id,fullName`)
        .then(r => (r.ok ? r.json() : { people: [] }))
        .then(d => d?.people ?? [])
        .catch(() => [])
    )
  );
  results.forEach(players => {
    players.forEach(p => {
      if (p.id && p.fullName) playerCache.set(p.id, p.fullName);
    });
  });
  cacheReady = true;
  console.log(`[mlbApi] Player cache ready — ${playerCache.size} players`);
}

buildPlayerCache().catch(console.error);

async function searchPlayers(query) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();

  if (!cacheReady) {
    const url = `${MLB_BASE}/sports/1/players?season=2024&fields=people,id,fullName`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return (data?.people ?? [])
      .filter(p => p.fullName.toLowerCase().includes(q))
      .slice(0, 10)
      .map(p => ({ id: p.id, name: p.fullName }));
  }

  const results = [];
  for (const [id, name] of playerCache) {
    if (name.toLowerCase().includes(q)) {
      results.push({ id, name });
      if (results.length >= 10) break;
    }
  }
  return results;
}

module.exports = { generateChallenge, fetchLeaderboard, lookupPlayerRank, searchPlayers, ALL_STATS };

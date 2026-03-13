const fetch = require('node-fetch');

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';

// Counting stats work for both multi-year aggregation AND career
const COUNTING_STATS = [
  { label: 'Home Runs', group: 'hitting', stat: 'homeRuns', leaderCategory: 'homeRuns', display: 'HR', higherBetter: true },
  { label: 'RBI', group: 'hitting', stat: 'rbi', leaderCategory: 'rbi', display: 'RBI', higherBetter: true },
  { label: 'Stolen Bases', group: 'hitting', stat: 'stolenBases', leaderCategory: 'stolenBases', display: 'SB', higherBetter: true },
  { label: 'Hits', group: 'hitting', stat: 'hits', leaderCategory: 'hits', display: 'H', higherBetter: true },
  { label: 'Runs', group: 'hitting', stat: 'runs', leaderCategory: 'runs', display: 'R', higherBetter: true },
  { label: 'Strikeouts (Pitching)', group: 'pitching', stat: 'strikeOuts', leaderCategory: 'strikeoutsPitching', display: 'K', higherBetter: true },
  { label: 'Wins', group: 'pitching', stat: 'wins', leaderCategory: 'wins', display: 'W', higherBetter: true },
  { label: 'Saves', group: 'pitching', stat: 'saves', leaderCategory: 'saves', display: 'SV', higherBetter: true },
];

// Rate stats only make sense with career (all-time) context
const RATE_STATS = [
  { label: 'ERA', group: 'pitching', stat: 'era', leaderCategory: 'earnedRunAverage', display: 'ERA', higherBetter: false, careerOnly: true },
  { label: 'Batting Average', group: 'hitting', stat: 'avg', leaderCategory: 'battingAverage', display: 'AVG', higherBetter: true, careerOnly: true },
  { label: 'WHIP', group: 'pitching', stat: 'whip', leaderCategory: 'walksAndHitsPerInningPitched', display: 'WHIP', higherBetter: false, careerOnly: true },
  { label: 'OPS', group: 'hitting', stat: 'ops', leaderCategory: 'onBasePlusSlugging', display: 'OPS', higherBetter: true, careerOnly: true },
];

const ALL_STATS = [...COUNTING_STATS, ...RATE_STATS];
const ALL_TIME_START = 1960;
const CURRENT_YEAR = 2024;

// Generate a random timeframe spanning at least 5 years, never before 1960
function randomTimeframe(careerOnly = false) {
  if (careerOnly) {
    return { startSeason: ALL_TIME_START, endSeason: CURRENT_YEAR, label: '1960–present', allTime: true };
  }

  const allTimeRoll = Math.random();
  if (allTimeRoll < 0.2) {
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
  const timeframe = randomTimeframe(category.careerOnly === true);
  return { category, timeframe };
}

// Fetch top 100 for a single season using the leaders endpoint
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

// Pitching rate stats (ERA, WHIP): the career endpoint caps at ~518 records and
// silently excludes pitchers who don't meet its internal threshold (e.g. deGrom).
// Instead, fetch per-season leaders for every year in the window and take each
// player's best single-season value. This guarantees full modern-era coverage.
async function fetchPitchingRateBest(category, startSeason, endSeason) {
  const { leaderCategory, stat, higherBetter } = category;
  const years = [];
  for (let y = startSeason; y <= endSeason; y++) years.push(y);

  const seasonResults = await Promise.all(
    years.map(yr => fetchSingleSeasonLeaders(leaderCategory, yr).catch(() => []))
  );

  // Per player: keep best (min for ERA/WHIP, max for AVG/OPS)
  const best = {};
  seasonResults.forEach(leaders => {
    leaders.forEach(p => {
      if (!p.id || !p.value) return;
      if (!best[p.id]) {
        best[p.id] = { name: p.name, value: p.value };
      } else {
        best[p.id].value = higherBetter
          ? Math.max(best[p.id].value, p.value)
          : Math.min(best[p.id].value, p.value);
      }
    });
  });

  const sorted = Object.values(best)
    .sort((a, b) => higherBetter ? b.value - a.value : a.value - b.value)
    .slice(0, 100);

  return sorted.map((entry, index) => ({
    rank: index + 1,
    playerName: entry.name,
    statValue: formatStatValue(stat, entry.value),
  }));
}

// Hitting rate stats (AVG, OPS): the career hitting endpoint returns ~910 records
// and includes active players like Trout. Sort in JS — never trust the API order.
async function fetchHittingRateCareer(category) {
  const { stat, higherBetter } = category;
  const url = `${MLB_BASE}/stats?stats=career&group=hitting&limit=5000&sportId=1`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MLB API error: ${response.status}`);
  const data = await response.json();
  const splits = data?.stats?.[0]?.splits ?? [];

  // Restrict to post-1960 players via the playerCache
  let filtered = cacheReady
    ? splits.filter(s => playerCache.has(s.player?.id))
    : splits;

  // Minimum plate appearances qualifier
  filtered = filtered.filter(
    s => parseInt(s.stat?.plateAppearances ?? s.stat?.atBats ?? 0) >= 3000
  );

  // Sort in JavaScript — higher is better for AVG, OPS
  filtered.sort((a, b) => {
    const av = parseFloat(a.stat?.[stat]) || 0;
    const bv = parseFloat(b.stat?.[stat]) || 0;
    return higherBetter ? bv - av : av - bv;
  });

  return filtered.slice(0, 100).map((split, index) => ({
    rank: index + 1,
    playerId: split.player?.id,
    playerName: split.player?.fullName ?? 'Unknown',
    statValue: formatStatValue(stat, split.stat?.[stat]),
  }));
}

// Route to the right career fetcher based on stat type
async function fetchCareerLeaders(category) {
  const { group, higherBetter } = category;
  if (group === 'pitching') {
    // ERA and WHIP: lower is better, use per-season best approach
    return fetchPitchingRateBest(category, ALL_TIME_START, CURRENT_YEAR);
  }
  // AVG, OPS: higher is better, use career hitting endpoint
  return fetchHittingRateCareer(category);
}

function formatStatValue(stat, raw) {
  if (raw === null || raw === undefined) return null;
  const v = parseFloat(raw);
  if (['avg', 'ops', 'era', 'whip'].includes(stat)) return v.toFixed(3);
  return String(parseInt(raw) || raw);
}

// Build aggregate leaderboard for a multi-year span (counting stats only)
async function fetchMultiYearLeaderboard(category, startSeason, endSeason) {
  const { leaderCategory, stat, higherBetter } = category;
  const years = [];
  for (let y = startSeason; y <= endSeason; y++) years.push(y);

  // Fetch all seasons in parallel
  const seasonResults = await Promise.all(
    years.map(yr => fetchSingleSeasonLeaders(leaderCategory, yr).catch(() => []))
  );

  // Aggregate by player ID
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
    .slice(0, 100);

  return sorted.map((entry, index) => ({
    rank: index + 1,
    playerName: entry.name,
    statValue: String(entry.total),
  }));
}

// Main entry point: fetch top-100 leaderboard for a challenge
async function fetchLeaderboard(category, timeframe) {
  if (timeframe.allTime) {
    return fetchCareerLeaders(category);
  }
  return fetchMultiYearLeaderboard(category, timeframe.startSeason, timeframe.endSeason);
}

// Look up a player's rank by name (case-insensitive)
function lookupPlayerRank(leaderboard, playerName) {
  const normalized = playerName.trim().toLowerCase();
  return leaderboard.find(e => e.playerName.toLowerCase() === normalized) ?? null;
}

// ── Historical player cache ──────────────────────────────────────────────────
// Fetch players from key seasons from 1960 onwards so the autocomplete covers
// every era. Also used to filter career stats to post-1960 players only.
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

// Start building immediately when the module loads
buildPlayerCache().catch(console.error);

// Autocomplete search — uses historical cache once ready, falls back to 2024 while loading
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

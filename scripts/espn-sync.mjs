import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * Runs only in GitHub Actions. ESPN cookies are read from GitHub Secrets and
 * are never written to the repository, logs, or generated JSON. The generated
 * file contains only the roster/matchup fields the public dashboard needs.
 */

const season = String(process.env.ESPN_SEASON || "2026");
const leagueId = String(process.env.ESPN_LEAGUE_ID || "919590140");
const teamName = String(process.env.ESPN_TEAM_NAME || "Gumby's Big D");
const s2 = String(process.env.ESPN_S2 || "").replace(/^ESPN_S2=/i, "").trim();
const swid = String(process.env.ESPN_SWID || "").replace(/^SWID=/i, "").trim();

if (!s2 || !swid) {
  console.error("ESPN sync is not configured: add ESPN_S2 and ESPN_SWID as GitHub Actions secrets.");
  process.exit(1);
}

const TEAM_BY_PRO_ID = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
  8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR",
  15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI",
  22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS",
  29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"
};

const POSITION_BY_ID = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };
const BENCH_SLOTS = new Set([20, 21, 22, 23]);
const outputPath = resolve(process.cwd(), "patriots-fantasy", "espn-data.json");

function clean(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function key(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number != null) return number;
  }
  return 0;
}

function firstNumberOrNull(...values) {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number != null) return number;
  }
  return null;
}

function playerFromEntry(entry) {
  return entry && (entry.playerPoolEntry && entry.playerPoolEntry.player || entry.player || entry.playerInfo || {});
}

function playerImage(player, entry) {
  const headshot = player && player.headshot || entry && entry.headshot;
  if (typeof headshot === "string") return headshot;
  if (headshot && typeof headshot === "object") return headshot.href || headshot.original || headshot.url || "";
  return clean(player && (player.imageUrl || player.image || player.headshotUrl));
}

function displayPosition(player) {
  const id = Number(player && player.defaultPositionId);
  return POSITION_BY_ID[id] || clean(player && (player.defaultPosition || player.position)) || "—";
}

function displayTeam(player) {
  const id = Number(player && (player.proTeamId || player.proTeam && player.proTeam.id));
  return TEAM_BY_PRO_ID[id] || clean(player && (player.proTeamAbbrev || player.proTeam && (player.proTeam.abbrev || player.proTeam.abbreviation))) || "FA";
}

function normalizePlayer(entry, index) {
  const player = playerFromEntry(entry);
  const id = player && player.id != null ? String(player.id) : entry && entry.playerId != null ? String(entry.playerId) : `espn-${index}`;
  const name = clean(player && (player.fullName || player.displayName || [player.firstName, player.lastName].filter(Boolean).join(" "))) || `PLAYER ${index + 1}`;
  const status = clean(player && (player.injuryStatus || player.injury_status || player.status));
  const stats = player && Array.isArray(player.stats) ? player.stats : [];
  const actualStats = [...stats].reverse().find((row) => Number(row && row.statSourceId) === 0 || row && row.appliedTotal != null || row && row.appliedStatTotal != null) || {};
  const projectedStats = stats.find((row) => Number(row && row.statSourceId) === 1 || row && row.projectedTotal != null || row && row.projectedPoints != null) || {};
  const points = firstNumber(
    entry && entry.appliedStatTotal,
    entry && entry.playerPoolEntry && entry.playerPoolEntry.appliedStatTotal,
    entry && entry.points,
    actualStats && (actualStats.appliedTotal || actualStats.appliedStatTotal || actualStats.total)
  );
  const projectedValue = firstNumberOrNull(
    entry && (entry.projectedTotal || entry.projectedPoints),
    entry && entry.playerPoolEntry && (entry.playerPoolEntry.projectedTotal || entry.playerPoolEntry.projectedPoints),
    player && (player.projectedTotal || player.projectedPoints),
    projectedStats && (projectedStats.projectedTotal || projectedStats.projectedPoints || projectedStats.appliedTotal || projectedStats.appliedStatTotal)
  );
  const lineupSlotId = numberOrNull(entry && (entry.lineupSlotId || entry.lineupSlot && (entry.lineupSlot.id || entry.lineupSlot.lineupSlotId)));
  return {
    id,
    name,
    team: displayTeam(player),
    position: displayPosition(player),
    points: Number(points.toFixed(1)),
    projected: projectedValue == null ? null : Number(projectedValue.toFixed(1)),
    injuryStatus: status,
    headshot: playerImage(player, entry),
    starter: lineupSlotId == null ? true : !BENCH_SLOTS.has(lineupSlotId)
  };
}

function teamLabel(team) {
  const joined = [team && team.location, team && team.nickname].map(clean).filter(Boolean).join(" ");
  return clean(team && (team.name || team.teamName)) || joined || clean(team && team.abbrev) || `TEAM ${team && team.id != null ? team.id : ""}`;
}

function normalizeTeam(team) {
  const entries = team && team.roster && Array.isArray(team.roster.entries) ? team.roster.entries : Array.isArray(team && team.roster) ? team.roster : [];
  const players = entries.map(normalizePlayer);
  const starters = players.filter((player) => player.starter);
  const bench = players.filter((player) => !player.starter);
  return {
    id: team && team.id != null ? String(team.id) : "",
    name: teamLabel(team),
    total: firstNumber(team && (team.totalPoints || team.points || team.score || team.total)),
    projected: firstNumberOrNull(team && (team.projectedTotal || team.projectedPoints || team.projectedScore || team.projected)),
    starters,
    bench
  };
}

function teamCandidates(team) {
  return [
    team && team.name,
    team && team.teamName,
    [team && team.location, team && team.nickname].filter(Boolean).join(" "),
    team && team.abbrev,
    team && team.abbreviation
  ].map(key).filter(Boolean);
}

function findOwnTeam(teams) {
  const wanted = key(teamName);
  const exact = teams.find((team) => teamCandidates(team).some((candidate) => candidate === wanted));
  if (exact) return exact;
  const tokens = wanted.match(/[a-z0-9]{3,}/g) || [];
  let best = null;
  let bestScore = 0;
  teams.forEach((team) => {
    const candidates = teamCandidates(team);
    const score = tokens.reduce((total, token) => total + (candidates.some((candidate) => candidate.includes(token)) ? 1 : 0), 0);
    if (score > bestScore) { best = team; bestScore = score; }
  });
  return bestScore ? best : null;
}

function scheduleRows(data) {
  return Array.isArray(data && data.schedule) ? data.schedule : Array.isArray(data && data.matchups) ? data.matchups : [];
}

function currentMatchup(data, ownId) {
  const rows = scheduleRows(data);
  const current = numberOrNull(data && data.status && (data.status.currentMatchupPeriod || data.status.currentMatchupPeriodId)) || numberOrNull(data && data.currentMatchupPeriod) || numberOrNull(data && data.scoringPeriodId);
  const containing = rows.filter((row) => String(row && row.home && row.home.teamId) === ownId || String(row && row.away && row.away.teamId) === ownId);
  if (!containing.length) return null;
  return containing.find((row) => current != null && Number(row.matchupPeriodId) === current) || containing.slice().sort((a, b) => Number(b.matchupPeriodId || 0) - Number(a.matchupPeriodId || 0))[0];
}

function applyMatchupTotal(team, side) {
  if (!team || !side) return team;
  const total = firstNumber(side.totalPoints, side.points, side.score, side.total);
  if (total || side.totalPoints === 0 || side.points === 0 || side.score === 0) team.total = Number(total.toFixed(1));
  const projected = firstNumberOrNull(side.projectedTotal, side.projectedPoints, side.projectedScore, side.projected);
  if (projected != null) team.projected = Number(projected.toFixed(1));
  return team;
}

async function fetchLeague() {
  const endpoint = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${encodeURIComponent(season)}/segments/0/leagues/${encodeURIComponent(leagueId)}?view=mSettings&view=mTeam&view=mRoster&view=mMatchup&view=mMatchupScore&view=mBoxScore&view=mLiveScoring`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "justins-sports-center ESPN sync",
      Cookie: `espn_s2=${s2}; SWID=${swid}`
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`ESPN returned HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const data = await fetchLeague();
  const teams = Array.isArray(data && data.teams) ? data.teams : [];
  if (!teams.length) throw new Error("ESPN response did not contain teams");
  const ownRaw = findOwnTeam(teams);
  if (!ownRaw) throw new Error("Configured ESPN team was not found in the league response");
  const own = normalizeTeam(ownRaw);
  const row = currentMatchup(data, own.id);
  let opponent = null;
  let matchupPeriodId = numberOrNull(row && row.matchupPeriodId);
  if (row) {
    const ownSide = String(row.home && row.home.teamId) === own.id ? row.home : row.away;
    const opponentSide = ownSide === row.home ? row.away : row.home;
    const opponentRaw = teams.find((team) => String(team.id) === String(opponentSide && opponentSide.teamId));
    if (opponentRaw) opponent = applyMatchupTotal(normalizeTeam(opponentRaw), opponentSide);
    applyMatchupTotal(own, ownSide);
  }
  const output = {
    ready: true,
    source: "PRIVATE SYNC",
    savedAt: new Date().toISOString(),
    season,
    leagueId,
    scoringPeriodId: numberOrNull(data && data.scoringPeriodId),
    matchupPeriodId,
    myTeam: own,
    opponent
  };
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`ESPN sync saved ${own.starters.length} starters and ${own.bench.length} bench players${opponent ? ` plus ${opponent.name}` : ""}.`);
}

main().catch((error) => {
  console.error(`ESPN sync failed: ${error && error.message ? error.message : "unknown error"}`);
  process.exit(1);
});

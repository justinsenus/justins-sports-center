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
const STAT_ID_LABELS = { 3: "Passing Yards", 4: "Passing Touchdowns", 19: "Interceptions", 24: "Rushing Yards", 25: "Rushing Touchdowns", 42: "Receiving Yards", 43: "Receiving Touchdowns", 53: "Receptions", 58: "Targets" };
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

function statLabelMap(data) {
  const labels = { ...STAT_ID_LABELS };
  const items = data && data.settings && data.settings.scoringSettings && data.settings.scoringSettings.scoringItems;
  (Array.isArray(items) ? items : []).forEach((item) => {
    const id = item && (item.statId ?? item.id);
    const label = item && (item.name || item.abbrev || item.abbreviation);
    if (id != null && label) labels[String(id)] = String(label);
  });
  return labels;
}

function formatStatLabel(value) {
  return String(value || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

function normalizeGameStats(stats, labels) {
  return Object.entries(stats && typeof stats === "object" ? stats : {}).map(([id, rawValue]) => ({
    id: String(id),
    label: formatStatLabel(labels && labels[String(id)]),
    value: numberOrNull(rawValue)
  })).filter((stat) => stat.label && stat.value != null && Math.abs(stat.value) > 0.001);
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

function normalizePlayer(entry, index, scoringPeriodId, labels) {
  const player = playerFromEntry(entry);
  const id = player && player.id != null ? String(player.id) : entry && entry.playerId != null ? String(entry.playerId) : "espn-" + index;
  const name = clean(player && (player.fullName || player.displayName || [player.firstName, player.lastName].filter(Boolean).join(" "))) || "PLAYER " + (index + 1);
  const status = clean(player && (player.injuryStatus || player.injury_status || player.status));
  const allStats = player && Array.isArray(player.stats) ? player.stats : [];
  const periodStats = allStats.filter((row) => Number(row && row.scoringPeriodId) === Number(scoringPeriodId));
  const actualStats = periodStats.find((row) => Number(row && row.statSourceId) === 0) || {};
  const projectedStats = periodStats.find((row) => Number(row && row.statSourceId) === 1) || {};
  const pointsValue = firstNumberOrNull(
    actualStats.appliedTotal,
    actualStats.appliedStatTotal,
    entry && entry.appliedStatTotal,
    entry && entry.playerPoolEntry && entry.playerPoolEntry.appliedStatTotal
  );
  const projectedValue = firstNumberOrNull(
    projectedStats.appliedTotal,
    projectedStats.projectedTotal,
    projectedStats.projectedPoints,
    entry && (entry.projectedTotal ?? entry.projectedPoints),
    entry && entry.playerPoolEntry && (entry.playerPoolEntry.projectedTotal ?? entry.playerPoolEntry.projectedPoints),
    player && (player.projectedTotal ?? player.projectedPoints)
  );
  const lineupSlotId = numberOrNull(entry && (entry.lineupSlotId || entry.lineupSlot && (entry.lineupSlot.id || entry.lineupSlot.lineupSlotId)));
  return {
    id,
    name,
    team: displayTeam(player),
    position: displayPosition(player),
    points: Number((pointsValue ?? 0).toFixed(1)),
    projected: projectedValue == null ? null : Number(projectedValue.toFixed(1)),
    gameStats: normalizeGameStats(actualStats.stats, labels),
    injuryStatus: status,
    headshot: playerImage(player, entry),
    starter: lineupSlotId == null ? true : !BENCH_SLOTS.has(lineupSlotId)
  };
}

function teamLabel(team) {
  const joined = [team && team.location, team && team.nickname].map(clean).filter(Boolean).join(" ");
  return clean(team && (team.name || team.teamName)) || joined || clean(team && team.abbrev) || `TEAM ${team && team.id != null ? team.id : ""}`;
}

function normalizeTeam(team, scoringPeriodId, labels) {
  const entries = team && team.roster && Array.isArray(team.roster.entries) ? team.roster.entries : Array.isArray(team && team.roster) ? team.roster : [];
  const players = entries.map((entry, index) => normalizePlayer(entry, index, scoringPeriodId, labels));
  const starters = players.filter((player) => player.starter);
  const bench = players.filter((player) => !player.starter);
  const overall = team && team.record && (team.record.overall || team.record.current) || {};
  const hasWeeklyActual = starters.some((player) => Math.abs(player.points) > 0.001);
  const projectedRows = starters.filter((player) => player.projected != null);
  return {
    id: team && team.id != null ? String(team.id) : "",
    name: teamLabel(team),
    abbrev: clean(team && team.abbrev),
    avatar: clean(team && (team.logoURL || team.logo)),
    record: { wins: numberOrNull(overall.wins), losses: numberOrNull(overall.losses) },
    total: hasWeeklyActual ? starters.reduce((sum, player) => sum + player.points, 0) : 0,
    projected: projectedRows.length ? projectedRows.reduce((sum, player) => sum + player.projected, 0) : null,
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
  if (!team) return team;
  const hasPlayerActual = (team.starters || []).some((player) => Math.abs(numberOrNull(player.points) || 0) > 0.001);
  const rosterTotal = (team.starters || []).reduce((sum, player) => sum + (numberOrNull(player.points) || 0), 0);
  const reportedTotal = firstNumberOrNull(side && side.totalPoints, side && side.points, side && side.score, side && side.total);
  team.total = Number((hasPlayerActual ? rosterTotal : reportedTotal ?? 0).toFixed(1));
  const hasPlayerProjection = (team.starters || []).some((player) => numberOrNull(player.projected) != null);
  const reportedProjection = firstNumberOrNull(side && side.projectedTotal, side && side.projectedPoints, side && side.projectedScore, side && side.projected);
  if (!hasPlayerProjection && reportedProjection != null) team.projected = Number(reportedProjection.toFixed(1));
  return team;
}

async function fetchLeagueFor(scoringPeriodId = null) {
  const periodQuery = scoringPeriodId == null ? "" : `&scoringPeriodId=${encodeURIComponent(scoringPeriodId)}`;
  const endpoint = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${encodeURIComponent(season)}/segments/0/leagues/${encodeURIComponent(leagueId)}?view=mSettings&view=mTeam&view=mRoster&view=mMatchup&view=mMatchupScore&view=mBoxScore&view=mLiveScoring${periodQuery}`;
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

async function fetchLeague() {
  const settings = await fetchLeagueFor();
  const scoringPeriodId = numberOrNull(settings && settings.status && (settings.status.currentScoringPeriod || settings.status.latestScoringPeriod))
    ?? numberOrNull(settings && settings.scoringPeriodId);
  return scoringPeriodId == null ? settings : fetchLeagueFor(scoringPeriodId);
}

async function main() {
  const data = await fetchLeague();
  const rawTeams = Array.isArray(data && data.teams) ? data.teams : [];
  const scoringPeriodId = numberOrNull(data && data.status && (data.status.currentScoringPeriod ?? data.status.latestScoringPeriod)) ?? numberOrNull(data && data.scoringPeriodId);
  if (scoringPeriodId == null) throw new Error("ESPN response did not include the current scoring period");
  const labels = statLabelMap(data);
  if (!rawTeams.length) throw new Error("ESPN response did not contain teams");
  const ownRaw = findOwnTeam(rawTeams);
  if (!ownRaw) throw new Error("Configured ESPN team was not found in the league response");

  const ownId = String(ownRaw.id);
  const ownMatchup = currentMatchup(data, ownId);
  const matchupPeriodId = numberOrNull(ownMatchup && ownMatchup.matchupPeriodId)
    ?? numberOrNull(data && data.status && (data.status.currentMatchupPeriod || data.status.currentMatchupPeriodId))
    ?? numberOrNull(data && data.matchupPeriodId)
    ?? numberOrNull(data && data.scoringPeriodId);
  const leagueSides = new Map();
  if (matchupPeriodId != null) {
    scheduleRows(data).filter((row) => Number(row && row.matchupPeriodId) === matchupPeriodId).forEach((row) => {
      if (row && row.home && row.home.teamId != null) leagueSides.set(String(row.home.teamId), row.home);
      if (row && row.away && row.away.teamId != null) leagueSides.set(String(row.away.teamId), row.away);
    });
  }

  const leagueTeams = rawTeams.map((rawTeam) => {
    const team = normalizeTeam(rawTeam, scoringPeriodId, labels);
    return applyMatchupTotal(team, leagueSides.get(team.id));
  });
  const own = leagueTeams.find((team) => team.id === ownId);
  const ownSide = ownMatchup && (String(ownMatchup.home && ownMatchup.home.teamId) === ownId ? ownMatchup.home : ownMatchup.away);
  const opponentSide = ownMatchup && (ownSide === ownMatchup.home ? ownMatchup.away : ownMatchup.home);
  const opponentId = opponentSide && opponentSide.teamId != null ? String(opponentSide.teamId) : "";
  const opponent = leagueTeams.find((team) => team.id === opponentId) || null;

  if (!own) throw new Error("Configured ESPN team was not normalized");
  const output = {
    ready: true,
    source: "PRIVATE SYNC",
    savedAt: new Date().toISOString(),
    season,
    leagueId,
    scoringPeriodId,
    matchupPeriodId,
    myTeam: own,
    opponent,
    leagueTeams
  };
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`ESPN sync saved ${leagueTeams.length} league teams and ${leagueTeams.reduce((sum, team) => sum + team.starters.length, 0)} starters.`);
}

main().catch((error) => {
  console.error(`ESPN sync failed: ${error && error.message ? error.message : "unknown error"}`);
  process.exit(1);
});

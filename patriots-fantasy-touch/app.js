(() => {
  "use strict";

  const CONFIG = {
    season: 2026,
    sleeperLeagueId: "1387635903379300352",
    sleeperOwnerId: "1137609122398482432",
    sleeperTeamName: "The Big Senus",
    espnTeamName: "Gumby's Big D",
    refreshMs: 5000,
    playersCacheMs: 12 * 60 * 60 * 1000
  };

  const ESPN_PUBLIC_URL = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/919590140?view=mMatchup&view=mBoxScore&view=mLiveScoring";
  const ESPN_TEAM_BY_PRO_ID = { 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU" };
  const ESPN_POSITION_BY_ID = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };
  const ESPN_BENCH_SLOTS = new Set([20, 21, 22, 23]);

  const root = document.body.dataset.root || "./";
  const state = {
    view: "overview",
    league: "sleeper",
    week: 1,
    sleeper: null,
    espn: null,
    consensus: null,
    scoreboard: [],
    selectedPlayer: null,
    loading: true,
    error: "",
    lastSync: null,
    refreshedAt: null
  };
  let refreshInFlight = false;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
  const finite = (value) => {
    if (value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const number = (value, decimals = 1, fallback = "0.0") => {
    const n = finite(value);
    return n == null ? fallback : n.toFixed(decimals);
  };
  const num = (value, fallback = "—") => `<span class="num">${esc(value == null || value === "" ? fallback : value)}</span>`;
  const nameKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const formatClock = (value = new Date()) => value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const formatAge = (value) => {
    if (!value) return "WAITING FOR FEED";
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return `${seconds}s AGO`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m AGO`;
    return `${Math.floor(seconds / 3600)}h AGO`;
  };
  const teamLogo = (team) => `https://a.espncdn.com/i/teamlogos/nfl/500/${encodeURIComponent(String(team || "nfl").toLowerCase())}.png`;
  const textValue = (value, fallback = "SYNCING") => value == null || value === "" ? fallback : String(value);
  const initials = (value) => String(value || "PLAYER").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";

  async function getJSON(url) {
    const response = await fetch(url, { cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  }

  function eventState(event) {
    const type = event && event.competitions && event.competitions[0] && event.competitions[0].status && event.competitions[0].status.type || {};
    const stateName = String(type.state || "").toLowerCase();
    return { live: stateName === "in", final: stateName === "post", upcoming: stateName === "pre", type };
  }

  function eventCompetitors(event) {
    return event && event.competitions && event.competitions[0] && event.competitions[0].competitors || [];
  }

  function findPlayerEvent(player) {
    const team = String(player && (player.team || player.proTeam || "")).toUpperCase();
    return state.scoreboard.find((event) => eventCompetitors(event).some((c) => String(c.team && c.team.abbreviation || "").toUpperCase() === team)) || null;
  }

  function playerImage(player) {
    const id = player && (player.player_id || player.playerId || player.id);
    const fallback = player && (player.headshot || player.imageUrl || player.image || "");
    const sleeper = id ? `https://sleepercdn.com/content/nfl/players/thumb/${encodeURIComponent(id)}.jpg` : "";
    return { src: sleeper || fallback, fallback: fallback && fallback !== sleeper ? fallback : "" };
  }

  function playerFace(player, size = "") {
    const image = playerImage(player);
    const name = player && (player.full_name || player.name) || "Player";
    return `<span class="player-face ${size}" data-initials="${esc(initials(name))}"><img src="${esc(image.src)}" ${image.fallback ? `data-fallback="${esc(image.fallback)}"` : ""} alt="${esc(name)}" onerror="this.style.opacity='.16'"></span>`;
  }

  function sleeperPlayerIds(roster) {
    return (roster && roster.players || []).map(String);
  }

  function rosterName(roster, users, fallback) {
    const owner = users && users.find((user) => String(user.user_id) === String(roster && roster.owner_id));
    return owner && owner.metadata && owner.metadata.team_name || owner && owner.display_name || fallback;
  }

  function normalizeSleeperPlayer(id, players, pointsMap, roster, consensusData) {
    const source = players && players[id] || { player_id: id, full_name: id, team: "FA", position: "UTIL" };
    const player = { ...source, player_id: id, name: source.full_name || source.name || id };
    const event = findPlayerEvent(player);
    const status = event && eventState(event).live ? "LIVE" : player.injury_status ? String(player.injury_status).toUpperCase() : event && eventState(event).upcoming ? "NEXT" : "NO GAME";
    const actualRaw = finite(pointsMap && pointsMap[id]) || 0;
    const started = event && (eventState(event).live || eventState(event).final);
    const actual = started ? actualRaw : 0;
    const consensus = consensusFor(player, consensusData);
    const starterSet = new Set((roster && roster.starters || []).map(String));
    return {
      ...player,
      full_name: player.full_name || player.name,
      position: player.position || "UTIL",
      team: player.team || "FA",
      actual,
      projected: consensus.value != null ? consensus.value : finite(player.projected),
      status,
      event,
      starter: starterSet.has(String(id)),
      consensus
    };
  }

  function consensusFor(player, consensusData = state.consensus) {
    const map = consensusData && consensusData.players || {};
    const id = String(player && (player.player_id || player.id) || "");
    let row = map[id];
    if (!row && player && player.full_name) row = Object.values(map).find((candidate) => nameKey(candidate.name || candidate.full_name) === nameKey(player.full_name) && (!candidate.team || String(candidate.team).toUpperCase() === String(player.team || "").toUpperCase()));
    if (!row) {
      const publicRows = state.espn && state.espn.projectionPlayers || {};
      const publicRow = publicRows[nameKey(player && player.full_name)] || publicRows[nameKey(player && player.name)];
      const direct = finite(player && player.projected) ?? finite(publicRow && publicRow.projected);
      return { value: direct, min: null, max: null, range: null, sourceCount: direct != null ? 1 : 0, sources: direct != null ? [{ source: publicRow && publicRow.source || "PUBLIC ESPN", value: direct }] : [], outlier: null, odds: [] };
    }
    const value = finite(row.consensus != null ? row.consensus : row.projectionMedian != null ? row.projectionMedian : row.projected);
    if (value == null) {
      const publicRows = state.espn && state.espn.projectionPlayers || {};
      const publicRow = publicRows[nameKey(player && player.full_name)] || publicRows[nameKey(player && player.name)];
      const direct = finite(player && player.projected) ?? finite(publicRow && publicRow.projected);
      if (direct != null) return { value: direct, min: null, max: null, range: null, sourceCount: 1, sources: [{ source: publicRow && publicRow.source || "PUBLIC ESPN", value: direct }], outlier: null, odds: [] };
    }
    return {
      value,
      min: finite(row.min != null ? row.min : row.projectionMin),
      max: finite(row.max != null ? row.max : row.projectionMax),
      range: finite(row.range != null ? row.range : row.projectionRange),
      sourceCount: finite(row.sourceCount) || (value == null ? 0 : 1),
      sources: Array.isArray(row.sources) ? row.sources : [],
      outlier: row.outlier || null,
      odds: Array.isArray(row.odds) ? row.odds : [],
      market: row.market || null
    };
  }

  async function loadSleeperPlayers() {
    const key = "justin-touch-nfl-players-v1";
    try {
      const cached = JSON.parse(localStorage.getItem(key) || "null");
      if (cached && cached.saved && Date.now() - cached.saved < CONFIG.playersCacheMs && cached.data) return cached.data;
    } catch (_) { /* Optional storage. */ }
    const data = await getJSON("https://api.sleeper.app/v1/players/nfl");
    try { localStorage.setItem(key, JSON.stringify({ saved: Date.now(), data })); } catch (_) { /* Large map can exceed storage. */ }
    return data;
  }

  async function loadSleeper() {
    const base = "https://api.sleeper.app/v1";
    const leagueId = CONFIG.sleeperLeagueId;
    const [league, users, rosters, nflState, players] = await Promise.all([
      getJSON(`${base}/league/${leagueId}`),
      getJSON(`${base}/league/${leagueId}/users`),
      getJSON(`${base}/league/${leagueId}/rosters`),
      getJSON(`${base}/state/nfl`),
      loadSleeperPlayers()
    ]);
    const week = Number(nflState.display_week || nflState.week || 1);
    const [matchups, projections] = await Promise.all([
      getJSON(`${base}/league/${leagueId}/matchups/${week}`),
      getJSON(`${base}/projections/nfl/${CONFIG.season}/${week}?season_type=regular`).catch(() => [])
    ]);
    const named = users.find((user) => String(user.metadata && user.metadata.team_name || "").trim().toLowerCase() === CONFIG.sleeperTeamName.toLowerCase());
    const ownerId = named && named.user_id || CONFIG.sleeperOwnerId;
    const roster = rosters.find((candidate) => String(candidate.owner_id) === String(ownerId)) || rosters[0];
    const matchup = matchups.find((candidate) => Number(candidate.roster_id) === Number(roster && roster.roster_id)) || {};
    const opponentMatchup = matchup && matchup.matchup_id ? matchups.find((candidate) => Number(candidate.matchup_id) === Number(matchup.matchup_id) && Number(candidate.roster_id) !== Number(matchup.roster_id)) : null;
    const opponentRoster = opponentMatchup && rosters.find((candidate) => Number(candidate.roster_id) === Number(opponentMatchup.roster_id));
    const projectedMap = {};
    (Array.isArray(projections) ? projections : Object.values(projections || {})).forEach((row) => {
      const id = String(row && (row.player_id || row.playerId || row.id) || "");
      if (!id) return;
      const value = finite(row && (row.pts_ppr != null ? row.pts_ppr : row.pts_half_ppr != null ? row.pts_half_ppr : row.pts_std != null ? row.pts_std : row.fantasy_points != null ? row.fantasy_points : row.projected_points));
      if (value != null) projectedMap[id] = value;
    });
    const mergedPlayers = { ...players };
    Object.entries(projectedMap).forEach(([id, value]) => { if (mergedPlayers[id]) mergedPlayers[id] = { ...mergedPlayers[id], projected: Number(value.toFixed(1)) }; });
    const pointsMap = matchup.players_points || {};
    const opponentPointsMap = opponentMatchup && opponentMatchup.players_points || {};
    return { league, users, rosters, roster, opponentRoster, matchup, opponentMatchup, players: mergedPlayers, pointsMap, opponentPointsMap, week };
  }

  function espnStatRows(player, scoringPeriodId) {
    return Array.isArray(player && player.stats) ? player.stats.filter((row) => Number(row.scoringPeriodId) === Number(scoringPeriodId)) : [];
  }

  function espnProjection(player, scoringPeriodId) {
    const rows = espnStatRows(player, scoringPeriodId);
    const projected = rows.find((row) => Number(row.statSourceId) === 1) || rows.find((row) => row.appliedTotal != null);
    return finite(projected && (projected.appliedTotal != null ? projected.appliedTotal : projected.appliedTotalCeiling)) || finite(player && (player.projectedTotal || player.projected)) || null;
  }

  function espnSeasonAverage(player) {
    const rows = Array.isArray(player && player.stats) ? player.stats : [];
    const season = rows.find((row) => Number(row.scoringPeriodId) === 0 && Number(row.statSourceId) === 0) || rows.find((row) => Number(row.scoringPeriodId) === 0);
    return finite(season && (season.appliedAverage || season.appliedTotal));
  }

  function espnLiveFields(player, scoringPeriodId) {
    const row = espnStatRows(player, scoringPeriodId).find((candidate) => Number(candidate.statSourceId) === 0);
    const stats = row && row.stats || {};
    if (!row) return {};
    const value = (key) => finite(stats[key]);
    if (Number(player && player.defaultPositionId) === 1) {
      return { pass_yd: value("3"), pass_td: value("4"), interceptions: value("19"), rush_yd: value("24"), rush_td: value("25") };
    }
    return { rush_yd: value("24"), rush_td: value("25"), rec_yd: value("42"), rec_td: value("43"), receptions: value("53"), targets: value("58") };
  }

  function espnStatLine(player, actual, projected, event) {
    const status = event && eventState(event).live ? "LIVE" : event && eventState(event).final ? "FINAL" : "PREGAME";
    const opponent = event && eventCompetitors(event).find((candidate) => String(candidate.team && candidate.team.abbreviation || "").toUpperCase() !== String(ESPN_TEAM_BY_PRO_ID[player && player.proTeamId] || "").toUpperCase());
    const matchup = opponent && opponent.team && opponent.team.abbreviation ? `VS ${opponent.team.abbreviation}` : "NEXT GAME";
    const visibleActual = event && (eventState(event).live || eventState(event).final) ? actual : 0;
    return `${status} • ${matchup} • ${number(visibleActual)} PTS • PROJ ${projected == null ? "FEED SYNCING" : number(projected)}`;
  }

  function normalizeESPNEntry(entry, currentEntry, scoringPeriodId, side) {
    const pool = entry && entry.playerPoolEntry || {};
    const player = pool.player || entry && entry.player || {};
    const id = String(entry && (entry.playerId || pool.id || player.id) || "");
    const name = player.fullName || [player.firstName, player.lastName].filter(Boolean).join(" ") || id || "Player";
    const position = ESPN_POSITION_BY_ID[player.defaultPositionId] || "UTIL";
    const team = ESPN_TEAM_BY_PRO_ID[player.proTeamId] || "FA";
    const event = state.scoreboard.find((candidate) => eventCompetitors(candidate).some((competitor) => String(competitor.team && competitor.team.abbreviation || "").toUpperCase() === team)) || null;
    const rows = espnStatRows(player, scoringPeriodId);
    const actualRow = rows.find((row) => Number(row.statSourceId) === 0) || rows.find((row) => Number(row.statSourceId) === 1 && row.appliedTotal != null);
    const actual = finite(currentEntry && currentEntry.playerPoolEntry && currentEntry.playerPoolEntry.appliedStatTotal) ?? finite(entry && entry.playerPoolEntry && entry.playerPoolEntry.appliedStatTotal) ?? finite(actualRow && actualRow.appliedTotal) ?? 0;
    const projected = espnProjection(player, scoringPeriodId);
    const liveFields = espnLiveFields(player, scoringPeriodId);
    const headshot = `https://a.espncdn.com/i/headshots/nfl/players/full/${encodeURIComponent(id)}.png`;
    const lineupSlotId = Number(entry && entry.lineupSlotId);
    const playerData = {
      player_id: id,
      playerId: id,
      full_name: name,
      name,
      team,
      position,
      proTeamId: player.proTeamId,
      headshot,
      injury_status: entry && entry.injuryStatus && entry.injuryStatus !== "NORMAL" ? entry.injuryStatus : player.injuryStatus,
      lineupSlotId,
      starter: !ESPN_BENCH_SLOTS.has(lineupSlotId),
      actual,
      projected,
      seasonAvg: espnSeasonAverage(player),
      status: event && eventState(event).live ? "LIVE" : event && eventState(event).final ? "FINAL" : player.injuryStatus && player.injuryStatus !== "ACTIVE" ? String(player.injuryStatus).toUpperCase() : "UPCOMING",
      event,
      statLine: espnStatLine(player, actual, projected, event),
      statRows: rows,
      ...liveFields,
      side
    };
    return playerData;
  }

  function normalizeESPNTeam(rawTeam, currentSide, scoringPeriodId, side) {
    if (!rawTeam) return null;
    const entries = rawTeam.roster && rawTeam.roster.entries || [];
    const currentEntries = currentSide && currentSide.rosterForCurrentScoringPeriod && currentSide.rosterForCurrentScoringPeriod.entries || [];
    const currentById = new Map(currentEntries.map((entry) => [String(entry.playerId || entry.playerPoolEntry && entry.playerPoolEntry.id), entry]));
    const players = {};
    const ids = [];
    const starters = [];
    entries.forEach((entry) => {
      const id = String(entry.playerId || entry.playerPoolEntry && entry.playerPoolEntry.id || "");
      if (!id) return;
      const row = normalizeESPNEntry(entry, currentById.get(id), scoringPeriodId, side);
      players[id] = row;
      ids.push(id);
      if (row.starter) starters.push(id);
    });
    const starterRows = ids.map((id) => players[id]).filter((row) => row && row.starter);
    const actual = starterRows.reduce((sum, row) => sum + (finite(row.actual) || 0), 0);
    const projected = starterRows.reduce((sum, row) => sum + (finite(row.projected) || 0), 0);
    return {
      name: rawTeam.name || rawTeam.abbrev || (side === "own" ? CONFIG.espnTeamName : "OPPONENT"),
      abbrev: rawTeam.abbrev || "TEAM",
      roster: { players: ids, starters },
      players,
      pointsMap: Object.fromEntries(ids.map((id) => [id, players[id].actual])),
      total: actual,
      projected: projected,
      projectedMap: Object.fromEntries(ids.map((id) => [id, players[id].projected]))
    };
  }

  async function loadESPNPublic() {
    const data = await getJSON(`${ESPN_PUBLIC_URL}&ts=${Date.now()}`);
    const scoringPeriodId = Number(data.status && (data.status.currentMatchupPeriod || data.status.latestScoringPeriod) || 1);
    const teams = Array.isArray(data.teams) ? data.teams : [];
    const ownRaw = teams.find((team) => nameKey(team.name) === nameKey(CONFIG.espnTeamName) || nameKey(team.abbrev) === nameKey(CONFIG.espnTeamName));
    if (!ownRaw) throw new Error("ESPN team not found in public league feed");
    const matchup = (data.schedule || []).find((row) => Number(row.matchupPeriodId) === scoringPeriodId && (Number(row.home && row.home.teamId) === Number(ownRaw.id) || Number(row.away && row.away.teamId) === Number(ownRaw.id)));
    const opponentId = matchup && (Number(matchup.home && matchup.home.teamId) === Number(ownRaw.id) ? Number(matchup.away && matchup.away.teamId) : Number(matchup.home && matchup.home.teamId));
    const opponentRaw = teams.find((team) => Number(team.id) === opponentId) || null;
    const ownSide = matchup && Number(matchup.home && matchup.home.teamId) === Number(ownRaw.id) ? matchup.home : matchup && matchup.away;
    const opponentSide = matchup && Number(matchup.home && matchup.home.teamId) === Number(opponentId) ? matchup.home : matchup && matchup.away;
    const ownTeam = normalizeESPNTeam(ownRaw, ownSide, scoringPeriodId, "own");
    const opponentTeam = normalizeESPNTeam(opponentRaw, opponentSide, scoringPeriodId, "opponent");
    const projectionPlayers = {};
    teams.forEach((team) => (team.roster && team.roster.entries || []).forEach((entry) => {
      const row = normalizeESPNEntry(entry, null, scoringPeriodId, "projection");
      if (row && row.full_name && finite(row.projected) != null) projectionPlayers[nameKey(row.full_name)] = { projected: row.projected, source: "PUBLIC ESPN" };
    }));
    return { ready: true, source: "PUBLIC ESPN LIVE", savedAt: new Date().toISOString(), scoringPeriodId, matchupPeriodId: scoringPeriodId, myTeam: ownTeam, opponent: opponentTeam, projectionPlayers, public: true };
  }

  async function loadESPN() {
    try {
      return await loadESPNPublic();
    } catch (publicError) {
      try {
        const local = await getJSON(new URL("../patriots-fantasy/espn-data.json?ts=" + Date.now(), location.href));
        if (local && local.ready) return local;
      } catch (_) { /* Direct public feed remains the primary path. */ }
      return { ready: false, error: publicError && publicError.message || "ESPN public feed unavailable" };
    }
  }

  async function loadConsensus() {
    try { return await getJSON(new URL(`${root}consensus-data.json?ts=${Date.now()}`, location.href)); } catch (_) { return { status: "unavailable", players: {}, sources: [], insights: [] }; }
  }

  async function loadScoreboard() {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    try { return await getJSON(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=1000&dates=${stamp}`); } catch (_) { return { events: [] }; }
  }

  function mergeESPNTeam(team, side) {
    if (!team) return null;
    const roster = team.roster || { starters: [], players: [] };
    const ids = (roster.players || Object.keys(team.players || {})).map(String);
    const starters = new Set((roster.starters || []).map(String));
    const pointsMap = team.pointsMap || {};
    const players = ids.map((id) => {
      const source = team.players && team.players[id] || { player_id: id, full_name: id, team: "FA", position: "UTIL" };
      const player = { ...source, player_id: id, full_name: source.full_name || source.name || id, name: source.full_name || source.name || id };
      const consensus = consensusFor(player);
      const actual = finite(pointsMap[id]) ?? finite(player.actual) ?? 0;
      const projected = consensus.value != null ? consensus.value : finite(player.projected);
      const event = player.event || findPlayerEvent(player);
      const eventStatus = event && eventState(event).live ? "LIVE" : event && eventState(event).final ? "FINAL" : null;
      return { ...player, actual, projected, seasonAvg: finite(player.seasonAvg), status: eventStatus || player.status || (player.injury_status ? String(player.injury_status).toUpperCase() : "UPCOMING"), starter: player.starter != null ? player.starter : starters.has(id), side, event, consensus };
    });
    return { name: team.name || (side === "own" ? CONFIG.espnTeamName : "OPPONENT"), players, roster, total: finite(team.total) ?? players.filter((player) => player.starter).reduce((sum, player) => sum + (finite(player.actual) || 0), 0), projected: finite(team.projected) ?? players.filter((player) => player.starter).reduce((sum, player) => sum + (finite(player.projected) || 0), 0) };
  }

  function currentLeague() {
    if (state.league === "sleeper" && state.sleeper) {
      const data = state.sleeper;
      const own = sleeperPlayerIds(data.roster).map((id) => normalizeSleeperPlayer(id, data.players, data.pointsMap, data.roster, state.consensus));
      const opponent = data.opponentRoster ? sleeperPlayerIds(data.opponentRoster).map((id) => normalizeSleeperPlayer(id, data.players, data.opponentPointsMap, data.opponentRoster, state.consensus)) : [];
      return { id: "sleeper", name: CONFIG.sleeperTeamName, ownName: CONFIG.sleeperTeamName, opponentName: rosterName(data.opponentRoster, data.users, "OPPONENT"), own, opponent, ownActual: finite(data.matchup && data.matchup.points) || 0, opponentActual: finite(data.opponentMatchup && data.opponentMatchup.points) || 0, week: data.week, ready: true };
    }
    const data = state.espn;
    if (data && data.ready && data.myTeam) {
      const own = mergeESPNTeam(data.myTeam, "own");
      const opponent = mergeESPNTeam(data.opponent, "opponent");
      return { id: "espn", name: CONFIG.espnTeamName, ownName: own && own.name || CONFIG.espnTeamName, opponentName: opponent && opponent.name || "MATCHUP PENDING", own: own && own.players || [], opponent: opponent && opponent.players || [], ownActual: own && own.total || 0, opponentActual: opponent && opponent.total || 0, week: data.matchupPeriodId || state.week, ready: true };
    }
    return { id: "espn", name: CONFIG.espnTeamName, ownName: CONFIG.espnTeamName, opponentName: "MATCHUP PENDING", own: [], opponent: [], ownActual: 0, opponentActual: 0, week: state.week, ready: false };
  }

  function leagueStarted(league) {
    const rows = [...(league.own || []), ...(league.opponent || [])];
    return rows.some((player) => player.event && (eventState(player.event).live || eventState(player.event).final)) || rows.some((player) => player.status === "LIVE" || player.status === "FINAL");
  }

  function actualForPlayer(player) {
    const event = player && (player.event || findPlayerEvent(player));
    return event && (eventState(event).live || eventState(event).final) ? finite(player.actual) || 0 : player && player.status === "LIVE" ? finite(player.actual) || 0 : 0;
  }

  function leagueActual(league, side) {
    const value = side === "own" ? league.ownActual : league.opponentActual;
    return leagueStarted(league) ? finite(value) || 0 : 0;
  }

  function sourceStats() {
    const catalog = window.FANTASY_SOURCE_CATALOG || [];
    const liveSources = (state.consensus && state.consensus.sources || []).filter((source) => source.status === "live" || source.status === "ok");
    const direct = [
      ...(state.sleeper ? [{ id: "sleeper", name: "Sleeper", status: "live" }] : []),
      ...(state.espn && state.espn.ready ? [{ id: "espn", name: "ESPN public", status: "live" }] : [])
    ];
    const all = [...liveSources, ...direct].filter((source, index, list) => list.findIndex((candidate) => candidate.id === source.id) === index);
    return { catalog: catalog.length || 30, live: all.length, sources: all, oddsBooks: state.consensus && state.consensus.odds_books || 0 };
  }

  function projectionLabel(player) {
    const c = player && player.consensus || consensusFor(player);
    if (c.value == null) return "PROJ FEED SYNCING";
    const source = c.sourceCount ? `${c.sourceCount} SRC` : "DIRECT";
    return `PROJ ${number(c.value)} • ${source}`;
  }

  function rangeLabel(player) {
    const c = player && player.consensus || consensusFor(player);
    if (c.min == null || c.max == null) return "RANGE FEED SYNCING";
    return `RANGE ${number(c.min)}–${number(c.max)} (${number(c.range)})`;
  }

  function oddsLabel(player) {
    const c = player && player.consensus || consensusFor(player);
    if (c.market && c.market.min != null && c.market.max != null) return `ODDS RANGE ${number(c.market.min)}–${number(c.market.max)} (${number(c.market.range, 1, "0")})`;
    return c.odds && c.odds.length ? `ODDS ${c.odds.length} LINES` : "ODDS FEED CONNECTING";
  }

  function playerOpponent(player) {
    const event = player && (player.event || findPlayerEvent(player));
    if (!event) return "UPCOMING";
    const team = String(player.team || "").toUpperCase();
    const other = eventCompetitors(event).find((candidate) => String(candidate.team && candidate.team.abbreviation || "").toUpperCase() !== team);
    return other && other.team && other.team.abbreviation || "UPCOMING";
  }

  function playerCard(player, side = "own") {
    const actual = actualForPlayer(player);
    const c = player.consensus || consensusFor(player);
    const statusClass = /OUT|IR|DOUBTFUL|QUESTIONABLE/.test(String(player.status || "")) ? "warn" : player.status === "LIVE" ? "live" : "";
    return `<button class="player-card ${side} ${statusClass}" data-player-id="${esc(player.player_id)}" data-side="${side}" type="button"><div class="player-position">${esc(player.position || "UTIL")}</div>${playerFace(player)}<div class="player-card-copy"><strong>${esc(player.full_name || player.name || player.player_id)}</strong><span>${esc(player.team || "FA")} • VS ${esc(playerOpponent(player))} • <b class="status-text">${esc(player.status || "UPCOMING")}</b></span><small>${esc(player.statLine || "PREGAME • LIVE STAT LINE READY")}</small></div><div class="player-card-score"><strong class="actual-score">${number(actual)}</strong><small>PTS</small><span>${esc(projectionLabel({ ...player, consensus: c }))}</span><em>${esc(rangeLabel({ ...player, consensus: c }))}</em></div><span class="chevron">›</span></button>`;
  }

  function compactPlayerRow(player) {
    const actual = actualForPlayer(player);
    return `<button class="compact-player" data-player-id="${esc(player.player_id)}" data-side="own" type="button">${playerFace(player, "small")}<span><strong>${esc(player.full_name || player.name)}</strong><small>${esc(player.position || "UTIL")} • ${esc(player.team || "FA")} • ${esc(player.status || "UPCOMING")}</small></span><b>${number(actual)}<small>${esc(projectionLabel(player))}</small></b></button>`;
  }

  function liveGamesMarkup() {
    const events = (state.scoreboard || []).filter((event) => eventState(event).live || eventState(event).upcoming).slice(0, 8);
    if (!events.length) return `<div class="empty-card"><strong>LIVE GAME FEED WAITING</strong><span>Games, quarter/clock, possession, and prop markets will appear here on game day.</span></div>`;
    return `<div class="live-games-grid">${events.map((event) => {
      const status = eventState(event);
      const competitors = eventCompetitors(event);
      const away = competitors.find((c) => c.homeAway === "away") || competitors[0] || {};
      const home = competitors.find((c) => c.homeAway === "home") || competitors[1] || {};
      return `<article class="live-game ${status.live ? "is-live" : ""}"><div class="live-game-top"><span>${status.live ? "LIVE NOW" : "NEXT"}</span><small>${esc(status.live ? `${status.type.shortDetail || "LIVE"}` : new Date(event.date || 0).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }))}</small></div><div class="game-team"><img src="${teamLogo(away.team && away.team.abbreviation)}" alt=""><strong>${esc(away.team && away.team.abbreviation || "TEAM")}</strong><b>${esc(away.score == null ? "PREGAME" : away.score)}</b></div><div class="game-team"><img src="${teamLogo(home.team && home.team.abbreviation)}" alt=""><strong>${esc(home.team && home.team.abbreviation || "TEAM")}</strong><b>${esc(home.score == null ? "PREGAME" : home.score)}</b></div></article>`;
    }).join("")}</div>`;
  }

  function sourceCoverageMarkup() {
    const stats = sourceStats();
    const catalog = stats.catalog;
    const live = stats.live;
    const consensus = state.consensus || {};
    const status = consensus.status === "ready" || consensus.status === "live" ? "CONSENSUS LIVE" : live > 1 ? "PARTIAL CONSENSUS" : "DIRECT FEED ONLY";
    const sourceNames = stats.sources.slice(0, 6).map((source) => `<span class="source-chip live">${esc(source.name || source.id)}</span>`).join("");
    return `<section class="source-panel"><div class="section-kicker">PROJECTION ENGINE</div><div class="source-top"><strong>${esc(status)}</strong><span>${live}/${catalog} SOURCES</span></div><div class="source-bar"><span style="width:${Math.min(100, Math.max(4, live / Math.max(1, catalog) * 100))}%"></span></div><div class="source-meta"><span>UPDATED ${esc(formatAge(consensus.generated_at || state.refreshedAt))}</span><span>${stats.oddsBooks ? `${stats.oddsBooks} BOOKS` : "ODDS FEED CONNECTING"}</span></div><div class="source-chips">${sourceNames || `<span class="source-chip">PUBLIC ESPN + SLEEPER</span>`}</div><p>Actual points are live when games start. Projections stay visible from the available public feed; ranges appear when multiple lines respond.</p></section>`;
  }

  function insightMarkup() {
    const insights = state.consensus && state.consensus.insights || [];
    if (!insights.length) return `<div class="empty-card compact"><strong>DIFFERENCE FEED SYNCING</strong><span>Provider ranges will appear as soon as public projection lines respond.</span></div>`;
    return `<div class="insight-list">${insights.slice(0, 5).map((item) => `<button class="insight-row" type="button" data-player-name="${esc(item.name)}"><span class="insight-rank">${esc(item.rank || "#")}</span><span><strong>${esc(item.name)}</strong><small>${esc(item.market || "FANTASY PROJECTION")} • ${esc(item.source || "OUTLIER")}</small></span><b>${item.delta == null ? "SYNC" : `+${number(item.delta)}`}<small>${item.range == null ? "RANGE FEED" : `RANGE ${number(item.range)}`}</small></b></button>`).join("")}</div>`;
  }

  function renderHero(league) {
    const started = leagueStarted(league);
    const ownActual = leagueActual(league, "own");
    const opponentActual = leagueActual(league, "opponent");
    const ownProjection = (league.own || []).filter((player) => player.starter !== false).reduce((sum, player) => sum + (finite(player.projected) || 0), 0);
    const opponentProjection = (league.opponent || []).filter((player) => player.starter !== false).reduce((sum, player) => sum + (finite(player.projected) || 0), 0);
    const ownHasProj = (league.own || []).some((player) => finite(player.projected) != null);
    const oppHasProj = (league.opponent || []).some((player) => finite(player.projected) != null);
    const totalProjection = ownProjection + opponentProjection;
    const ownPct = totalProjection > 0 ? Math.round(ownProjection / totalProjection * 100) : 50;
    const opponentPct = 100 - ownPct;
    const ownMark = initials(league.ownName);
    const opponentMark = initials(league.opponentName);
    return `<section class="matchup-hero"><div class="hero-team own"><div class="hero-team-copy"><span>YOUR TEAM</span><strong>${esc(league.ownName)}</strong><small>WEEK ${esc(league.week || state.week)} • ${started ? "LIVE TOTALS" : "PREGAME PROJECTION"}</small></div><span class="hero-mark red-mark" aria-label="${esc(league.ownName)}">${esc(ownMark)}</span></div><div class="hero-score"><span class="live-pill ${started ? "active" : ""}"><i></i>${started ? "LIVE" : "PREGAME"}</span><div><strong>${number(ownActual)}</strong><em>VS</em><strong>${number(opponentActual)}</strong></div><div class="hero-proj"><span>PROJ ${ownHasProj ? number(ownProjection) : "FEED SYNCING"}</span><span>PROJ ${oppHasProj ? number(opponentProjection) : "FEED SYNCING"}</span></div><div class="win-bar"><span class="win-own" style="width:${ownPct}%"></span><span class="win-label">${ownPct}% PROJECTED WIN PROBABILITY • MODEL FROM LIVE PROJECTIONS</span><span class="win-opp" style="width:${opponentPct}%"></span></div></div><div class="hero-team opponent"><span class="hero-mark blue-mark" aria-label="${esc(league.opponentName)}">${esc(opponentMark)}</span><div class="hero-team-copy"><span>OPPONENT</span><strong>${esc(league.opponentName)}</strong><small>${started ? "MATCHUP LIVE" : "MATCHUP PREVIEW"}</small></div></div><div class="hero-meta"><span>${esc(sourceStats().live)}/${esc(sourceStats().catalog)} PROJECTION SOURCES</span><span>${esc(state.consensus && state.consensus.odds_books || 0)} ODDS BOOKS CONNECTED</span><span>UPDATED ${esc(formatAge(state.consensus && state.consensus.generated_at || state.refreshedAt))}</span></div></section>`;
  }

  function renderMonitorTabs() {
    return `<div class="monitor-tabs" role="tablist"><button data-view="overview" class="${state.view === "overview" ? "active" : ""}" type="button">OVERVIEW</button><button data-view="matchups" class="${state.view === "matchups" ? "active" : ""}" type="button">STARTERS</button><button data-view="players" class="${state.view === "players" ? "active" : ""}" type="button">BENCH / PLAYERS</button><button data-view="live" class="${state.view === "live" ? "active" : ""}" type="button">SCORING</button><button data-view="injuries" class="${state.view === "injuries" ? "active" : ""}" type="button">INJURIES</button></div>`;
  }

  function renderFocusPanel(league) {
    const players = [...(league.own || []), ...(league.opponent || [])];
    const focus = state.selectedPlayer && players.find((player) => String(player.player_id) === String(state.selectedPlayer.player_id)) || players.find((player) => player.status === "LIVE") || players.find((player) => player.starter !== false) || players[0];
    if (!focus) return `<section class="focus-panel workspace-panel"><div class="empty-card"><strong>PLAYER DETAIL SYNCING</strong><span>Live player details appear when the roster feed responds.</span></div></section>`;
    const c = focus.consensus || consensusFor(focus);
    const actual = actualForPlayer(focus);
    const projection = finite(c.value) ?? finite(focus.projected);
    const average = finite(focus.seasonAvg) ?? projection;
    const stat = (value) => textValue(value, "SYNCING");
    const trendValues = [finite(focus.actual) || 0, projection || 0, average || 0];
    const peak = Math.max(...trendValues, 1);
    const bars = trendValues.map((value, index) => `<span style="height:${Math.max(14, Math.round(value / peak * 72))}%" class="${index === 0 ? "current" : ""}"></span>`).join("");
    const next = playerOpponent(focus);
    return `<section class="focus-panel workspace-panel"><div class="focus-top"><span class="section-kicker">PLAYER FOCUS</span><button class="focus-close" type="button" aria-label="Clear player focus">×</button></div><div class="focus-player">${playerFace(focus, "large")}<div><h2>${esc(focus.full_name || focus.name)}</h2><p>${esc(focus.position || "UTIL")} • ${esc(focus.team || "FA")} • ${esc(focus.side === "opponent" ? league.opponentName : league.ownName)}</p><span class="live-pill ${focus.status === "LIVE" ? "active" : ""}"><i></i>${esc(focus.status || "UPCOMING")} • VS ${esc(next)}</span></div></div><div class="focus-score-grid"><div><strong>${number(actual)}</strong><small>LIVE POINTS</small></div><div><strong>${projection == null ? "SYNC" : number(projection)}</strong><small>PROJ POINTS</small></div><div><strong>${average == null ? "SYNC" : number(average)}</strong><small>SEASON AVG</small></div></div><div class="focus-tabs"><span class="active">STATS</span><span>TRENDS</span><span>MATCHUP</span><span>NEWS</span></div><div class="focus-stat-grid"><div><b>${stat(focus.pass_yd || focus.passing_yards)}</b><small>PASS YDS</small></div><div><b>${stat(focus.pass_td || focus.passing_tds)}</b><small>PASS TD</small></div><div><b>${stat(focus.interceptions || focus.int)}</b><small>INT</small></div><div><b>${stat(focus.rush_yd || focus.rushing_yards)}</b><small>RUSH YDS</small></div><div><b>${stat(focus.rec || focus.receptions)}</b><small>REC</small></div><div><b>${stat(focus.tgt || focus.targets)}</b><small>TARGETS</small></div></div><div class="focus-trend-heading"><b>FANTASY POINTS SNAPSHOT</b><span>LIVE • PROJ • AVG</span></div><div class="focus-trend">${bars}</div><div class="focus-trend-labels"><span>LIVE</span><span>PROJ</span><span>AVG</span></div><div class="focus-next"><span>NEXT GAME</span><b>${esc(next)} • ${esc(focus.status === "LIVE" ? "IN PROGRESS" : "SCHEDULED")}</b></div><div class="focus-feed"><span class="status-dot live"></span><b>${esc(focus.statLine || "PREGAME • LIVE STAT LINE READY")}</b></div>${sourceCoverageMarkup()}</section>`;
  }

  function renderScoringTicker(league) {
    const ownActual = leagueActual(league, "own");
    const opponentActual = leagueActual(league, "opponent");
    const ownProjection = (league.own || []).filter((player) => player.starter !== false).reduce((sum, player) => sum + (finite(player.projected) || 0), 0);
    const opponentProjection = (league.opponent || []).filter((player) => player.starter !== false).reduce((sum, player) => sum + (finite(player.projected) || 0), 0);
    return `<section class="scoring-ticker"><div class="ticker-label"><span>WEEK ${esc(league.week || state.week)} SCORING</span><small>ACTUAL LARGE • PROJECTION ALWAYS VISIBLE</small></div><div><span>YOUR TEAM</span><b>${number(ownActual)}</b><small>PROJ ${number(ownProjection)}</small></div><div><span>OPPONENT</span><b>${number(opponentActual)}</b><small>PROJ ${number(opponentProjection)}</small></div><div><span>REFRESH</span><b>5s</b><small>${esc(formatAge(state.refreshedAt))}</small></div></section>`;
  }

  function renderOverview(league) {
    const starters = (league.own || []).filter((player) => player.starter !== false).slice(0, 10);
    const opponentStarters = (league.opponent || []).filter((player) => player.starter !== false).slice(0, 10);
    const bench = (league.own || []).filter((player) => player.starter === false).slice(0, 6);
    const monitor = document.body.dataset.layout === "monitor";
    return `${monitor ? renderMonitorTabs() : ""}<div class="overview-grid"><section class="workspace-panel roster-panel"><div class="panel-heading red-heading"><span><b>MY STARTERS</b><small>${esc(league.ownName)} • LIVE TOTALS + PROJECTIONS</small></span><button class="panel-action" data-view="players" type="button">ALL PLAYERS ›</button></div><div class="player-stack">${starters.length ? starters.map((player) => playerCard(player, "own")).join("") : `<div class="empty-card"><strong>ROSTER FEED SYNCING</strong><span>Waiting for the fantasy provider to return starters.</span></div>`}</div><div class="bench-strip"><span>BENCH • ${bench.length} SHOWN</span>${bench.slice(0, 3).map(compactPlayerRow).join("")}</div></section><section class="workspace-panel roster-panel opponent-panel"><div class="panel-heading blue-heading"><span><b>OPPONENT STARTERS</b><small>${esc(league.opponentName)} • MATCHUP LIVE FEED</small></span><button class="panel-action" data-view="matchups" type="button">MATCHUP ›</button></div><div class="player-stack">${opponentStarters.length ? opponentStarters.map((player) => playerCard(player, "opponent")).join("") : `<div class="empty-card"><strong>OPPONENT FEED SYNCING</strong><span>Waiting for the matchup side to respond.</span></div>`}</div></section><aside class="overview-side">${monitor ? renderFocusPanel(league) : `<section class="workspace-panel games-panel"><div class="panel-heading cyan-heading"><span><b>LIVE GAMES</b><small>TOUCH A GAME FOR DETAILS</small></span><button class="panel-action" data-view="live" type="button">ALL GAMES ›</button></div>${liveGamesMarkup()}</section><section class="workspace-panel difference-panel"><div class="panel-heading amber-heading"><span><b>BIGGEST DIFFERENCES</b><small>PROJECTION + ODDS RANGE</small></span><button class="panel-action" data-view="players" type="button">OPEN ›</button></div>${insightMarkup()}</section>${sourceCoverageMarkup()}`}</aside></div>${monitor ? renderScoringTicker(league) : ""}`;
  }

  function renderMatchups(league) {
    const own = (league.own || []).filter((player) => player.starter !== false);
    const opponent = (league.opponent || []).filter((player) => player.starter !== false);
    return `<div class="matchup-grid"><section class="workspace-panel roster-panel"><div class="panel-heading red-heading"><span><b>${esc(league.ownName)}</b><small>STARTERS • ${own.length} SLOTS</small></span><span class="panel-total">${number(leagueActual(league, "own"))}</span></div><div class="player-stack">${own.map((player) => playerCard(player, "own")).join("")}</div></section><section class="workspace-panel roster-panel opponent-panel"><div class="panel-heading blue-heading"><span><b>${esc(league.opponentName)}</b><small>OPPONENT • ${opponent.length} SLOTS</small></span><span class="panel-total">${number(leagueActual(league, "opponent"))}</span></div><div class="player-stack">${opponent.map((player) => playerCard(player, "opponent")).join("")}</div></section><aside class="workspace-panel matchup-insights"><div class="panel-heading amber-heading"><span><b>MARKET DIFFERENCES</b><small>MAX − MIN BY PLAYER</small></span></div>${insightMarkup()}${sourceCoverageMarkup()}</aside></div>`;
  }

  function renderPlayers(league) {
    const players = [...(league.own || []).map((player) => ({ ...player, rosterSide: "YOUR ROSTER" })), ...(league.opponent || []).map((player) => ({ ...player, rosterSide: "OPPONENT" }))];
    const live = players.filter((player) => player.status === "LIVE");
    return `<div class="players-view"><div class="filter-row"><button class="filter active" type="button">ALL PLAYERS</button><button class="filter" type="button">STARTERS</button><button class="filter" type="button">BENCH</button><button class="filter" type="button">LIVE NOW${live.length ? ` • ${live.length}` : ""}</button><span class="filter-note">Actual large • projection small • source range under every row</span></div><div class="players-table"><div class="players-table-head"><span>PLAYER</span><span>STATUS / MATCHUP</span><span>ACTUAL</span><span>CONSENSUS</span><span>ODDS / RANGE</span></div>${players.map((player) => `<button class="players-table-row" data-player-id="${esc(player.player_id)}" data-side="own" type="button">${playerFace(player, "small")}<span><strong>${esc(player.full_name || player.name)}</strong><small>${esc(player.position || "UTIL")} • ${esc(player.team || "FA")} • ${esc(player.rosterSide)}</small></span><span><b class="status-text">${esc(player.status || "UPCOMING")}</b><small>VS ${esc(playerOpponent(player))}</small></span><strong class="table-actual">${number(actualForPlayer(player))}<small>PTS</small></strong><span class="table-proj">${esc(projectionLabel(player))}<small>${esc(rangeLabel(player))}</small></span><span class="table-odds">${esc(oddsLabel(player))}<small>OPEN DETAIL ›</small></span></button>`).join("")}</div></div>`;
  }

  function renderInjuries(league) {
    const players = [...(league.own || []).map((player) => ({ ...player, rosterSide: "YOUR ROSTER" })), ...(league.opponent || []).map((player) => ({ ...player, rosterSide: "OPPONENT" }))];
    const flagged = players.filter((player) => /OUT|IR|DOUBTFUL|QUESTIONABLE|INJURY/i.test(String(player.status || "")));
    const rows = flagged.length ? flagged : players.filter((player) => player.status && player.status !== "ACTIVE" && player.status !== "NO GAME").slice(0, 8);
    return `<div class="injuries-view"><section class="workspace-panel"><div class="panel-heading amber-heading"><span><b>INJURY CENTER</b><small>STATUS • PRACTICE • PLAY PROBABILITY</small></span><span class="panel-total">${rows.length} FLAGS</span></div><div class="injury-grid">${rows.length ? rows.map((player) => `<button class="injury-card" data-player-id="${esc(player.player_id)}" data-side="own" type="button">${playerFace(player, "medium")}<span><strong>${esc(player.full_name || player.name)}</strong><small>${esc(player.team || "FA")} • ${esc(player.position || "UTIL")} • ${esc(player.rosterSide)}</small><b class="injury-status">${esc(player.status || "QUESTIONABLE")}</b><em>MEDIAN PLAY PROBABILITY • PROVIDER DATA SYNCING</em></span><span class="probability-track"><i style="width:${/OUT|IR/.test(String(player.status || "")) ? 5 : 50}%"></i></span></button>`).join("") : `<div class="empty-card"><strong>NO CURRENT ROSTER FLAGS</strong><span>Practice updates and median probability will appear when provider feeds respond.</span></div>`}</div></section><aside>${sourceCoverageMarkup()}<section class="workspace-panel injury-note"><div class="panel-heading cyan-heading"><span><b>HOW PROBABILITY WORKS</b><small>TRANSPARENT SIGNALS</small></span></div><p>Each player will show a median of enabled practice, injury, news, and sportsbook availability signals. Missing sources stay missing; they are never silently treated as a healthy 100%.</p></section></aside></div>`;
  }

  function renderLive(league) {
    const livePlayers = [...(league.own || []), ...(league.opponent || [])].filter((player) => player.status === "LIVE");
    return `<div class="live-view"><section class="workspace-panel games-panel"><div class="panel-heading cyan-heading"><span><b>LIVE GAME BOARD</b><small>REFRESHING EVERY ${CONFIG.refreshMs / 1000}s</small></span><span class="panel-total">${livePlayers.length} FANTASY LIVE</span></div>${liveGamesMarkup()}</section><section class="workspace-panel live-players"><div class="panel-heading green-heading"><span><b>LIVE PLAYER PERFORMANCE</b><small>ACTUAL SCORE IS PRIMARY • PROJ STAYS VISIBLE</small></span></div><div class="player-stack">${livePlayers.length ? livePlayers.map((player) => playerCard(player, player.side || "own")).join("") : `<div class="empty-card"><strong>NO ROSTER PLAYERS LIVE</strong><span>When a game starts, actual points and live stat lines replace the pregame zero.</span></div>`}</div></section><aside class="workspace-panel difference-panel"><div class="panel-heading amber-heading"><span><b>LIVE MARKET MOVES</b><small>LINE RANGE + OUTLIER</small></span></div>${insightMarkup()}</aside></div>`;
  }

  function renderDrawer() {
    const drawer = $("#playerDrawer");
    if (!state.selectedPlayer) { drawer.classList.remove("open"); drawer.innerHTML = ""; return; }
    const player = state.selectedPlayer;
    const c = player.consensus || consensusFor(player);
    const actual = actualForPlayer(player);
    const sourceRows = c.sources && c.sources.length ? c.sources.slice(0, 8).map((source) => `<div class="source-value"><span>${esc(source.source || source.name || "SOURCE")}</span><b>${number(source.value, 1, "SYNC")}</b></div>`).join("") : `<div class="empty-card compact"><strong>PUBLIC PROJECTION FEED</strong><span>Additional source values appear when provider endpoints respond.</span></div>`;
    const oddsRows = c.odds && c.odds.length ? c.odds.slice(0, 8).map((odd) => `<div class="source-value"><span>${esc(odd.book || odd.bookmaker || odd.source || "BOOK")} • ${esc(odd.market || "PROP")}</span><b>${esc(odd.line == null ? "SYNC" : odd.line)} <small>${esc(odd.price == null ? "" : odd.price)}</small></b></div>`).join("") : `<div class="empty-card compact"><strong>ODDS FEED CONNECTING</strong><span>Market range appears after an odds provider is enabled.</span></div>`;
    drawer.classList.add("open");
    drawer.innerHTML = `<div class="drawer-top"><span class="section-kicker">PLAYER DETAIL</span><button id="closeDrawer" type="button" aria-label="Close player detail">×</button></div><div class="drawer-player">${playerFace(player, "large")}<div><h2>${esc(player.full_name || player.name)}</h2><p>${esc(player.position || "UTIL")} • ${esc(player.team || "FA")} • VS ${esc(playerOpponent(player))}</p><span class="live-pill ${player.status === "LIVE" ? "active" : ""}"><i></i>${esc(player.status || "UPCOMING")}</span></div></div><div class="drawer-score-grid"><div><strong>${number(actual)}</strong><small>ACTUAL / LIVE</small></div><div><strong>${c.value == null ? "SYNC" : number(c.value)}</strong><small>CONSENSUS PROJ</small></div><div><strong>${c.range == null ? "SYNC" : number(c.range)}</strong><small>PROJ RANGE</small></div></div><div class="drawer-tabs"><button class="active" type="button">STATS</button><button type="button">TRENDS</button><button type="button">MARKET</button><button type="button">NEWS</button></div><section class="drawer-section"><div class="drawer-heading"><b>LIVE / PROJECTED STAT LINE</b><span>${esc(projectionLabel(player))}</span></div><div class="stat-grid"><div><b>${esc(textValue(player.pass_yd || player.passing_yards))}</b><small>PASS YDS</small></div><div><b>${esc(textValue(player.pass_td || player.passing_tds))}</b><small>PASS TD</small></div><div><b>${esc(textValue(player.rush_yd || player.rushing_yards))}</b><small>RUSH YDS</small></div><div><b>${esc(textValue(player.rec || player.receptions))}</b><small>REC</small></div><div><b>${esc(textValue(player.rec_yd || player.receiving_yards))}</b><small>REC YDS</small></div><div><b>${esc(textValue(player.tgt || player.targets))}</b><small>TARGETS</small></div></div></section><section class="drawer-section"><div class="drawer-heading"><b>PROJECTION SOURCES</b><span>${esc(rangeLabel(player))}</span></div>${sourceRows}</section><section class="drawer-section"><div class="drawer-heading"><b>SPORTSBOOK ODDS</b><span>${esc(oddsLabel(player))}</span></div>${oddsRows}</section><p class="drawer-disclaimer">Informational only. Lines can move, disappear, or be delayed by a provider. Biggest difference means the largest absolute gap from the current median.</p>`;
    $("#closeDrawer").addEventListener("click", () => { state.selectedPlayer = null; renderDrawer(); });
  }

  function renderWorkspace(league) {
    const workspace = $("#workspace");
    if (state.loading) { workspace.innerHTML = `<div class="loading-panel">LOADING LIVE FANTASY DATA…</div>`; return; }
    if (!league.ready && state.view !== "overview") { workspace.innerHTML = `<div class="loading-panel"><strong>ESPN PRIVATE SYNC NEEDED</strong><span>Make the league public or add ESPN_S2 and ESPN_SWID as private Actions secrets.</span></div>`; return; }
    if (state.view === "matchups") workspace.innerHTML = renderMatchups(league);
    else if (state.view === "players") workspace.innerHTML = renderPlayers(league);
    else if (state.view === "injuries") workspace.innerHTML = renderInjuries(league);
    else if (state.view === "live") workspace.innerHTML = renderLive(league);
    else workspace.innerHTML = renderOverview(league);
    wireInteractions();
  }

  function render() {
    const league = currentLeague();
    $("#weekLabel").textContent = `WEEK ${league.week || state.week}`;
    $("#matchupHero").innerHTML = renderHero(league);
    renderWorkspace(league);
    renderDrawer();
    $$("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
    $$("[data-league]").forEach((button) => button.classList.toggle("active", button.dataset.league === state.league));
    $("#connectionText").textContent = state.error ? "FEED PARTIAL" : state.loading ? "CONNECTING" : "LIVE DATA CONNECTED";
    $("#connectionDot").className = `status-dot ${state.error ? "warn" : state.loading ? "" : "live"}`;
    $("#lastSync").textContent = `SYNC ${formatClock(state.refreshedAt || new Date())}`;
    $("#sourceStatus").textContent = `${sourceStats().live}/${sourceStats().catalog} PROJECTION SOURCES`;
    const oddsStatus = $("#oddsStatus");
    if (oddsStatus) oddsStatus.textContent = sourceStats().oddsBooks ? `${sourceStats().oddsBooks} ODDS BOOKS` : "ODDS FEED CONNECTING";
  }

  function wireInteractions() {
    $$("[data-view]").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.view; state.selectedPlayer = null; render(); }));
    $$("[data-league]").forEach((button) => button.addEventListener("click", () => { state.league = button.dataset.league; state.selectedPlayer = null; render(); }));
    $$('[data-player-id]').forEach((button) => button.addEventListener("click", () => {
      const league = currentLeague();
      const players = [...(league.own || []), ...(league.opponent || [])];
      state.selectedPlayer = players.find((player) => String(player.player_id) === String(button.dataset.playerId)) || null;
      renderDrawer();
    }));
    const focusClose = $(".focus-close");
    if (focusClose) focusClose.addEventListener("click", () => { state.selectedPlayer = null; render(); });
  }

  async function refresh() {
    if (refreshInFlight) return;
    refreshInFlight = true;
    const [sleeperResult, espnResult, consensusResult, scoreboardResult] = await Promise.all([
      loadSleeper().then((value) => ({ value })).catch((error) => ({ error })),
      loadESPN().then((value) => ({ value })).catch((error) => ({ error })),
      loadConsensus().then((value) => ({ value })).catch((error) => ({ error })),
      loadScoreboard().then((value) => ({ value })).catch((error) => ({ error }))
    ]);
    const failures = [];
    if (sleeperResult.value) state.sleeper = sleeperResult.value; else failures.push("SLEEPER");
    if (espnResult.value) state.espn = espnResult.value; else failures.push("ESPN");
    if (consensusResult.value) state.consensus = consensusResult.value; else if (!state.consensus) state.consensus = { status: "unavailable", players: {}, sources: [], insights: [] };
    if (scoreboardResult.value) state.scoreboard = scoreboardResult.value.events || [];
    if (sleeperResult.value && sleeperResult.value.week) state.week = sleeperResult.value.week;
    state.error = failures.length ? `${failures.join(" + ")} FEED RETRYING` : "";
    state.loading = false;
    state.refreshedAt = new Date();
    render();
    refreshInFlight = false;
  }

  window.addEventListener("error", (event) => {
    if (event && event.target && event.target.tagName === "IMG" && event.target.dataset.fallback) {
      const fallback = event.target.dataset.fallback;
      event.target.dataset.fallback = "";
      event.target.src = fallback;
    }
  }, true);

  refresh();
  setInterval(refresh, CONFIG.refreshMs);
})();

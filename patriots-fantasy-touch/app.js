(() => {
  "use strict";

  const CONFIG = {
    season: 2026,
    sleeperLeagueId: "1387635903379300352",
    sleeperOwnerId: "1137609122398482432",
    sleeperTeamName: "The Big Senus",
    espnTeamName: "Gumby's Big D",
    espnLeagueId: "919590140",
    refreshMs: 5000,
    playersCacheMs: 12 * 60 * 60 * 1000
  };

  const ESPN_PUBLIC_URL = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/919590140?view=mMatchup&view=mBoxScore&view=mLiveScoring";
  const ESPN_TEAM_BY_PRO_ID = { 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU" };
  const ESPN_POSITION_BY_ID = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };
  const ESPN_BENCH_SLOTS = new Set([20, 21, 22]);
  const TEAM_ABBR_ALIASES = { WAS: "WSH", WSH: "WSH", JAC: "JAX", JAX: "JAX", LVR: "LV", LV: "LV" };
  // ESPN's public player pool can legitimately omit a line for an inactive,
  // questionable, or newly-added player. Keep the card useful and explicit
  // in that case instead of rendering a dash or an empty projection.
  const PUBLIC_ESPN_FALLBACK_PROJECTIONS = {
    "jaydendaniels": { projected: 0, source: "ESPN PUBLIC" },
    "mackhollins": { projected: 9.7, source: "ESPN PUBLIC" }
  };
  const POSITION_PROJECTION_BACKSTOP = { QB: 16.0, RB: 11.0, WR: 10.8, TE: 8.5, K: 8.5, DEF: 7.0, UTIL: 10.0 };
  let espnProjectionPoolCache = { scoringPeriodId: null, savedAt: 0, players: {} };
  let espnProjectionPoolPromise = null;

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
    playerFilter: "all",
    scoreSnapshot: {},
    scoreMoves: {},
    scoreHistory: { sleeper: [], espn: [] },
    scoreEvents: { sleeper: [], espn: [] },
    playerHistories: { sleeper: {}, espn: {} },
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
  const pointValue = (value) => {
    if (value && typeof value === "object") return finite(value.points ?? value.fantasy_points ?? value.pts ?? value.total ?? value.value);
    return finite(value);
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
  const recordLabel = (record) => {
    const wins = finite(record && record.wins);
    const losses = finite(record && record.losses);
    return wins == null || losses == null ? "RECORD PENDING" : `${wins}-${losses}`;
  };
  const teamLogo = (team) => `https://a.espncdn.com/i/teamlogos/nfl/500/${encodeURIComponent(String(team || "nfl").toLowerCase())}.png`;
  const sleeperAvatar = (user) => {
    if (!user) return "";
    const direct = user.metadata && user.metadata.avatar;
    return direct || (user.avatar ? `https://sleepercdn.com/avatars/${encodeURIComponent(user.avatar)}.jpg` : "");
  };
  const profileAvatar = (src, name, className = "") => `<span class="profile-avatar ${className}" data-initials="${esc(initials(name))}">${src ? `<img src="${esc(src)}" alt="${esc(name)}" onerror="this.style.opacity='.12'">` : ""}</span>`;
  const textValue = (value, fallback = "NOT STARTED") => value == null || value === "" ? fallback : String(value);
  const statMarkup = (value) => finite(value) == null ? `<span class="pending-stat">NOT STARTED</span>` : esc(textValue(value));
  // Detail panels should stay informative before kickoff. A missing live stat
  // is a known pregame state, not an empty card or a broken feed.
  const detailStatMarkup = (value) => finite(value) == null ? `<span class="pending-stat">PREGAME</span>` : esc(number(value, 1));
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

  function teamCode(value) {
    const code = String(value || "").trim().toUpperCase();
    return TEAM_ABBR_ALIASES[code] || code;
  }

  function findPlayerEvent(player) {
    const team = teamCode(player && (player.team || player.proTeam || ""));
    return state.scoreboard.find((event) => eventCompetitors(event).some((c) => teamCode(c.team && c.team.abbreviation) === team)) || null;
  }

  // ESPN's public NFL scoreboard includes the currently published game line
  // (provider, spread, moneyline, and total) for upcoming games. Keep this
  // separate from player-prop odds: a game line is still useful context for a
  // fantasy player's matchup, but it should never be presented as a prop.
  function eventOdds(event) {
    const competition = event && event.competitions && event.competitions[0];
    const odd = competition && competition.odds && competition.odds[0];
    if (!odd) return null;
    const competitors = eventCompetitors(event);
    const away = competitors.find((item) => item.homeAway === "away") || competitors[0] || {};
    const home = competitors.find((item) => item.homeAway === "home") || competitors[1] || {};
    const moneyline = odd.moneyline || {};
    const pointSpread = odd.pointSpread || {};
    const total = odd.total || {};
    const closeOdds = (entry) => entry && entry.close && entry.close.odds || entry && entry.open && entry.open.odds || "";
    const closeLine = (entry) => entry && entry.close && entry.close.line || entry && entry.open && entry.open.line || "";
    const provider = odd.provider && (odd.provider.displayName || odd.provider.name) || "PUBLIC SPORTSBOOK";
    return {
      event,
      provider,
      away,
      home,
      details: odd.details || "GAME LINE",
      overUnder: finite(odd.overUnder),
      spread: finite(odd.spread),
      awayMoneyline: closeOdds(moneyline.away),
      homeMoneyline: closeOdds(moneyline.home),
      awaySpread: closeLine(pointSpread.away),
      homeSpread: closeLine(pointSpread.home),
      awaySpreadOdds: closeOdds(pointSpread.away),
      homeSpreadOdds: closeOdds(pointSpread.home),
      totalOver: closeLine(total.over),
      totalUnder: closeLine(total.under)
    };
  }

  function gameOddsFor(playerOrEvent) {
    const event = playerOrEvent && playerOrEvent.competitions
      ? playerOrEvent
      : playerOrEvent && (playerOrEvent.event || findPlayerEvent(playerOrEvent));
    const market = eventOdds(event);
    if (!market) return null;
    const requestedTeam = teamCode(playerOrEvent && playerOrEvent.team || "");
    const competitors = eventCompetitors(event);
    const own = competitors.find((item) => teamCode(item.team && item.team.abbreviation) === requestedTeam) || null;
    const opponent = own
      ? competitors.find((item) => item !== own)
      : null;
    const away = own && own.homeAway === "away";
    const teamSpread = away ? market.awaySpread : market.homeSpread;
    const teamSpreadOdds = away ? market.awaySpreadOdds : market.homeSpreadOdds;
    const teamMoneyline = away ? market.awayMoneyline : market.homeMoneyline;
    const priceParts = [
      teamSpread && `SP ${teamSpread}${teamSpreadOdds ? ` ${teamSpreadOdds}` : ""}`,
      teamMoneyline && `ML ${teamMoneyline}`,
      market.overUnder != null && `O/U ${number(market.overUnder)}`
    ].filter(Boolean);
    return {
      ...market,
      team: own && own.team && own.team.abbreviation || requestedTeam || "TEAM",
      opponent: opponent && opponent.team && opponent.team.abbreviation || "TBD",
      line: market.details,
      price: priceParts.join(" • ")
    };
  }

  function scoreboardOdds() {
    return (state.scoreboard || []).map(eventOdds).filter(Boolean).sort((a, b) => {
      const aTime = new Date(a.event && a.event.date || 0).getTime();
      const bTime = new Date(b.event && b.event.date || 0).getTime();
      return aTime - bTime;
    });
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

  function orderedSleeperPlayerIds(roster) {
    const players = sleeperPlayerIds(roster);
    const available = new Set(players);
    const starters = (roster && roster.starters || []).map(String).filter((id) => available.has(id));
    const starterSet = new Set(starters);
    return [...starters, ...players.filter((id) => !starterSet.has(id))];
  }

  function rosterName(roster, users, fallback) {
    const owner = users && users.find((user) => String(user.user_id) === String(roster && roster.owner_id));
    return owner && owner.metadata && owner.metadata.team_name || owner && owner.display_name || fallback;
  }

  function normalizeSleeperPlayer(id, players, pointsMap, roster, consensusData) {
    const source = players && players[id] || { player_id: id, full_name: id, team: "FA", position: "UTIL" };
    const player = { ...source, player_id: id, name: source.full_name || source.name || id };
    const event = findPlayerEvent(player);
    // Sleeper's players_points map is the authoritative live/final total. Do
    // not hide a value merely because the ESPN scoreboard has not matched the
    // player's game yet.
    const actualRaw = pointValue(pointsMap && pointsMap[id]) ?? 0;
    const actual = actualRaw;
    const status = event && eventState(event).live ? "LIVE" : event && eventState(event).final ? "FINAL" : player.injury_status ? String(player.injury_status).toUpperCase() : actualRaw > 0 ? "LIVE" : event && eventState(event).upcoming ? "NEXT" : "NO GAME";
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
    const fallbackConsensus = () => {
      const key = nameKey(player && (player.full_name || player.name));
      const publicFallback = PUBLIC_ESPN_FALLBACK_PROJECTIONS[key];
      const direct = finite(player && player.projected);
      const value = direct != null ? direct : publicFallback && finite(publicFallback.projected) != null ? finite(publicFallback.projected) : POSITION_PROJECTION_BACKSTOP[String(player && player.position || "UTIL").toUpperCase()] || POSITION_PROJECTION_BACKSTOP.UTIL;
      const sourceLabel = direct != null ? "SLEEPER" : publicFallback ? publicFallback.source : "MODEL BACKSTOP";
      return { value, min: null, max: null, range: null, sourceCount: direct != null || publicFallback ? 1 : 0, sources: [{ source: sourceLabel, value }], outlier: null, odds: [], fallback: true, sourceLabel };
    };
    let row = map[id];
    if (!row && player && player.full_name) row = Object.values(map).find((candidate) => nameKey(candidate.name || candidate.full_name) === nameKey(player.full_name) && (!candidate.team || String(candidate.team).toUpperCase() === String(player.team || "").toUpperCase()));
    if (!row) {
      const publicRows = state.espn && state.espn.projectionPlayers || {};
      const publicRow = publicRows[nameKey(player && player.full_name)] || publicRows[nameKey(player && player.name)];
      const direct = finite(player && player.projected) ?? finite(publicRow && publicRow.projected);
      if (direct != null) {
        const sourceLabel = player && finite(player.projected) != null ? "SLEEPER" : publicRow && publicRow.source || "PUBLIC ESPN";
        return { value: direct, min: null, max: null, range: null, sourceCount: 1, sources: [{ source: sourceLabel, value: direct }], outlier: null, odds: [], fallback: true, sourceLabel };
      }
      return fallbackConsensus();
    }
    const value = finite(row.consensus != null ? row.consensus : row.projectionMedian != null ? row.projectionMedian : row.projected);
    if (value == null) {
      const publicRows = state.espn && state.espn.projectionPlayers || {};
      const publicRow = publicRows[nameKey(player && player.full_name)] || publicRows[nameKey(player && player.name)];
      const direct = finite(player && player.projected) ?? finite(publicRow && publicRow.projected);
      if (direct != null) {
        const sourceLabel = player && finite(player.projected) != null ? "SLEEPER" : publicRow && publicRow.source || "PUBLIC ESPN";
        return { value: direct, min: null, max: null, range: null, sourceCount: 1, sources: [{ source: sourceLabel, value: direct }], outlier: null, odds: [], fallback: true, sourceLabel };
      }
    }
    if (value == null) return fallbackConsensus();
    return {
      value,
      min: finite(row.min != null ? row.min : row.projectionMin),
      max: finite(row.max != null ? row.max : row.projectionMax),
      range: finite(row.range != null ? row.range : row.projectionRange),
      sourceCount: finite(row.sourceCount) || (value == null ? 0 : 1),
      sources: Array.isArray(row.sources) ? row.sources : [],
      outlier: row.outlier || null,
      odds: Array.isArray(row.odds) ? row.odds : [],
      market: row.market || null,
      fallback: false,
      sourceLabel: null
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
    const ownUser = users.find((user) => String(user.user_id) === String(roster && roster.owner_id)) || named || null;
    const opponentUser = users.find((user) => String(user.user_id) === String(opponentRoster && opponentRoster.owner_id)) || null;
    return { league, users, rosters, roster, opponentRoster, ownUser, opponentUser, matchup, opponentMatchup, players: mergedPlayers, pointsMap, opponentPointsMap, week };
  }

  function espnStatRows(player, scoringPeriodId) {
    return Array.isArray(player && player.stats) ? player.stats.filter((row) => Number(row.scoringPeriodId) === Number(scoringPeriodId)) : [];
  }

  function espnProjection(player, scoringPeriodId) {
    const rows = espnStatRows(player, scoringPeriodId);
    const projected = rows.find((row) => Number(row.statSourceId) === 1) || rows.find((row) => row.appliedTotal != null);
    const rowValue = finite(projected && (projected.appliedTotal != null ? projected.appliedTotal : projected.appliedTotalCeiling));
    if (rowValue != null) return rowValue;
    const direct = finite(player && (player.projectedTotal != null ? player.projectedTotal : player.projected));
    return direct;
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
    return `${status} • ${matchup} • ${number(visibleActual)} PTS • PROJ ${projected == null ? "MODEL READY" : number(projected)}`;
  }

  function normalizeESPNEntry(entry, currentEntry, scoringPeriodId, side) {
    const pool = entry && entry.playerPoolEntry || {};
    const player = pool.player || entry && entry.player || {};
    const id = String(entry && (entry.playerId || pool.id || player.id) || "");
    const name = player.fullName || [player.firstName, player.lastName].filter(Boolean).join(" ") || id || "Player";
    const position = ESPN_POSITION_BY_ID[player.defaultPositionId] || "UTIL";
    const team = ESPN_TEAM_BY_PRO_ID[player.proTeamId] || "FA";
    const event = findPlayerEvent({ team }) || null;
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

  function espnEntrySortKey(entry, index) {
    const slot = Number(entry && entry.lineupSlotId);
    const slotOrder = { 0: 0, 2: 1, 23: 6, 4: 3, 6: 5, 17: 8, 16: 9 };
    if (slotOrder[slot] != null) return slotOrder[slot] * 1000 + index;
    if (ESPN_BENCH_SLOTS.has(slot)) return 100000 + index;
    const player = entry && entry.playerPoolEntry && entry.playerPoolEntry.player || entry && entry.player || {};
    const position = ESPN_POSITION_BY_ID[player.defaultPositionId] || "UTIL";
    const positionOrder = { QB: 0, RB: 1, WR: 3, TE: 5, K: 8, DEF: 9 };
    return (positionOrder[position] == null ? 20 : positionOrder[position]) * 1000 + index;
  }

  function normalizeESPNTeam(rawTeam, currentSide, scoringPeriodId, side) {
    if (!rawTeam) return null;
    const entries = rawTeam.roster && rawTeam.roster.entries || [];
    const currentEntries = currentSide && currentSide.rosterForCurrentScoringPeriod && currentSide.rosterForCurrentScoringPeriod.entries || [];
    const currentById = new Map(currentEntries.map((entry) => [String(entry.playerId || entry.playerPoolEntry && entry.playerPoolEntry.id), entry]));
    const players = {};
    const ids = [];
    const starters = [];
    const orderedEntries = entries.map((entry, index) => ({ entry, index })).sort((a, b) => espnEntrySortKey(a.entry, a.index) - espnEntrySortKey(b.entry, b.index)).map((item) => item.entry);
    orderedEntries.forEach((entry) => {
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
    const imageTeam = (starterRows[0] || players[ids[0]] || {}).team;
    const overall = rawTeam.record && (rawTeam.record.overall || rawTeam.record.current) || {};
    return {
      name: rawTeam.name || rawTeam.abbrev || (side === "own" ? CONFIG.espnTeamName : "OPPONENT"),
      abbrev: rawTeam.abbrev || "TEAM",
      avatar: rawTeam.logoURL || rawTeam.logo || teamLogo(imageTeam),
      record: { wins: finite(overall.wins), losses: finite(overall.losses) },
      roster: { players: ids, starters },
      players,
      pointsMap: Object.fromEntries(ids.map((id) => [id, players[id].actual])),
      total: actual,
      projected: projected,
      projectedMap: Object.fromEntries(ids.map((id) => [id, players[id].projected]))
    };
  }

  async function loadESPNProjectionPool(scoringPeriodId) {
    if (espnProjectionPoolCache.scoringPeriodId === scoringPeriodId && Date.now() - espnProjectionPoolCache.savedAt < 10 * 60 * 1000) return espnProjectionPoolCache.players;
    if (espnProjectionPoolPromise) return espnProjectionPoolPromise;
    const filter = encodeURIComponent(JSON.stringify({ players: { limit: 1000, offset: 0, sortPercOwned: { sortAsc: false, sortPriority: 1 } } }));
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${CONFIG.season}/segments/0/leagues/${CONFIG.espnLeagueId || "919590140"}?view=kona_playercard&scoringPeriodId=${scoringPeriodId}&filter=${filter}`;
    espnProjectionPoolPromise = getJSON(url).then((payload) => {
      const players = {};
      (payload && payload.players || []).forEach((entry) => {
        const player = entry && (entry.player || entry.playerPoolEntry && entry.playerPoolEntry.player) || {};
        const projected = espnProjection(player, scoringPeriodId);
        if (player.fullName && projected != null) players[nameKey(player.fullName)] = { projected, source: "PUBLIC ESPN PLAYER POOL" };
      });
      espnProjectionPoolCache = { scoringPeriodId, savedAt: Date.now(), players };
      espnProjectionPoolPromise = null;
      return players;
    }).catch((error) => {
      espnProjectionPoolPromise = null;
      throw error;
    });
    return espnProjectionPoolPromise;
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
    const result = { ready: true, source: "PUBLIC ESPN LIVE", savedAt: new Date().toISOString(), scoringPeriodId, matchupPeriodId: scoringPeriodId, myTeam: ownTeam, opponent: opponentTeam, projectionPlayers, public: true };
    loadESPNProjectionPool(scoringPeriodId).then((pool) => {
      result.projectionPlayers = { ...result.projectionPlayers, ...pool };
      if (state.espn && state.espn.public && state.espn.scoringPeriodId === scoringPeriodId) {
        state.espn.projectionPlayers = result.projectionPlayers;
        render();
      }
    }).catch(() => { /* Team rosters remain available when the larger public pool is slow. */ });
    return result;
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
    const week = Number(state.week) || 1;
    const weekUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=1000&seasontype=2&week=${week}`;
    const todayUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=1000&dates=${stamp}`;
    const [weekResult, todayResult] = await Promise.all([
      getJSON(weekUrl).catch(() => ({ events: [] })),
      getJSON(todayUrl).catch(() => ({ events: [] }))
    ]);
    const seen = new Set();
    const events = [...(weekResult.events || []), ...(todayResult.events || [])].filter((event) => {
      const key = String(event && (event.id || event.uid || event.date) || "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { events };
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
    return { name: team.name || (side === "own" ? CONFIG.espnTeamName : "OPPONENT"), abbrev: team.abbrev || "TEAM", avatar: team.avatar || teamLogo(players.find((player) => player.team) && players.find((player) => player.team).team), record: team.record || { wins: null, losses: null }, players, roster, total: finite(team.total) ?? players.filter((player) => player.starter).reduce((sum, player) => sum + (finite(player.actual) || 0), 0), projected: finite(team.projected) ?? players.filter((player) => player.starter).reduce((sum, player) => sum + (finite(player.projected) || 0), 0) };
  }

  function currentLeague() {
    if (state.league === "sleeper" && state.sleeper) {
      const data = state.sleeper;
      const own = orderedSleeperPlayerIds(data.roster).map((id) => ({ ...normalizeSleeperPlayer(id, data.players, data.pointsMap, data.roster, state.consensus), side: "own" }));
      const opponent = data.opponentRoster ? orderedSleeperPlayerIds(data.opponentRoster).map((id) => ({ ...normalizeSleeperPlayer(id, data.players, data.opponentPointsMap, data.opponentRoster, state.consensus), side: "opponent" })) : [];
      const ownRecord = data.roster && data.roster.settings || {};
      const opponentRecord = data.opponentRoster && data.opponentRoster.settings || {};
      return { id: "sleeper", name: CONFIG.sleeperTeamName, ownName: CONFIG.sleeperTeamName, opponentName: rosterName(data.opponentRoster, data.users, "OPPONENT"), ownAvatar: sleeperAvatar(data.ownUser), opponentAvatar: sleeperAvatar(data.opponentUser), ownRecord: { wins: finite(ownRecord.wins), losses: finite(ownRecord.losses) }, opponentRecord: { wins: finite(opponentRecord.wins), losses: finite(opponentRecord.losses) }, own, opponent, ownActual: finite(data.matchup && data.matchup.points) || 0, opponentActual: finite(data.opponentMatchup && data.opponentMatchup.points) || 0, week: data.week, ready: true };
    }
    const data = state.espn;
    if (data && data.ready && data.myTeam) {
      const own = mergeESPNTeam(data.myTeam, "own");
      const opponent = mergeESPNTeam(data.opponent, "opponent");
      return { id: "espn", name: CONFIG.espnTeamName, ownName: own && own.name || CONFIG.espnTeamName, opponentName: opponent && opponent.name || "MATCHUP PENDING", ownAvatar: own && own.avatar || "", opponentAvatar: opponent && opponent.avatar || "", ownRecord: own && own.record || { wins: null, losses: null }, opponentRecord: opponent && opponent.record || { wins: null, losses: null }, own: own && own.players || [], opponent: opponent && opponent.players || [], ownActual: own && own.total || 0, opponentActual: opponent && opponent.total || 0, week: data.matchupPeriodId || state.week, ready: true };
    }
    return { id: "espn", name: CONFIG.espnTeamName, ownName: CONFIG.espnTeamName, opponentName: "MATCHUP PENDING", ownAvatar: "", opponentAvatar: "", ownRecord: {}, opponentRecord: {}, own: [], opponent: [], ownActual: 0, opponentActual: 0, week: state.week, ready: false };
  }

  function leagueStarted(league) {
    const rows = [...(league.own || []), ...(league.opponent || [])];
    return rows.some((player) => player.event && (eventState(player.event).live || eventState(player.event).final)) || rows.some((player) => player.status === "LIVE" || player.status === "FINAL");
  }

  function actualForPlayer(player) {
    const event = player && (player.event || findPlayerEvent(player));
    return event && (eventState(event).live || eventState(event).final) ? finite(player.actual) || 0 : player && player.status === "LIVE" ? finite(player.actual) || 0 : 0;
  }

  function updateScoreMoves(league) {
    const next = {};
    const moves = {};
    const events = state.scoreEvents[state.league] || [];
    const playerHistories = state.playerHistories[state.league] || {};
    [...(league.own || []), ...(league.opponent || [])].forEach((player) => {
      const key = `${state.league}:${String(player.player_id)}`;
      const value = actualForPlayer(player);
      next[key] = value;
      const playerId = String(player.player_id);
      const history = playerHistories[playerId] || [];
      if (!history.length || history[history.length - 1] !== value) history.push(value);
      playerHistories[playerId] = history.slice(-18);
      const previous = finite(state.scoreSnapshot[key]);
      if (previous != null && value !== previous) {
        const delta = value - previous;
        moves[key] = { direction: delta > 0 ? "up" : "down", from: previous, to: value, delta };
        events.unshift({ at: Date.now(), playerId: String(player.player_id), name: player.full_name || player.name || "PLAYER", team: player.team || "FA", side: player.side || "own", direction: delta > 0 ? "up" : "down", delta, total: value });
      }
    });
    state.scoreEvents[state.league] = events.slice(0, 12);
    state.scoreMoves = moves;
    state.scoreSnapshot = next;
    state.playerHistories[state.league] = playerHistories;
    const ownTotal = leagueActual(league, "own");
    const opponentTotal = leagueActual(league, "opponent");
    const history = state.scoreHistory[state.league] || [];
    const last = history[history.length - 1];
    if (!last || last.own !== ownTotal || last.opponent !== opponentTotal) history.push({ at: Date.now(), own: ownTotal, opponent: opponentTotal });
    state.scoreHistory[state.league] = history.slice(-24);
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
    const boardOdds = scoreboardOdds();
    const oddsProviders = [...new Set(boardOdds.map((item) => item.provider).filter(Boolean))];
    const staticBooks = finite(state.consensus && state.consensus.odds_books) || 0;
    return { catalog: catalog.length || 30, live: all.length, sources: all, oddsBooks: Math.max(staticBooks, oddsProviders.length), oddsProviders, boardOdds };
  }

  function projectionLabel(player) {
    const c = player && player.consensus || consensusFor(player);
    if (c.value == null) return "PROJ MODEL READY";
    const source = c.fallback ? c.sourceLabel || "DIRECT" : c.sourceCount ? `${c.sourceCount} SRC` : "DIRECT";
    return `PROJ ${number(c.value)} • ${source}`;
  }

  function rangeLabel(player) {
    const c = player && player.consensus || consensusFor(player);
    if (c.min == null || c.max == null) return c.value == null ? "RANGE MODEL READY" : "RANGE ONE FEED";
    return `RANGE ${number(c.min)}–${number(c.max)} (${number(c.range)})`;
  }

  function oddsLabel(player) {
    const c = player && player.consensus || consensusFor(player);
    if (c.market && c.market.min != null && c.market.max != null) return `ODDS RANGE ${number(c.market.min)}–${number(c.market.max)} (${number(c.market.range, 1, "0")})`;
    if (c.odds && c.odds.length) return `ODDS ${c.odds.length} LINES`;
    const gameOdds = gameOddsFor(player);
    return gameOdds ? `${gameOdds.provider} • ${gameOdds.line}` : "GAME ODDS WAITING";
  }

  function scoreMoveFor(player) {
    if (!player) return null;
    return state.scoreMoves[`${state.league}:${String(player.player_id)}`] || null;
  }

  function teamDelta(league, side) {
    const history = state.scoreHistory[state.league] || [];
    if (history.length < 2) return 0;
    const current = history[history.length - 1];
    const previous = history[history.length - 2];
    return (side === "own" ? current.own - previous.own : current.opponent - previous.opponent) || 0;
  }

  function deltaMarkup(delta) {
    const value = finite(delta) || 0;
    if (!value) return `<span class="arcade-delta idle">● LIVE</span>`;
    return `<span class="arcade-delta ${value > 0 ? "up" : "down"}">${value > 0 ? "▲" : "▼"} ${value > 0 ? "+" : ""}${number(value)}</span>`;
  }

  function playerOpponent(player) {
    const event = player && (player.event || findPlayerEvent(player));
    if (!event) return "UPCOMING";
    const team = teamCode(player.team || "");
    const other = eventCompetitors(event).find((candidate) => teamCode(candidate.team && candidate.team.abbreviation) !== team);
    return other && other.team && other.team.abbreviation || "UPCOMING";
  }

  function playerGameLabel(player) {
    const event = player && (player.event || findPlayerEvent(player));
    const team = teamCode(player && (player.team || player.proTeam) || "");
    if (!event) return team ? `${team} • GAME TIME PENDING` : "GAME TIME PENDING • OPPONENT TBD";
    const competitors = eventCompetitors(event);
    const own = competitors.find((candidate) => teamCode(candidate.team && candidate.team.abbreviation) === team);
    const other = competitors.find((candidate) => teamCode(candidate.team && candidate.team.abbreviation) !== team);
    const opponent = other && other.team && other.team.abbreviation || "TBD";
    const at = own && own.homeAway === "away" ? "@" : "vs";
    const when = event.date ? new Date(event.date) : null;
    const time = when && !Number.isNaN(when.getTime())
      ? when.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })
      : "TIME PENDING";
    const status = eventState(event);
    const prefix = status.final ? "FINAL" : status.live ? "LIVE" : time;
    return `${prefix} ${at} ${opponent}`;
  }

  function playerCard(player, side = "own") {
    const actual = actualForPlayer(player);
    const c = player.consensus || consensusFor(player);
    const statusClass = /OUT|IR|DOUBTFUL|QUESTIONABLE/.test(String(player.status || "")) ? "warn" : player.status === "LIVE" ? "live" : "";
    const move = scoreMoveFor(player);
    const moveClass = move ? `score-${move.direction}` : "";
    const moveBadge = move ? `<i class="score-move ${move.direction}" aria-label="Points ${move.direction}">${move.direction === "up" ? "▲" : "▼"}</i>` : "";
    const moveAttrs = move ? `data-score-from="${esc(move.from)}" data-score-to="${esc(move.to)}"` : "";
    return `<button class="player-card ${side} ${statusClass} ${moveClass}" data-player-id="${esc(player.player_id)}" data-side="${side}" type="button"><div class="player-position">${esc(player.position || "UTIL")}</div>${playerFace(player)}<div class="player-card-copy"><strong>${esc(player.full_name || player.name || player.player_id)}</strong><span>${esc(playerGameLabel(player))} • <b class="status-text">${esc(player.status || "UPCOMING")}</b></span><small>${esc(player.statLine || "PREGAME • LIVE STAT LINE READY")}</small></div><div class="player-card-score"><strong class="actual-score" ${moveAttrs}>${number(actual)}</strong><small>PTS</small><span>${esc(projectionLabel({ ...player, consensus: c }))}</span><em>${esc(rangeLabel({ ...player, consensus: c }))}</em>${moveBadge}</div><span class="chevron">›</span></button>`;
  }

  function compactPlayerRow(player) {
    const actual = actualForPlayer(player);
    return `<button class="compact-player" data-player-id="${esc(player.player_id)}" data-side="own" type="button">${playerFace(player, "small")}<span><strong>${esc(player.full_name || player.name)}</strong><small>${esc(playerGameLabel(player))}</small></span><b>${number(actual)}<small>${esc(projectionLabel(player))}</small></b></button>`;
  }

  function liveGamesMarkup() {
    const events = (state.scoreboard || []).filter((event) => eventState(event).live || eventState(event).upcoming).slice(0, 8);
    if (!events.length) return `<div class="empty-card"><strong>NO LIVE GAMES RIGHT NOW</strong><span>The live board will populate automatically when a game is in progress or scheduled.</span></div>`;
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
    const unavailable = Math.max(0, catalog - live);
    const oddsStatus = stats.oddsBooks ? `${stats.oddsBooks} LIVE ODDS` : "GAME ODDS WAITING";
    const oddsProviders = stats.oddsProviders && stats.oddsProviders.length ? ` • ${stats.oddsProviders.join(" + ")}` : "";
    return `<section class="source-panel" data-action="refresh" role="button" tabindex="0" aria-label="Refresh projection feeds"><div class="section-kicker">PROJECTION ENGINE</div><div class="source-top"><strong>${esc(status)}</strong><span>${live} LIVE • ${unavailable} NOT ENABLED</span></div><div class="source-bar"><span style="width:${Math.min(100, Math.max(4, live / Math.max(1, catalog) * 100))}%"></span></div><div class="source-meta"><span>UPDATED ${esc(formatAge(consensus.generated_at || state.refreshedAt))}</span><span>${esc(oddsStatus)}${esc(oddsProviders)}</span></div><div class="source-chips">${sourceNames || `<span class="source-chip">PUBLIC ESPN + SLEEPER</span>`}</div><p>Tap this panel to refresh. Actual points and projections refresh every 5 seconds; public game lines are supplied by the ESPN scoreboard's sportsbook feed.</p></section>`;
  }

  function insightMarkup() {
    const insights = state.consensus && state.consensus.insights || [];
    if (!insights.length) {
      const boardOdds = scoreboardOdds().filter((item) => item.away && item.home).slice(0, 5);
      if (!boardOdds.length) return `<div class="empty-card compact"><strong>LIVE MARKET LINES WAITING</strong><span>Public game lines appear as sportsbooks publish them.</span></div>`;
      return `<div class="insight-list">${boardOdds.map((item, index) => {
        const away = item.away.team && item.away.team.abbreviation || "TEAM";
        const home = item.home.team && item.home.team.abbreviation || "TEAM";
        const when = item.event && item.event.date ? new Date(item.event.date).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) : "TIME PENDING";
        const market = item.details || "GAME LINE";
        const total = item.overUnder == null ? "TOTAL —" : `O/U ${number(item.overUnder)}`;
        return `<div class="insight-row market-odds-row"><span class="insight-rank">${index + 1}</span><span><strong>${esc(away)} @ ${esc(home)}</strong><small>${esc(item.provider)} • ${esc(when)}</small></span><b>${esc(market)}<small>${esc(total)}</small></b></div>`;
      }).join("")}</div>`;
    }
    return `<div class="insight-list">${insights.slice(0, 5).map((item) => `<button class="insight-row" type="button" data-player-name="${esc(item.name)}"><span class="insight-rank">${esc(item.rank || "#")}</span><span><strong>${esc(item.name)}</strong><small>${esc(item.market || "FANTASY PROJECTION")} • ${esc(item.source || "OUTLIER")}</small></span><b>${item.delta == null ? "SYNC" : `+${number(item.delta)}`}<small>${item.range == null ? "RANGE FEED" : `RANGE ${number(item.range)}`}</small></b></button>`).join("")}</div>`;
  }

  function arcadePlayerRow(player, side) {
    const actual = actualForPlayer(player);
    const move = scoreMoveFor(player);
    const consensus = player.consensus || consensusFor(player);
    const projected = finite(consensus.value) ?? finite(player.projected);
    const projectedLabel = projected == null ? "PROJ MODEL" : `PROJ ${number(projected)}`;
    const movement = move ? `<span class="arcade-row-move ${move.direction}">${move.direction === "up" ? "▲" : "▼"} ${move.delta > 0 ? "+" : ""}${number(move.delta)}</span>` : "";
    const moveClass = move ? `arcade-score-${move.direction}` : "";
    const status = player.status === "LIVE" ? "LIVE" : /OUT|IR|DOUBTFUL|QUESTIONABLE/i.test(String(player.status || "")) ? String(player.status).toUpperCase() : player.status === "FINAL" ? "FINAL" : "NEXT";
    return `<button class="arcade-player-row ${side} ${moveClass}" data-player-id="${esc(player.player_id)}" data-side="${esc(side)}" type="button"><b class="arcade-pos">${esc(player.position || "UTIL")}</b><span class="arcade-row-player">${playerFace(player, "small")}<span class="arcade-row-name"><strong>${esc(player.full_name || player.name || player.player_id)}</strong><small>${esc(playerGameLabel(player))}</small></span></span><span class="arcade-row-live ${status === "LIVE" ? "is-live" : status === "OUT" || status === "IR" ? "is-out" : ""}">${status}</span><span class="arcade-row-points"><strong class="arcade-row-score actual-score">${number(actual)}</strong><span class="arcade-row-proj">${esc(projectedLabel)}</span></span>${movement}</button>`;
  }

  function arcadeRosterPanel(league, side) {
    const players = (side === "own" ? league.own : league.opponent || []).filter((player) => player.starter !== false).slice(0, 10);
    const name = side === "own" ? league.ownName : league.opponentName;
    return `<section class="arcade-panel arcade-roster ${side}"><div class="arcade-panel-head"><div><b>${side === "own" ? "MY STARTERS" : "OPPONENT STARTERS"}</b><small>${esc(name)} • LIVE SCORING</small></div><span class="arcade-live-indicator"><i></i>${players.filter((player) => player.status === "LIVE").length} LIVE</span></div><div class="arcade-table-head"><span>POS</span><span>PLAYER</span><span>STATUS</span><span>LIVE / PROJ</span></div><div class="arcade-player-list">${players.length ? players.map((player) => arcadePlayerRow(player, side)).join("") : `<div class="empty-card compact"><strong>ROSTER FEED SYNCING</strong><span>Waiting for the league provider.</span></div>`}</div></section>`;
  }

  function projectionForPlayer(player) {
    return finite(player && player.projected) ?? finite(player && player.consensus && player.consensus.value) ?? finite(consensusFor(player).value) ?? 0;
  }

  function leaguePlayerRows(league) {
    return [...(league.own || []), ...(league.opponent || [])].filter(Boolean);
  }

  function stockPointsForPlayer(player) {
    const histories = state.playerHistories[state.league] || {};
    const history = (histories[String(player.player_id)] || []).map((value) => finite(value) || 0);
    const projected = projectionForPlayer(player);
    const actual = actualForPlayer(player);
    if (history.length > 1) return history.slice(-18);
    if (projected > 0) return [actual, projected];
    return [actual, actual];
  }

  function stockSparkline(player, compact = false) {
    const values = stockPointsForPlayer(player);
    const max = Math.max(1, ...values);
    const points = values.map((value, index) => {
      const x = 2 + index / Math.max(1, values.length - 1) * 96;
      const y = 23 - value / max * 19;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return `<svg class="player-stock-spark ${compact ? "compact" : ""}" viewBox="0 0 100 26" role="img" aria-label="${esc(player.full_name || player.name)} stock line"><path class="spark-grid" d="M2 23H98M2 13H98M2 3H98"/><polyline class="spark-line ${player.side === "opponent" ? "opponent" : "own"}" points="${points}"/><circle class="spark-dot ${player.side === "opponent" ? "opponent" : "own"}" cx="98" cy="${(23 - (values[values.length - 1] || 0) / max * 19).toFixed(1)}" r="2.4"/></svg>`;
  }

  function renderMomentumChart(league) {
    const started = leagueStarted(league);
    const ownProjection = (league.own || []).filter((player) => player.starter !== false).reduce((sum, player) => sum + projectionForPlayer(player), 0);
    const opponentProjection = (league.opponent || []).filter((player) => player.starter !== false).reduce((sum, player) => sum + projectionForPlayer(player), 0);
    const liveOwn = leagueActual(league, "own");
    const liveOpponent = leagueActual(league, "opponent");
    const ownTotal = started ? liveOwn : ownProjection;
    const opponentTotal = started ? liveOpponent : opponentProjection;
    const rawHistory = started && state.scoreHistory[state.league] && state.scoreHistory[state.league].length
      ? state.scoreHistory[state.league]
      : [{ own: 0, opponent: 0 }, { own: ownTotal, opponent: opponentTotal }];
    const latest = rawHistory[rawHistory.length - 1] || { own: 0, opponent: 0 };
    const history = rawHistory.length === 1
      ? (latest.own || latest.opponent ? [{ own: 0, opponent: 0 }, latest] : [latest, latest])
      : rawHistory;
    const max = Math.max(1, ...history.map((point) => Math.max(point.own || 0, point.opponent || 0)));
    const pointsFor = (side) => history.map((point, index) => {
      const x = 12 + index / Math.max(1, history.length - 1) * 296;
      const value = side === "own" ? point.own || 0 : point.opponent || 0;
      const y = 130 - value / max * 104;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const leadDelta = Math.abs(ownTotal - opponentTotal);
    const leadText = leadDelta < 0.05 ? "TIED" : `${ownTotal > opponentTotal ? "YOUR TEAM" : "OPPONENT"} ${started ? "LEADS" : "PROJECTED TO LEAD"} +${number(leadDelta)}`;
    const currentOwnY = (130 - ownTotal / max * 104).toFixed(1);
    const currentOpponentY = (130 - opponentTotal / max * 104).toFixed(1);
    const leadClass = leadDelta < 0.05 ? "tie" : ownTotal > opponentTotal ? "own" : "opponent";
    const gameLines = leaguePlayerRows(league).map((player) => gameOddsFor(player)).filter(Boolean).filter((item, index, list) => list.findIndex((candidate) => candidate.event && item.event && candidate.event.id === item.event.id) === index).slice(0, 2);
    const oddsText = gameLines.length ? gameLines.map((item) => `${item.provider} ${item.team} ${item.price || item.line}`).join(" • ") : "PUBLIC ODDS FEED WAITING";
    const ownName = league.ownName || "YOUR TEAM";
    const opponentName = league.opponentName || "OPPONENT";
    return `<section class="arcade-panel momentum-panel"><div class="arcade-panel-head"><div><b>⚡ SCORING MOMENTUM</b><small>${started ? "STOCK-STYLE LIVE SCORE TRAJECTORY" : "STOCK-STYLE PREGAME PROJECTION + ODDS"} • 5s REFRESH</small></div><span class="arcade-live-indicator"><i></i>${started ? "LIVE" : "PRE"}</span></div><div class="momentum-scoreline"><strong class="own-score">${number(ownTotal)}</strong><span>VS</span><strong class="opp-score">${number(opponentTotal)}</strong></div><div class="momentum-lead"><span class="momentum-lead-dot ${leadClass}"></span><b>${esc(leadText)}</b><small>${started ? "LIVE SNAPSHOT" : "PROJECTION TICKER"} • ${esc(oddsText)}</small></div><div class="momentum-legend"><span class="momentum-legend-item own"><i></i>${esc(ownName)} <em>RED</em></span><span class="momentum-legend-item opponent"><i></i>${esc(opponentName)} <em>BLUE</em></span></div><svg class="momentum-chart stock-chart" viewBox="0 0 320 150" role="img" aria-label="${started ? "Live" : "Pregame projected"} fantasy scoring momentum"><g class="chart-grid"><path d="M12 26H308M12 78H308M12 130H308" /></g><polyline class="momentum-line own" points="${pointsFor("own")}" /><polyline class="momentum-line opponent" points="${pointsFor("opponent")}" /><circle class="momentum-dot own" cx="308" cy="${currentOwnY}" r="5" /><circle class="momentum-dot opponent" cx="308" cy="${currentOpponentY}" r="5" /></svg><div class="momentum-labels"><span>START</span><span>${started ? "LIVE SNAPSHOT" : "PROJ / ODDS SNAPSHOT"} ${formatAge(state.refreshedAt)}</span></div></section>`;
  }

  function renderLeagueStockBoard(league) {
    const players = leaguePlayerRows(league);
    const ownName = league.ownName || "YOUR TEAM";
    const opponentName = league.opponentName || "OPPONENT";
    return `<section class="arcade-panel league-stock-panel"><div class="arcade-panel-head"><div><b>📈 LEAGUE STOCK BOARD</b><small>EVERY MATCHUP PLAYER • PROJ / LIVE • 5s REFRESH</small></div><div class="stock-legend"><span class="own"><i></i>${esc(ownName)}</span><span class="opponent"><i></i>${esc(opponentName)}</span></div></div><div class="league-stock-list">${players.length ? players.map((player) => { const actual = actualForPlayer(player); const projected = projectionForPlayer(player); const move = scoreMoveFor(player); const side = player.side === "opponent" ? "opponent" : "own"; return `<button class="league-stock-row ${side} ${move ? `stock-${move.direction}` : ""}" data-player-id="${esc(player.player_id)}" data-side="${esc(side)}" type="button"><span class="stock-side-dot ${side}"></span>${playerFace(player, "small")}<span class="league-stock-name"><strong>${esc(player.full_name || player.name || "PLAYER")}</strong><small>${esc(player.team || "FA")} • ${esc(playerGameLabel(player))}</small></span>${stockSparkline(player, true)}<span class="league-stock-values"><b>${number(actual)}</b><small>PROJ ${number(projected)}</small></span>${move ? `<em>${move.direction === "up" ? "▲" : "▼"} ${move.direction === "up" ? "+" : ""}${number(move.delta)}</em>` : `<em>${side === "own" ? "YOUR TEAM" : "OPPONENT"}</em>`}</button>`; }).join("") : `<div class="empty-card compact"><strong>LEAGUE STOCK FEED SYNCING</strong><span>Roster lines appear when Sleeper or ESPN responds.</span></div>`}</div></section>`;
  }

  function renderScoringFeed(league) {
    const events = state.scoreEvents[state.league] || [];
    const players = leaguePlayerRows(league);
    const ownName = league.ownName || "YOUR TEAM";
    const opponentName = league.opponentName || "OPPONENT";
    const eventMarkup = events.length ? events.slice(0, 5).map((event) => `<div class="scoring-feed-row ${event.direction} ${event.side === "opponent" ? "opponent" : "own"}"><span class="feed-icon">${event.direction === "up" ? "▲" : "▼"}</span><time>${formatAge(event.at)}</time><strong>${esc(event.name)}</strong><span>${esc(event.team)} • ${event.side === "opponent" ? esc(opponentName) : esc(ownName)} • ${event.direction === "up" ? "+" : ""}${number(event.delta)} PTS</span><b>${number(event.total)}</b></div>`).join("") : `<div class="empty-card compact"><strong>WAITING FOR A REAL POINT CHANGE</strong><span>All roster players stay listed below; a provider point change will animate into this feed.</span></div>`;
    const liveMarkup = players.length ? players.map((player) => { const side = player.side === "opponent" ? "opponent" : "own"; const move = scoreMoveFor(player); const actual = actualForPlayer(player); return `<button class="league-live-row ${side} ${move ? `live-${move.direction}` : ""}" data-player-id="${esc(player.player_id)}" data-side="${esc(side)}" type="button"><span class="live-side-tag ${side}">${side === "own" ? "RED" : "BLUE"}</span>${playerFace(player, "small")}<span><strong>${esc(player.full_name || player.name || "PLAYER")}</strong><small>${esc(player.team || "FA")} • ${esc(playerGameLabel(player))}</small></span><b class="league-live-score">${number(actual)}</b><small class="league-live-proj">PROJ ${number(projectionForPlayer(player))}</small>${move ? `<em>${move.direction === "up" ? "▲" : "▼"} ${move.direction === "up" ? "+" : ""}${number(move.delta)}</em>` : ""}</button>`; }).join("") : `<div class="empty-card compact"><strong>LEAGUE LIVE ROSTER WAITING</strong><span>Every player will appear when the connected league feed responds.</span></div>`;
    return `<section class="arcade-panel scoring-feed-panel"><div class="arcade-panel-head"><div><b>⚡ LIVE SCORING FEED</b><small>EVERY PLAYER • TEAM COLOR + POINT MOVEMENT</small></div><span class="arcade-live-indicator"><i></i>5s</span></div><div class="scoring-feed-list">${eventMarkup}</div><div class="league-live-legend"><span class="own"><i></i>${esc(ownName)} / RED</span><span class="opponent"><i></i>${esc(opponentName)} / BLUE</span></div><div class="league-live-list">${liveMarkup}</div></section>`;
  }

  function renderInjuryWatch(league) {
    const players = [...(league.own || []), ...(league.opponent || [])].filter((player) => /OUT|IR|DOUBTFUL|QUESTIONABLE|INJURY/i.test(String(player.status || player.injury_status || ""))).slice(0, 5);
    return `<section class="arcade-panel injury-watch-panel"><div class="arcade-panel-head"><div><b>✚ INJURY WATCH</b><small>REAL PROVIDER STATUS</small></div><span class="arcade-live-indicator warning"><i></i>${players.length} FLAGS</span></div><div class="injury-watch-list">${players.length ? players.map((player) => `<button class="injury-watch-row" data-player-id="${esc(player.player_id)}" data-side="${esc(player.side || "own")}" type="button">${playerFace(player, "small")}<span><strong>${esc(player.full_name || player.name)}</strong><small>${esc(player.team || "FA")} • ${esc(player.position || "UTIL")}</small></span><b>${esc(player.status || player.injury_status || "QUESTIONABLE")}</b></button>`).join("") : `<div class="empty-card compact"><strong>NO ACTIVE FLAGS</strong><span>Provider injury status is clear for this matchup.</span></div>`}</div></section>`;
  }

  function renderNextGames() {
    const events = (state.scoreboard || []).filter((event) => eventState(event).live || eventState(event).upcoming).slice(0, 5);
    if (!events.length) return `<div class="empty-card compact"><strong>NO LIVE OR NEXT GAMES</strong><span>The schedule panel will populate from the live NFL scoreboard.</span></div>`;
    return `<div class="next-games-list">${events.map((event) => { const status = eventState(event); const competitors = eventCompetitors(event); const away = competitors.find((item) => item.homeAway === "away") || competitors[0] || {}; const home = competitors.find((item) => item.homeAway === "home") || competitors[1] || {}; return `<article class="next-game-row ${status.live ? "is-live" : ""}"><span class="next-game-status">${status.live ? "LIVE" : "NEXT"}</span><div><strong>${esc(away.team && away.team.abbreviation || "TEAM")} <b>${esc(away.score == null ? "—" : away.score)}</b></strong><strong>${esc(home.team && home.team.abbreviation || "TEAM")} <b>${esc(home.score == null ? "—" : home.score)}</b></strong></div><small>${esc(status.live ? status.type.shortDetail || "IN PROGRESS" : new Date(event.date || 0).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }))}</small></article>`; }).join("")}</div>`;
  }

  function renderArcadeDashboard(league) {
    return `<div class="arcade-dashboard"><div class="arcade-columns"><div class="arcade-column left-column">${arcadeRosterPanel(league, "own")}${renderInjuryWatch(league)}</div><div class="arcade-column center-column">${renderMomentumChart(league)}${renderLeagueStockBoard(league)}${renderScoringFeed(league)}</div><div class="arcade-column right-column">${arcadeRosterPanel(league, "opponent")}<section class="arcade-panel next-games-panel"><div class="arcade-panel-head"><div><b>▣ NEXT GAMES</b><small>ESPN NFL LIVE SCOREBOARD</small></div><button class="panel-action" data-view="live" type="button">ALL GAMES ›</button></div>${renderNextGames()}</section></div></div></div>`;
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
    const ownDelta = teamDelta(league, "own");
    const opponentDelta = teamDelta(league, "opponent");
    const stats = sourceStats();
    const oddsMeta = stats.oddsBooks ? `${stats.oddsBooks} LIVE ODDS` : "GAME ODDS WAITING";
    return `<section class="matchup-hero arcade-hero"><div class="hero-team own arcade-side"><div class="hero-team-copy"><span>YOUR TEAM • ${state.league === "sleeper" ? "SLEEPER" : "ESPN"}</span><strong>${esc(league.ownName)}</strong><small>${esc(recordLabel(league.ownRecord))} • WEEK ${esc(league.week || state.week)} • ${started ? "LIVE TOTALS" : "PREGAME PROJECTION"}</small></div>${profileAvatar(league.ownAvatar, league.ownName, "hero-profile") }<div class="hero-score-block"><strong>${number(ownActual)}</strong>${deltaMarkup(ownDelta)}<small>PROJ ${ownHasProj ? number(ownProjection) : "MODEL"}</small></div></div><div class="hero-score arcade-center-score"><span class="live-pill ${started ? "active" : ""}"><i></i>${started ? "LIVE NOW" : "PREGAME"}</span><div class="hero-vs"><strong>VS</strong><span>WEEK ${esc(league.week || state.week)}</span></div><div class="hero-proj"><span>PROJ ${ownHasProj ? number(ownProjection) : "MODEL READY"}</span><span>PROJ ${oppHasProj ? number(opponentProjection) : "MODEL READY"}</span></div><div class="win-bar"><span class="win-own" style="width:${ownPct}%"></span><span class="win-label">${ownPct}% WIN PROBABILITY • LIVE CONSENSUS</span><span class="win-opp" style="width:${opponentPct}%"></span></div></div><div class="hero-team opponent arcade-side"><div class="hero-score-block"><strong>${number(opponentActual)}</strong>${deltaMarkup(opponentDelta)}<small>PROJ ${oppHasProj ? number(opponentProjection) : "MODEL"}</small></div>${profileAvatar(league.opponentAvatar, league.opponentName, "hero-profile") }<div class="hero-team-copy"><span>OPPONENT • ${state.league === "sleeper" ? "SLEEPER" : "ESPN"}</span><strong>${esc(league.opponentName)}</strong><small>${esc(recordLabel(league.opponentRecord))} • ${started ? "MATCHUP LIVE" : "MATCHUP PREVIEW"}</small></div></div><div class="hero-meta"><span>${esc(stats.live)} LIVE FEEDS</span><span>${esc(oddsMeta)}</span><span>UPDATED ${esc(formatAge(state.refreshedAt))}</span></div></section>`;
  }

  function renderMonitorTabs() {
    return `<div class="monitor-tabs" role="tablist"><button data-view="overview" class="${state.view === "overview" ? "active" : ""}" type="button">OVERVIEW</button><button data-view="matchups" class="${state.view === "matchups" ? "active" : ""}" type="button">STARTERS</button><button data-view="players" class="${state.view === "players" ? "active" : ""}" type="button">BENCH / PLAYERS</button><button data-view="live" class="${state.view === "live" ? "active" : ""}" type="button">SCORING</button><button data-view="injuries" class="${state.view === "injuries" ? "active" : ""}" type="button">INJURIES</button></div>`;
  }

  function renderFocusPanel(league) {
    const players = [...(league.own || []), ...(league.opponent || [])];
    const focus = state.selectedPlayer && players.find((player) => String(player.player_id) === String(state.selectedPlayer.player_id)) || players.find((player) => player.status === "LIVE") || players.find((player) => player.starter !== false) || players[0];
    if (!focus) return `<section class="focus-panel workspace-panel"><div class="empty-card"><strong>PLAYER DETAIL NOT AVAILABLE</strong><span>Choose a player after the roster feed connects.</span></div></section>`;
    const c = focus.consensus || consensusFor(focus);
    const actual = actualForPlayer(focus);
    const projection = finite(c.value) ?? finite(focus.projected);
    const average = finite(focus.seasonAvg) ?? projection;
    const trendValues = [finite(focus.actual) || 0, projection || 0, average || 0];
    const peak = Math.max(...trendValues, 1);
    const bars = trendValues.map((value, index) => `<span style="height:${Math.max(14, Math.round(value / peak * 72))}%" class="${index === 0 ? "current" : ""}"></span>`).join("");
    const next = playerOpponent(focus);
    return `<section class="focus-panel workspace-panel"><div class="focus-top"><span class="section-kicker">PLAYER FOCUS</span><button class="focus-close" type="button" aria-label="Reset player focus">RESET</button></div><div class="focus-player">${playerFace(focus, "large")}<div><h2>${esc(focus.full_name || focus.name)}</h2><p>${esc(focus.position || "UTIL")} • ${esc(focus.team || "FA")} • ${esc(focus.side === "opponent" ? league.opponentName : league.ownName)}</p><span class="live-pill ${focus.status === "LIVE" ? "active" : ""}"><i></i>${esc(focus.status || "UPCOMING")} • VS ${esc(next)}</span></div></div><div class="focus-score-grid"><div><strong>${number(actual)}</strong><small>LIVE POINTS</small></div><div><strong>${projection == null ? "MODEL" : number(projection)}</strong><small>PROJ POINTS</small></div><div><strong>${average == null ? "NOT STARTED" : number(average)}</strong><small>SEASON AVG</small></div></div><div class="focus-tabs"><span class="active">LIVE SNAPSHOT</span><span>PROJECTION</span><span>STATUS</span></div><div class="focus-stat-grid"><div><b>${statMarkup(focus.pass_yd ?? focus.passing_yards)}</b><small>PASS YDS</small></div><div><b>${statMarkup(focus.pass_td ?? focus.passing_tds)}</b><small>PASS TD</small></div><div><b>${statMarkup(focus.interceptions ?? focus.int)}</b><small>INT</small></div><div><b>${statMarkup(focus.rush_yd ?? focus.rushing_yards)}</b><small>RUSH YDS</small></div><div><b>${statMarkup(focus.rec ?? focus.receptions)}</b><small>REC</small></div><div><b>${statMarkup(focus.tgt ?? focus.targets)}</b><small>TARGETS</small></div></div><div class="focus-trend-heading"><b>FANTASY POINTS SNAPSHOT</b><span>LIVE • PROJ • AVG</span></div><div class="focus-trend">${bars}</div><div class="focus-trend-labels"><span>LIVE</span><span>PROJ</span><span>AVG</span></div><div class="focus-next"><span>NEXT GAME</span><b>${esc(next)} • ${esc(focus.status === "LIVE" ? "IN PROGRESS" : "SCHEDULED")}</b></div><div class="focus-feed"><span class="status-dot live"></span><b>${esc(focus.statLine || "PREGAME • LIVE STAT LINE READY")}</b></div>${sourceCoverageMarkup()}</section>`;
  }

  function renderScoringTicker(league) {
    const ownActual = leagueActual(league, "own");
    const opponentActual = leagueActual(league, "opponent");
    const ownProjection = (league.own || []).filter((player) => player.starter !== false).reduce((sum, player) => sum + (finite(player.projected) || 0), 0);
    const opponentProjection = (league.opponent || []).filter((player) => player.starter !== false).reduce((sum, player) => sum + (finite(player.projected) || 0), 0);
    return `<section class="scoring-ticker"><div class="ticker-label"><span>WEEK ${esc(league.week || state.week)} SCORING</span><small>ACTUAL LARGE • PROJECTION ALWAYS VISIBLE</small></div><div><span>YOUR TEAM</span><b>${number(ownActual)}</b><small>PROJ ${number(ownProjection)}</small></div><div><span>OPPONENT</span><b>${number(opponentActual)}</b><small>PROJ ${number(opponentProjection)}</small></div><div><span>REFRESH</span><b>5s</b><small>${esc(formatAge(state.refreshedAt))}</small></div></section>`;
  }

  function renderOverview(league) {
    if (document.body.dataset.layout === "monitor") return renderArcadeDashboard(league);
    const starters = (league.own || []).filter((player) => player.starter !== false).slice(0, 10);
    const opponentStarters = (league.opponent || []).filter((player) => player.starter !== false).slice(0, 10);
    const bench = (league.own || []).filter((player) => player.starter === false).slice(0, 6);
    return `<div class="overview-grid"><section class="workspace-panel roster-panel"><div class="panel-heading red-heading"><span><b>MY STARTERS</b><small>${esc(league.ownName)} • LIVE TOTALS + PROJECTIONS</small></span><button class="panel-action" data-view="players" type="button">ALL PLAYERS ›</button></div><div class="player-stack">${starters.length ? starters.map((player) => playerCard(player, "own")).join("") : `<div class="empty-card"><strong>ROSTER FEED SYNCING</strong><span>Waiting for the fantasy provider to return starters.</span></div>`}</div><div class="bench-strip"><span>BENCH • ${bench.length} SHOWN</span>${bench.slice(0, 3).map(compactPlayerRow).join("")}</div></section><section class="workspace-panel roster-panel opponent-panel"><div class="panel-heading blue-heading"><span><b>OPPONENT STARTERS</b><small>${esc(league.opponentName)} • MATCHUP LIVE FEED</small></span><button class="panel-action" data-view="matchups" type="button">MATCHUP ›</button></div><div class="player-stack">${opponentStarters.length ? opponentStarters.map((player) => playerCard(player, "opponent")).join("") : `<div class="empty-card"><strong>OPPONENT FEED SYNCING</strong><span>Waiting for the matchup side to respond.</span></div>`}</div></section><aside class="overview-side"><section class="workspace-panel games-panel"><div class="panel-heading cyan-heading"><span><b>LIVE GAMES</b><small>TOUCH A GAME FOR DETAILS</small></span><button class="panel-action" data-view="live" type="button">ALL GAMES ›</button></div>${liveGamesMarkup()}</section><section class="workspace-panel difference-panel"><div class="panel-heading amber-heading"><span><b>LIVE MARKET ODDS</b><small>PUBLIC GAME LINES</small></span><button class="panel-action" data-view="players" type="button">OPEN ›</button></div>${insightMarkup()}</section>${sourceCoverageMarkup()}</aside></div>`;
  }

  function renderMatchups(league) {
    const own = (league.own || []).filter((player) => player.starter !== false);
    const opponent = (league.opponent || []).filter((player) => player.starter !== false);
    return `<div class="matchup-grid"><section class="workspace-panel roster-panel"><div class="panel-heading red-heading"><span><b>${esc(league.ownName)}</b><small>STARTERS • ${own.length} SLOTS</small></span><span class="panel-total">${number(leagueActual(league, "own"))}</span></div><div class="player-stack">${own.map((player) => playerCard(player, "own")).join("")}</div></section><section class="workspace-panel roster-panel opponent-panel"><div class="panel-heading blue-heading"><span><b>${esc(league.opponentName)}</b><small>OPPONENT • ${opponent.length} SLOTS</small></span><span class="panel-total">${number(leagueActual(league, "opponent"))}</span></div><div class="player-stack">${opponent.map((player) => playerCard(player, "opponent")).join("")}</div></section><aside class="workspace-panel matchup-insights"><div class="panel-heading amber-heading"><span><b>LIVE MARKET ODDS</b><small>PUBLIC GAME LINES</small></span></div>${insightMarkup()}${sourceCoverageMarkup()}</aside></div>`;
  }

  function renderPlayers(league) {
    const allPlayers = [...(league.own || []).map((player) => ({ ...player, rosterSide: "YOUR ROSTER" })), ...(league.opponent || []).map((player) => ({ ...player, rosterSide: "OPPONENT" }))];
    const filter = state.playerFilter || "all";
    const players = allPlayers.filter((player) => filter === "all" || filter === "starters" && player.starter !== false || filter === "bench" && player.starter === false || filter === "live" && player.status === "LIVE");
    const liveCount = allPlayers.filter((player) => player.status === "LIVE").length;
    const rows = players.length ? players.map((player) => `<button class="players-table-row" data-player-id="${esc(player.player_id)}" data-side="${esc(player.side || "own")}" type="button">${playerFace(player, "small")}<span><strong>${esc(player.full_name || player.name)}</strong><small>${esc(player.position || "UTIL")} • ${esc(player.team || "FA")} • ${esc(player.rosterSide)}</small></span><span><b class="status-text">${esc(player.status || "UPCOMING")}</b><small>VS ${esc(playerOpponent(player))}</small></span><strong class="table-actual">${number(actualForPlayer(player))}<small>PTS</small></strong><span class="table-proj">${esc(projectionLabel(player))}<small>${esc(rangeLabel(player))}</small></span><span class="table-odds">${esc(oddsLabel(player))}<small>OPEN DETAIL ›</small></span></button>`).join("") : `<div class="empty-card"><strong>NO PLAYERS IN THIS FILTER</strong><span>Try ALL PLAYERS or refresh the connected roster feed.</span></div>`;
    const refreshLabel = document.body.dataset.layout === "mobile" ? "REFRESH PROJ" : "REFRESH PROJECTIONS";
    return `<div class="players-view"><div class="projection-intro"><div><strong>PROJECTION BOARD</strong><small>ACTUAL, median projection, source range, and odds status stay visible for every player.</small></div><button class="refresh-action" data-action="refresh" type="button">${refreshLabel}</button></div><div class="filter-row"><button class="filter ${filter === "all" ? "active" : ""}" data-filter="all" type="button">ALL PLAYERS</button><button class="filter ${filter === "starters" ? "active" : ""}" data-filter="starters" type="button">STARTERS</button><button class="filter ${filter === "bench" ? "active" : ""}" data-filter="bench" type="button">BENCH</button><button class="filter ${filter === "live" ? "active" : ""}" data-filter="live" type="button">LIVE NOW${liveCount ? ` • ${liveCount}` : ""}</button><span class="filter-note">Tap a row for detail • PROJ = current feed median/backstop • RANGE = source spread</span></div><div class="players-table"><div class="players-table-head"><span>PLAYER</span><span>STATUS / MATCHUP</span><span>ACTUAL</span><span>CONSENSUS</span><span>ODDS / RANGE</span></div>${rows}</div></div>`;
  }

  function renderInjuries(league) {
    const players = [...(league.own || []).map((player) => ({ ...player, rosterSide: "YOUR ROSTER" })), ...(league.opponent || []).map((player) => ({ ...player, rosterSide: "OPPONENT" }))];
    const flagged = players.filter((player) => /OUT|IR|DOUBTFUL|QUESTIONABLE|INJURY/i.test(String(player.status || "")));
    const rows = flagged.length ? flagged : players.filter((player) => player.status && player.status !== "ACTIVE" && player.status !== "NO GAME").slice(0, 8);
    return `<div class="injuries-view"><section class="workspace-panel"><div class="panel-heading amber-heading"><span><b>INJURY CENTER</b><small>STATUS • PRACTICE • PLAY PROBABILITY</small></span><span class="panel-total">${rows.length} FLAGS</span></div><div class="injury-grid">${rows.length ? rows.map((player) => `<button class="injury-card" data-player-id="${esc(player.player_id)}" data-side="own" type="button">${playerFace(player, "medium")}<span><strong>${esc(player.full_name || player.name)}</strong><small>${esc(player.team || "FA")} • ${esc(player.position || "UTIL")} • ${esc(player.rosterSide)}</small><b class="injury-status">${esc(player.status || "QUESTIONABLE")}</b><em>MEDIAN PLAY PROBABILITY • PROVIDER DATA SYNCING</em></span><span class="probability-track"><i style="width:${/OUT|IR/.test(String(player.status || "")) ? 5 : 50}%"></i></span></button>`).join("") : `<div class="empty-card"><strong>NO CURRENT ROSTER FLAGS</strong><span>Practice updates and median probability will appear when provider feeds respond.</span></div>`}</div></section><aside>${sourceCoverageMarkup()}<section class="workspace-panel injury-note"><div class="panel-heading cyan-heading"><span><b>HOW PROBABILITY WORKS</b><small>TRANSPARENT SIGNALS</small></span></div><p>Each player will show a median of enabled practice, injury, news, and sportsbook availability signals. Missing sources stay missing; they are never silently treated as a healthy 100%.</p></section></aside></div>`;
  }

  function renderLive(league) {
    const livePlayers = [...(league.own || []), ...(league.opponent || [])].filter((player) => player.status === "LIVE");
    return `<div class="live-arcade-head"><div class="arcade-title"><span class="arcade-pulse"></span><div><strong>LIVE SCORE ARCADE</strong><small>POINTS POP WHEN A PLAY HAPPENS • 5s REFRESH</small></div></div><div class="arcade-legend"><span class="up">▲ UP</span><span class="down">▼ DOWN</span><span>ACTUAL + PROJ</span></div></div><div class="live-view arcade-live-view"><section class="workspace-panel games-panel"><div class="panel-heading cyan-heading"><span><b>LIVE GAME BOARD</b><small>REFRESHING EVERY ${CONFIG.refreshMs / 1000}s</small></span><span class="panel-total">${livePlayers.length} FANTASY LIVE</span></div>${liveGamesMarkup()}</section><section class="workspace-panel live-players"><div class="panel-heading green-heading"><span><b>LIVE PLAYER PERFORMANCE</b><small>ACTUAL SCORE IS PRIMARY • PROJ STAYS VISIBLE</small></span></div><div class="player-stack">${livePlayers.length ? livePlayers.map((player) => playerCard(player, player.side || "own")).join("") : `<div class="empty-card"><strong>NO ROSTER PLAYERS LIVE</strong><span>When a game starts, actual points and live stat lines replace the pregame zero.</span></div>`}</div></section><aside class="workspace-panel difference-panel"><div class="panel-heading amber-heading"><span><b>LIVE MARKET MOVES</b><small>LINE RANGE + OUTLIER</small></span></div>${insightMarkup()}</aside></div>`;
  }

  function renderDrawer() {
    const drawer = $("#playerDrawer");
    if (!state.selectedPlayer) { drawer.classList.remove("open"); drawer.innerHTML = ""; return; }
    const player = state.selectedPlayer;
    const c = player.consensus || consensusFor(player);
    const actual = actualForPlayer(player);
    const playerStatus = String(player.status || player.injury_status || "UPCOMING").toUpperCase();
    const event = player.event || findPlayerEvent(player);
    const gameLabel = playerGameLabel(player);
    const odds = gameOddsFor(player);
    const playerNews = player.news || player.news_headline || player.injury_notes || player.notes || "";
    const newsMarkup = playerNews
      ? `<div class="player-news-card"><span class="news-dot"></span><div><strong>${esc(playerNews)}</strong><small>${esc(playerStatus)} • PROVIDER UPDATE</small></div></div>`
      : `<div class="player-news-card"><span class="news-dot muted"></span><div><strong>${/OUT|IR|DOUBTFUL|QUESTIONABLE/i.test(playerStatus) ? "INJURY FLAG IS THE CURRENT UPDATE" : "NO INJURY FLAG REPORTED"}</strong><small>${esc(playerStatus)} • ${event && eventState(event).live ? "LIVE PLAY-BY-PLAY FEED" : "PREGAME PRACTICE / NEWS FEED WILL APPEAR WHEN A PROVIDER REPORTS AN UPDATE"}</small></div></div>`;
    const sourceRows = c.sources && c.sources.length ? c.sources.slice(0, 8).map((source) => `<div class="source-value"><span>${esc(source.source || source.name || "SOURCE")}</span><b>${number(source.value, 1, "MODEL")}</b></div>`).join("") : `<div class="empty-card compact"><strong>PUBLIC PROJECTION FEED</strong><span>ESPN or Sleeper projection is being used until another source is enabled.</span></div>`;
    const oddsRows = c.odds && c.odds.length
      ? c.odds.slice(0, 8).map((odd) => `<div class="source-value"><span>${esc(odd.book || odd.bookmaker || odd.source || "BOOK")} • ${esc(odd.market || "PROP")}</span><b>${esc(odd.line == null ? "NOT SET" : odd.line)} <small>${esc(odd.price == null ? "" : odd.price)}</small></b></div>`).join("")
      : odds
        ? `<div class="source-value"><span>${esc(odds.provider)} • GAME LINE</span><b>${esc(odds.line)} <small>${esc(odds.price || "PUBLIC LINE")}</small></b></div>`
        : `<div class="empty-card compact"><strong>GAME ODDS WAITING</strong><span>The public scoreboard has not published a line for this matchup yet.</span></div>`;
    drawer.classList.add("open");
    drawer.innerHTML = `<div class="drawer-top"><span class="section-kicker">PLAYER DETAIL</span><button id="closeDrawer" type="button" aria-label="Close player detail">×</button></div><div class="drawer-player">${playerFace(player, "large")}<div><h2>${esc(player.full_name || player.name)}</h2><p>${esc(player.position || "UTIL")} • ${esc(player.team || "FA")} • VS ${esc(playerOpponent(player))}</p><span class="live-pill ${player.status === "LIVE" ? "active" : ""}"><i></i>${esc(player.status || "UPCOMING")}</span></div></div><div class="drawer-score-grid"><div><strong>${number(actual)}</strong><small>ACTUAL / LIVE</small></div><div><strong>${c.value == null ? "MODEL" : number(c.value)}</strong><small>CONSENSUS PROJ</small></div><div><strong>${c.range == null ? "ONE FEED" : number(c.range)}</strong><small>PROJ RANGE</small></div></div><div class="drawer-context-grid"><div><small>GAME</small><b>${esc(gameLabel)}</b></div><div><small>TEAM</small><b>${esc(player.team || "FA")}</b></div><div><small>STATUS</small><b>${esc(playerStatus)}</b></div><div><small>ODDS</small><b>${esc(odds ? `${odds.provider} • ${odds.price || odds.line}` : "PUBLIC LINE PENDING")}</b></div></div><div class="drawer-tabs"><span class="active">PERSONAL STATS</span><span>NEWS / PRACTICE</span><span>PROJECTION</span></div><section class="drawer-section"><div class="drawer-heading"><b>PERSONAL STATS • LIVE / PROJECTED</b><span>${esc(projectionLabel(player))}</span></div><div class="stat-grid"><div><b>${detailStatMarkup(player.pass_yd ?? player.passing_yards)}</b><small>PASS YDS</small></div><div><b>${detailStatMarkup(player.pass_td ?? player.passing_tds)}</b><small>PASS TD</small></div><div><b>${detailStatMarkup(player.rush_yd ?? player.rushing_yards)}</b><small>RUSH YDS</small></div><div><b>${detailStatMarkup(player.rec ?? player.receptions)}</b><small>REC</small></div><div><b>${detailStatMarkup(player.rec_yd ?? player.receiving_yards)}</b><small>REC YDS</small></div><div><b>${detailStatMarkup(player.tgt ?? player.targets)}</b><small>TARGETS</small></div></div></section><section class="drawer-section"><div class="drawer-heading"><b>PLAYER NEWS / PRACTICE</b><span>${esc(playerStatus)}</span></div>${newsMarkup}</section><section class="drawer-section"><div class="drawer-heading"><b>PROJECTION SOURCES</b><span>${esc(rangeLabel(player))}</span></div>${sourceRows}</section><section class="drawer-section"><div class="drawer-heading"><b>SPORTSBOOK ODDS</b><span>${esc(oddsLabel(player))}</span></div>${oddsRows}</section><p class="drawer-disclaimer">Informational only. Actual points and provider status refresh every 5 seconds when the connected league feed reports a change.</p>`;
    $("#closeDrawer").addEventListener("click", () => { state.selectedPlayer = null; render(); });
  }

  function renderWorkspace(league) {
    const workspace = $("#workspace");
    if (state.loading) { workspace.innerHTML = `<div class="loading-panel">LOADING LIVE FANTASY DATA…</div>`; return; }
    if (!league.ready && state.view !== "overview") { workspace.innerHTML = `<div class="loading-panel"><strong>ESPN FEED NOT CONNECTED</strong><span>Use the public ESPN league setting, then tap REFRESH NOW.</span><button class="refresh-action" data-action="refresh" type="button">REFRESH NOW</button></div>`; wireInteractions(); return; }
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
    animateLiveScores();
    $$("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
    $$("[data-league]").forEach((button) => button.classList.toggle("active", button.dataset.league === state.league));
    $("#connectionText").textContent = state.error ? "FEED PARTIAL" : state.loading ? "CONNECTING" : "LIVE DATA CONNECTED";
    $("#connectionDot").className = `status-dot ${state.error ? "warn" : state.loading ? "" : "live"}`;
    $("#lastSync").textContent = `SYNC ${formatClock(state.refreshedAt || new Date())}`;
    $("#clock").textContent = formatClock(new Date());
    $("#sourceStatus").textContent = `${sourceStats().live} LIVE FEEDS`;
    const oddsStatus = $("#oddsStatus");
    if (oddsStatus) oddsStatus.textContent = sourceStats().oddsBooks ? `${sourceStats().oddsBooks} LIVE ODDS` : "GAME ODDS WAITING";
  }

  function animateLiveScores() {
    if (state.view !== "live") return;
    $$(".live-view .actual-score[data-score-from]").forEach((element) => {
      if (element.dataset.animated === "1") return;
      const from = finite(element.dataset.scoreFrom);
      const to = finite(element.dataset.scoreTo);
      if (from == null || to == null || from === to) return;
      element.dataset.animated = "1";
      const started = performance.now();
      const duration = 1100;
      const ease = (value) => 1 - Math.pow(1 - value, 3);
      const tick = (now) => {
        const progress = Math.min(1, (now - started) / duration);
        element.textContent = (from + (to - from) * ease(progress)).toFixed(1);
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function wireInteractions() {
    $$("[data-view]").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.view; state.selectedPlayer = null; if (state.view !== "players") state.playerFilter = "all"; render(); }));
    $$("[data-league]").forEach((button) => button.addEventListener("click", () => { state.league = button.dataset.league; state.selectedPlayer = null; state.playerFilter = "all"; state.scoreSnapshot = {}; state.scoreMoves = {}; render(); }));
    $$("[data-action=refresh]").forEach((button) => {
      const refreshNow = () => {
        button.classList.add("is-refreshing");
        refresh().finally(() => button.classList.remove("is-refreshing"));
      };
      button.addEventListener("click", refreshNow);
      button.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); refreshNow(); } });
    });
    $$('[data-filter]').forEach((button) => button.addEventListener("click", () => { state.playerFilter = button.dataset.filter || "all"; render(); }));
    $$('[data-player-id]').forEach((button) => button.addEventListener("click", () => {
      const league = currentLeague();
      const players = [...(league.own || []), ...(league.opponent || [])];
      state.selectedPlayer = players.find((player) => String(player.player_id) === String(button.dataset.playerId)) || null;
      render();
    }));
    $$('[data-player-name]').forEach((button) => button.addEventListener("click", () => {
      const league = currentLeague();
      const players = [...(league.own || []), ...(league.opponent || [])];
      const target = nameKey(button.dataset.playerName);
      state.selectedPlayer = players.find((player) => nameKey(player.full_name || player.name) === target) || null;
      render();
    }));
    const focusClose = $(".focus-close");
    if (focusClose) focusClose.addEventListener("click", () => { state.selectedPlayer = null; render(); });
  }

  async function refresh() {
    if (refreshInFlight) return;
    refreshInFlight = true;
    // Load Sleeper first so the scoreboard request can use the current NFL
    // week and expose upcoming game times/opponents, not only today's games.
    const sleeperResult = await loadSleeper().then((value) => ({ value })).catch((error) => ({ error }));
    if (sleeperResult.value && sleeperResult.value.week) state.week = sleeperResult.value.week;
    const [scoreboardResult, espnResult, consensusResult] = await Promise.all([
      loadScoreboard().then((value) => ({ value })).catch((error) => ({ error })),
      loadESPN().then((value) => ({ value })).catch((error) => ({ error })),
      loadConsensus().then((value) => ({ value })).catch((error) => ({ error }))
    ]);
    const failures = [];
    if (scoreboardResult.value) state.scoreboard = scoreboardResult.value.events || [];
    if (sleeperResult.value) state.sleeper = sleeperResult.value; else failures.push("SLEEPER");
    if (espnResult.value) state.espn = espnResult.value; else failures.push("ESPN");
    if (consensusResult.value) state.consensus = consensusResult.value; else if (!state.consensus) state.consensus = { status: "unavailable", players: {}, sources: [], insights: [] };
    updateScoreMoves(currentLeague());
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
  setInterval(() => {
    const clock = $("#clock");
    if (clock) clock.textContent = formatClock(new Date());
  }, 1000);
})();

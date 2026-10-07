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

  const ESPN_PUBLIC_URL = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/919590140?view=mSettings&view=mTeam&view=mRoster&view=mMatchup&view=mMatchupScore&view=mBoxScore&view=mLiveScoring";
  const ESPN_TEAM_BY_PRO_ID = { 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU" };
  const ESPN_POSITION_BY_ID = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };
  const ESPN_STAT_ID_LABELS = {
    0: "Passing Attempts", 1: "Passing Completions", 2: "Incomplete Passes", 3: "Passing Yards", 4: "Passing Touchdowns", 19: "Interceptions",
    20: "Sacks Taken", 23: "Rushing Attempts", 24: "Rushing Yards", 25: "Rushing Touchdowns",
    41: "Receiving Targets", 42: "Receiving Yards", 43: "Receiving Touchdowns", 53: "Receptions", 58: "Targets",
    72: "Fumbles Lost", 80: "Field Goals Made", 81: "Field Goals Attempted", 85: "Extra Points Made",
    89: "Defense Sacks", 90: "Defense Interceptions", 91: "Defense Fumbles Recovered", 92: "Defense Touchdowns", 95: "Points Allowed", 96: "Yards Allowed"
  };
  const SLEEPER_STAT_LABELS = {
    pass_cmp: "Completions", pass_att: "Passing Attempts", pass_yd: "Passing Yards", pass_td: "Passing Touchdowns", pass_int: "Interceptions", pass_sack: "Sacks Taken",
    rush_att: "Rushing Attempts", rush_yd: "Rushing Yards", rush_td: "Rushing Touchdowns", rush_lng: "Longest Rush", rush_rz_att: "Red Zone Rushes", rush_fd: "Rushing First Downs", rush_ypa: "Rush Yards Per Attempt",
    rec: "Receptions", rec_tgt: "Targets", targets: "Targets", rec_yd: "Receiving Yards", rec_td: "Receiving Touchdowns", rec_lng: "Longest Catch", rec_air_yd: "Air Yards", rec_fd: "Receiving First Downs", rec_ypr: "Yards Per Catch", rec_ypt: "Yards Per Target", rush_rec_yd: "Total Scrimmage Yards",
    fum: "Fumbles", fum_lost: "Fumbles Lost", xpm: "Extra Points Made", xpa: "Extra Points Attempted", fgm: "Field Goals Made", fga: "Field Goals Attempted", fgmiss: "Field Goals Missed",
    sack: "Defense Sacks", int: "Defense Interceptions", ff: "Forced Fumbles", fum_rec: "Fumbles Recovered", def_td: "Defense Touchdowns", safe: "Safeties", blk_kick: "Blocked Kicks", pts_allow: "Points Allowed", yds_allow: "Yards Allowed"
  };
  const ESPN_BENCH_SLOTS = new Set([20, 21, 22]);
  const TEAM_ABBR_ALIASES = { WAS: "WSH", WSH: "WSH", JAC: "JAX", JAX: "JAX", LVR: "LV", LV: "LV" };
  const OWN_TEAM_COLOR = "#ff7a00";
  const TEAM_STOCK_COLORS = ["#58bfff", "#b29aff", "#39c99b", "#ef7898", "#ffd166", "#7fa6ff", "#42d4db", "#cf8cff", "#ff8774", "#b8d85b", "#e883d2", "#c3cfdd"];
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
  const BRAND_LOGO_DATA = root + "assets/justin-mascot-cutout.png";
  const state = {
    view: "overview",
    selectedMatchup: null,
    selectedGame: null,
    selectedPlayerId: null,
    refreshNonce: 0,
    league: "sleeper",
    week: 1,
    sleeper: null,
    espn: null,
    consensus: null,
    scoreboard: [],
    scoreboards: {},
    selectedPlayer: null,
    playerFilter: "all",
    scoreSnapshot: {},
    scoreMoves: {},
    scoreHistory: { sleeper: [], espn: [] },
    scoreHistoryScope: { sleeper: "", espn: "" },
    scoreEvents: { sleeper: [], espn: [] },
    scoreEventScope: { sleeper: "", espn: "" },
    playerHistories: { sleeper: {}, espn: {} },
    teamScoreHistory: { sleeper: [], espn: [] },
    teamScoreHistoryMode: { sleeper: "", espn: "" },
    teamScoreHistoryScope: { sleeper: "", espn: "" },
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

  const brandLogo = () => BRAND_LOGO_DATA;
  const isOwnFantasyTeam = (team) => [CONFIG.sleeperTeamName, CONFIG.espnTeamName].some((name) => nameKey(team && team.name) === nameKey(name));

  function statRowsFromMap(stats, labels = {}, options = {}) {
    const raw = stats && typeof stats === "object" ? stats : {};
    const skip = new Set(["player_id", "playerId", "id", "team", "opponent", "game_id", "week", "season", "season_type", "company", "date", "updated_at", "pts_std", "pts_half_ppr", "pts_ppr", "fantasy_points", "projected_points"]);
    return Object.entries(raw).map(([key, rawValue]) => {
      if (skip.has(String(key))) return null;
      const value = finite(rawValue);
      if (value == null) return null;
      const label = labels[String(key)] || labels[key] || (options.strictLabels ? "" : formatESPNStatLabel(String(key)));
      if (!label) return null;
      return { id: String(key), label: options.projected ? `PROJ ${formatESPNStatLabel(label)}` : formatESPNStatLabel(label), value, projected: Boolean(options.projected) };
    }).filter(Boolean);
  }

  function rowsFromProviderPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    return Object.entries(payload).map(([id, value]) => ({ player_id: id, ...(value && typeof value === "object" ? value : {}) }));
  }

  function playerStatsSummary(stats) {
    const rows = (Array.isArray(stats) ? stats : []).filter((stat) => stat && finite(stat.value) != null);
    const wanted = ["RECEPTIONS", "TARGETS", "RECEIVING YARDS", "RUSHING YARDS", "RUSHING ATTEMPTS", "PASSING YARDS", "PASSING TOUCHDOWNS", "RUSHING TOUCHDOWNS", "RECEIVING TOUCHDOWNS", "INTERCEPTIONS"];
    return rows.slice().sort((a, b) => {
      const ai = wanted.findIndex((label) => String(a.label || "").includes(label));
      const bi = wanted.findIndex((label) => String(b.label || "").includes(label));
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    }).slice(0, 4).map((stat) => `${number(stat.value, Number.isInteger(stat.value) ? 0 : 1)} ${stat.label}`).join(" • ");
  }

  async function getJSON(url) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 12000);
    try {
      const response = await fetch(url, { cache: "no-store", credentials: "omit", signal:abort.signal });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return await response.json();
    } finally { clearTimeout(timer); }
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
    const period=Number(player && player.scoringPeriodId);
    const board=period && period!==Number(state.week)?state.scoreboards[period] || []:state.scoreboard;
    return board.find((event) => eventCompetitors(event).some((c) => teamCode(c.team && c.team.abbreviation) === team)) || null;
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
    if(player && player.scoringPeriodId)return {src:fallback || `https://a.espncdn.com/i/headshots/nfl/players/full/${encodeURIComponent(id)}.png`,fallback:""};
    return { src: sleeper || fallback, fallback: fallback && fallback !== sleeper ? fallback : "" };
  }

  function playerFace(player, size = "") {
    const image = playerImage(player);
    const name = player && (player.full_name || player.name) || "Player";
    return `<span class="player-face ${size}" data-initials="${esc(initials(name))}"><img src="${esc(image.src)}" ${image.fallback ? `data-fallback="${esc(image.fallback)}"` : ""} alt="${esc(name)}" onload="this.style.opacity='1'" onerror="this.style.opacity='.16'"></span>`;
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

  function colorLeagueTeams(teams) {
    const ordered = [...(teams || [])].sort((left, right) => String(left.id || left.teamId || left.name).localeCompare(String(right.id || right.teamId || right.name), undefined, { numeric: true }));
    const colorById = new Map();
    let otherTeamColorIndex = 0;
    ordered.forEach((team, index) => {
      if (!isOwnFantasyTeam(team)) {
        const id = String(team.id || team.teamId || team.name || index);
        colorById.set(id, TEAM_STOCK_COLORS[otherTeamColorIndex++ % TEAM_STOCK_COLORS.length]);
      }
    });
    return (teams || []).map((team, index) => {
      const id = String(team.id || team.teamId || team.name || index);
      const color = isOwnFantasyTeam(team) ? OWN_TEAM_COLOR : colorById.get(id) || TEAM_STOCK_COLORS[(index + 1) % TEAM_STOCK_COLORS.length];
      return {
        ...team,
        teamColor: color,
        isOwnFantasyTeam: isOwnFantasyTeam(team),
        players: (team.players || []).map((player) => ({
          ...player,
          fantasyTeamId: id,
          fantasyTeamName: team.name || "LEAGUE TEAM",
          fantasyTeamColor: color
        }))
      };
    });
  }

  function normalizeSleeperPlayer(id, players, pointsMap, roster, consensusData, statsMap = {}, projectedStatsMap = {}) {
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
    const liveStats = statsMap && statsMap[String(id)] || {};
    const projectionStats = projectedStatsMap && projectedStatsMap[String(id)] || {};
    const gameStats = statRowsFromMap(liveStats, SLEEPER_STAT_LABELS, { strictLabels: true });
    const projectedGameStats = statRowsFromMap(projectionStats, SLEEPER_STAT_LABELS, { projected: true, strictLabels: true });
    const starterSet = new Set((roster && roster.starters || []).map(String));
    const projected = consensus.value != null ? consensus.value : finite(player.projected);
    return {
      ...player,
      full_name: player.full_name || player.name,
      position: player.position || "UTIL",
      team: player.team || "FA",
      actual,
      projected,
      status,
      event,
      starter: starterSet.has(String(id)),
      consensus,
      gameStats,
      projectedGameStats,
      pass_yd: liveStats.pass_yd,
      pass_td: liveStats.pass_td,
      interceptions: liveStats.pass_int,
      rush_att: liveStats.rush_att,
      rush_yd: liveStats.rush_yd,
      rush_td: liveStats.rush_td,
      receptions: liveStats.rec,
      targets: liveStats.rec_tgt ?? liveStats.targets,
      rec_yd: liveStats.rec_yd,
      rec_td: liveStats.rec_td,
      statLine: gameStats.length ? `LIVE • ${playerStatsSummary(gameStats)} • ${number(actual)} PTS` : projectedGameStats.length ? `PROJ • ${playerStatsSummary(projectedGameStats)} • ${projected == null ? "MODEL" : number(projected)} PTS` : undefined
    };
  }

  function consensusFor(player, consensusData = state.consensus) {
    const targetWeek=Number(player && player.scoringPeriodId || state.week);
    const map = consensusData && (!consensusData.week || Number(consensusData.week)===targetWeek) ? consensusData.players || {} : {};
    const id = String(player && (player.player_id || player.id) || "");
    const fallbackConsensus = () => {
      const key = nameKey(player && (player.full_name || player.name));
      const publicRows=Number(state.espn && state.espn.scoringPeriodId)===targetWeek?state.espn.projectionPlayers || {}:{};
      const publicRow=publicRows[key];
      const direct = finite(player && player.projected) ?? finite(publicRow && publicRow.projected);
      const sourceLabel = direct == null ? "NOT REPORTED" : player && player.scoringPeriodId ? "ESPN" : "SLEEPER";
      return { value:direct, min: null, max: null, range: null, sourceCount:direct == null?0:1, sources:direct == null?[]:[{ source:sourceLabel,value:direct }], outlier:null,odds:[],fallback:true,sourceLabel };
    };
    // ESPN's weekly projection already reflects this league's scoring rules.
    // A Sleeper projection from another week or scoring format cannot replace it.
    if(player && player.scoringPeriodId)return fallbackConsensus();
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
    const [matchups, projections, weeklyStats] = await Promise.all([
      getJSON(`${base}/league/${leagueId}/matchups/${week}`),
      getJSON(`${base}/projections/nfl/regular/${CONFIG.season}/${week}`).catch(() => []),
      getJSON(`${base}/stats/nfl/regular/${CONFIG.season}/${week}`).catch(() => ({}))
    ]);
    const named = users.find((user) => String(user.metadata && user.metadata.team_name || "").trim().toLowerCase() === CONFIG.sleeperTeamName.toLowerCase());
    const ownerId = named && named.user_id || CONFIG.sleeperOwnerId;
    const roster = rosters.find((candidate) => String(candidate.owner_id) === String(ownerId)) || rosters[0];
    const matchup = matchups.find((candidate) => Number(candidate.roster_id) === Number(roster && roster.roster_id)) || {};
    const opponentMatchup = matchup && matchup.matchup_id ? matchups.find((candidate) => Number(candidate.matchup_id) === Number(matchup.matchup_id) && Number(candidate.roster_id) !== Number(matchup.roster_id)) : null;
    const opponentRoster = opponentMatchup && rosters.find((candidate) => Number(candidate.roster_id) === Number(opponentMatchup.roster_id));
    const projectedMap = {};
    const projectedStatsMap = {};
    rowsFromProviderPayload(projections).forEach((row) => {
      const id = String(row && (row.player_id || row.playerId || row.id) || "");
      if (!id) return;
      const stats = row.stats && typeof row.stats === "object" ? row.stats : row;
      const value = finite(row && (row.pts_ppr != null ? row.pts_ppr : row.pts_half_ppr != null ? row.pts_half_ppr : row.pts_std != null ? row.pts_std : row.fantasy_points != null ? row.fantasy_points : row.projected_points)) ?? finite(stats && (stats.pts_ppr ?? stats.pts_half_ppr ?? stats.pts_std));
      if (value != null) projectedMap[id] = value;
      projectedStatsMap[id] = stats || {};
    });
    const statsMap = Object.fromEntries(rowsFromProviderPayload(weeklyStats).map((row) => {
      const id = String(row && (row.player_id || row.playerId || row.id) || "");
      const stats = row && row.stats && typeof row.stats === "object" ? row.stats : row;
      return [id, stats || {}];
    }).filter(([id]) => id));
    const mergedPlayers = { ...players };
    Object.entries(projectedMap).forEach(([id, value]) => { if (mergedPlayers[id]) mergedPlayers[id] = { ...mergedPlayers[id], projected: Number(value.toFixed(1)) }; });
    const pointsMap = matchup.players_points || {};
    const opponentPointsMap = opponentMatchup && opponentMatchup.players_points || {};
    const ownUser = users.find((user) => String(user.user_id) === String(roster && roster.owner_id)) || named || null;
    const opponentUser = users.find((user) => String(user.user_id) === String(opponentRoster && opponentRoster.owner_id)) || null;
    return { league, users, rosters, roster, opponentRoster, ownUser, opponentUser, matchup, opponentMatchup, matchups, players: mergedPlayers, pointsMap, opponentPointsMap, statsMap, projectedStatsMap, week };
  }

  function espnStatRows(player, scoringPeriodId) {
    return Array.isArray(player && player.stats) ? player.stats.filter((row) => Number(row.scoringPeriodId) === Number(scoringPeriodId)) : [];
  }

  function espnProjection(player, scoringPeriodId) {
    const rows = espnStatRows(player, scoringPeriodId);
    const projected = rows.find((row) => Number(row.statSourceId) === 1);
    const rowValue = finite(projected && (projected.appliedTotal ?? projected.projectedTotal ?? projected.projectedPoints));
    if (rowValue != null) return rowValue;
    return finite(player && (player.projectedTotal != null ? player.projectedTotal : player.projected));
  }

  function espnSeasonAverage(player) {
    const rows = Array.isArray(player && player.stats) ? player.stats : [];
    const season = rows.find((row) => Number(row.scoringPeriodId) === 0 && Number(row.statSourceId) === 0) || rows.find((row) => Number(row.scoringPeriodId) === 0);
    return finite(season && (season.appliedAverage || season.appliedTotal));
  }

  function espnStatLabels(data) {
    const labels = { ...ESPN_STAT_ID_LABELS };
    const items = data && data.settings && data.settings.scoringSettings && data.settings.scoringSettings.scoringItems;
    (Array.isArray(items) ? items : []).forEach((item) => {
      const id = item && (item.statId ?? item.id);
      const label = item && (item.name || item.abbrev || item.abbreviation);
      if (id != null && label) labels[String(id)] = String(label);
    });
    return labels;
  }

  function formatESPNStatLabel(value) {
    return String(value || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  }

  function espnLiveFields(player, scoringPeriodId, labels = ESPN_STAT_ID_LABELS) {
    const actualRows = espnStatRows(player, scoringPeriodId).filter((candidate) => Number(candidate.statSourceId) === 0);
    const row = actualRows.find((candidate) => candidate.stats && Object.keys(candidate.stats).length) || actualRows[0];
    const stats = row && row.stats || {};
    if (!row) return {};
    const value = (key) => finite(stats[key]);
    const gameStats = Object.entries(stats).map(([id, rawValue]) => ({
      id: String(id),
      label: formatESPNStatLabel(labels[String(id)] || ESPN_STAT_ID_LABELS[String(id)] || `STAT ${id}`),
      value: finite(rawValue)
    })).filter((stat) => stat.label && stat.value != null && (Math.abs(stat.value) > 0.001 || Boolean(ESPN_STAT_ID_LABELS[stat.id])));
    const projectedRow = espnStatRows(player, scoringPeriodId).find((candidate) => Number(candidate.statSourceId) === 1 && candidate.stats && Object.keys(candidate.stats).length);
    const projectedGameStats = Object.entries(projectedRow && projectedRow.stats || {}).map(([id, rawValue]) => ({
      id: String(id),
      label: `PROJ ${formatESPNStatLabel(labels[String(id)] || ESPN_STAT_ID_LABELS[String(id)] || `STAT ${id}`)}`,
      value: finite(rawValue),
      projected: true
    })).filter((stat) => stat.label && stat.value != null && Math.abs(stat.value) > 0.001);
    if (Number(player && player.defaultPositionId) === 1) {
      return { pass_yd: value("3"), pass_td: value("4"), interceptions: value("19"), rush_att: value("23"), rush_yd: value("24"), rush_td: value("25"), gameStats, projectedGameStats };
    }
    return { rush_att: value("23"), rush_yd: value("24"), rush_td: value("25"), rec_yd: value("42"), rec_td: value("43"), receptions: value("53"), targets: value("58") ?? value("41"), gameStats, projectedGameStats };
  }

  function espnStatLine(player, actual, projected, event) {
    const status = event && eventState(event);
    const final = Boolean(status && status.final);
    const live = Boolean(status && status.live) || !final && finite(actual) != null && finite(actual) > 0;
    const label = final ? "FINAL" : live ? "LIVE" : "PREGAME";
    const opponent = event && eventCompetitors(event).find((candidate) => String(candidate.team && candidate.team.abbreviation || "").toUpperCase() !== String(ESPN_TEAM_BY_PRO_ID[player && player.proTeamId] || "").toUpperCase());
    const matchup = opponent && opponent.team && opponent.team.abbreviation ? `VS ${opponent.team.abbreviation}` : "NEXT GAME";
    const visibleActual = final || live || finite(actual) > 0 ? actual : 0;
    return `${label} • ${matchup} • ${number(visibleActual)} PTS • PROJ ${projected == null ? "MODEL READY" : number(projected)}`;
  }

  function normalizeESPNEntry(entry, currentEntry, scoringPeriodId, side, statLabels = ESPN_STAT_ID_LABELS) {
    const pool = entry && entry.playerPoolEntry || {};
    const currentPool = currentEntry && currentEntry.playerPoolEntry || {};
    const basePlayer = pool.player || entry && entry.player || {};
    const currentPlayer = currentPool.player || currentEntry && currentEntry.player || {};
    const player = { ...basePlayer, ...currentPlayer };
    const id = String(entry && (entry.playerId || pool.id || player.id) || "");
    const name = player.fullName || [player.firstName, player.lastName].filter(Boolean).join(" ") || id || "Player";
    const position = ESPN_POSITION_BY_ID[player.defaultPositionId] || "UTIL";
    const team = ESPN_TEAM_BY_PRO_ID[player.proTeamId] || "FA";
    const event = findPlayerEvent({ team, scoringPeriodId }) || null;
    const eventStatus = event && eventState(event);
    const rows = espnStatRows(player, scoringPeriodId);
    const actualRow = rows.find((row) => Number(row.statSourceId) === 0);
    const actualValue = [
      actualRow && actualRow.appliedTotal,
      actualRow && actualRow.appliedStatTotal,
      currentEntry && currentEntry.appliedStatTotal,
      currentPool.appliedStatTotal,
      Number(entry && entry.scoringPeriodId) === Number(scoringPeriodId) ? entry.appliedStatTotal : null
    ].map(finite).find((value) => value != null);
    const actual = actualValue ?? 0;
    const rowProjection = espnProjection(player, scoringPeriodId);
    const entryProjection = [
      currentEntry && (currentEntry.projectedTotal ?? currentEntry.projectedPoints),
      currentPool && (currentPool.projectedTotal ?? currentPool.projectedPoints),
      entry && (entry.projectedTotal ?? entry.projectedPoints),
      pool && (pool.projectedTotal ?? pool.projectedPoints)
    ].map(finite).find((value) => value != null);
    const projected = rowProjection ?? entryProjection ?? null;
    const liveFields = espnLiveFields(player, scoringPeriodId, statLabels);
    const headshot = `https://a.espncdn.com/i/headshots/nfl/players/full/${encodeURIComponent(id)}.png`;
    const lineupSlotId = Number(entry && entry.lineupSlotId);
    const injury = entry && entry.injuryStatus && entry.injuryStatus !== "NORMAL" ? entry.injuryStatus : player.injuryStatus;
    const status = eventStatus && eventStatus.final ? "FINAL" : eventStatus && eventStatus.live ? "LIVE" : actual > 0 ? "LIVE" : injury && injury !== "ACTIVE" ? String(injury).toUpperCase() : "UPCOMING";
    return {
      player_id: id,
      playerId: id,
      full_name: name,
      name,
      team,
      position,
      proTeamId: player.proTeamId,
      headshot,
      injury_status: injury,
      lineupSlotId,
      starter: !ESPN_BENCH_SLOTS.has(lineupSlotId),
      actual,
      scoringPeriodId,
      projected,
      seasonAvg: espnSeasonAverage(player),
      status,
      event,
      statLine: liveFields.gameStats && liveFields.gameStats.length ? `${eventStatus && eventStatus.final ? "FINAL" : eventStatus && eventStatus.live ? "LIVE" : actual > 0 ? "LIVE" : "PREGAME"} • ${playerStatsSummary(liveFields.gameStats)} • ${number(actual)} PTS` : espnStatLine(player, actual, projected, event),
      statRows: rows,
      ...liveFields,
      side
    };
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

  function normalizeESPNTeam(rawTeam, currentSide, scoringPeriodId, side, statLabels = ESPN_STAT_ID_LABELS) {
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
      const row = normalizeESPNEntry(entry, currentById.get(id), scoringPeriodId, side, statLabels);
      players[id] = row;
      ids.push(id);
      if (row.starter) starters.push(id);
    });
    const starterRows = ids.map((id) => players[id]).filter((row) => row && row.starter);
    const actualSum = starterRows.reduce((sum, row) => sum + (finite(row.actual) || 0), 0);
    const sideTotal = finite(currentSide && currentSide.totalPoints);
    const actual = sideTotal ?? actualSum;
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
      projected,
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

  async function loadESPNPublic(requestedPeriod = null) {
    let data = await getJSON(`${ESPN_PUBLIC_URL}${requestedPeriod ? '&scoringPeriodId='+encodeURIComponent(requestedPeriod):''}&ts=${Date.now()}`);
    if(!requestedPeriod){
      const currentPeriod=Number(data.status && (data.status.currentScoringPeriod || data.status.latestScoringPeriod) || data.scoringPeriodId);
      if(currentPeriod)data=await getJSON(`${ESPN_PUBLIC_URL}&scoringPeriodId=${currentPeriod}&ts=${Date.now()}`);
    }
    const statLabels = espnStatLabels(data);
    const status = data.status || {};
    const matchupPeriodId = Number(status.currentMatchupPeriod || status.latestScoringPeriod || 1);
    const scoringPeriodId = Number(status.currentScoringPeriod || status.latestScoringPeriod || matchupPeriodId || 1);
    const teams = Array.isArray(data.teams) ? data.teams : [];
    const ownRaw = teams.find((team) => nameKey(team.name) === nameKey(CONFIG.espnTeamName) || nameKey(team.abbrev) === nameKey(CONFIG.espnTeamName));
    if (!ownRaw) throw new Error("ESPN team not found in public league feed");
    const matchup = (data.schedule || []).find((row) => Number(row.matchupPeriodId) === matchupPeriodId && (Number(row.home && row.home.teamId) === Number(ownRaw.id) || Number(row.away && row.away.teamId) === Number(ownRaw.id)));
    const opponentId = matchup && (Number(matchup.home && matchup.home.teamId) === Number(ownRaw.id) ? Number(matchup.away && matchup.away.teamId) : Number(matchup.home && matchup.home.teamId));
    const leagueSides = new Map();
    (data.schedule || []).filter((row) => Number(row.matchupPeriodId) === matchupPeriodId).forEach((row) => {
      if (row.home && row.home.teamId != null) leagueSides.set(String(row.home.teamId), row.home);
      if (row.away && row.away.teamId != null) leagueSides.set(String(row.away.teamId), row.away);
    });
    const leagueTeams = colorLeagueTeams(teams.map((rawTeam) => {
      const teamId = String(rawTeam.id);
      const side = teamId === String(ownRaw.id) ? "own" : teamId === String(opponentId) ? "opponent" : "league";
      return { ...normalizeESPNTeam(rawTeam, leagueSides.get(teamId), scoringPeriodId, side, statLabels), id: `espn:${teamId}`, teamId };
    }));
    const matchups = (data.schedule || []).filter((row) => Number(row && row.matchupPeriodId) === matchupPeriodId).map((row, index) => ({
      id: String(row.id || row.matchupId || `espn-${matchupPeriodId}-${index}`),
      homeTeamId: String(row.home && row.home.teamId || ""),
      awayTeamId: String(row.away && row.away.teamId || ""),
      homeTotal: finite(row.home && (row.home.totalPoints ?? row.home.points ?? row.home.score)),
      awayTotal: finite(row.away && (row.away.totalPoints ?? row.away.points ?? row.away.score)),
      homeProjected: finite(row.home && (row.home.projectedTotal ?? row.home.projectedPoints ?? row.home.projectedScore)),
      awayProjected: finite(row.away && (row.away.projectedTotal ?? row.away.projectedPoints ?? row.away.projectedScore))
    })).filter((row) => row.homeTeamId && row.awayTeamId);
    const ownTeam = leagueTeams.find((team) => String(team.teamId) === String(ownRaw.id)) || null;
    const opponentTeam = leagueTeams.find((team) => String(team.teamId) === String(opponentId)) || null;
    const projectionPlayers = {};
    teams.forEach((team) => (team.roster && team.roster.entries || []).forEach((entry) => {
      const row = normalizeESPNEntry(entry, null, scoringPeriodId, "projection", statLabels);
      if (row && row.full_name && finite(row.projected) != null) projectionPlayers[nameKey(row.full_name)] = { projected: row.projected, source: "PUBLIC ESPN" };
    }));
    const result = { ready: true, source: "PUBLIC ESPN LIVE", savedAt: new Date().toISOString(), scoringPeriodId, matchupPeriodId, myTeam: ownTeam, opponent: opponentTeam, leagueTeams, matchups, projectionPlayers, public: true };
    loadESPNProjectionPool(scoringPeriodId).then((pool) => {
      result.projectionPlayers = { ...result.projectionPlayers, ...pool };
      if (state.espn && state.espn.public && state.espn.scoringPeriodId === scoringPeriodId) {
        state.espn.projectionPlayers = result.projectionPlayers;
        render();
      }
    }).catch(() => { /* Team rosters remain available when the larger public pool is slow. */ });
    return result;
  }

  function normalizeStoredESPNTeam(team, scoringPeriodId = null) {
    if (!team) return null;
    const snapshotTotal = finite(team.total);
    const oldRows = [
      ...(team.starters || []).map((player) => ({ ...player, starter: player.starter !== false })),
      ...(team.bench || []).map((player) => ({ ...player, starter: false }))
    ];
    if (!oldRows.length && team.roster && team.players) return team;
    const rows = oldRows.length ? oldRows : Array.isArray(team.players) ? team.players : Object.values(team.players || {});
    const players = {};
    const ids = [];
    const starters = [];
    rows.forEach((row) => {
      const id = String(row.id || row.player_id || row.playerId || "");
      if (!id) return;
      const projected = finite(row.projected) ?? finite(row.projectedPoints);
      const event = findPlayerEvent({...row,scoringPeriodId}) || null;
      const eventStatus = event && eventState(event);
      // The sync file is normalized for scoringPeriodId before publish.
      // Trust its weekly row even while the separate NFL scoreboard lags.
      const actual = finite(row.actual) ?? finite(row.points) ?? finite(row.appliedStatTotal) ?? 0;
      const injury = row.injuryStatus || row.injury_status || "";
      const status = eventStatus && eventStatus.final ? "FINAL" : eventStatus && eventStatus.live ? "LIVE" : actual > 0 ? "LIVE" : injury && injury !== "ACTIVE" ? String(injury).toUpperCase() : "UPCOMING";
      const name = row.full_name || row.name || id;
      players[id] = {
        ...row,
        id,
        player_id: id,
        playerId: id,
        full_name: name,
        name,
        team: row.team || "FA",
        position: row.position || "UTIL",
        actual,
        scoringPeriodId,
        projected,
        gameStats: Array.isArray(row.gameStats) ? row.gameStats : [],
        status,
        event,
        injury_status: injury,
        headshot: row.headshot || "",
        statLine: espnStatLine(row, actual, projected, event)
      };
      ids.push(id);
      if (players[id].starter) starters.push(id);
    });
    const startersOnly = ids.map((id) => players[id]).filter((player) => player && player.starter);
    const total = startersOnly.reduce((sum, player) => sum + (finite(player.actual) || 0), 0);
    const projected = startersOnly.reduce((sum, player) => sum + projectionForPlayer(player), 0);
    const teamId = String(team.id || team.teamId || "");
    return {
      ...team,
      id: teamId,
      teamId,
      roster: { players: ids, starters },
      players,
      pointsMap: Object.fromEntries(ids.map((id) => [id, players[id].actual])),
      total: snapshotTotal ?? total,
      projected: rows.length ? projected : finite(team.projected),
      record: team.record || { wins: null, losses: null }
    };
  }

  function normalizeStoredESPNData(data) {
    const sourceTeams = data.leagueTeams && data.leagueTeams.length ? data.leagueTeams : [data.myTeam, data.opponent].filter(Boolean);
    const teams = sourceTeams.map(team=>normalizeStoredESPNTeam(team,data.scoringPeriodId)).filter(Boolean);
    const findTeam = (target) => teams.find((team) => String(team.teamId || team.id) === String(target && (target.teamId || target.id)) || nameKey(team.name) === nameKey(target && target.name)) || null;
    const savedAtMs = data && data.savedAt ? new Date(data.savedAt).getTime() : NaN;
    const syncAgeMs = Number.isFinite(savedAtMs) ? Math.max(0, Date.now() - savedAtMs) : Infinity;
    return {
      ...data,
      public: false,
      staleFallback: syncAgeMs > 15 * 60 * 1000,
      syncAgeMs: Number.isFinite(syncAgeMs) ? syncAgeMs : null,
      myTeam: findTeam(data.myTeam),
      opponent: findTeam(data.opponent),
      leagueTeams: teams
    };
  }

  async function loadESPN() {
    let synced = null;
    try {
      const local = await getJSON(new URL("../patriots-fantasy/espn-data.json?ts=" + Date.now(), location.href));
      if (local && local.ready) {
        synced = normalizeStoredESPNData(local);
        // The private sync is scoped to ESPN's current scoring period and has
        // the authoritative lineup totals. Keep using it while fresh so the
        // public and private endpoints cannot make the score board jump.
        if (!synced.staleFallback) {
          loadESPNPublic(synced.scoringPeriodId).then((publicData) => {
            if (state.espn && !state.espn.public && publicData && publicData.matchups && publicData.matchups.length) {
              // Keep private scores and matchup totals from the same snapshot.
              state.espn.projectionPlayers = { ...(state.espn.projectionPlayers || {}), ...(publicData.projectionPlayers || {}) };
              render();
            }
          }).catch(() => { /* Keep the private synced ESPN scores even if public matchup rows are unavailable. */ });
          return synced;
        }
      }
    } catch (_) { /* Try the public endpoint when the synced snapshot is unavailable. */ }
    try {
      return await loadESPNPublic(synced && synced.scoringPeriodId);
    } catch (publicError) {
      if (synced && synced.ready) return synced;
      return { ready: false, error: publicError && publicError.message || "ESPN feed unavailable" };
    }
  }
  async function loadConsensus() {
    try { return await getJSON(new URL(`${root}consensus-data.json?ts=${Date.now()}`, location.href)); } catch (_) { return { status: "unavailable", players: {}, sources: [], insights: [] }; }
  }

  async function loadScoreboard(requestedWeek = null) {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const week = Number(requestedWeek || state.week) || 1;
    const weekUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=1000&seasontype=2&year=${CONFIG.season}&week=${week}`;
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

  function buildSleeperMatchups(data, teams) {
    const byRoster = new Map((teams || []).map((team) => [String(team.teamId), team]));
    const grouped = new Map();
    (data.matchups || []).forEach((row) => {
      const id = String(row && (row.matchup_id || row.matchupId || row.roster_id) || "");
      if (!id) return;
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id).push(row);
    });
    return [...grouped.entries()].map(([id, rows]) => {
      const sides = rows.map((row) => {
        const teamId = String(row.roster_id);
        const team = byRoster.get(teamId);
        return team ? { teamId, score: finite(row.points), projected: finite(team.projected) } : null;
      }).filter(Boolean).slice(0, 2);
      return sides.length === 2 ? { id: `sleeper-${id}`, homeTeamId: sides[0].teamId, awayTeamId: sides[1].teamId, homeTotal: sides[0].score, awayTotal: sides[1].score, homeProjected: sides[0].projected, awayProjected: sides[1].projected } : null;
    }).filter(Boolean);
  }

  function buildLeagueMatchups(league, pairRows) {
    const teams = league.teams || [];
    const byId = new Map();
    teams.forEach((team) => {
      [team.id, team.teamId, String(team.id || "").replace(/^espn:/, ""), String(team.id || "").replace(/^sleeper:/, "")].filter(Boolean).forEach((id) => byId.set(String(id), team));
    });
    const started = leagueGamesStarted(league) || teams.some((team) => (team.players || []).some((player) => player.status === "LIVE" || player.status === "FINAL" || actualForPlayer(player) > 0) || (finite(team.total) || 0) > 0);
    const rows = (pairRows || []).map((pair, index) => {
      const home = byId.get(String(pair.homeTeamId)) || byId.get(String(pair.home && pair.home.teamId || ""));
      const away = byId.get(String(pair.awayTeamId)) || byId.get(String(pair.away && pair.away.teamId || ""));
      if (!home || !away) return null;
      const homeScore = started ? finite(pair.homeTotal) ?? finite(pair.homeScore) ?? leagueTeamMetric(home, true) : finite(pair.homeProjected) ?? finite(pair.homeScore) ?? leagueTeamMetric(home, false);
      const awayScore = started ? finite(pair.awayTotal) ?? finite(pair.awayScore) ?? leagueTeamMetric(away, true) : finite(pair.awayProjected) ?? finite(pair.awayScore) ?? leagueTeamMetric(away, false);
      const ownGame = isOwnFantasyTeam(home) || isOwnFantasyTeam(away);
      return { id: pair.id || `matchup-${index}`, home, away, homeScore, awayScore, ownGame };
    }).filter(Boolean);
    if (rows.length) return rows.sort((a, b) => Number(b.ownGame) - Number(a.ownGame) || Math.max(b.homeScore, b.awayScore) - Math.max(a.homeScore, a.awayScore));
    if (league.own && league.opponent && league.own.length && league.opponent.length) {
      return [{ id: "current", home: { name: league.ownName, record: league.ownRecord, teamColor: OWN_TEAM_COLOR, isOwnFantasyTeam: true }, away: { name: league.opponentName, record: league.opponentRecord, teamColor: "#9ca3af" }, homeScore: leagueTeamMetric({ total: league.ownActual, projected: teamFinishEstimate(league, "own"), players: league.own }, started), awayScore: leagueTeamMetric({ total: league.opponentActual, projected: teamFinishEstimate(league, "opponent"), players: league.opponent }, started), ownGame: true }];
    }
    return [];
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

  function baseCurrentLeague() {
    if (state.league === "sleeper" && state.sleeper) {
      const data = state.sleeper;
      const teams = colorLeagueTeams((data.rosters || []).map((teamRoster) => {
        const teamMatchup = (data.matchups || []).find((row) => Number(row.roster_id) === Number(teamRoster.roster_id)) || {};
        const pointsMap = teamMatchup.players_points || {};
        const players = orderedSleeperPlayerIds(teamRoster).map((id) => ({
          ...normalizeSleeperPlayer(id, data.players, pointsMap, teamRoster, state.consensus, data.statsMap, data.projectedStatsMap),
          side: "league"
        }));
        const starters = players.filter((player) => player.starter !== false);
        const settings = teamRoster.settings || {};
        const owner = (data.users || []).find((user) => String(user.user_id) === String(teamRoster.owner_id));
        return {
          id: `sleeper:${teamRoster.roster_id}`,
          teamId: String(teamRoster.roster_id),
          name: rosterName(teamRoster, data.users, "LEAGUE TEAM"),
          avatar: sleeperAvatar(owner),
          record: { wins: finite(settings.wins), losses: finite(settings.losses) },
          players,
          total: finite(teamMatchup.points) ?? starters.reduce((sum, player) => sum + (finite(player.actual) || 0), 0),
          projected: starters.reduce((sum, player) => sum + projectionForPlayer(player), 0)
        };
      }));
      const ownTeam = teams.find((team) => String(team.teamId) === String(data.roster && data.roster.roster_id));
      const opponentTeam = teams.find((team) => String(team.teamId) === String(data.opponentRoster && data.opponentRoster.roster_id));
      const matchups = buildSleeperMatchups(data, teams);
      const own = ownTeam ? ownTeam.players.map((player) => ({ ...player, side: "own" })) : [];
      const opponent = opponentTeam ? opponentTeam.players.map((player) => ({ ...player, side: "opponent" })) : [];
      return {
        id: "sleeper",
        name: CONFIG.sleeperTeamName,
        ownName: ownTeam && ownTeam.name || CONFIG.sleeperTeamName,
        opponentName: opponentTeam && opponentTeam.name || "OPPONENT",
        ownAvatar: ownTeam && ownTeam.avatar || "",
        opponentAvatar: opponentTeam && opponentTeam.avatar || "",
        ownRecord: ownTeam && ownTeam.record || {},
        opponentRecord: opponentTeam && opponentTeam.record || {},
        own,
        opponent,
        teams,
        matchups,
        allPlayers: teams.flatMap((team) => team.players),
        ownActual: finite(data.matchup && data.matchup.points) || 0,
        opponentActual: finite(data.opponentMatchup && data.opponentMatchup.points) || 0,
        week: data.week,
        ready: true
      };
    }
    const data = state.espn;
    if (data && data.ready && data.myTeam) {
      const sourceTeams = data.leagueTeams && data.leagueTeams.length ? data.leagueTeams : [data.myTeam, data.opponent].filter(Boolean);
      const ownKey = String(data.myTeam.id || data.myTeam.teamId || "");
      const opponentKey = String(data.opponent && (data.opponent.id || data.opponent.teamId) || "");
      const teams = colorLeagueTeams(sourceTeams.map((team, index) => {
        const key = String(team.id || team.teamId || index);
        const isOwn = team === data.myTeam || key === ownKey || nameKey(team.name) === nameKey(CONFIG.espnTeamName);
        const isOpponent = team === data.opponent || key === opponentKey;
        const merged = mergeESPNTeam(team, isOwn ? "own" : isOpponent ? "opponent" : "league");
        const projected = merged.players.filter((player) => player.starter !== false).reduce((sum, player) => sum + projectionForPlayer(player), 0);
        return { ...merged, id: team.id || `espn:${team.teamId || index}`, teamId: String(team.teamId || team.id || index), projected };
      }));
      const ownTeam = teams.find((team) => String(team.id) === ownKey || String(team.teamId) === ownKey || nameKey(team.name) === nameKey(CONFIG.espnTeamName)) || teams[0];
      const opponentTeam = teams.find((team) => String(team.id) === opponentKey || String(team.teamId) === opponentKey) || teams.find((team) => team !== ownTeam) || null;
      const matchups = buildLeagueMatchups({ teams }, data.matchups || []);
      return {
        id: "espn",
        name: CONFIG.espnTeamName,
        ownName: ownTeam && ownTeam.name || CONFIG.espnTeamName,
        opponentName: opponentTeam && opponentTeam.name || "MATCHUP PENDING",
        ownAvatar: ownTeam && ownTeam.avatar || "",
        opponentAvatar: opponentTeam && opponentTeam.avatar || "",
        ownRecord: ownTeam && ownTeam.record || { wins: null, losses: null },
        opponentRecord: opponentTeam && opponentTeam.record || { wins: null, losses: null },
        own: ownTeam && ownTeam.players || [],
        opponent: opponentTeam && opponentTeam.players || [],
        teams,
        matchups,
        allPlayers: teams.flatMap((team) => team.players),
        ownActual: ownTeam && ownTeam.total || 0,
        opponentActual: opponentTeam && opponentTeam.total || 0,
        week: data.matchupPeriodId || state.week,
        ready: true
      };
    }
    return { id: "espn", name: CONFIG.espnTeamName, ownName: CONFIG.espnTeamName, opponentName: "MATCHUP PENDING", ownAvatar: "", opponentAvatar: "", ownRecord: {}, opponentRecord: {}, own: [], opponent: [], ownActual: 0, opponentActual: 0, week: state.week, ready: false };
  }

  function currentLeague() {
    const league = baseCurrentLeague();
    if (!state.selectedMatchup) return league;
    const pair = buildLeagueMatchups(league, league.matchups || []).find(row => String(row.id) === state.selectedMatchup);
    if (!pair) return league;
    return { ...league, ownName: pair.home.name, opponentName: pair.away.name,
      ownAvatar: pair.home.avatar || "", opponentAvatar: pair.away.avatar || "",
      ownRecord: pair.home.record || {}, opponentRecord: pair.away.record || {},
      own: (pair.home.players || []).map(p => ({...p, side:"own"})),
      opponent: (pair.away.players || []).map(p => ({...p, side:"opponent"})),
      ownActual: finite(pair.homeScore) ?? finite(pair.home.total) ?? 0,
      opponentActual: finite(pair.awayScore) ?? finite(pair.away.total) ?? 0,
      remoteMatchupId: state.selectedMatchup };
  }

  function leagueStarted(league) {
    const rows = [...(league.own || []), ...(league.opponent || [])];
    return rows.some((player) => player.event && (eventState(player.event).live || eventState(player.event).final)) || rows.some((player) => player.status === "LIVE" || player.status === "FINAL" || actualForPlayer(player) > 0);
  }

  function leagueGamesStarted(league) {
    const players = league.allPlayers && league.allPlayers.length ? league.allPlayers : [...(league.own || []), ...(league.opponent || [])];
    return players.some((player) => {
      const event = player.event || findPlayerEvent(player);
      const status = event && eventState(event);
      const actual = finite(player.actual) ?? finite(player.points);
      return player.status === "LIVE" || player.status === "FINAL" || actual != null && actual > 0 || Boolean(status && (status.live || status.final));
    });
  }

  function leagueTeamMetric(team, started) {
    if (started) return finite(team.total) ?? (team.players || []).filter((player) => player.starter !== false).reduce((sum, player) => sum + (finite(actualForPlayer(player)) || 0), 0);
    return finite(team.projected) ?? finite(team.total) ?? 0;
  }

  function actualForPlayer(player) {
    // Fantasy providers already scope these values to the active scoring
    // period. A second dependency on the NFL scoreboard hid ESPN points when
    // that separate feed lagged or did not match a player's team code.
    return finite(player && player.actual) ?? finite(player && player.points) ?? 0;
  }

  function scoreHistoryStorageKey(league) {
    const leagueId = state.league === "espn" ? CONFIG.espnLeagueId : CONFIG.sleeperLeagueId;
    const week = Number(league && league.week || state.week) || 1;
    return "fantasy-matchup-score-history:v1:" + CONFIG.season + ":" + state.league + ":" + leagueId + ":" + week + ":" + (state.selectedMatchup || "mine");
  }

  function restoreScoreHistory(league) {
    const scope = scoreHistoryStorageKey(league);
    if (state.scoreHistoryScope[state.league] === scope) return;
    state.scoreHistoryScope[state.league] = scope;
    state.scoreHistory[state.league] = [];
    try {
      const saved = JSON.parse(localStorage.getItem(scope) || "null");
      if (!saved || !Array.isArray(saved.samples)) return;
      state.scoreHistory[state.league] = saved.samples
        .filter((sample) => sample && Number.isFinite(Number(sample.at)))
        .map((sample) => ({ at: Number(sample.at), own: finite(sample.own) || 0, opponent: finite(sample.opponent) || 0 }))
        .slice(-4096);
    } catch (_) { /* Keep the live chart working if browser storage is unavailable. */ }
  }

  function persistScoreHistory(league) {
    try {
      localStorage.setItem(scoreHistoryStorageKey(league), JSON.stringify({ samples: (state.scoreHistory[state.league] || []).slice(-4096) }));
    } catch (_) { /* Storage limits never interrupt live scoring. */ }
  }

  function teamHistoryStorageKey(league) {
    const leagueId = state.league === "espn" ? CONFIG.espnLeagueId : CONFIG.sleeperLeagueId;
    const week = Number(league && league.week || state.week) || 1;
    return `fantasy-team-score-history:v1:${CONFIG.season}:${state.league}:${leagueId}:${week}`;
  }

  function scoreEventStorageKey(league) {
    const leagueId = state.league === "espn" ? CONFIG.espnLeagueId : CONFIG.sleeperLeagueId;
    const week = Number(league && league.week || state.week) || 1;
    return `fantasy-player-score-events:v1:${CONFIG.season}:${state.league}:${leagueId}:${week}`;
  }

  function restoreTeamScoreHistory(league) {
    const scope = teamHistoryStorageKey(league);
    if (state.teamScoreHistoryScope[state.league] === scope) return;
    state.teamScoreHistoryScope[state.league] = scope;
    state.teamScoreHistory[state.league] = [];
    state.teamScoreHistoryMode[state.league] = "";
    try {
      const saved = JSON.parse(localStorage.getItem(scope) || "null");
      if (!saved || !Array.isArray(saved.samples)) return;
      const samples = saved.samples.filter((sample) => sample && sample.totals && typeof sample.totals === "object")
        .map((sample) => ({ at: Number(sample.at) || Date.now(), totals: Object.fromEntries(Object.entries(sample.totals).map(([id, value]) => [id, finite(value)]).filter(([, value]) => value != null)) }))
        .filter((sample) => Object.keys(sample.totals).length);
      state.teamScoreHistory[state.league] = samples.slice(-4096);
      state.teamScoreHistoryMode[state.league] = saved.mode === "live" || saved.mode === "projection" ? saved.mode : "";
    } catch (_) { /* Keep the live chart working if browser storage is unavailable. */ }
  }

  function persistTeamScoreHistory(league, mode) {
    try {
      localStorage.setItem(teamHistoryStorageKey(league), JSON.stringify({ mode, samples: (state.teamScoreHistory[state.league] || []).slice(-4096) }));
    } catch (_) { /* Quota or private-browsing limits do not interrupt live scoring. */ }
  }
  function updateScoreMoves(league) {
    restoreScoreHistory(league);
    const next = {};
    const moves = {};
    const eventScope = scoreEventStorageKey(league);
    if (state.scoreEventScope[state.league] !== eventScope) {
      state.scoreEventScope[state.league] = eventScope;
      try {
        const savedEvents = JSON.parse(localStorage.getItem(eventScope) || "null");
        state.scoreEvents[state.league] = Array.isArray(savedEvents) ? savedEvents.filter((event) => event && event.playerId && Number.isFinite(Number(event.at))).slice(0, 12) : [];
      } catch (_) { state.scoreEvents[state.league] = []; }
    }
    const events = state.scoreEvents[state.league] || [];
    let eventsChanged = false;
    const playerHistories = state.playerHistories[state.league] || {};
    const players = league.allPlayers && league.allPlayers.length ? league.allPlayers : [...(league.own || []), ...(league.opponent || [])];
    const seedCurrentScorers = events.length === 0;
    players.forEach((player) => {
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
        events.unshift({
          at: Date.now(),
          playerId,
          name: player.full_name || player.name || "PLAYER",
          team: player.team || "FA",
          fantasyTeamId: player.fantasyTeamId || "",
          fantasyTeamName: player.fantasyTeamName || "OWNER UNKNOWN",
          teamColor: player.fantasyTeamColor || "#a8b7c9",
          headshot: player.headshot || player.imageUrl || "",
          direction: delta > 0 ? "up" : "down",
          delta,
          total: value
        });
        eventsChanged = true;
      } else if (seedCurrentScorers && value > 0) {
        events.unshift({
          at: Date.now(),
          playerId,
          name: player.full_name || player.name || "PLAYER",
          team: player.team || "FA",
          fantasyTeamId: player.fantasyTeamId || "",
          fantasyTeamName: player.fantasyTeamName || "OWNER UNKNOWN",
          teamColor: player.fantasyTeamColor || "#a8b7c9",
          headshot: player.headshot || player.imageUrl || "",
          direction: "up",
          delta: value,
          total: value,
          snapshot: true
        });
        eventsChanged = true;
      }
    });
    state.scoreEvents[state.league] = events.slice(0, 12);
    if (eventsChanged) {
      try { localStorage.setItem(eventScope, JSON.stringify(state.scoreEvents[state.league])); } catch (_) { /* Keep the live feed if browser storage is unavailable. */ }
    }
    state.scoreMoves = moves;
    state.scoreSnapshot = next;
    state.playerHistories[state.league] = playerHistories;
    const started = leagueGamesStarted(league);
    const teams = league.teams || [];
    if (teams.length) {
      restoreTeamScoreHistory(league);
      const mode = started ? "live" : "projection";
      const previousMode = state.teamScoreHistoryMode[state.league];
      let history = previousMode === mode ? state.teamScoreHistory[state.league] || [] : [];
      const totals = Object.fromEntries(teams.map((team) => [String(team.id), leagueTeamMetric(team, started)]));
      const modeChanged = previousMode !== mode;
      if (started && modeChanged) {
        history.push({ at: Date.now(), totals: Object.fromEntries(teams.map((team) => [String(team.id), 0])) });
      }
      const last = history[history.length - 1];
      const changed = !last || Object.entries(totals).some(([id, value]) => Math.abs((finite(last.totals && last.totals[id]) || 0) - value) >= 0.05);
      if (changed) history.push({ at: Date.now(), totals });
      if (history.length > 4096) history = [history[0], ...history.slice(-4095)];
      state.teamScoreHistory[state.league] = history;
      state.teamScoreHistoryMode[state.league] = mode;
      if (changed || modeChanged) persistTeamScoreHistory(league, mode);
    }
    const ownTotal = leagueActual(league, "own");
    const opponentTotal = leagueActual(league, "opponent");
    const history = state.scoreHistory[state.league] || [];
    const last = history[history.length - 1];
    const changed = !last || Math.abs((finite(last.own) || 0) - ownTotal) >= 0.01 || Math.abs((finite(last.opponent) || 0) - opponentTotal) >= 0.01;
    if (changed) history.push({ at: Date.now(), own: ownTotal, opponent: opponentTotal });
    state.scoreHistory[state.league] = history.length > 4096 ? [history[0], ...history.slice(-4095)] : history;
    if (changed) persistScoreHistory(league);
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
      ...(state.espn && state.espn.ready && !state.espn.staleFallback ? [{ id: "espn", name: state.espn.public ? "ESPN public" : "ESPN sync", status: "live" }] : [])
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
      return `<article class="live-game ${status.live ? "is-live" : ""}" data-game-id="${esc(event.id)}" role="button" tabindex="0"><div class="live-game-top"><span>${status.live ? "LIVE NOW" : "NEXT"}</span><small>${esc(status.live ? `${status.type.shortDetail || "LIVE"}` : new Date(event.date || 0).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }))}</small></div><div class="game-team"><img src="${teamLogo(away.team && away.team.abbreviation)}" alt=""><strong>${esc(away.team && away.team.abbreviation || "TEAM")}</strong><b>${esc(away.score == null ? "PREGAME" : away.score)}</b></div><div class="game-team"><img src="${teamLogo(home.team && home.team.abbreviation)}" alt=""><strong>${esc(home.team && home.team.abbreviation || "TEAM")}</strong><b>${esc(home.score == null ? "PREGAME" : home.score)}</b></div></article>`;
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
    return `<section class="source-panel" data-action="refresh" role="button" tabindex="0" aria-label="Refresh projection feeds"><div class="section-kicker">PROJECTION ENGINE</div><div class="source-top"><strong>${esc(status)}</strong><span>${live} LIVE • ${unavailable} NOT ENABLED</span></div><div class="source-bar"><span style="width:${Math.min(100, Math.max(4, live / Math.max(1, catalog) * 100))}%"></span></div><div class="source-meta"><span>UPDATED ${esc(formatAge(consensus.generated_at || state.refreshedAt))}</span><span>${esc(oddsStatus)}${esc(oddsProviders)}</span></div><div class="source-chips">${sourceNames || `<span class="source-chip">PUBLIC ESPN + SLEEPER</span>`}</div><p>Tap this panel to refresh. Sleeper points check every 5 seconds; ESPN points use the synced current-week roster. Public game lines come from the ESPN scoreboard.</p></section>`;
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

  function teamStockSparkline(team, currentValue) {
    const id = String(team.id);
    const history = (state.teamScoreHistory[state.league] || []).map((point) => finite(point.totals && point.totals[id])).filter((value) => value != null);
    if (!history.length) history.push(currentValue, currentValue);
    else if (history[history.length - 1] !== currentValue) history.push(currentValue);
    if (history.length === 1) history.unshift(history[0]);
    const max = Math.max(1, ...history);
    const points = history.map((value, index) => {
      const x = 2 + index / Math.max(1, history.length - 1) * 96;
      const y = 23 - value / max * 19;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const lastY = (23 - (history[history.length - 1] || 0) / max * 19).toFixed(1);
    return `<svg class="team-stock-sparkline" viewBox="0 0 100 26" role="img" aria-label="${esc(team.name)} total points trend"><path class="spark-grid" d="M2 23H98M2 13H98M2 3H98"/><polyline points="${points}"/><circle cx="98" cy="${lastY}" r="2.4"/></svg>`;
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
    let history = rawHistory.slice(-4096);
    const latest = history[history.length - 1] || { own: 0, opponent: 0 };
    if (history.length === 1) history = latest.own || latest.opponent ? [{ own: 0, opponent: 0 }, latest] : [latest, latest];
    const currentDiffers = Math.abs((finite(latest.own) || 0) - ownTotal) >= 0.01 || Math.abs((finite(latest.opponent) || 0) - opponentTotal) >= 0.01;
    if (started && currentDiffers) history = [...history, { own: ownTotal, opponent: opponentTotal }];
    const observedMax = Math.max(50, ownTotal, opponentTotal, ...history.map((point) => Math.max(finite(point.own) || 0, finite(point.opponent) || 0)));
    const scaleFor = (value) => {
      const rough = Math.max(1, value) / 4;
      const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
      const normalized = rough / magnitude;
      const unit = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
      const step = unit * magnitude;
      return { step, max: Math.ceil(value / step) * step };
    };
    const scale = scaleFor(observedMax);
    const left = 42, right = 470, top = 17, bottom = 148;
    const yFor = (value) => bottom - (Math.max(0, finite(value) || 0) / scale.max) * (bottom - top);
    const xFor = (index, length) => left + index / Math.max(1, length - 1) * (right - left);
    const grid = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, index) => index * scale.step).map((tick) => {
      const y = yFor(tick);
      return '<g class="chart-tick"><path d="M' + left + ' ' + y.toFixed(1) + 'H' + right + '"/><text class="chart-y-label" x="' + (left - 8) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + number(tick, Number.isInteger(tick) ? 0 : 1) + '</text></g>';
    }).join("");
    const xTicks = [{ label: "START", fraction: 0 }, { label: "EARLY", fraction: 0.25 }, { label: "MID", fraction: 0.5 }, { label: "LATE", fraction: 0.75 }, { label: "NOW", fraction: 1 }];
    const xLabels = xTicks.map((tick, index) => {
      const anchor = index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle";
      const x = left + tick.fraction * (right - left);
      return '<text class="chart-x-label" x="' + x.toFixed(1) + '" y="174" text-anchor="' + anchor + '">' + tick.label + '</text>';
    }).join("");
    const pointsFor = (side) => history.map((point, index) => {
      const value = side === "own" ? point.own : point.opponent;
      return xFor(index, history.length).toFixed(1) + "," + yFor(value).toFixed(1);
    }).join(" ");
    const ownName = league.ownName || "YOUR TEAM";
    const opponentName = league.opponentName || "OPPONENT";
    const opponentKey = String(opponentName).toLowerCase().replace(/[^a-z0-9]/g, "");
    const opponentTeam = (league.teams || []).find((team) => String(team.name || "").toLowerCase().replace(/[^a-z0-9]/g, "") === opponentKey);
    const ownColor = ((league.teams || []).find(team => team.name === league.ownName) || {}).teamColor || OWN_TEAM_COLOR;
    const opponentColor = opponentTeam && opponentTeam.teamColor || "#b9c3d0";
    const ownY = yFor(ownTotal).toFixed(1);
    const opponentY = yFor(opponentTotal).toFixed(1);
    const leadDelta = Math.abs(ownTotal - opponentTotal);
    const leadText = leadDelta < 0.05 ? "TIED" : (ownTotal > opponentTotal ? "YOUR TEAM" : "OPPONENT") + (started ? " LEADS" : " PROJECTED TO LEAD") + " +" + number(leadDelta);
    const leadClass = leadDelta < 0.05 ? "tie" : ownTotal > opponentTotal ? "own" : "opponent";
    const leadColor = ownTotal > opponentTotal ? ownColor : opponentColor;
    const gameLines = leaguePlayerRows(league).map((player) => gameOddsFor(player)).filter(Boolean).filter((item, index, list) => list.findIndex((candidate) => candidate.event && item.event && candidate.event.id === item.event.id) === index).slice(0, 2);
    const oddsText = gameLines.length ? gameLines.map((item) => item.provider + " " + item.team + " " + (item.price || item.line)).join(" • ") : "PUBLIC ODDS FEED WAITING";
    const lineFor = (side, color) => {
      const points = pointsFor(side);
      const currentY = side === "own" ? ownY : opponentY;
      return '<polyline class="momentum-line-outline" points="' + points + '"/>' +
        '<polyline class="momentum-line ' + side + '" style="--series-color:' + esc(color) + '" points="' + points + '"/>' +
        history.map((point, index) => {
          const x = xFor(index, history.length).toFixed(1);
          const value = side === "own" ? point.own : point.opponent;
          const y = yFor(value).toFixed(1);
          return '<circle class="momentum-sample-outline" cx="' + x + '" cy="' + y + '" r="3.3"/><circle class="momentum-sample ' + side + '" style="--series-color:' + esc(color) + '" cx="' + x + '" cy="' + y + '" r="1.8"/>';
        }).join("") +
        '<circle class="momentum-dot-outline" cx="' + right + '" cy="' + currentY + '" r="6.6"/>' +
        '<circle class="momentum-dot ' + side + '" style="--series-color:' + esc(color) + '" cx="' + right + '" cy="' + currentY + '" r="4.2"/>';
    };
    return '<section class="arcade-panel momentum-panel">' +
      '<div class="arcade-panel-head"><div><b>⚡ SCORING MOMENTUM</b><small>' + (started ? "LIVE ACTUAL SCORE HISTORY" : "PROJECTED FINISH • PROVIDER PROJECTIONS") + ' • 5s REFRESH</small></div><span class="arcade-live-indicator"><i></i>' + (started ? "LIVE" : "PRE") + '</span></div>' +
      '<div class="momentum-scoreline">' +
        '<div class="momentum-score-side own" style="--series-color:' + ownColor + '"><strong class="own-score">' + number(ownTotal) + '</strong><small><i></i>' + esc(ownName) + '</small></div>' +
        '<span>VS</span>' +
        '<div class="momentum-score-side opponent" style="--series-color:' + esc(opponentColor) + '"><strong class="opp-score">' + number(opponentTotal) + '</strong><small><i></i>' + esc(opponentName) + '</small></div>' +
      '</div>' +
      '<div class="momentum-lead"><span class="momentum-lead-dot ' + leadClass + '" style="--series-color:' + esc(leadColor) + '"></span><b>' + esc(leadText) + '</b><small>' + (started ? "LIVE SNAPSHOT" : "PROJECTED TOTALS") + ' • ' + esc(oddsText) + '</small></div>' +
      '<svg class="momentum-chart stock-chart" viewBox="0 0 480 184" preserveAspectRatio="none" role="img" aria-label="' + (started ? "Actual fantasy points" : "Projected fantasy points") + ' by recorded matchup snapshot">' +
        '<g class="chart-grid">' + grid + '</g><path class="chart-axis" d="M' + left + ' ' + top + 'V' + bottom + 'H' + right + '"/>' +
        '<text class="chart-unit" x="5" y="11">PTS</text>' +
        '<g class="chart-x-labels">' + xLabels + '</g>' +
        '<g class="matchup-series">' + lineFor("own", ownColor) + lineFor("opponent", opponentColor) + '</g>' +
      '</svg>' +
      '<div class="momentum-legend"><span class="momentum-legend-item own" style="--series-color:' + ownColor + '"><i></i>' + esc(ownName) + '</span><span class="momentum-legend-item opponent" style="--series-color:' + esc(opponentColor) + '"><i></i>' + esc(opponentName) + '</span></div>' +
      '<div class="momentum-labels"><span>' + (started ? "SAVED PROVIDER SCORE MOVES" : "PREGAME PROJECTION CURVE") + '</span><span>UPDATED ' + formatAge(state.refreshedAt) + '</span></div>' +
    '</section>';
  }

  function renderLeagueStockBoard(league) {
    const teams = league.teams || [];
    const started = leagueGamesStarted(league);
    const metric = started ? "LIVE PTS" : "PROJ PTS";
    const rows = [...teams].sort((a, b) => leagueTeamMetric(b, started) - leagueTeamMetric(a, started));
    const values = Object.fromEntries(teams.map((team) => [String(team.id), leagueTeamMetric(team, started)]));
    const zeroTotals = Object.fromEntries(teams.map((team) => [String(team.id), 0]));
    const currentTotals = { ...zeroTotals, ...values };
    const savedHistory = started ? state.teamScoreHistory[state.league] || [] : [];
    let history = savedHistory.length ? [...savedHistory] : [{ totals: zeroTotals }, { totals: currentTotals }];
    const first = history[0] && history[0].totals || {};
    if (teams.some((team) => Math.abs(finite(first[String(team.id)]) || 0) > 0.05)) history.unshift({ totals: zeroTotals });
    if (!started) history = [{ totals: zeroTotals }, { totals: currentTotals }];
    const latest = history[history.length - 1] || { totals: zeroTotals };
    if (started && teams.some((team) => Math.abs((finite(latest.totals && latest.totals[String(team.id)]) || 0) - (finite(currentTotals[String(team.id)]) || 0)) >= 0.05)) {
      history = [...history, { at: Date.now(), totals: currentTotals }];
    }
    if (history.length === 1) history.unshift({ totals: zeroTotals });
    if (history.length > 4096) history = [history[0], ...history.slice(-4095)];
    const observedMax = Math.max(50, ...history.flatMap((snapshot) => teams.map((team) => finite(snapshot.totals && snapshot.totals[String(team.id)]) || 0)), ...Object.values(currentTotals));
    const scaleFor = (value) => {
      const rough = Math.max(1, value) / 4;
      const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
      const normalized = rough / magnitude;
      const unit = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
      const step = unit * magnitude;
      return { step, max: Math.ceil(value / step) * step };
    };
    const scale = scaleFor(observedMax);
    const left = 42, right = 470, top = 17, bottom = 148;
    const yFor = (value) => bottom - (Math.max(0, finite(value) || 0) / scale.max) * (bottom - top);
    const xFor = (index, length) => left + index / Math.max(1, length - 1) * (right - left);
    const grid = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, index) => index * scale.step).map((tick) => {
      const y = yFor(tick);
      return '<g class="chart-tick"><path d="M' + left + ' ' + y.toFixed(1) + 'H' + right + '"/><text class="chart-y-label" x="' + (left - 8) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + number(tick, Number.isInteger(tick) ? 0 : 1) + '</text></g>';
    }).join("");
    const xTicks = [{ label: "START", fraction: 0 }, { label: "EARLY", fraction: 0.25 }, { label: "MID", fraction: 0.5 }, { label: "LATE", fraction: 0.75 }, { label: "NOW", fraction: 1 }];
    const xLabels = xTicks.map((tick, index) => {
      const anchor = index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle";
      const x = left + tick.fraction * (right - left);
      return '<text class="chart-x-label" x="' + x.toFixed(1) + '" y="174" text-anchor="' + anchor + '">' + tick.label + '</text>';
    }).join("");
    const pointsFor = (team) => history.map((snapshot, index) => {
      const value = finite(snapshot.totals && snapshot.totals[String(team.id)]) || 0;
      return xFor(index, history.length).toFixed(1) + "," + yFor(value).toFixed(1);
    }).join(" ");
    const chart = teams.length ? '<div class="league-stock-chart-wrap"><svg class="league-team-stock-chart stock-chart" viewBox="0 0 480 184" preserveAspectRatio="none" role="img" aria-label="' + (started ? "Live" : "Projected") + ' total points for every league team">' +
      '<g class="chart-grid">' + grid + '</g><path class="chart-axis" d="M' + left + ' ' + top + 'V' + bottom + 'H' + right + '"/><text class="chart-unit" x="5" y="11">PTS</text><g class="chart-x-labels">' + xLabels + '</g>' +
      '<g class="league-team-stock-lines">' + rows.map((team) => {
        const color = team.teamColor || "#a8b7c9";
        const value = finite(values[String(team.id)]) || 0;
        const endY = yFor(value).toFixed(1);
        const points = pointsFor(team);
        return '<polyline class="league-team-stock-outline" points="' + points + '"/><polyline class="league-team-stock-line" points="' + points + '" style="--team-color:' + esc(color) + '"/><circle class="league-team-stock-end" cx="' + right + '" cy="' + endY + '" r="4" style="--team-color:' + esc(color) + '"/>';
      }).join("") + '</g></svg><div class="momentum-labels"><span>ALL TEAMS SHARE ONE ZERO BASELINE</span><span>' + (started ? "LIVE TOTALS" : "PROJECTED TOTALS") + ' • ' + formatAge(state.league === "espn" && state.espn && state.espn.savedAt ? state.espn.savedAt : state.refreshedAt) + '</span></div></div>' : "";
    return '<section class="arcade-panel league-stock-panel"><div class="arcade-panel-head"><div><b>📈 LEAGUE STOCK BOARD</b><small>' + teams.length + ' TEAMS • ' + (started ? "LIVE TOTAL POINTS" : "PROJECTED POINTS") + ' • 5s REFRESH</small></div><div class="stock-legend team-stock-legend"><span><i></i>ONE SHARED LIVE CHART</span></div></div>' + chart +
      '<div class="league-stock-list">' + (rows.length ? rows.map((team) => {
        const value = leagueTeamMetric(team, started);
        const color = team.teamColor || "#a8b7c9";
        return '<div class="league-stock-row team-stock-row" style="--team-color:' + esc(color) + '"><span class="team-stock-key"></span><span class="league-stock-name"><strong>' + esc(team.name || "LEAGUE TEAM") + '</strong><small>' + esc(recordLabel(team.record)) + ' • ' + (started ? "LIVE TOTAL" : "WEEK PROJECTION") + '</small></span><span class="league-stock-values"><b>' + number(value) + '</b><small>' + metric + '</small></span></div>';
      }).join("") : '<div class="empty-card compact"><strong>LEAGUE TEAM FEED SYNCING</strong><span>Every team appears when the league provider responds.</span></div>') + '</div></section>';
  }

  function renderLeagueMatchupBoard(league) {
    const started = leagueGamesStarted(league);
    const rows = buildLeagueMatchups(league, league.matchups || []);
    const mode = started ? "LIVE SCORE" : "PROJECTED SCORE";
    const cards = rows.length ? rows.map((row) => {
      const homeColor = row.home.teamColor || (row.home.isOwnFantasyTeam ? OWN_TEAM_COLOR : "#9ca3af");
      const awayColor = row.away.teamColor || (row.away.isOwnFantasyTeam ? OWN_TEAM_COLOR : "#9ca3af");
      const homeLead = row.homeScore > row.awayScore + 0.05;
      const awayLead = row.awayScore > row.homeScore + 0.05;
      const tied = !homeLead && !awayLead;
      const maxScore = Math.max(1, row.homeScore, row.awayScore);
      const leadText = tied ? "TIED" : `${homeLead ? row.home.name : row.away.name} WINNING`;
      return `<article class="league-matchup-card ${row.ownGame ? "own-matchup" : ""}" data-matchup-id="${esc(row.id)}" role="button" tabindex="0" aria-label="Show ${esc(row.home.name)} versus ${esc(row.away.name)}"><div class="league-matchup-top"><span>${row.ownGame ? "MY MATCHUP" : "LEAGUE MATCHUP"}</span><b>${esc(leadText)}</b></div><div class="league-matchup-side ${homeLead ? "winning" : ""}" style="--team-color:${esc(homeColor)}"><i></i><span><strong>${esc(row.home.name || "TEAM")}</strong><small>${esc(recordLabel(row.home.record))}</small></span><b>${number(row.homeScore)}</b></div><div class="league-matchup-meter"><span style="width:${Math.max(4, row.homeScore / maxScore * 100).toFixed(1)}%;--team-color:${esc(homeColor)}"></span><span style="width:${Math.max(4, row.awayScore / maxScore * 100).toFixed(1)}%;--team-color:${esc(awayColor)}"></span></div><div class="league-matchup-side ${awayLead ? "winning" : ""}" style="--team-color:${esc(awayColor)}"><i></i><span><strong>${esc(row.away.name || "TEAM")}</strong><small>${esc(recordLabel(row.away.record))}</small></span><b>${number(row.awayScore)}</b></div></article>`;
    }).join("") : `<div class="empty-card compact"><strong>MATCHUPS SYNCING</strong><span>The league matchup board appears when Sleeper or ESPN returns the week pairings.</span></div>`;
    return `<section class="arcade-panel league-matchups-panel"><div class="arcade-panel-head"><div><b>▦ LEAGUE MATCHUPS</b><small>WHO IS WINNING • ${mode} • ABOVE LIVE SCORES</small></div><span class="arcade-live-indicator"><i></i>${rows.length || 0} GAMES</span></div><div class="league-matchups-list">${cards}</div></section>`;
  }

  function renderScoringFeed(league) {
    const events = state.scoreEvents[state.league] || [];
    const eventMarkup = events.length ? events.slice(0, 6).map((event) => {
      const color = event.teamColor || "#a8b7c9";
      const delta = event.snapshot ? "ON BOARD" : `${event.delta > 0 ? "+" : "−"}${number(Math.abs(event.delta))} PTS`;
      const player = { player_id: event.playerId, full_name: event.name, name: event.name, team: event.team, headshot: event.headshot };
      return `<div class="scoring-feed-row team-event ${event.direction}" style="--team-color:${esc(color)}"><span class="feed-icon">${event.direction === "up" ? "▲" : "▼"}</span><time>${formatAge(event.at)}</time>${playerFace(player, "small")}<span class="feed-player"><strong>${esc(event.name)}</strong><small>${esc(event.team || "NFL")} • <i class="feed-team-swatch" style="background:${esc(color)}"></i>${esc(event.fantasyTeamName || "OWNER UNKNOWN")}</small></span><b class="feed-points"><em class="feed-delta">${delta}</em>${number(event.total)}</b></div>`;
    }).join("") : `<div class="empty-card compact"><strong>WAITING FOR A LEAGUE SCORER</strong><span>Player point changes appear here with the owner team and matching stock-line color.</span></div>`;
    return `<section class="arcade-panel scoring-feed-panel"><div class="arcade-panel-head"><div><b>⚡ LIVE SCORING FEED</b><small>SCORING PLAYER • FANTASY OWNER • TEAM COLOR</small></div><span class="arcade-live-indicator"><i></i>5s</span></div><div class="scoring-feed-list">${eventMarkup}</div></section>`;
  }
  function renderInjuryWatch(league) {
    const players = [...(league.own || []), ...(league.opponent || [])].filter((player) => /OUT|IR|DOUBTFUL|QUESTIONABLE|INJURY/i.test(String(player.status || player.injury_status || ""))).slice(0, 5);
    return `<section class="arcade-panel injury-watch-panel"><div class="arcade-panel-head"><div><b>✚ INJURY WATCH</b><small>REAL PROVIDER STATUS</small></div><span class="arcade-live-indicator warning"><i></i>${players.length} FLAGS</span></div><div class="injury-watch-list">${players.length ? players.map((player) => `<button class="injury-watch-row" data-player-id="${esc(player.player_id)}" data-side="${esc(player.side || "own")}" type="button">${playerFace(player, "small")}<span><strong>${esc(player.full_name || player.name)}</strong><small>${esc(player.team || "FA")} • ${esc(player.position || "UTIL")}</small></span><b>${esc(player.status || player.injury_status || "QUESTIONABLE")}</b></button>`).join("") : `<div class="empty-card compact"><strong>NO ACTIVE FLAGS</strong><span>Provider injury status is clear for this matchup.</span></div>`}</div></section>`;
  }

  function renderNextGames() {
    const events = (state.scoreboard || []).filter((event) => eventState(event).live || eventState(event).upcoming).slice(0, 5);
    if (!events.length) return `<div class="empty-card compact"><strong>NO LIVE OR NEXT GAMES</strong><span>The schedule panel will populate from the live NFL scoreboard.</span></div>`;
    return `<div class="next-games-list">${events.map((event) => { const status = eventState(event); const competitors = eventCompetitors(event); const away = competitors.find((item) => item.homeAway === "away") || competitors[0] || {}; const home = competitors.find((item) => item.homeAway === "home") || competitors[1] || {}; return `<article class="next-game-row ${status.live ? "is-live" : ""}" data-game-id="${esc(event.id)}" role="button" tabindex="0"><span class="next-game-status">${status.live ? "LIVE" : "NEXT"}</span><div><strong>${esc(away.team && away.team.abbreviation || "TEAM")} <b>${esc(away.score == null ? "—" : away.score)}</b></strong><strong>${esc(home.team && home.team.abbreviation || "TEAM")} <b>${esc(home.score == null ? "—" : home.score)}</b></strong></div><small>${esc(status.live ? status.type.shortDetail || "IN PROGRESS" : new Date(event.date || 0).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }))}</small></article>`; }).join("")}</div>`;
  }

  function renderArcadeDashboard(league) {
    return `<div class="arcade-dashboard"><div class="arcade-columns"><div class="arcade-column left-column">${arcadeRosterPanel(league, "own")}${renderInjuryWatch(league)}</div><div class="arcade-column center-column">${renderMomentumChart(league)}${renderLeagueStockBoard(league)}${renderLeagueMatchupBoard(league)}${renderScoringFeed(league)}</div><div class="arcade-column right-column">${arcadeRosterPanel(league, "opponent")}<section class="arcade-panel next-games-panel"><div class="arcade-panel-head"><div><b>▣ NEXT GAMES</b><small>ESPN NFL LIVE SCOREBOARD</small></div><button class="panel-action" data-view="live" type="button">ALL GAMES ›</button></div>${renderNextGames()}</section></div></div></div>`;
  }

  function playerFinishEstimate(player) {
    const actual = actualForPlayer(player);
    const projection = Math.max(actual, projectionForPlayer(player));
    const event = player.event || findPlayerEvent(player);
    const game = event && eventState(event);
    const final = player.status === "FINAL" || Boolean(game && game.final);
    const live = player.status === "LIVE" || Boolean(game && game.live);
    if (final) return { finish: actual, remaining: 0, isLive: false };
    if (live) return { finish: actual + Math.max(0, projection - actual), remaining: Math.max(0, projection - actual), isLive: true };
    return { finish: Math.max(actual, projection), remaining: Math.max(0, projection - actual), isLive: false };
  }

  function teamFinishEstimate(league, side) {
    const remaining = (league[side] || []).filter((player) => player.starter !== false)
      .reduce((sum, player) => sum + playerFinishEstimate(player).remaining, 0);
    // League totals include provider corrections that may not yet be in player rows.
    return leagueActual(league, side) + remaining;
  }

  function teamFinishUncertainty(league, side) {
    const variance = (league[side] || []).filter((player) => player.starter !== false).reduce((sum, player) => {
      const estimate = playerFinishEstimate(player);
      const deviation = estimate.isLive ? estimate.remaining * 0.45 : estimate.remaining * 0.38;
      return sum + deviation * deviation;
    }, 0);
    return Math.sqrt(variance);
  }

  function errorFunction(value) {
    const sign = value < 0 ? -1 : 1;
    const x = Math.abs(value);
    const t = 1 / (1 + 0.3275911 * x);
    const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
    return sign * (1 - polynomial * Math.exp(-x * x));
  }

  function matchupWinChance(ownFinish, opponentFinish, ownUncertainty, opponentUncertainty) {
    const gap = ownFinish - opponentFinish;
    const spread = Math.hypot(ownUncertainty, opponentUncertainty);
    if (spread < 0.01) return gap === 0 ? 50 : gap > 0 ? 99 : 1;
    return Math.max(1, Math.min(99, Math.round(0.5 * (1 + errorFunction((gap / spread) / Math.SQRT2)) * 100)));
  }
  function renderHero(league) {
    const started = leagueStarted(league);
    const ownColor = ((league.teams || []).find(team => team.name === league.ownName) || {}).teamColor || OWN_TEAM_COLOR;
    const opponentColor = ((league.teams || []).find(team => team.name === league.opponentName) || {}).teamColor || '#9ca3af';
    const ownActual = leagueActual(league, "own");
    const opponentActual = leagueActual(league, "opponent");
    const ownHasProj = (league.own || []).some((player) => finite(player.projected) != null || finite(player.consensus && player.consensus.value) != null);
    const oppHasProj = (league.opponent || []).some((player) => finite(player.projected) != null || finite(player.consensus && player.consensus.value) != null);
    const ownFinish = teamFinishEstimate(league, "own");
    const opponentFinish = teamFinishEstimate(league, "opponent");
    const ownPct = matchupWinChance(ownFinish, opponentFinish, teamFinishUncertainty(league, "own"), teamFinishUncertainty(league, "opponent"));
    const opponentPct = 100 - ownPct;
    const ownDelta = teamDelta(league, "own");
    const opponentDelta = teamDelta(league, "opponent");
    const stats = sourceStats();
    const oddsMeta = stats.oddsBooks ? `${stats.oddsBooks} LIVE ODDS` : "GAME ODDS WAITING";
    return `<section class="matchup-hero arcade-hero"><div class="hero-team own arcade-side" style="--team-color:${esc(ownColor)}"><div class="hero-team-copy"><span>YOUR TEAM • ${state.league === "sleeper" ? "SLEEPER" : "ESPN"}</span><strong>${esc(league.ownName)}</strong><small>${esc(recordLabel(league.ownRecord))} • WEEK ${esc(league.week || state.week)} • ${started ? "LIVE TOTALS" : "PREGAME PROJECTION"}</small></div>${profileAvatar(league.ownAvatar, league.ownName, "hero-profile") }<div class="hero-score-block"><strong>${number(ownActual)}</strong>${deltaMarkup(ownDelta)}<small>${started ? "EST. FINISH" : "PROJ"} ${ownHasProj ? number(ownFinish) : "MODEL"}</small></div></div><div class="hero-score arcade-center-score"><img class="hero-brand-logo" src="${brandLogo()}" alt="The Big Senus logo"><span class="live-pill ${started ? "active" : ""}"><i></i>${started ? "LIVE NOW" : "PREGAME"}</span><div class="hero-vs"><strong>VS</strong><span>WEEK ${esc(league.week || state.week)}</span></div><div class="hero-proj"><span>${started ? "EST. FINISH" : "PROJ"} ${ownHasProj ? number(ownFinish) : "MODEL READY"}</span><span>${started ? "EST. FINISH" : "PROJ"} ${oppHasProj ? number(opponentFinish) : "MODEL READY"}</span></div><div class="win-bar"><span class="win-own" style="width:${ownPct}%"></span><span class="win-label">${ownPct}% PROJECTED WIN CHANCE • ${number(ownFinish)}–${number(opponentFinish)} FINISH</span><span class="win-opp" style="width:${opponentPct}%"></span></div></div><div class="hero-team opponent arcade-side" style="--team-color:${esc(opponentColor)}"><div class="hero-score-block"><strong>${number(opponentActual)}</strong>${deltaMarkup(opponentDelta)}<small>${started ? "EST. FINISH" : "PROJ"} ${oppHasProj ? number(opponentFinish) : "MODEL"}</small></div>${profileAvatar(league.opponentAvatar, league.opponentName, "hero-profile") }<div class="hero-team-copy"><span>OPPONENT • ${state.league === "sleeper" ? "SLEEPER" : "ESPN"}</span><strong>${esc(league.opponentName)}</strong><small>${esc(recordLabel(league.opponentRecord))} • ${started ? "MATCHUP LIVE" : "MATCHUP PREVIEW"}</small></div></div><div class="hero-meta"><span>${esc(stats.live)} LIVE FEEDS</span><span>${esc(oddsMeta)}</span><span>UPDATED ${esc(formatAge(state.refreshedAt))}</span></div></section>`;
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
    return `<section class="focus-panel workspace-panel"><div class="focus-top"><span class="section-kicker">PLAYER FOCUS</span><button class="focus-close" type="button" aria-label="Reset player focus">RESET</button></div><div class="focus-player">${playerFace(focus, "large")}<div><h2>${esc(focus.full_name || focus.name)}</h2><p>${esc(focus.position || "UTIL")} • ${esc(focus.team || "FA")} • ${esc(focus.side === "opponent" ? league.opponentName : league.ownName)}</p><span class="live-pill ${focus.status === "LIVE" ? "active" : ""}"><i></i>${esc(focus.status || "UPCOMING")} • VS ${esc(next)}</span></div></div><div class="focus-score-grid"><div><strong>${number(actual)}</strong><small>LIVE POINTS</small></div><div><strong>${projection == null ? "MODEL" : number(projection)}</strong><small>PROJ POINTS</small></div><div><strong>${average == null ? "NOT STARTED" : number(average)}</strong><small>SEASON AVG</small></div></div><div class="focus-tabs"><span class="active">LIVE SNAPSHOT</span><span>PROJECTION</span><span>STATUS</span></div>${playerDetailStatsGrid(focus, "focus-stat-grid")}<div class="focus-trend-heading"><b>FANTASY POINTS SNAPSHOT</b><span>LIVE • PROJ • AVG</span></div><div class="focus-trend">${bars}</div><div class="focus-trend-labels"><span>LIVE</span><span>PROJ</span><span>AVG</span></div><div class="focus-next"><span>NEXT GAME</span><b>${esc(next)} • ${esc(focus.status === "LIVE" ? "IN PROGRESS" : "SCHEDULED")}</b></div><div class="focus-feed"><span class="status-dot live"></span><b>${esc(focus.statLine || "PREGAME • LIVE STAT LINE READY")}</b></div>${sourceCoverageMarkup()}</section>`;
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
    return `<div class="overview-grid"><section class="workspace-panel roster-panel"><div class="panel-heading red-heading"><span><b>MY STARTERS</b><small>${esc(league.ownName)} • LIVE TOTALS + PROJECTIONS</small></span><button class="panel-action" data-view="players" type="button">ALL PLAYERS ›</button></div><div class="player-stack">${starters.length ? starters.map((player) => playerCard(player, "own")).join("") : `<div class="empty-card"><strong>ROSTER FEED SYNCING</strong><span>Waiting for the fantasy provider to return starters.</span></div>`}</div><div class="bench-strip"><span>BENCH • ${bench.length} SHOWN</span>${bench.slice(0, 3).map(compactPlayerRow).join("")}</div></section><section class="workspace-panel roster-panel opponent-panel"><div class="panel-heading blue-heading"><span><b>OPPONENT STARTERS</b><small>${esc(league.opponentName)} • MATCHUP LIVE FEED</small></span><button class="panel-action" data-view="matchups" type="button">MATCHUP ›</button></div><div class="player-stack">${opponentStarters.length ? opponentStarters.map((player) => playerCard(player, "opponent")).join("") : `<div class="empty-card"><strong>OPPONENT FEED SYNCING</strong><span>Waiting for the matchup side to respond.</span></div>`}</div></section><aside class="overview-side"><section class="workspace-panel games-panel"><div class="panel-heading cyan-heading"><span><b>LIVE GAMES</b><small>TOUCH A GAME FOR DETAILS</small></span><button class="panel-action" data-view="live" type="button">ALL GAMES ›</button></div>${liveGamesMarkup()}</section><section class="workspace-panel difference-panel"><div class="panel-heading amber-heading"><span><b>LIVE MARKET ODDS</b><small>PUBLIC GAME LINES</small></span><button class="panel-action" data-view="players" type="button">OPEN ›</button></div>${insightMarkup()}</section>${sourceCoverageMarkup()}</aside></div><div class="mobile-league-board">${renderLeagueStockBoard(league)}${renderLeagueMatchupBoard(league)}${renderScoringFeed(league)}</div>`;
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

  function playerDetailStats(player) {
    const saved = Array.isArray(player && player.gameStats) ? player.gameStats : [];
    const projectedSaved = Array.isArray(player && player.projectedGameStats) ? player.projectedGameStats : [];
    const priority = [
      "COMPLETIONS", "ATTEMPTS", "PASSING YARDS", "PASSING TOUCHDOWNS", "INTERCEPTIONS",
      "RUSHING ATTEMPTS", "RUSHING YARDS", "RUSHING TOUCHDOWNS", "RECEPTIONS", "TARGETS",
      "RECEIVING YARDS", "RECEIVING TOUCHDOWNS", "FUMBLES", "FUMBLES LOST"
    ];
    const unique = new Map();
    saved.forEach((stat) => {
      const label = formatESPNStatLabel(stat && stat.label);
      const value = finite(stat && stat.value);
      if (label && value != null) unique.set(label, { label, value });
    });
    const legacy = [
      ["PASSING YARDS", player.pass_yd ?? player.passing_yards],
      ["PASSING TOUCHDOWNS", player.pass_td ?? player.passing_tds],
      ["INTERCEPTIONS", player.interceptions ?? player.int],
      ["RUSHING YARDS", player.rush_yd ?? player.rushing_yards],
      ["RUSHING TOUCHDOWNS", player.rush_td ?? player.rushing_tds],
      ["RECEPTIONS", player.receptions ?? player.rec],
      ["RECEIVING YARDS", player.rec_yd ?? player.receiving_yards],
      ["RECEIVING TOUCHDOWNS", player.rec_td ?? player.receiving_tds],
      ["TARGETS", player.targets ?? player.tgt]
    ];
    legacy.forEach(([label, raw]) => {
      const value = finite(raw);
      if (value != null && !unique.has(label)) unique.set(label, { label, value });
    });
    projectedSaved.forEach((stat) => {
      const label = formatESPNStatLabel(stat && stat.label);
      const value = finite(stat && stat.value);
      if (label && value != null && !unique.has(label.replace(/^PROJ /, ""))) unique.set(label, { label, value, projected: true });
    });
    return [...unique.values()].sort((a, b) => {
      const ai = priority.findIndex((label) => a.label.includes(label));
      const bi = priority.findIndex((label) => b.label.includes(label));
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.label.localeCompare(b.label);
    });
  }

  function playerDetailStatsGrid(player, className = "stat-grid") {
    const stats = playerDetailStats(player);
    if (!stats.length) {
      const status = String(player && player.status || "").toUpperCase();
      const copy = status === "LIVE" || status === "FINAL" ? "NO PLAYER STATS REPORTED YET" : "PREGAME • PLAYER STATS APPEAR AS THEY SCORE";
      return '<div class="' + className + ' player-stat-grid"><div class="player-stats-empty">' + copy + '</div></div>';
    }
    const items = stats.map((stat) => '<div><b>' + number(stat.value, Number.isInteger(stat.value) ? 0 : 1) + '</b><small>' + esc(stat.label) + '</small></div>').join("");
    return '<div class="' + className + ' player-stat-grid">' + items + '</div>';
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
    drawer.innerHTML = `<div class="drawer-top"><span class="section-kicker">PLAYER DETAIL</span><button id="closeDrawer" type="button" aria-label="Close player detail">×</button></div><div class="drawer-player">${playerFace(player, "large")}<div><h2>${esc(player.full_name || player.name)}</h2><p>${esc(player.position || "UTIL")} • ${esc(player.team || "FA")} • VS ${esc(playerOpponent(player))}</p><span class="live-pill ${player.status === "LIVE" ? "active" : ""}"><i></i>${esc(player.status || "UPCOMING")}</span></div></div><div class="drawer-score-grid"><div><strong>${number(actual)}</strong><small>ACTUAL / LIVE</small></div><div><strong>${c.value == null ? "MODEL" : number(c.value)}</strong><small>CONSENSUS PROJ</small></div><div><strong>${c.range == null ? "ONE FEED" : number(c.range)}</strong><small>PROJ RANGE</small></div></div><div class="drawer-context-grid"><div><small>GAME</small><b>${esc(gameLabel)}</b></div><div><small>TEAM</small><b>${esc(player.team || "FA")}</b></div><div><small>STATUS</small><b>${esc(playerStatus)}</b></div><div><small>ODDS</small><b>${esc(odds ? `${odds.provider} • ${odds.price || odds.line}` : "PUBLIC LINE PENDING")}</b></div></div><div class="drawer-tabs"><span class="active">PERSONAL STATS</span><span>NEWS / PRACTICE</span><span>PROJECTION</span></div><section class="drawer-section"><div class="drawer-heading"><b>PERSONAL STATS • LIVE / PROJECTED</b><span>${esc(projectionLabel(player))}</span></div>${playerDetailStatsGrid(player, "stat-grid")}</section><section class="drawer-section"><div class="drawer-heading"><b>PLAYER NEWS / PRACTICE</b><span>${esc(playerStatus)}</span></div>${newsMarkup}</section><section class="drawer-section"><div class="drawer-heading"><b>PROJECTION SOURCES</b><span>${esc(rangeLabel(player))}</span></div>${sourceRows}</section><section class="drawer-section"><div class="drawer-heading"><b>SPORTSBOOK ODDS</b><span>${esc(oddsLabel(player))}</span></div>${oddsRows}</section><p class="drawer-disclaimer">Informational only. Actual points update when the connected league provider reports a change; saved score movement remains visible after refresh.</p>`;
    $("#closeDrawer").dataset.closePlayer = "true";
  }

  function renderWorkspace(league) {
    const workspace = $("#workspace");
    if (state.loading) { workspace.innerHTML = `<div class="loading-panel">LOADING LIVE FANTASY DATA…</div>`; return; }
    if (!league.ready && state.view !== "overview") { workspace.innerHTML = `<div class="loading-panel"><strong>ESPN FEED NOT CONNECTED</strong><span>Use the public ESPN league setting, then tap REFRESH NOW.</span><button class="refresh-action" data-action="refresh" type="button">REFRESH NOW</button></div>`; wireInteractions(); return; }
    if (state.view === "stock") workspace.innerHTML = renderLeagueStockBoard(league);
    else if (state.view === "league") workspace.innerHTML = renderLeagueMatchupBoard(league);
    else if (["games", "patriots"].includes(state.view)) workspace.innerHTML = renderLive(league);
    else if (state.view === "matchups") workspace.innerHTML = renderMatchups(league);
    else if (state.view === "players") workspace.innerHTML = renderPlayers(league);
    else if (state.view === "injuries") workspace.innerHTML = renderInjuries(league);
    else if (state.view === "live") workspace.innerHTML = renderLive(league);
    else workspace.innerHTML = renderOverview(league);
    wireInteractions();
  }

  function render() {
    const league = currentLeague();
    state.selectedPlayer = (league.allPlayers || [...(league.own || []), ...(league.opponent || [])]).find(p => String(p.player_id) === String(state.selectedPlayerId)) || null;
    if (window.FantasyGlass) {
      window.FantasyGlass.render();
      document.dispatchEvent(new CustomEvent("fantasy:render"));
      return;
    }
    if (document.body.dataset.screen === "tv") {
      if (window.FantasyTV) window.FantasyTV.render();
      document.dispatchEvent(new CustomEvent("fantasy:render"));
      return;
    }
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
    document.dispatchEvent(new CustomEvent("fantasy:render"));
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
    if (window.FantasyCenter) return;
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
    if (scoreboardResult.value) {state.scoreboard = scoreboardResult.value.events || [];state.scoreboards[state.week]=state.scoreboard;}
    if (sleeperResult.value) state.sleeper = sleeperResult.value; else failures.push("SLEEPER");
    if (espnResult.value) state.espn = espnResult.value;
    const espnWeek=Number(state.espn && state.espn.scoringPeriodId);
    if(espnWeek && espnWeek!==Number(state.week)){
      try{state.scoreboards[espnWeek]=(await loadScoreboard(espnWeek)).events || [];}catch(_){/* Do not attach a different week's game. */}
    }
    if (!espnResult.value || !espnResult.value.ready || espnResult.value.staleFallback) failures.push("ESPN");
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


  const uiState = () => ({league:state.league, view:state.view, playerId:state.selectedPlayerId,
    matchupId:state.selectedMatchup, gameId:state.selectedGame, playerFilter:state.playerFilter, refresh:state.refreshNonce});
  const applyUI = (ui) => {
    const oldLeague = state.league, oldMatchup = state.selectedMatchup, oldRefresh = state.refreshNonce;
    if (["sleeper", "espn"].includes(ui.league)) state.league = ui.league;
    if (["overview","matchups","players","injuries","live","stock","league","patriots","games"].includes(ui.view)) state.view = ui.view;
    if ("playerId" in ui) state.selectedPlayerId = ui.playerId;
    if ("matchupId" in ui) state.selectedMatchup = ui.matchupId;
    if ("gameId" in ui) state.selectedGame = ui.gameId;
    if (ui.playerFilter) state.playerFilter = ui.playerFilter;
    if (typeof ui.refresh === "number") state.refreshNonce = ui.refresh;
    if (oldLeague !== state.league || oldMatchup !== state.selectedMatchup) {
      state.scoreSnapshot = {}; state.scoreMoves = {}; state.selectedPlayer = null;
      updateScoreMoves(currentLeague());
    }
    render();
    if (state.refreshNonce !== oldRefresh) refresh();
  };
  const dispatch = (patch) => {
    applyUI(patch);
    if (patch.refresh === true) refresh();
    document.dispatchEvent(new CustomEvent("fantasy:command", {detail:patch}));
  };
  window.FantasyCenter = {
    getUI:uiState, applyUI, dispatch, render,
    model:() => {
      const league = currentLeague();
      return {league, ui:uiState(), loading:state.loading, error:state.error, updated:state.refreshedAt,
        games:state.scoreboards[league.week] || state.scoreboard, player:state.selectedPlayer,
        started:leagueStarted(league), leagueStarted:leagueGamesStarted(league), history:state.scoreHistory[state.league] || [],
        teamHistory:state.teamScoreHistory[state.league] || [], events:state.scoreEvents[state.league] || [],
        providerUpdated:state.league === "espn" ? state.espn && state.espn.savedAt : state.refreshedAt,
        stale:state.league === "espn" && Boolean(state.espn && state.espn.staleFallback),
        ownActual:leagueActual(league,"own"), opponentActual:leagueActual(league,"opponent"),
        ownFinish:teamFinishEstimate(league,"own"), opponentFinish:teamFinishEstimate(league,"opponent"),
        winChance:matchupWinChance(teamFinishEstimate(league,"own"),teamFinishEstimate(league,"opponent"),teamFinishUncertainty(league,"own"),teamFinishUncertainty(league,"opponent")),
        matchups:buildLeagueMatchups(league,league.matchups || [])};
    },
    markup:{momentum:renderMomentumChart, stock:renderLeagueStockBoard, league:renderLeagueMatchupBoard,
      feed:renderScoringFeed, face:playerFace, stats:playerDetailStatsGrid, games:renderNextGames,
      gameLabel:playerGameLabel, hero:renderHero},
    data:{stats:playerDetailStats, projection:projectionForPlayer, actual:actualForPlayer, record:recordLabel},
    format:number, escape:esc
  };
  document.addEventListener("click", event => {
    if (document.body.dataset.screen === "tv") return;
    const button = event.target.closest("[data-view],[data-league],[data-player-id],[data-player-name],[data-matchup-id],[data-game-id],[data-filter],[data-close-player],.focus-close,[data-action=refresh]");
    if (!button) return;
    if (button.dataset.view) dispatch({view:button.dataset.view,playerId:null,gameId:null});
    else if (button.dataset.league) dispatch({league:button.dataset.league,matchupId:null,playerId:null,gameId:null});
    else if (button.dataset.matchupId) dispatch({matchupId:button.dataset.matchupId,playerId:null,view:"overview"});
    else if (button.dataset.gameId) dispatch({view:"games",gameId:button.dataset.gameId,playerId:null});
    else if (button.dataset.filter) dispatch({playerFilter:button.dataset.filter});
    else if (button.dataset.closePlayer || button.classList.contains("focus-close")) dispatch({playerId:null});
    else if (button.dataset.action === "refresh") dispatch({refresh:true});
    else {
      const league = currentLeague();
      const players = league.allPlayers || [...(league.own || []), ...(league.opponent || [])];
      const player = players.find(p => button.dataset.playerId ? String(p.player_id) === button.dataset.playerId : nameKey(p.full_name || p.name) === nameKey(button.dataset.playerName));
      if (player) dispatch({playerId:String(player.player_id)});
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && state.selectedPlayerId) dispatch({playerId:null});
    if (["Enter", " "].includes(event.key) && event.target.matches("[data-matchup-id],[data-game-id]")) { event.preventDefault(); event.target.click(); }
  });

  refresh();
  setInterval(refresh, CONFIG.refreshMs);
  setInterval(() => {
    const clock = $("#clock");
    if (clock) clock.textContent = formatClock(new Date());
  }, 1000);
})();

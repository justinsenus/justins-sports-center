Warning: truncated output (original token count: 38720)
Total output lines: 2054

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
    playerTab: "stats",
    chartRange: "week",
    flaggedPlayers: {},
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
  try {
    const flags = JSON.parse(localStorage.getItem("fcc-player-flags-v1") || "{}");
    if (flags && typeof flags === "object" && !Array.isArray(flags)) state.flaggedPlayers = flags;
    const range = localStorage.getItem("fcc-chart-range-v1");
    if (["week","hour"].includes(range)) state.chartRange = range;
  } catch (_) { /* Storage may be unavailable on a TV browser. */ }

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
    if (/^(DEF|DST|D\/ST)$/i.test(player && player.position || "")) return {src:teamLogo(player.team),fallback:""};
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
    const cloud = cloudProjectionFor(player);
    if (cloud && (!player.injury_status || /^(?:not published|unknown)$/i.test(player.injury_status)) && cloud.injury_fallback !== "UNKNOWN") player.injury_status = cloud.injury_fallback;
    const status = event && eventState(event).live ? "LIVE" : event && eventState(event).final ? "FINAL" : player.injury_status ? String(player.injury_status).toUpperCase() : actualRaw > 0 ? "LIVE" : event && eventState(event).upcoming ? "NEXT" : "NO GAME";
    const consensus = consensusFor(player, consensusData);
    const liveStats = statsMap && statsMap[String(id)] || {};
    const projectionStats = projectedStatsMap && projectedStatsMap[String(id)] || {};
    const gameStats = statRowsFromMap(liveStats, SLEEPER_STAT_LABELS, { strictLabels: true });
    const projectedGameStats = statRowsFromMap(projectionStats, SLEEPER_STAT_LABELS, { projected: true, strictLabels: true });
    const starterSet = new Set((roster && roster.starters || []).map(String));
    const projected = consensus.cloud ? consensus.value : finite(player.projected) ?? consensus.value;
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

  function cloudProjectionFor(player) {
    return window.FantasyProjectionCloud && window.FantasyProjectionCloud.get(player,
      { season:CONFIG.season, week:Number(player && player.scoringPeriodId || state.week) });
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
    const cloud = cloudProjectionFor(player);
    if (cloud) {
      const previous = map[id];
      return { value:cloud.calculated_average, min:null, max:null, range:null,
        sourceCount:cloud.sources_counted,
        sources:[{source:`Cloud consensus (${cloud.sources_counted} sources)`,value:cloud.calculated_average}],
        outlier:null, odds:Array.isArray(previous && previous.odds)?previous.odds:[],
        market:previous && previous.market || null, fallback:false, sourceLabel:"CLOUD CONSENSUS",
        cloud:true, updatedAt:cloud.updated_at };
    }
    let row = map[id];
    if (!row && player && player.full_name) row = Object.values(map).find((candidate) => nameKey(candidate.name || candidate.full_name) === nameKey(player.full_name) && (!candidate.team || String(candidate.team).toUpperCase() === String(player.team || "").toUpperCase()));
    if (!row) {
      const publicRows = Number(state.espn && state.espn.scoringPeriodId) === targetWeek ? state.espn.projectionPlayers || {} : {};
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
      const publicRows = Number(state.espn && state.espn.scoringPeriodId) === targetWeek ? state.espn.projectionPlayers || {} : {};
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
      getJSON(`https://api.sleeper.com/projections/nfl/${CONFIG.season}/${week}?season_type=regular`).catch(() => []),
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
      label: formatESPNStatLabel(labels[String(id)] || ESP…22720 tokens truncated…(player) => player.starter !== false).slice(0, 10);
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
      loadConsensus().then((value) => ({ value })).catch((error) => ({ error })),
      window.FantasyProjectionCloud ? window.FantasyProjectionCloud.refresh().catch(() => null) : Promise.resolve(null)
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
    matchupId:state.selectedMatchup, gameId:state.selectedGame, playerFilter:state.playerFilter, refresh:state.refreshNonce,
    playerTab:state.playerTab, chartRange:state.chartRange, flaggedPlayers:{...state.flaggedPlayers}});
  const applyUI = (ui) => {
    const oldLeague = state.league, oldMatchup = state.selectedMatchup, oldRefresh = state.refreshNonce;
    if (["sleeper", "espn"].includes(ui.league)) state.league = ui.league;
    if (["overview","matchups","players","injuries","live","stock","league","patriots","games"].includes(ui.view)) state.view = ui.view;
    if ("playerId" in ui) {
      if (ui.playerId !== state.selectedPlayerId && !("playerTab" in ui)) state.playerTab = "stats";
      state.selectedPlayerId = ui.playerId;
    }
    if (["stats","news","projections"].includes(ui.playerTab)) state.playerTab = ui.playerTab;
    if (["week","hour"].includes(ui.chartRange)) {
      state.chartRange = ui.chartRange;
      try { localStorage.setItem("fcc-chart-range-v1", ui.chartRange); } catch (_) {}
    }
    if (ui.flaggedPlayers && typeof ui.flaggedPlayers === "object" && !Array.isArray(ui.flaggedPlayers)) state.flaggedPlayers = {...ui.flaggedPlayers};
    if (ui.playerFlag && typeof ui.playerFlag === "object" && !Array.isArray(ui.playerFlag)) Object.assign(state.flaggedPlayers, ui.playerFlag);
    if (ui.flaggedPlayers || ui.playerFlag) {
      try { localStorage.setItem("fcc-player-flags-v1", JSON.stringify(state.flaggedPlayers)); } catch (_) {}
    }
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
    if ("playerId" in patch && patch.playerId !== state.selectedPlayerId && !("playerTab" in patch)) patch = {...patch,playerTab:"stats"};
    applyUI(patch);
    if (patch.refresh === true) refresh();
    document.dispatchEvent(new CustomEvent("fantasy:command", {detail:patch}));
  };
  window.FantasyCenter = {
    getUI:uiState, applyUI, dispatch, render,
    model:() => {
      const league = currentLeague();
      // A saved snapshot describes the current total, unlike a historical
      // scoring play. Drop snapshots that disagree with the provider's roster.
      const started = leagueGamesStarted(league);
      const events = started ? (state.scoreEvents[state.league] || []).filter(event => !event.snapshot ||
        (league.allPlayers || []).some(player => String(player.player_id) === String(event.playerId) &&
          Math.abs(actualForPlayer(player) - Number(event.total)) < .001)) : [];
      return {league, ui:uiState(), loading:state.loading, error:state.error, updated:state.refreshedAt,
        games:state.scoreboards[league.week] || state.scoreboard, player:state.selectedPlayer,
        nflGames:state.scoreboards[Number(state.espn && state.espn.scoringPeriodId)] || state.scoreboard,
        nflWeek:Number(state.espn && state.espn.scoringPeriodId) || Number(state.week),
        started:leagueStarted(league), leagueStarted:leagueGamesStarted(league), history:state.scoreHistory[state.league] || [],
        teamHistory:state.teamScoreHistory[state.league] || [], events,
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
    if (document.body.dataset.screen === "tv") return;
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

(() => {
  "use strict";

  const CONFIG = {
    season: 2026,
    sleeperLeagueId: "1387635903379300352",
    sleeperOwnerId: "1137609122398482432",
    sleeperTeamName: "The Big Senus",
    espnTeamName: "Gumby's Big D",
    refreshMs: 20000,
    playersCacheMs: 12 * 60 * 60 * 1000
  };

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

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
  const finite = (value) => {
    if (value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const number = (value, decimals = 1, fallback = "—") => {
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
    return `<span class="player-face ${size}"><img src="${esc(image.src)}" ${image.fallback ? `data-fallback="${esc(image.fallback)}"` : ""} alt="${esc(player && player.full_name || player && player.name || "Player")}" onerror="this.style.opacity='.16'"></span>`;
  }

  function sleeperPlayerIds(roster) {
    return (roster && roster.players || []).map(String);
  }

  function rosterName(roster, users, fallback) {
    const owner = users && users.find((user) => String(user.user_id) === String(roster && roster.owner_id));
    return owner && owner.metadata && owner.metadata.team_name || owner && owner.display_name || fallback;
  }

  function normalizeSleeperPlayer(id, players, pointsMap, roster, consensusData) {
    const source = players && players[id] || { player_id: id, full_name: id, team: "FA", position: "—" };
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
      position: player.position || "—",
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
    if (!row) return { value: finite(player && player.projected), min: null, max: null, range: null, sourceCount: finite(player && player.projected) != null ? 1 : 0, sources: [], outlier: null, odds: [] };
    const value = finite(row.consensus != null ? row.consensus : row.projectionMedian != null ? row.projectionMedian : row.projected);
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

  async function loadESPN() {
    try {
      return await getJSON(new URL("../patriots-fantasy/espn-data.json?ts=" + Date.now(), location.href));
    } catch (_) {
      return { ready: false, error: "ESPN secure sync is not available" };
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
    const ids = (roster.players || []).map(String);
    const starters = new Set((roster.starters || []).map(String));
    const pointsMap = team.pointsMap || {};
    const players = ids.map((id) => {
      const source = team.players && team.players[id] || { player_id: id, full_name: id, team: "—", position: "—" };
      const player = { ...source, player_id: id, full_name: source.full_name || source.name || id, name: source.full_name || source.name || id };
      const consensus = consensusFor(player);
      return { ...player, actual: finite(pointsMap[id]) || 0, projected: consensus.value != null ? consensus.value : finite(player.projected), status: player.injury_status ? String(player.injury_status).toUpperCase() : "ACTIVE", starter: starters.has(id), side, event: findPlayerEvent(player), consensus };
    });
    return { name: team.name || (side === "own" ? CONFIG.espnTeamName : "OPPONENT"), players, roster, total: finite(team.total) || 0, projected: finite(team.projected) };
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
    const direct = state.sleeper ? [{ id: "sleeper", name: "Sleeper", status: "live" }] : [];
    const all = [...liveSources, ...direct].filter((source, index, list) => list.findIndex((candidate) => candidate.id === source.id) === index);
    return { catalog: catalog.length || 30, live: all.length, sources: all, oddsBooks: state.consensus && state.consensus.odds_books || 0 };
  }

  function projectionLabel(player) {
    const c = player && player.consensus || consensusFor(player);
    if (c.value == null) return "PROJ —";
    const source = c.sourceCount ? `${c.sourceCount} SRC` : "DIRECT";
    return `PROJ ${number(c.value)} • ${source}`;
  }

  function rangeLabel(player) {
    const c = player && player.consensus || consensusFor(player);
    if (c.min == null || c.max == null) return "RANGE —";
    return `RANGE ${number(c.min)}–${number(c.max)} (${number(c.range)})`;
  }

  function oddsLabel(player) {
    const c = player && player.consensus || consensusFor(player);
    if (c.market && c.market.min != null && c.market.max != null) return `ODDS RANGE ${number(c.market.min)}–${number(c.market.max)} (${number(c.market.range, 1, "0")})`;
    return c.odds && c.odds.length ? `ODDS ${c.odds.length} LINES` : "ODDS WAITING";
  }

  function playerOpponent(player) {
    const event = player && (player.event || findPlayerEvent(player));
    if (!event) return "—";
    const team = String(player.team || "").toUpperCase();
    const other = eventCompetitors(event).find((candidate) => String(candidate.team && candidate.team.abbreviation || "").toUpperCase() !== team);
    return other && other.team && other.team.abbreviation || "—";
  }

  function playerCard(player, side = "own") {
    const actual = actualForPlayer(player);
    const c = player.consensus || consensusFor(player);
    const statusClass = /OUT|IR|DOUBTFUL|QUESTIONABLE/.test(String(player.status || "")) ? "warn" : player.status === "LIVE" ? "live" : "";
    return `<button class="player-card ${side} ${statusClass}" data-player-id="${esc(player.player_id)}" data-side="${side}" type="button"><div class="player-position">${esc(player.position || "—")}</div>${playerFace(player)}<div class="player-card-copy"><strong>${esc(player.full_name || player.name || player.player_id)}</strong><span>${esc(player.team || "FA")} • VS ${esc(playerOpponent(player))} • <b class="status-text">${esc(player.status || "ACTIVE")}</b></span><small>${esc(player.statLine || "LIVE STAT LINE PENDING")}</small></div><div class="player-card-score"><strong class="actual-score">${number(actual)}</strong><small>PTS</small><span>${esc(projectionLabel({ ...player, consensus: c }))}</span><em>${esc(rangeLabel({ ...player, consensus: c }))}</em></div><span class="chevron">›</span></button>`;
  }

  function compactPlayerRow(player) {
    const actual = actualForPlayer(player);
    return `<button class="compact-player" data-player-id="${esc(player.player_id)}" data-side="own" type="button">${playerFace(player, "small")}<span><strong>${esc(player.full_name || player.name)}</strong><small>${esc(player.position || "—")} • ${esc(player.team || "FA")} • ${esc(player.status || "ACTIVE")}</small></span><b>${number(actual)}<small>${esc(projectionLabel(player))}</small></b></button>`;
  }

  function liveGamesMarkup() {
    const events = (state.scoreboard || []).filter((event) => eventState(event).live || eventState(event).upcoming).slice(0, 8);
    if (!events.length) return `<div class="empty-card"><strong>LIVE GAME FEED WAITING</strong><span>Games, quarter/clock, possession, and prop markets will appear here on game day.</span></div>`;
    return `<div class="live-games-grid">${events.map((event) => {
      const status = eventState(event);
      const competitors = eventCompetitors(event);
      const away = competitors.find((c) => c.homeAway === "away") || competitors[0] || {};
      const home = competitors.find((c) => c.homeAway === "home") || competitors[1] || {};
      return `<article class="live-game ${status.live ? "is-live" : ""}"><div class="live-game-top"><span>${status.live ? "LIVE NOW" : "NEXT"}</span><small>${esc(status.live ? `${status.type.shortDetail || "LIVE"}` : new Date(event.date || 0).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }))}</small></div><div class="game-team"><img src="${teamLogo(away.team && away.team.abbreviation)}" alt=""><strong>${esc(away.team && away.team.abbreviation || "—")}</strong><b>${esc(away.score == null ? "—" : away.score)}</b></div><div class="game-team"><img src="${teamLogo(home.team && home.team.abbreviation)}" alt=""><strong>${esc(home.team && home.team.abbreviation || "—")}</strong><b>${esc(home.score == null ? "—" : home.score)}</b></div></article>`;
    }).join("")}</div>`;
  }

  function sourceCoverageMarkup() {
    const stats = sourceStats();
    const catalog = stats.catalog;
    const live = stats.live;
    const consensus = state.consensus || {};
    const status = consensus.status === "ready" || consensus.status === "live" ? "CONSENSUS LIVE" : live > 1 ? "PARTIAL CONSENSUS" : "DIRECT FEED ONLY";
    const sourceNames = stats.sources.slice(0, 6).map((source) => `<span class="source-chip live">${esc(source.name || source.id)}</span>`).join("");
    return `<section class="source-panel"><div class="section-kicker">PROJECTION ENGINE</div><div class="source-top"><strong>${esc(status)}</strong><span>${live}/${catalog} SOURCES</span></div><div class="source-bar"><span style="width:${Math.min(100, Math.max(4, live / Math.max(1, catalog) * 100))}%"></span></div><div class="source-meta"><span>UPDATED ${esc(formatAge(consensus.generated_at || state.refreshedAt))}</span><span>${stats.oddsBooks ? `${stats.oddsBooks} BOOKS` : "ODDS KEY NEEDED"}</span></div><div class="source-chips">${sourceNames || `<span class="source-chip">SLEEPER LIVE FALLBACK</span>`}</div><p>Consensus uses the median of enabled source values. Ranges are max − min; outliers are shown instead of hidden.</p></section>`;
  }

  function insightMarkup() {
    const insights = state.consensus && state.consensus.insights || [];
    if (!insights.length) return `<div class="empty-card compact"><strong>DIFFERENCE BOARD WAITING</strong><span>Add the provider secrets to show the biggest projection gaps and sportsbook ranges.</span></div>`;
    return `<div class="insight-list">${insights.slice(0, 5).map((item) => `<button class="insight-row" type="button" data-player-name="${esc(item.name)}"><span class="insight-rank">${esc(item.rank || "—")}</span><span><strong>${esc(item.name)}</strong><small>${esc(item.market || "FANTASY PROJECTION")} • ${esc(item.source || "OUTLIER")}</small></span><b>${item.delta == null ? "—" : `+${number(item.delta)}`}<small>${item.range == null ? "RANGE —" : `RANGE ${number(item.range)}`}</small></b></button>`).join("")}</div>`;
  }

  function renderHero(league) {
    const started = leagueStarted(league);
    const ownActual = leagueActual(league, "own");
    const opponentActual = leagueActual(league, "opponent");
    const ownProjection = (league.own || []).filter((player) => player.starter !== false).reduce((sum, player) => sum + (finite(player.projected) || 0), 0);
    const opponentProjection = (league.opponent || []).filter((player) => player.starter !== false).reduce((sum, player) => sum + (finite(player.projected) || 0), 0);
    const ownHasProj = (league.own || []).some((player) => finite(player.projected) != null);
    const oppHasProj = (league.opponent || []).some((player) => finite(player.projected) != null);
    return `<section class="matchup-hero"><div class="hero-team own"><div class="hero-team-copy"><span>YOUR TEAM</span><strong>${esc(league.ownName)}</strong><small>WEEK ${esc(league.week || state.week)} • ${started ? "LIVE TOTALS" : "PREGAME"}</small></div><span class="hero-mark red-mark">${esc(league.id === "sleeper" ? "S" : "E")}</span></div><div class="hero-score"><span class="live-pill ${started ? "active" : ""}"><i></i>${started ? "LIVE" : "PREGAME"}</span><div><strong>${number(ownActual)}</strong><em>VS</em><strong>${number(opponentActual)}</strong></div><div class="hero-proj"><span>PROJ ${ownHasProj ? number(ownProjection) : "—"}</span><span>PROJ ${oppHasProj ? number(opponentProjection) : "—"}</span></div><div class="win-bar"><span class="win-own" style="width:${started ? 50 : 50}%"></span><span class="win-label">WIN PROBABILITY • MARKET MODEL PENDING</span><span class="win-opp"></span></div></div><div class="hero-team opponent"><span class="hero-mark blue-mark">${esc(league.id === "sleeper" ? "M" : "O")}</span><div class="hero-team-copy"><span>OPPONENT</span><strong>${esc(league.opponentName)}</strong><small>${started ? "MATCHUP LIVE" : "MATCHUP PREVIEW"}</small></div></div><div class="hero-meta"><span>${esc(sourceStats().live)}/${esc(sourceStats().catalog)} PROJECTION SOURCES</span><span>${esc(state.consensus && state.consensus.odds_books || 0)} ODDS BOOKS</span><span>UPDATED ${esc(formatAge(state.consensus && state.consensus.generated_at || state.refreshedAt))}</span></div></section>`;
  }

  function renderOverview(league) {
    const starters = (league.own || []).filter((player) => player.starter !== false).slice(0, 10);
    const opponentStarters = (league.opponent || []).filter((player) => player.starter !== false).slice(0, 10);
    const bench = (league.own || []).filter((player) => player.starter === false).slice(0, 6);
    return `<div class="overview-grid"><section class="workspace-panel roster-panel"><div class="panel-heading red-heading"><span><b>MY STARTERS</b><small>${esc(league.ownName)}</small></span><button class="panel-action" data-view="players" type="button">ALL PLAYERS ›</button></div><div class="player-stack">${starters.length ? starters.map((player) => playerCard(player, "own")).join("") : `<div class="empty-card">SLEEPER ROSTER WAITING</div>`}</div><div class="bench-strip"><span>BENCH • ${bench.length} SHOWN</span>${bench.slice(0, 3).map(compactPlayerRow).join("")}</div></section><section class="workspace-panel roster-panel opponent-panel"><div class="panel-heading blue-heading"><span><b>OPPONENT STARTERS</b><small>${esc(league.opponentName)}</small></span><button class="panel-action" data-view="matchups" type="button">MATCHUP ›</button></div><div class="player-stack">${opponentStarters.length ? opponentStarters.map((player) => playerCard(player, "opponent")).join("") : `<div class="empty-card">OPPONENT ROSTER WAITING</div>`}</div></section><aside class="overview-side"><section class="workspace-panel games-panel"><div class="panel-heading cyan-heading"><span><b>LIVE GAMES</b><small>TOUCH A GAME FOR DETAILS</small></span><button class="panel-action" data-view="live" type="button">ALL GAMES ›</button></div>${liveGamesMarkup()}</section><section class="workspace-panel difference-panel"><div class="panel-heading amber-heading"><span><b>BIGGEST DIFFERENCES</b><small>PROJECTION + ODDS RANGE</small></span><button class="panel-action" data-view="players" type="button">OPEN ›</button></div>${insightMarkup()}</section>${sourceCoverageMarkup()}</aside></div>`;
  }

  function renderMatchups(league) {
    const own = (league.own || []).filter((player) => player.starter !== false);
    const opponent = (league.opponent || []).filter((player) => player.starter !== false);
    return `<div class="matchup-grid"><section class="workspace-panel roster-panel"><div class="panel-heading red-heading"><span><b>${esc(league.ownName)}</b><small>STARTERS • ${own.length} SLOTS</small></span><span class="panel-total">${number(leagueActual(league, "own"))}</span></div><div class="player-stack">${own.map((player) => playerCard(player, "own")).join("")}</div></section><section class="workspace-panel roster-panel opponent-panel"><div class="panel-heading blue-heading"><span><b>${esc(league.opponentName)}</b><small>OPPONENT • ${opponent.length} SLOTS</small></span><span class="panel-total">${number(leagueActual(league, "opponent"))}</span></div><div class="player-stack">${opponent.map((player) => playerCard(player, "opponent")).join("")}</div></section><aside class="workspace-panel matchup-insights"><div class="panel-heading amber-heading"><span><b>MARKET DIFFERENCES</b><small>MAX − MIN BY PLAYER</small></span></div>${insightMarkup()}${sourceCoverageMarkup()}</aside></div>`;
  }

  function renderPlayers(league) {
    const players = [...(league.own || []).map((player) => ({ ...player, rosterSide: "YOUR ROSTER" })), ...(league.opponent || []).map((player) => ({ ...player, rosterSide: "OPPONENT" }))];
    const live = players.filter((player) => player.status === "LIVE");
    return `<div class="players-view"><div class="filter-row"><button class="filter active" type="button">ALL PLAYERS</button><button class="filter" type="button">STARTERS</button><button class="filter" type="button">BENCH</button><button class="filter" type="button">LIVE NOW${live.length ? ` • ${live.length}` : ""}</button><span class="filter-note">Actual large • projection small • source range under every row</span></div><div class="players-table"><div class="players-table-head"><span>PLAYER</span><span>STATUS / MATCHUP</span><span>ACTUAL</span><span>CONSENSUS</span><span>ODDS / RANGE</span></div>${players.map((player) => `<button class="players-table-row" data-player-id="${esc(player.player_id)}" data-side="own" type="button">${playerFace(player, "small")}<span><strong>${esc(player.full_name || player.name)}</strong><small>${esc(player.position || "—")} • ${esc(player.team || "FA")} • ${esc(player.rosterSide)}</small></span><span><b class="status-text">${esc(player.status || "ACTIVE")}</b><small>VS ${esc(playerOpponent(player))}</small></span><strong class="table-actual">${number(actualForPlayer(player))}<small>PTS</small></strong><span class="table-proj">${esc(projectionLabel(player))}<small>${esc(rangeLabel(player))}</small></span><span class="table-odds">${esc(oddsLabel(player))}<small>OPEN DETAIL ›</small></span></button>`).join("")}</div></div>`;
  }

  function renderInjuries(league) {
    const players = [...(league.own || []).map((player) => ({ ...player, rosterSide: "YOUR ROSTER" })), ...(league.opponent || []).map((player) => ({ ...player, rosterSide: "OPPONENT" }))];
    const flagged = players.filter((player) => /OUT|IR|DOUBTFUL|QUESTIONABLE|INJURY/i.test(String(player.status || "")));
    const rows = flagged.length ? flagged : players.filter((player) => player.status && player.status !== "ACTIVE" && player.status !== "NO GAME").slice(0, 8);
    return `<div class="injuries-view"><section class="workspace-panel"><div class="panel-heading amber-heading"><span><b>INJURY CENTER</b><small>STATUS • PRACTICE • PLAY PROBABILITY</small></span><span class="panel-total">${rows.length} FLAGS</span></div><div class="injury-grid">${rows.length ? rows.map((player) => `<button class="injury-card" data-player-id="${esc(player.player_id)}" data-side="own" type="button">${playerFace(player, "medium")}<span><strong>${esc(player.full_name || player.name)}</strong><small>${esc(player.team || "FA")} • ${esc(player.position || "—")} • ${esc(player.rosterSide)}</small><b class="injury-status">${esc(player.status || "QUESTIONABLE")}</b><em>MEDIAN PLAY PROBABILITY • PROVIDER DATA PENDING</em></span><span class="probability-track"><i style="width:${/OUT|IR/.test(String(player.status || "")) ? 5 : 50}%"></i></span></button>`).join("") : `<div class="empty-card"><strong>NO CURRENT ROSTER FLAGS</strong><span>Practice updates and median probability will appear when provider feeds respond.</span></div>`}</div></section><aside>${sourceCoverageMarkup()}<section class="workspace-panel injury-note"><div class="panel-heading cyan-heading"><span><b>HOW PROBABILITY WORKS</b><small>TRANSPARENT SIGNALS</small></span></div><p>Each player will show a median of enabled practice, injury, news, and sportsbook availability signals. Missing sources stay missing; they are never silently treated as a healthy 100%.</p></section></aside></div>`;
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
    const sourceRows = c.sources && c.sources.length ? c.sources.slice(0, 8).map((source) => `<div class="source-value"><span>${esc(source.source || source.name || "SOURCE")}</span><b>${number(source.value)}</b></div>`).join("") : `<div class="empty-card compact"><strong>DIRECT PROJECTION ONLY</strong><span>More source values appear after provider keys are configured.</span></div>`;
    const oddsRows = c.odds && c.odds.length ? c.odds.slice(0, 8).map((odd) => `<div class="source-value"><span>${esc(odd.book || odd.bookmaker || odd.source || "BOOK")} • ${esc(odd.market || "PROP")}</span><b>${esc(odd.line == null ? "—" : odd.line)} <small>${esc(odd.price == null ? "" : odd.price)}</small></b></div>`).join("") : `<div class="empty-card compact"><strong>ODDS FEED WAITING</strong><span>Market range appears after an odds API key is enabled.</span></div>`;
    drawer.classList.add("open");
    drawer.innerHTML = `<div class="drawer-top"><span class="section-kicker">PLAYER DETAIL</span><button id="closeDrawer" type="button" aria-label="Close player detail">×</button></div><div class="drawer-player">${playerFace(player, "large")}<div><h2>${esc(player.full_name || player.name)}</h2><p>${esc(player.position || "—")} • ${esc(player.team || "FA")} • VS ${esc(playerOpponent(player))}</p><span class="live-pill ${player.status === "LIVE" ? "active" : ""}"><i></i>${esc(player.status || "ACTIVE")}</span></div></div><div class="drawer-score-grid"><div><strong>${number(actual)}</strong><small>ACTUAL / LIVE</small></div><div><strong>${number(c.value)}</strong><small>CONSENSUS PROJ</small></div><div><strong>${c.range == null ? "—" : number(c.range)}</strong><small>PROJ RANGE</small></div></div><div class="drawer-tabs"><button class="active" type="button">STATS</button><button type="button">TRENDS</button><button type="button">MARKET</button><button type="button">NEWS</button></div><section class="drawer-section"><div class="drawer-heading"><b>LIVE / PROJECTED STAT LINE</b><span>${esc(projectionLabel(player))}</span></div><div class="stat-grid"><div><b>${esc(player.pass_yd || player.passing_yards || "—")}</b><small>PASS YDS</small></div><div><b>${esc(player.pass_td || player.passing_tds || "—")}</b><small>PASS TD</small></div><div><b>${esc(player.rush_yd || player.rushing_yards || "—")}</b><small>RUSH YDS</small></div><div><b>${esc(player.rec || player.receptions || "—")}</b><small>REC</small></div><div><b>${esc(player.rec_yd || player.receiving_yards || "—")}</b><small>REC YDS</small></div><div><b>${esc(player.tgt || player.targets || "—")}</b><small>TARGETS</small></div></div></section><section class="drawer-section"><div class="drawer-heading"><b>PROJECTION SOURCES</b><span>${esc(rangeLabel(player))}</span></div>${sourceRows}</section><section class="drawer-section"><div class="drawer-heading"><b>SPORTSBOOK ODDS</b><span>${esc(oddsLabel(player))}</span></div>${oddsRows}</section><p class="drawer-disclaimer">Informational only. Lines can move, disappear, or be delayed by a provider. Biggest difference means the largest absolute gap from the current median.</p>`;
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
    if (oddsStatus) oddsStatus.textContent = sourceStats().oddsBooks ? `${sourceStats().oddsBooks} ODDS BOOKS` : "ODDS RANGE PENDING";
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
  }

  async function refresh() {
    try {
      const [sleeper, espn, consensus, scoreboard] = await Promise.all([loadSleeper(), loadESPN(), loadConsensus(), loadScoreboard()]);
      state.sleeper = sleeper;
      state.espn = espn;
      state.consensus = consensus;
      state.scoreboard = scoreboard.events || [];
      state.week = sleeper.week || state.week;
      state.error = "";
    } catch (error) {
      state.error = error && error.message || "Live feed unavailable";
      if (!state.consensus) state.consensus = { status: "unavailable", players: {}, sources: [], insights: [] };
    }
    state.loading = false;
    state.refreshedAt = new Date();
    render();
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

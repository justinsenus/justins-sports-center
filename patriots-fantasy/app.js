(() => {
  "use strict";

  /*
   * This page is intentionally a static GitHub Pages app. Sleeper's read-only
   * endpoints can be called from the browser; ESPN private-league credentials
   * are never placed in this file. The ESPN tab clearly reports when a secure
   * connector is needed instead of exposing a login or cookie.
   */
  const CONFIG = {
    season: "2026",
    sleeperLeagueId: "1387635903379300352",
    sleeperOwnerId: "1137609122398482432",
    sleeperTeamName: "The Big Senus",
    espnLeagueId: "919590140",
    espnTeamName: "Gumby's Big D",
    refreshMs: 20000,
    playersCacheMs: 12 * 60 * 60 * 1000,
    summaryCacheMs: 15000
  };

  const API = {
    sleeper: "https://api.sleeper.app/v1",
    scoreboard: () => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=1000&dates=${dateStamp()}`,
    patriotsSchedule: () => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/ne/schedule?season=${CONFIG.season}`,
    summary: (id) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(id)}`,
    espnLeague: () => `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${CONFIG.season}/segments/0/leagues/${CONFIG.espnLeagueId}?view=mSettings&view=mTeam&view=mRoster&view=mMatchup`
  };

  const state = {
    view: "sleeper",
    busy: false,
    connected: false,
    lastSync: null,
    week: 1,
    sleeper: null,
    players: {},
    scoreboardEvents: [],
    scheduleEvents: [],
    patriotsEvent: null,
    patriotsSummary: null,
    liveStats: new Map(),
    espn: { checked: false, data: null, error: null }
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
  const safeText = (value, fallback = "—") => value == null || value === "" ? fallback : String(value);
  const num = (value, fallback = "—") => `<span class="num">${esc(value == null || value === "" ? fallback : value)}</span>`;
  const pad = (value) => String(value).padStart(2, "0");
  const dateStamp = (date = new Date()) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const dateKey = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  const formatClock = (value = new Date()) => value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const formatDate = (value, includeTime = true) => {
    if (!value) return "DATE TBD";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "DATE TBD";
    const day = date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
    return includeTime ? `${day} • ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : day;
  };

  function setHTML(id, html) { const node = $(id); if (node) node.innerHTML = html; }
  function setText(id, value) { const node = $(id); if (node) node.textContent = value; }

  async function getJSON(url, options = {}) {
    const response = await fetch(url, { cache: "no-store", credentials: "omit", ...options });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  }

  async function cachedPlayers() {
    const key = "justin-patriots-fantasy-players-v1";
    try {
      const cached = JSON.parse(localStorage.getItem(key) || "null");
      if (cached && cached.saved && Date.now() - cached.saved < CONFIG.playersCacheMs && cached.data) return cached.data;
    } catch (_) { /* Storage is optional. */ }
    const data = await getJSON(`${API.sleeper}/players/nfl`);
    try { localStorage.setItem(key, JSON.stringify({ saved: Date.now(), data })); } catch (_) { /* Large player maps may exceed storage. */ }
    return data;
  }

  function normalizeName(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function normalizeKey(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function teamLogo(abbr) {
    const code = String(abbr || "nfl").toLowerCase();
    return `https://a.espncdn.com/i/teamlogos/nfl/500/${encodeURIComponent(code)}.png`;
  }
  function teamAbbrFromCompetitor(competitor) { return competitor && competitor.team && (competitor.team.abbreviation || competitor.team.shortDisplayName) || "NFL"; }
  function competitors(event) { return event && event.competitions && event.competitions[0] && event.competitions[0].competitors || []; }
  function competition(event) { return event && event.competitions && event.competitions[0] || {}; }
  function eventState(event) {
    const status = competition(event).status || event && event.status || {};
    const type = status.type || status;
    const stateName = String(type.state || "").toLowerCase();
    return { live: stateName === "in", final: stateName === "post", upcoming: stateName === "pre", type, status };
  }
  function eventTeams(event) { return competitors(event).map((c) => teamAbbrFromCompetitor(c)); }
  function hasTeam(event, abbr) { return eventTeams(event).some((team) => String(team).toUpperCase() === String(abbr).toUpperCase()); }
  function eventDate(event) { return new Date(event && event.date || 0).getTime() || 0; }
  function sortByDate(events, direction = 1) { return [...events].sort((a, b) => direction * (eventDate(a) - eventDate(b))); }

  function findPatriotsEvent(events) {
    const pats = events.filter((event) => hasTeam(event, "NE") || competitors(event).some((c) => String(c.team && c.team.id) === "17"));
    if (!pats.length) return null;
    const live = pats.find((event) => eventState(event).live);
    if (live) return live;
    const today = dateKey(new Date());
    const todays = pats.filter((event) => dateKey(event.date) === today);
    const finishedToday = todays.filter((event) => eventState(event).final);
    if (finishedToday.length) return finishedToday[finishedToday.length - 1];
    const upcoming = pats.filter((event) => eventState(event).upcoming && eventDate(event) >= Date.now());
    return sortByDate(upcoming)[0] || sortByDate(pats, -1)[0] || null;
  }

  function findNextPatriotsEvent(events) {
    return sortByDate(events.filter((event) => (hasTeam(event, "NE") || competitors(event).some((c) => String(c.team && c.team.id) === "17")) && eventState(event).upcoming && eventDate(event) >= Date.now()))[0] || null;
  }

  function bostonLikeName(team) {
    const location = team && team.location || team && team.locationName || "";
    const name = team && (team.displayName || team.name || team.shortDisplayName) || "TEAM";
    return location && !name.toLowerCase().startsWith(String(location).toLowerCase()) ? `${location} ${name}` : name;
  }

  function recordsFor(competitor) {
    const records = competitor && competitor.records || [];
    const summary = records.find((record) => record.type === "total") || records[0];
    return summary && (summary.summary || summary.displayValue) || "—";
  }

  function displayPeriod(value) {
    const period = Number(value || 0);
    return period > 0 ? `Q${period}` : "GAME";
  }

  function scoreValue(competitor, upcoming) {
    return upcoming ? "—" : safeText(competitor && competitor.score, "0");
  }

  function competitorBySide(event, side) { return competitors(event).find((c) => c.homeAway === side) || {}; }
  function patriotsCompetitor(event) { return competitors(event).find((c) => String(c.team && c.team.abbreviation).toUpperCase() === "NE" || String(c.team && c.team.id) === "17") || {}; }
  function opponentCompetitor(event) { return competitors(event).find((c) => c !== patriotsCompetitor(event)) || {}; }

  function situationFrom(summary, event) {
    const situation = summary && summary.header && summary.header.competitions && summary.header.competitions[0] && summary.header.competitions[0].situation || competition(event).situation || {};
    const possessionId = situation.possession;
    const possession = competitors(event).find((c) => String(c.id) === String(possessionId));
    const down = situation.down && situation.distance ? `DOWN ${situation.down} & ${situation.distance}` : "";
    const toGo = situation.downDistanceText || "";
    return { possession: possession ? teamAbbrFromCompetitor(possession) : "—", down: toGo || down || "—", yardLine: situation.possessionText || situation.yardLine || "" };
  }

  function teamStats(summary, teamId) {
    const teams = summary && summary.boxscore && summary.boxscore.teams || [];
    const data = teams.find((item) => String(item.team && item.team.id) === String(teamId)) || {};
    const map = {};
    (data.statistics || []).forEach((item) => { map[normalizeKey(item.name)] = item.displayValue != null ? item.displayValue : item.value; });
    return {
      firstDowns: map.firstdowns || map.firstdown || "—",
      yards: map.totalyards || map.totalyard || "—",
      turnovers: map.turnovers || "—"
    };
  }

  function renderScoreBox(event, summary) {
    if (!event) {
      setHTML("scoreBox", `<div class="score-topline"><div class="score-title">JUSTIN'S PATRIOTS LIVE</div><span class="state-pill">NO SCHEDULE FOUND</span><span class="sample-pill">RETRYING LIVE FEED</span></div><div class="empty-state">PATRIOTS SCHEDULE WILL RETRY AUTOMATICALLY</div>`);
      return;
    }
    const status = eventState(event);
    const home = competitorBySide(event, "home");
    const away = competitorBySide(event, "away");
    const pats = patriotsCompetitor(event);
    const opp = opponentCompetitor(event);
    const patsIsHome = pats === home;
    const upcoming = status.upcoming;
    const detail = status.type.detail || status.type.shortDetail || (upcoming ? formatDate(event.date) : status.final ? "FINAL" : "LIVE NOW");
    const situation = situationFrom(summary, event);
    const patsStats = summary ? teamStats(summary, pats.id) : { firstDowns: "—", yards: "—", turnovers: "—" };
    const oppStats = summary ? teamStats(summary, opp.id) : { firstDowns: "—", yards: "—", turnovers: "—" };
    const possession = status.live && situation.possession !== "—" ? `POSSESSION • ${situation.possession}` : (patsIsHome ? "HOME GAME" : "AWAY GAME");
    const stateLabel = status.live ? `${displayPeriod(competition(event).status && competition(event).status.period)} • ${safeText(competition(event).status && competition(event).status.displayClock, "LIVE")}` : status.final ? "FINAL" : "NEXT GAME";
    const pillClass = status.live ? "live" : status.final ? "final" : "";
    setHTML("scoreBox", `
      <div class="score-topline"><div class="score-title">JUSTIN'S PATRIOTS LIVE</div><span class="state-pill ${pillClass}">${esc(stateLabel)}</span><span class="sample-pill">READ-ONLY LIVE FEED</span></div>
      <div class="score-main">
        <div class="team-side ${patsIsHome ? "home" : "away"}">
          <img class="team-logo" src="${teamLogo(teamAbbrFromCompetitor(pats))}" alt="New England Patriots logo">
          <div class="team-copy"><div class="team-name">NEW ENGLAND PATRIOTS</div><div class="team-record">${patsIsHome ? "HOME" : "AWAY"} • ${esc(recordsFor(pats))}</div></div>
          <div class="score-stack"><div class="score-label">NE SCORE</div><div class="score-number">${num(scoreValue(pats, upcoming))}</div></div>
        </div>
        <div class="score-center">
          <div class="game-state">${esc(stateLabel)}</div>
          <div class="game-detail">${esc(detail)}</div>
          <div class="score-stats">
            <div class="score-stat"><div class="score-stat-label">NE YDS</div><div class="score-stat-value">${num(patsStats.yards)}</div></div>
            <div class="score-stat"><div class="score-stat-label">OPP YDS</div><div class="score-stat-value">${num(oppStats.yards)}</div></div>
            <div class="score-stat"><div class="score-stat-label">TO</div><div class="score-stat-value">${num(patsStats.turnovers)}</div></div>
          </div>
          <div class="score-notes">${esc(possession)}${status.live && situation.down !== "—" ? ` • ${esc(situation.down)}` : ""}</div>
        </div>
        <div class="team-side ${patsIsHome ? "away" : "home"}">
          <img class="team-logo" src="${teamLogo(teamAbbrFromCompetitor(opp))}" alt="${esc(bostonLikeName(opp.team || {}))} logo">
          <div class="team-copy"><div class="team-name">${esc(bostonLikeName(opp.team || {}))}</div><div class="team-record">${patsIsHome ? "AWAY" : "HOME"} • ${esc(recordsFor(opp))}</div></div>
          <div class="score-stack"><div class="score-label">${esc(teamAbbrFromCompetitor(opp))} SCORE</div><div class="score-number">${num(scoreValue(opp, upcoming))}</div></div>
        </div>
      </div>`);
  }

  function sleeperRoster() {
    const data = state.sleeper;
    if (!data) return null;
    const users = data.users || [];
    const named = users.find((user) => String(user.metadata && user.metadata.team_name || "").trim().toLowerCase() === CONFIG.sleeperTeamName.toLowerCase());
    const user = named || users.find((candidate) => String(candidate.user_id) === CONFIG.sleeperOwnerId);
    const ownerId = user && user.user_id || CONFIG.sleeperOwnerId;
    return (data.rosters || []).find((roster) => String(roster.owner_id) === String(ownerId)) || (data.rosters || []).find((roster) => Number(roster.roster_id) === 11) || null;
  }

  function rosterPlayerIds(roster) {
    const starters = new Set((roster && roster.starters || []).map(String));
    const all = (roster && roster.players || []).map(String);
    return [...all].sort((a, b) => Number(starters.has(b)) - Number(starters.has(a)));
  }

  function playerEvent(player) {
    const team = player && (player.team || player.player_id || "");
    return state.scoreboardEvents.find((event) => hasTeam(event, team)) || state.scheduleEvents.find((event) => hasTeam(event, team) && eventState(event).upcoming) || null;
  }

  function playerStatus(player) {
    if (player && player.injury_status) return String(player.injury_status).toUpperCase();
    const event = playerEvent(player);
    if (!event) return "NO GAME";
    const status = eventState(event);
    return status.live ? "LIVE" : status.final ? "FINAL" : "NEXT";
  }

  function findLiveStat(player) {
    if (!player) return null;
    const direct = state.liveStats.get(String(player.player_id || player.id));
    if (direct) return direct;
    const wanted = normalizeName(player.full_name);
    for (const value of state.liveStats.values()) if (normalizeName(value.name) === wanted && (!player.team || !value.team || player.team === value.team)) return value;
    return null;
  }

  function statFrom(stats, aliases) {
    if (!stats) return null;
    const keys = Object.keys(stats);
    for (const alias of aliases) {
      const target = normalizeKey(alias);
      const key = keys.find((candidate) => normalizeKey(candidate) === target || normalizeKey(candidate).includes(target));
      if (key != null && stats[key] != null && stats[key] !== "") return stats[key];
    }
    return null;
  }

  function compactValue(value) {
    if (value == null || value === "") return null;
    const text = String(value);
    return text.includes(".") ? Number(text).toFixed(1).replace(/\.0$/, "") : text;
  }

  function statLine(player, live) {
    if (!live || !live.stats) return playerEvent(player) && eventState(playerEvent(player)).live ? "LIVE • STAT LINE PENDING" : "NO LIVE STATS";
    const s = live.stats;
    const parts = [];
    const add = (label, value) => { const compact = compactValue(value); if (compact != null) parts.push(`${compact} ${label}`); };
    const pos = String(player.position || "").toUpperCase();
    if (pos === "QB") {
      const combined = statFrom(s, ["completions/attempts", "catt", "compatt"]);
      const split = combined != null && String(combined).includes("/") ? String(combined).split("/") : [];
      const c = statFrom(s, ["completions", "complete", "cmp"]) || split[0], a = statFrom(s, ["attempts", "passAttempts", "att"]) || split[1];
      if (c != null || a != null) parts.push(`${compactValue(c) || "—"}/${compactValue(a) || "—"} C/ATT`);
      add("YDS", statFrom(s, ["passingYards", "passYards", "yards", "yds"])); add("TD", statFrom(s, ["passingTouchdowns", "passTouchdowns", "touchdowns", "td"])); add("INT", statFrom(s, ["interceptions", "interception", "int"]));
    } else if (pos === "RB") {
      add("CAR", statFrom(s, ["rushingAttempts", "rushAttempts", "carries", "car"])); add("RUSH YDS", statFrom(s, ["rushingYards", "rushYards", "rushingyds"])); add("REC", statFrom(s, ["receptions", "rec"])); add("REC YDS", statFrom(s, ["receivingYards", "recYards"])); add("TD", statFrom(s, ["rushingTouchdowns", "receivingTouchdowns", "touchdowns", "td"]));
    } else if (pos === "WR" || pos === "TE") {
      add("TGT", statFrom(s, ["targets", "target"])); add("REC", statFrom(s, ["receptions", "rec"])); add("YDS", statFrom(s, ["receivingYards", "recYards", "yards", "yds"])); add("TD", statFrom(s, ["receivingTouchdowns", "touchdowns", "td"]));
    } else if (pos === "K") {
      add("FG", statFrom(s, ["fieldGoalsMade", "fgMade", "fg"])); add("XP", statFrom(s, ["extraPointsMade", "xpm"])); add("PTS", statFrom(s, ["points", "totalPoints"]));
    } else if (pos === "DEF") {
      add("SACK", statFrom(s, ["sacks", "defensiveSacks"])); add("INT", statFrom(s, ["interceptions", "defensiveInterceptions"])); add("FF", statFrom(s, ["forcedFumbles", "ff"])); add("TD", statFrom(s, ["defensiveTouchdowns", "td"]));
    }
    return parts.length ? parts.slice(0, 5).join(" • ") : "LIVE • STAT LINE PENDING";
  }

  function renderFantasy() {
    if (state.view === "espn") { renderESPN(); return; }
    const data = state.sleeper;
    const roster = sleeperRoster();
    if (!data || !roster) {
      setText("fantasyMeta", "UNAVAILABLE");
      setHTML("fantasyContent", `<div class="empty-state">SLEEPER ROSTER COULD NOT BE LOADED • RETRYING</div>`);
      return;
    }
    const players = data.players || state.players || {};
    const matchup = data.matchup || {};
    const pointsMap = matchup.players_points || {};
    const starters = new Set((roster.starters || []).map(String));
    const ids = rosterPlayerIds(roster);
    const total = Number(matchup.points || 0);
    const starterPoints = ids.filter((id) => starters.has(id)).reduce((sum, id) => sum + Number(pointsMap[id] || 0), 0);
    const injured = ids.filter((id) => players[id] && players[id].injury_status).length;
    const liveCount = ids.filter((id) => playerStatus({ ...(players[id] || {}), player_id: id }) === "LIVE").length;
    setText("fantasySubheading", CONFIG.sleeperTeamName.toUpperCase());
    setText("fantasyMeta", `WEEK ${state.week} • ${liveCount ? `${liveCount} LIVE` : "PREVIEW"}`);
    const summary = `<div class="fantasy-summary"><div class="summary-card"><div class="summary-label">WEEK ${esc(state.week)} TOTAL</div><div class="summary-value red">${num(total.toFixed(1))}</div></div><div class="summary-card"><div class="summary-label">STARTERS</div><div class="summary-value">${num(starterPoints.toFixed(1))}</div></div><div class="summary-card"><div class="summary-label">STATUS</div><div class="summary-value ${injured ? "" : "green"}">${injured ? num(injured) + " INJ" : "READY"}</div></div></div>`;
    const rows = ids.map((id) => {
      const player = players[id] || { full_name: id, position: "—", team: "—" };
      const enriched = { ...player, player_id: id };
      const live = findLiveStat(enriched);
      const status = playerStatus(enriched);
      const isStarter = starters.has(id);
      const points = pointsMap[id] == null ? 0 : Number(pointsMap[id]);
      const injury = player.injury_status ? " alert" : "";
      const role = isStarter ? "STARTER" : "BENCH";
      const statusText = player.injury_status ? `${String(player.injury_status).toUpperCase()}${player.injury_body_part ? ` • ${player.injury_body_part}` : ""}` : status;
      return `<article class="fantasy-row ${isStarter ? "starter" : "bench"}${injury}"><div class="player-chip">${esc(player.position || "—")}</div><div class="player-copy"><div class="player-name">${esc(player.full_name || id)}</div><div class="player-meta">${esc(player.team || "FA")} • ${esc(role)} • ${esc(statusText)}</div></div><div class="fantasy-points">${num(points.toFixed(1))}<small>PTS</small></div><div class="player-line">${esc(statLine(enriched, live))}</div></article>`;
    }).join("");
    setHTML("fantasyContent", summary + `<div class="fantasy-grid">${rows || `<div class="empty-state">NO PLAYERS FOUND</div>`}</div><div class="source-note">Sleeper roster, scoring rules, matchup points, and player status are read-only. Live player stat lines appear as their NFL games update.</div>`);
  }

  function renderESPN() {
    setText("fantasySubheading", CONFIG.espnTeamName.toUpperCase());
    setText("fantasyMeta", state.espn.data ? "CONNECTED" : "AUTH NEEDED");
    if (state.espn.data) {
      const teams = state.espn.data.teams || [];
      const team = teams.find((candidate) => String(candidate.name || "").toLowerCase().includes("gumby")) || teams[0];
      setHTML("fantasyContent", `<div class="fantasy-summary"><div class="summary-card"><div class="summary-label">ESPN TEAM</div><div class="summary-value red">${esc(team && team.name || CONFIG.espnTeamName)}</div></div><div class="summary-card"><div class="summary-label">SEASON</div><div class="summary-value">${num(CONFIG.season)}</div></div><div class="summary-card"><div class="summary-label">STATUS</div><div class="summary-value green">CONNECTED</div></div></div><div class="empty-state">ESPN ROSTER DATA IS AVAILABLE • PLAYER DETAIL VIEW WILL POPULATE ON THE NEXT REFRESH</div>`);
      return;
    }
    setHTML("fantasyContent", `<div class="espn-lock"><h3>ESPN LEAGUE SYNC NEEDS A SECURE CONNECTION</h3><p>This league can stay in the dashboard, but private ESPN roster data should not be exposed in a public GitHub file. The Patriots game feed and Sleeper league remain live here. Add a secure connector or import the ESPN roster/scoring settings to turn this tab on.</p><div class="espn-id">LEAGUE <span class="num">${esc(CONFIG.espnLeagueId)}</span> • ${esc(CONFIG.season)} • ${esc(CONFIG.espnTeamName)}</div></div><div class="source-note">No ESPN password, login cookie, or token is stored in this dashboard.</div>`);
  }

  function renderPatriotsPulse(event, summary) {
    if (!event) {
      setText("patriotsMeta", "WAITING");
      setHTML("patriotsContent", `<div class="empty-state">PATRIOTS INFO WILL APPEAR WHEN THE 2026 SCHEDULE FEED RESPONDS</div>`);
      return;
    }
    const status = eventState(event);
    const pats = patriotsCompetitor(event);
    const opp = opponentCompetitor(event);
    const situation = situationFrom(summary, event);
    const next = findNextPatriotsEvent(state.scheduleEvents);
    const nextOpp = next ? opponentCompetitor(next) : null;
    setText("patriotsMeta", status.live ? "LIVE NOW" : status.final ? "FINAL" : "NEXT GAME");
    const record = recordsFor(pats);
    const eventLabel = status.live ? `${displayPeriod(competition(event).status && competition(event).status.period)} • ${safeText(competition(event).status && competition(event).status.displayClock, "LIVE")}` : status.final ? "FINAL" : formatDate(event.date);
    const nextMarkup = next && nextOpp ? `<div class="patriots-next"><img src="${teamLogo(teamAbbrFromCompetitor(nextOpp))}" alt=""><div class="next-copy"><div class="next-title">NEXT PATRIOTS MATCHUP</div><div class="next-matchup">${esc(teamAbbrFromCompetitor(nextOpp))} • ${esc(bostonLikeName(nextOpp.team || {}))}</div><div class="next-date">${esc(formatDate(next.date))}</div></div></div>` : `<div class="patriots-next"><img src="${teamLogo("ne")}" alt=""><div class="next-copy"><div class="next-title">NEXT PATRIOTS MATCHUP</div><div class="next-matchup">SCHEDULE FEED WILL UPDATE</div><div class="next-date">RETRYING AUTOMATICALLY</div></div></div>`;
    setHTML("patriotsContent", `<div class="pulse-grid"><div class="pulse-card"><div class="pulse-label">GAME STATUS</div><div class="pulse-value">${esc(eventLabel)}</div></div><div class="pulse-card"><div class="pulse-label">RECORD</div><div class="pulse-value num">${esc(record)}</div></div><div class="pulse-card"><div class="pulse-label">POSSESSION</div><div class="pulse-value">${esc(status.live ? situation.possession : (pats === competitorBySide(event, "home") ? "HOME" : "AWAY"))}</div></div><div class="pulse-card"><div class="pulse-label">OPPONENT</div><div class="pulse-value">${esc(teamAbbrFromCompetitor(opp))}</div></div></div>${nextMarkup}<div class="patriots-note">${status.live && situation.down !== "—" ? esc(situation.down) : esc((competition(event).broadcasts || [])[0] && (competition(event).broadcasts || [])[0].names && (competition(event).broadcasts || [])[0].names[0] || "Patriots game center")}</div>`);
  }

  function summaryPlayAlerts(summary) {
    const plays = summary && (summary.scoringPlays || summary.plays) || [];
    return plays.filter((play) => play.scoringPlay !== false || /touchdown|field goal|safety|extra point/i.test(play.text || play.shortText || play.type && play.type.text || "")).slice(-4).reverse().map((play) => ({ type: "score", title: play.text || play.shortText || play.type && play.type.text || "Scoring play", detail: play.period && play.clock ? `${displayPeriod(play.period.number)} • ${play.clock.displayValue || play.clock}` : "PATRIOTS GAME", time: play.clock && (play.clock.displayValue || play.clock) || "NOW" }));
  }

  function fantasyInjuryAlerts() {
    const roster = sleeperRoster();
    const players = state.players || {};
    if (!roster) return [];
    return (roster.players || []).map(String).map((id) => players[id] && { id, player: players[id] }).filter((item) => item && item.player && item.player.injury_status).slice(0, 5).map((item) => ({ type: "injury", title: `${item.player.full_name} • ${String(item.player.injury_status).toUpperCase()}`, detail: item.player.injury_body_part ? `${item.player.team || "FA"} • ${item.player.injury_body_part}` : `${item.player.team || "FA"} • fantasy roster`, time: "STATUS" }));
  }

  function renderAlerts(summary) {
    const alerts = [...summaryPlayAlerts(summary), ...fantasyInjuryAlerts()];
    setText("alertsMeta", alerts.length ? `${alerts.length} UPDATES` : "REFRESH 20S");
    if (!alerts.length) {
      setHTML("alertsContent", `<div class="empty-state">NO NEW SCORING OR INJURY ALERTS<br><span class="source-note">LIVE WATCH REMAINS ON</span></div>`);
      return;
    }
    setHTML("alertsContent", `<div class="alert-list">${alerts.slice(0, 6).map((alert) => `<div class="alert-row ${esc(alert.type)}"><span class="alert-pin"></span><div class="alert-copy"><div class="alert-title">${esc(alert.title)}</div><div class="alert-detail">${esc(alert.detail)}</div></div><div class="alert-time">${esc(alert.time)}</div></div>`).join("")}</div><div class="source-note">Scoring alerts come from the Patriots game summary. Fantasy injury status comes from your Sleeper roster feed.</div>`);
  }

  function buildLiveStats(summaries) {
    state.liveStats = new Map();
    summaries.forEach((summary) => {
      const groups = summary && summary.boxscore && summary.boxscore.players || [];
      groups.forEach((group) => {
        const team = group.team && (group.team.abbreviation || group.team.shortDisplayName) || "";
        (group.statistics || []).forEach((block) => {
          const labels = block.labels || block.names || block.keys || [];
          (block.athletes || []).forEach((athlete) => {
            const name = athlete.athlete && (athlete.athlete.displayName || athlete.athlete.fullName || athlete.athlete.shortName) || athlete.name || "PLAYER";
            const id = athlete.athlete && athlete.athlete.id || athlete.id || name;
            const raw = Array.isArray(athlete.stats) ? Object.fromEntries(labels.map((label, index) => [label, athlete.stats[index]])) : (athlete.stats || athlete.statistics || {});
            const previous = state.liveStats.get(String(id)) || state.liveStats.get(normalizeName(name));
            const entry = { id: String(id), name, team, stats: { ...(previous && previous.stats || {}), ...raw }, group: block.name || (previous && previous.group) || "" };
            state.liveStats.set(String(id), entry);
            state.liveStats.set(`${normalizeName(name)}:${team}`, entry);
            state.liveStats.set(normalizeName(name), entry);
          });
        });
      });
    });
  }

  const summaryCache = new Map();
  async function loadSummary(event) {
    if (!event || !event.id || !eventState(event).live && !eventState(event).final) return null;
    const cached = summaryCache.get(String(event.id));
    if (cached && Date.now() - cached.saved < CONFIG.summaryCacheMs) return cached.data;
    try {
      const data = await getJSON(API.summary(event.id));
      summaryCache.set(String(event.id), { saved: Date.now(), data });
      return data;
    } catch (_) { return null; }
  }

  async function loadSleeper() {
    const [league, users, rosters, nflState, players] = await Promise.all([
      getJSON(`${API.sleeper}/league/${CONFIG.sleeperLeagueId}`),
      getJSON(`${API.sleeper}/league/${CONFIG.sleeperLeagueId}/users`),
      getJSON(`${API.sleeper}/league/${CONFIG.sleeperLeagueId}/rosters`),
      getJSON(`${API.sleeper}/state/nfl`),
      cachedPlayers()
    ]);
    state.week = Number(nflState && nflState.week || 1);
    const matchupList = await getJSON(`${API.sleeper}/league/${CONFIG.sleeperLeagueId}/matchups/${state.week}`);
    state.players = players || {};
    state.sleeper = { league, users, rosters, matchup: (matchupList || []).find((matchup) => Number(matchup.roster_id) === 11) || {}, players: state.players };
  }

  async function loadFootball() {
    const [scoreboard, schedule] = await Promise.all([getJSON(API.scoreboard()), getJSON(API.patriotsSchedule())]);
    state.scoreboardEvents = scoreboard && scoreboard.events || [];
    state.scheduleEvents = schedule && schedule.events || [];
    state.patriotsEvent = findPatriotsEvent(state.scoreboardEvents) || findNextPatriotsEvent(state.scheduleEvents);
    state.patriotsSummary = await loadSummary(state.patriotsEvent);
    const roster = sleeperRoster();
    const playerTeams = new Set(rosterPlayerIds(roster).map((id) => state.players[id] && state.players[id].team).filter(Boolean));
    const relevant = state.scoreboardEvents.filter((event) => eventState(event).live || eventState(event).final).filter((event) => eventTeams(event).some((team) => playerTeams.has(team)));
    const summaries = (await Promise.all(relevant.slice(0, 10).map(loadSummary))).filter(Boolean);
    buildLiveStats([state.patriotsSummary, ...summaries].filter(Boolean));
  }

  async function checkESPN() {
    if (state.espn.checked) return;
    state.espn.checked = true;
    try { state.espn.data = await getJSON(API.espnLeague()); } catch (error) { state.espn.error = error; }
  }

  async function refresh() {
    if (state.busy) return;
    state.busy = true;
    setText("connectionText", "UPDATING LIVE DATA");
    try {
      // Load the roster first so the football summary pass knows which player
      // games are relevant to this team.
      await loadSleeper();
      await loadFootball();
      state.connected = true;
      state.lastSync = new Date();
      $("connectionDot").className = "status-dot live";
      setText("connectionText", "LIVE DATA CONNECTED");
      renderScoreBox(state.patriotsEvent, state.patriotsSummary);
      renderPatriotsPulse(state.patriotsEvent, state.patriotsSummary);
      renderFantasy();
      renderAlerts(state.patriotsSummary);
      setText("lastSync", `SYNC ${formatClock(state.lastSync)}`);
      setText("newsTicker", state.patriotsEvent && eventState(state.patriotsEvent).live ? "PATRIOTS GAME CENTER LIVE • FANTASY ROSTER WATCH ACTIVE" : `PATRIOTS + FANTASY WATCH • WEEK ${state.week} • NEXT REFRESH ${CONFIG.refreshMs / 1000}S`);
    } catch (error) {
      console.error(error);
      state.connected = false;
      $("connectionDot").className = "status-dot offline";
      setText("connectionText", "RETRYING DATA FEED");
      setText("newsTicker", "ONE OR MORE LIVE FEEDS DID NOT RESPOND • RETRYING AUTOMATICALLY");
      setText("lastSync", "SYNC ERROR");
      if (!state.sleeper) setHTML("fantasyContent", `<div class="empty-state">LIVE DATA DID NOT RESPOND • RETRYING AUTOMATICALLY</div>`);
    } finally { state.busy = false; }
  }

  function tickClock() { setText("clock", formatClock()); }
  function chooseView(view) {
    state.view = view;
    $("sleeperTab").classList.toggle("active", view === "sleeper");
    $("espnTab").classList.toggle("active", view === "espn");
    $("sleeperTab").setAttribute("aria-selected", String(view === "sleeper"));
    $("espnTab").setAttribute("aria-selected", String(view === "espn"));
    if (view === "espn") checkESPN().finally(renderFantasy); else renderFantasy();
  }

  $("sleeperTab").addEventListener("click", () => chooseView("sleeper"));
  $("espnTab").addEventListener("click", () => chooseView("espn"));
  tickClock();
  setInterval(tickClock, 1000);
  refresh();
  setInterval(refresh, CONFIG.refreshMs);
})();

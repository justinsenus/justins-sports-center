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
    summaryCacheMs: 15000,
    injuryCacheMs: 2 * 60 * 1000
  };

  const API = {
    sleeper: "https://api.sleeper.app/v1",
    scoreboard: () => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=1000&dates=${dateStamp()}`,
    patriotsSchedule: () => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/ne/schedule?season=${CONFIG.season}`,
    summary: (id) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(id)}`,
    teamRoster: (id) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${encodeURIComponent(id)}?enable=roster`,
    news: () => "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=300",
    nflNews: () => "https://www.nfl.com/news/",
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
    injury: { saved: 0, byPlayer: new Map(), news: [], nflNews: [], teams: [] },
    espn: { checked: false, data: null, error: null },
    scoreValues: { patriots: null }
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

  async function getText(url, options = {}) {
    const response = await fetch(url, { cache: "no-store", credentials: "omit", ...options });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.text();
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

  function animateScore(node, key, rawValue, upcoming = false, decimals = 0) {
    if (!node) return;
    const next = upcoming ? null : Number(rawValue);
    const previous = state.scoreValues[key];
    const formatValue = (value) => decimals > 0 ? Number(value).toFixed(decimals) : String(Math.round(value));
    node.classList.remove("score-counting", "up", "down");
    if (!Number.isFinite(next)) {
      node.textContent = "—";
      state.scoreValues[key] = null;
      return;
    }
    if (previous == null || previous === next || typeof requestAnimationFrame !== "function") {
      node.textContent = formatValue(next);
      state.scoreValues[key] = next;
      return;
    }
    const direction = next > previous ? "up" : "down";
    node.classList.add("score-counting", direction);
    const start = performance.now();
    const duration = 900;
    const from = previous;
    const draw = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = formatValue(from + (next - from) * eased);
      if (progress < 1) requestAnimationFrame(draw);
      else {
        node.textContent = formatValue(next);
        node.classList.remove("score-counting", direction);
      }
    };
    state.scoreValues[key] = next;
    requestAnimationFrame(draw);
  }

  function scoreSpan(key, value, decimals = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return num("—");
    const display = numeric.toFixed(decimals);
    return `<span class="num fantasy-score-number" data-score-key="${esc(key)}" data-score-value="${display}">${display}</span>`;
  }

  function animateFantasyScores() {
    document.querySelectorAll(".fantasy-score-number").forEach((node) => {
      animateScore(node, node.getAttribute("data-score-key"), node.getAttribute("data-score-value"), false, 1);
    });
  }

  function scheduleCard(event) {
    const status = eventState(event);
    const away = competitorBySide(event, "away");
    const home = competitorBySide(event, "home");
    const label = status.live ? "LIVE" : status.final ? "FINAL" : "NEXT";
    const clock = status.live ? `${displayPeriod(competition(event).status && competition(event).status.period)} • ${safeText(competition(event).status && competition(event).status.displayClock, "LIVE")}` : status.final ? "" : formatDate(event.date, true);
    const score = (competitor) => status.upcoming ? "—" : safeText(competitor && competitor.score, "0");
    return `<article class="schedule-card ${status.live ? "live" : status.final ? "final" : "upcoming"}"><div class="schedule-card-top"><span class="schedule-card-state">${label}</span><span class="schedule-card-clock">${esc(clock)}</span></div><div class="schedule-team-row"><img src="${teamLogo(teamAbbrFromCompetitor(away))}" alt=""><span class="schedule-team-name">${esc(teamAbbrFromCompetitor(away))}</span><span class="schedule-team-score">${esc(score(away))}</span></div><div class="schedule-team-row"><img src="${teamLogo(teamAbbrFromCompetitor(home))}" alt=""><span class="schedule-team-name">${esc(teamAbbrFromCompetitor(home))}</span><span class="schedule-team-score">${esc(score(home))}</span></div></article>`;
  }

  function renderLiveSchedule(excludeEvent) {
    const events = sortByDate(state.scoreboardEvents.filter((event) => event !== excludeEvent), 1).sort((a, b) => Number(eventState(b).live) - Number(eventState(a).live)).slice(0, 9);
    if (!events.length) return `<div class="schedule-empty">NO OTHER NFL GAMES LIVE<br><span>FULL SCHEDULE RETURNS ON GAME DAY</span></div>`;
    return events.map(scheduleCard).join("");
  }

  function renderScoreBox(event, summary) {
    if (!event) {
      state.scoreValues.patriots = null;
      setHTML("scoreBox", `<div class="score-topline"><div class="score-title">JUSTIN'S PATRIOTS LIVE</div><span class="state-pill">NO GAME TODAY</span><span class="sample-pill">RETRYING LIVE FEED</span></div><div class="score-main"><div class="patriots-score-side"><div class="score-team-line"><img class="team-logo" src="${teamLogo("NE")}" alt="New England Patriots logo"><div><div class="score-team-abbr">NE</div><div class="score-team-name">NEW ENGLAND PATRIOTS</div><div class="score-team-record">SCORE WILL APPEAR LIVE</div></div><div class="score-stack"><div class="score-label">NE SCORE</div><div id="neScoreNumber" class="score-number">—</div></div></div><div class="score-opponent">NEXT PATRIOTS MATCHUP WILL LOAD FROM THE 2026 SCHEDULE</div></div><div class="live-schedule"><div class="schedule-heading">LIVE NFL SCHEDULE</div><div class="schedule-grid">${renderLiveSchedule(null)}</div></div></div>`);
      return;
    }
    const status = eventState(event);
    const pats = patriotsCompetitor(event);
    const opp = opponentCompetitor(event);
    const upcoming = status.upcoming;
    const situation = situationFrom(summary, event);
    const stateLabel = status.live ? `${displayPeriod(competition(event).status && competition(event).status.period)} • ${safeText(competition(event).status && competition(event).status.displayClock, "LIVE")}` : status.final ? "FINAL" : "NEXT GAME";
    const detail = status.type.detail || status.type.shortDetail || (upcoming ? formatDate(event.date) : status.final ? "GAME COMPLETE" : "LIVE NOW");
    const patsIsHome = pats === competitorBySide(event, "home");
    const opponentName = bostonLikeName(opp.team || {});
    const opponentAbbr = teamAbbrFromCompetitor(opp);
    const stats = summary ? teamStats(summary, pats.id) : { yards: "—", turnovers: "—" };
    const possession = status.live && situation.possession !== "—" ? `POSSESSION • ${situation.possession}` : patsIsHome ? "HOME GAME" : "AWAY GAME";
    const pillClass = status.live ? "live" : status.final ? "final" : "";
    setHTML("scoreBox", `<div class="score-topline"><div class="score-title">JUSTIN'S PATRIOTS LIVE</div><span class="state-pill ${pillClass}">${esc(stateLabel)}</span><span class="sample-pill">READ-ONLY LIVE FEED</span></div><div class="score-main"><div class="patriots-score-side"><div class="score-team-line"><img class="team-logo" src="${teamLogo("NE")}" alt="New England Patriots logo"><div><div class="score-team-abbr">NE ${patsIsHome ? "HOME" : "AWAY"}</div><div class="score-team-name">NEW ENGLAND PATRIOTS</div><div class="score-team-record">${esc(recordsFor(pats))}</div></div><div class="score-stack"><div class="score-label">NE SCORE</div><div id="neScoreNumber" class="score-number">${num(scoreValue(pats, upcoming))}</div></div></div><div class="score-state-line">${esc(stateLabel)} • ${esc(detail)}</div><div class="score-opponent">VS ${esc(opponentAbbr)} • ${esc(opponentName)}${status.live && situation.down !== "—" ? ` • ${esc(situation.down)}` : ""}</div><div class="score-stats"><div class="score-stat"><div class="score-stat-label">NE YDS</div><div class="score-stat-value">${num(stats.yards)}</div></div><div class="score-stat"><div class="score-stat-label">NE TO</div><div class="score-stat-value">${num(stats.turnovers)}</div></div><div class="score-stat"><div class="score-stat-label">${esc(possession.split(" • ")[0])}</div><div class="score-stat-value">${esc(status.live ? situation.possession : patsIsHome ? "HOME" : "AWAY")}</div></div></div></div><div class="live-schedule"><div class="schedule-heading">LIVE NFL SCHEDULE</div><div class="schedule-grid">${renderLiveSchedule(event)}</div></div></div>`);
    animateScore($("neScoreNumber"), "patriots", pats.score, upcoming);
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

  // ESPN's public team roster feed gives us headshots and the current injury
  // note. The IDs are stable, so the page can request only the teams represented
  // in the two rosters instead of loading an entire league injury database.
  const ESPN_TEAM_IDS = {
    ARI: 22, ATL: 1, BAL: 33, BUF: 2, CAR: 29, CHI: 3, CIN: 4, CLE: 5,
    DAL: 6, DEN: 7, DET: 8, GB: 9, HOU: 34, IND: 11, JAX: 30, KC: 12,
    LAC: 24, LAR: 14, LV: 13, MIA: 15, MIN: 16, NE: 17, NO: 18, NYG: 19,
    NYJ: 20, PHI: 21, PIT: 23, SF: 25, SEA: 26, TB: 27, TEN: 10, WAS: 28
  };

  function espnTeamId(abbr) { return ESPN_TEAM_IDS[String(abbr || "").toUpperCase()] || null; }

  function median(values) {
    const sorted = values.filter((value) => Number.isFinite(Number(value))).map(Number).sort((a, b) => a - b);
    if (!sorted.length) return 95;
    const middle = Math.floor(sorted.length / 2);
    return Math.round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
  }

  function probabilityForStatus(value) {
    const status = String(value || "").toUpperCase();
    if (!status) return null;
    if (/IR|INJURED RESERVE|OUT|PUP|NFI|SUSPENDED|DID NOT PLAY/.test(status)) return 0;
    if (/DOUBTFUL/.test(status)) return 20;
    if (/QUESTIONABLE|GAME[- ]TIME/.test(status)) return 55;
    if (/LIMITED|PARTIAL/.test(status)) return 65;
    if (/ACTIVE|FULL|CLEARED|PROBABLE|AVAILABLE|EXPECTED/.test(status)) return 95;
    return null;
  }

  function practiceSignal(player) {
    const participation = String(player && player.practice_participation || "").toUpperCase();
    const description = String(player && player.practice_description || "");
    const text = `${participation} ${description}`.toUpperCase();
    if (!text.trim()) return null;
    if (/DID NOT|DNP|NO PRACTICE|ABSENT|NOT PARTICIPAT|NOT CLEARED/.test(text)) return { value: 35, source: "SLEEPER PRACTICE" };
    if (/LIMITED|PARTIAL/.test(text)) return { value: 65, source: "SLEEPER PRACTICE" };
    if (/FULL|COMPLETE/.test(text)) return { value: 95, source: "SLEEPER PRACTICE" };
    return { value: 55, source: "SLEEPER PRACTICE" };
  }

  function newsMatchesFor(player) {
    const name = normalizeName(player && (player.full_name || player.display_name));
    if (!name || name.length < 5) return [];
    const feeds = [
      ...(state.injury && state.injury.news || []).map((article) => ({ ...article, source: article.source || "ESPN NEWS" })),
      ...(state.injury && state.injury.nflNews || []).map((article) => ({ ...article, source: article.source || "NFL NEWS" }))
    ];
    return feeds.filter((article) => {
      const published = article && article.published ? new Date(article.published).getTime() : 0;
      if (published && Date.now() - published > 21 * 24 * 60 * 60 * 1000) return false;
      return normalizeName(`${article && article.headline || ""} ${article && article.description || ""}`).includes(name);
    }).slice(0, 3);
  }

  function newsSignal(article) {
    const text = `${article && article.headline || ""} ${article && article.description || ""}`.toUpperCase();
    if (/RULED OUT|WON'T PLAY|WILL NOT PLAY|INACTIVE|OUT FOR|PLACED ON IR|INJURED RESERVE/.test(text)) return 5;
    if (/DOUBTFUL|NOT EXPECTED TO PLAY/.test(text)) return 20;
    if (/QUESTIONABLE|GAME[- ]TIME DECISION|LIMITED|DID NOT PRACTICE|SITS OUT|MISSES PRACTICE|NOT CLEARED/.test(text)) return 55;
    if (/WILL PLAY|EXPECTED TO PLAY|CLEARED|FULL PARTICIPANT|ACTIVE TODAY|AVAILABLE/.test(text)) return 90;
    return null;
  }

  function injuryReportFor(player) {
    const name = player && (player.full_name || player.display_name) || "Player";
    const entry = state.injury && state.injury.byPlayer && state.injury.byPlayer.get(normalizeName(name));
    const signals = [];
    const sources = [];
    const addSignal = (value, source) => {
      if (!Number.isFinite(Number(value))) return;
      signals.push({ value: Number(value), source });
      if (source && !sources.includes(source)) sources.push(source);
    };
    const sleeperStatus = String(player && player.injury_status || "").toUpperCase();
    if (sleeperStatus) addSignal(probabilityForStatus(sleeperStatus), "SLEEPER STATUS");
    else if (player && player.injury_body_part) addSignal(55, "SLEEPER STATUS");
    const practice = practiceSignal(player);
    if (practice) addSignal(practice.value, practice.source);

    const injury = entry && entry.injury;
    let injuryStatus = "";
    if (injury) {
      const statusValue = injury.status;
      const typeValue = injury.type;
      injuryStatus = typeof statusValue === "string" ? statusValue : statusValue && (statusValue.name || statusValue.text) || "";
      if (!injuryStatus) injuryStatus = typeof typeValue === "string" ? typeValue : typeValue && (typeValue.text || typeValue.name) || "";
    }
    if (injury) {
      const comment = [injuryStatus, injury.shortComment, injury.longComment, injury.details && injury.details.description].filter(Boolean).join(" ");
      const statusValue = probabilityForStatus(injuryStatus);
      const commentUpper = comment.toUpperCase();
      const commentValue = /FULL PARTICIPATION|CLEARED|WILL PLAY|EXPECTED TO PLAY/.test(commentUpper) ? 90 : /DID NOT PARTICIPATE|NOT CLEARED|HAS[N']?T PRACTICED|NO PRACTICE/.test(commentUpper) ? 35 : /LIMITED/.test(commentUpper) ? 65 : null;
      addSignal(statusValue != null ? statusValue : commentValue != null ? commentValue : 55, "ESPN INJURY");
    }

    const articles = newsMatchesFor(player);
    articles.forEach((article) => addSignal(newsSignal(article), article.source || "ESPN NEWS"));
    const probability = Math.max(0, Math.min(100, median(signals.map((signal) => signal.value))));
    const rawStatus = [sleeperStatus, injuryStatus].find((value) => /IR|OUT|PUP|NFI|DOUBTFUL|QUESTIONABLE|ACTIVE|PROBABLE|INJUR|LIMITED/.test(String(value || "").toUpperCase()));
    const flagged = Boolean(sleeperStatus || player && player.injury_body_part || injury || practice || articles.length);
    const status = rawStatus ? String(rawStatus).toUpperCase() : !flagged ? "READY" : probability < 25 ? "OUT / DOUBTFUL" : probability < 70 ? "QUESTIONABLE" : "LIMITED";
    const comments = [
      player && player.practice_description,
      injury && (injury.shortComment || injury.longComment),
      articles[0] && articles[0].headline
    ].filter(Boolean);
    const practiceNote = comments[0] || "No practice note posted";
    return {
      player,
      entry,
      probability,
      status,
      flagged,
      sources: sources.length ? sources : ["BASELINE"],
      signalCount: signals.length || 1,
      bodyPart: player && player.injury_body_part || injury && injury.type && (injury.type.text || injury.type.description) || "",
      practice: practiceNote,
      articles
    };
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

  function playerFace(player) {
    const id = player && (player.player_id || player.id);
    const name = player && (player.full_name || player.display_name) || "Player";
    const entry = state.injury && state.injury.byPlayer && state.injury.byPlayer.get(normalizeName(name));
    const sleeperPhoto = id && /^\d+$/.test(String(id)) ? `https://sleepercdn.com/content/nfl/players/thumb/${encodeURIComponent(id)}.jpg` : "";
    const espnPhoto = entry && entry.headshot || (player && player.espn_id ? `https://a.espncdn.com/i/headshots/nfl/players/full/${encodeURIComponent(player.espn_id)}.png` : "");
    const fallback = espnPhoto || "https://sleepercdn.com/images/v2/icons/player_default.webp";
    const source = sleeperPhoto || fallback;
    const fallbackMarkup = source !== fallback ? ` data-fallback="${esc(fallback)}"` : "";
    return `<span class="player-avatar"><img src="${esc(source)}" alt="${esc(name)}" loading="lazy"${fallbackMarkup}></span>`;
  }

  function rosterTeamName(rosterId, users) {
    const user = (users || []).find((candidate) => String(candidate.user_id) === String((state.sleeper && (state.sleeper.rosters || []).find((roster) => Number(roster.roster_id) === Number(rosterId)) || {}).owner_id));
    return user && user.metadata && user.metadata.team_name || user && user.display_name || `TEAM ${rosterId}`;
  }

  function renderPlayerRows(ids, players, pointsMap, starters, section, side = "own") {
    return ids.map((id) => {
      const player = players[id] || { full_name: id, position: "—", team: "FA", player_id: id };
      const enriched = { ...player, player_id: id };
      const live = findLiveStat(enriched);
      const status = playerStatus(enriched);
      const report = injuryReportFor(enriched);
      const points = Number(pointsMap[id] || 0);
      const injury = report.flagged ? " injury" : "";
      const statusText = report.flagged ? `${report.status}${report.bodyPart ? ` • ${report.bodyPart}` : ""}` : status;
      const statusClass = report.flagged ? " injury" : "";
      return `<article class="player-row${injury}">${playerFace(enriched)}<div class="player-copy"><div class="player-name">${esc(player.full_name || id)}</div><div class="player-meta">${esc(player.team || "FA")} • ${esc(player.position || "—")} • <span class="player-status${statusClass}">${esc(statusText)}</span></div></div><div class="player-points">${scoreSpan(`fantasy:${side}:player:${id}`, points, 1)}<small>PTS</small></div><div class="player-line">${esc(statLine(enriched, live))}</div></article>`;
    }).join("");
  }

  function truncate(value, length = 92) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > length ? `${text.slice(0, length - 1)}…` : text;
  }

  function injuryReportRow(report) {
    const player = report.player || {};
    const statusClass = /OUT|IR|PUP|NFI|DOUBTFUL/.test(report.status) ? "out" : report.probability < 70 ? "questionable" : "limited";
    const detail = [report.bodyPart, report.practice && `PRACTICE • ${truncate(report.practice, 76)}`].filter(Boolean).join(" • ") || "Practice note not posted";
    const chips = report.sources.map((source) => `<span class="source-chip">${esc(source)}</span>`).join("");
    return `<div class="injury-row"><div class="injury-avatar">${playerFace(player)}</div><div class="injury-copy"><div class="injury-name-line"><span class="injury-name">${esc(player.full_name || "Player")}</span><span class="injury-status ${statusClass}">${esc(report.status)}</span></div><div class="injury-detail">${esc(detail)}</div><div class="probability-track" aria-label="${esc(report.probability)} percent probability of playing"><span class="probability-fill" style="width:${report.probability}%"></span></div><div class="injury-source-row">${chips}<span class="signal-count">MEDIAN ${report.signalCount}</span></div></div><div class="probability-label"><strong>${num(report.probability, "0")}%</strong><small>PLAY</small></div></div>`;
  }

  function injuryReportMarkup(ids, players, sideLabel) {
    const reports = ids.map((id) => injuryReportFor({ ...(players[id] || { full_name: id, player_id: id }), player_id: id }));
    const flagged = reports.filter((report) => report.flagged).sort((a, b) => a.probability - b.probability).slice(0, 4);
    const reportRows = flagged.length ? flagged.map(injuryReportRow).join("") : `<div class="injury-clear"><span>NO CURRENT FLAGS</span><strong>95%+ PLAY PROBABILITY</strong></div>`;
    const extra = reports.filter((report) => report.flagged).length > flagged.length ? `<div class="injury-more">+${reports.filter((report) => report.flagged).length - flagged.length} MORE ROSTER FLAG${reports.filter((report) => report.flagged).length - flagged.length === 1 ? "" : "S"}</div>` : "";
    return `<section class="injury-report"><div class="injury-report-heading"><span>LIVE INJURY REPORT • ${esc(sideLabel)}</span><span>${flagged.length ? `${flagged.length} FLAG${flagged.length === 1 ? "" : "S"}` : "CLEAR"}</span></div>${reportRows}${extra}<div class="injury-footnote">MEDIAN OF AVAILABLE SIGNALS • SLEEPER PRACTICE + ESPN/NFL NEWS</div></section>`;
  }

  function wireAvatarFallbacks() {
    document.querySelectorAll(".player-avatar img[data-fallback]").forEach((image) => {
      if (image.dataset.fallbackBound) return;
      image.dataset.fallbackBound = "1";
      image.addEventListener("error", () => {
        const fallback = image.dataset.fallback;
        if (!fallback) {
          image.style.opacity = "0.24";
          return;
        }
        image.dataset.fallback = "";
        image.src = fallback;
      });
    });
  }

  function matchupMarkup(data, ownRoster, users, leagueName) {
    const own = data && data.matchup || {};
    const opponent = data && data.opponentMatchup || {};
    const ownName = leagueName || rosterTeamName(ownRoster && ownRoster.roster_id, users);
    const opponentName = opponent && opponent.roster_id ? rosterTeamName(opponent.roster_id, users) : "OPPONENT";
    const ownScore = Number(own.points || 0).toFixed(1);
    const opponentScore = opponent && opponent.points != null ? Number(opponent.points || 0).toFixed(1) : "—";
    const ownScoreMarkup = scoreSpan(`fantasy:matchup:${leagueName}:own`, ownScore, 1);
    const opponentScoreMarkup = opponentScore === "—" ? num("—") : scoreSpan(`fantasy:matchup:${leagueName}:opponent`, opponentScore, 1);
    return `<div class="matchup-card"><div class="matchup-team"><div class="matchup-team-label">YOUR TEAM</div><div class="matchup-team-name">${esc(ownName)}</div><div class="matchup-team-score">${ownScoreMarkup}</div></div><div class="matchup-vs">VS</div><div class="matchup-team away"><div class="matchup-team-label">OPPONENT</div><div class="matchup-team-name">${esc(opponentName)}</div><div class="matchup-team-score">${opponentScoreMarkup}</div></div><div class="matchup-meta">WEEK ${esc(state.week)} • ${own.matchup_id ? "MATCHUP LIVE" : "MATCHUP WAITING"}</div></div>`;
  }

  function rosterColumnMarkup(label, roster, players, pointsMap, side) {
    const ids = rosterPlayerIds(roster);
    const starters = (roster && roster.starters || []).map(String);
    const starterSet = new Set(starters);
    const bench = ids.filter((id) => !starterSet.has(id));
    const name = side === "own" ? CONFIG.sleeperTeamName : rosterTeamName(roster && roster.roster_id, state.sleeper && state.sleeper.users);
    const starterRows = renderPlayerRows(starters, players, pointsMap, starterSet, "STARTERS", side);
    const benchRows = renderPlayerRows(bench, players, pointsMap, starterSet, "BENCH", side);
    return `<section class="roster-side ${side}"><div class="roster-side-heading"><span class="roster-side-name">${esc(name)}</span><span class="roster-side-role">${esc(label)}</span></div><div class="roster-section"><div class="roster-section-heading"><span>STARTERS</span><span>${starters.length} SLOTS</span></div><div class="player-list">${starterRows || `<div class="empty-state">NO STARTERS FOUND</div>`}</div></div><div class="roster-section bench-section"><div class="roster-section-heading"><span>BENCH</span><span>${bench.length} PLAYERS</span></div><div class="player-list">${benchRows || `<div class="empty-state">BENCH EMPTY</div>`}</div></div>${injuryReportMarkup(ids, players, side === "own" ? "YOUR TEAM" : "OPPONENT")}</section>`;
  }

  function renderSleeperLeague() {
    const data = state.sleeper;
    const roster = sleeperRoster();
    if (!data || !roster) {
      setText("sleeperMeta", "UNAVAILABLE");
      setHTML("sleeperContent", `<div class="empty-state">SLEEPER ROSTER COULD NOT BE LOADED • RETRYING</div>`);
      return;
    }
    const players = data.players || state.players || {};
    const matchup = data.matchup || {};
    const opponentRoster = data.opponentRoster || (data.rosters || []).find((candidate) => Number(candidate.roster_id) === Number(data.opponentMatchup && data.opponentMatchup.roster_id)) || null;
    const pointsMap = matchup.players_points || {};
    const starters = (roster.starters || []).map(String);
    const starterSet = new Set(starters);
    const bench = (roster.players || []).map(String).filter((id) => !starterSet.has(id));
    const total = Number(matchup.points || 0);
    const starterPoints = starters.reduce((sum, id) => sum + Number(pointsMap[id] || 0), 0);
    const injured = [...starters, ...bench].filter((id) => players[id] && players[id].injury_status).length;
    const liveCount = [...starters, ...bench].filter((id) => playerStatus({ ...(players[id] || {}), player_id: id }) === "LIVE").length;
    setText("sleeperMeta", `WEEK ${state.week} • ${liveCount ? `${liveCount} LIVE` : "PREVIEW"}`);
    const summary = `<div class="league-summary"><div class="league-summary-card"><div class="league-summary-label">WEEK ${esc(state.week)} TOTAL</div><div class="league-summary-value red">${scoreSpan("fantasy:summary:total", total, 1)}</div></div><div class="league-summary-card"><div class="league-summary-label">STARTERS</div><div class="league-summary-value">${scoreSpan("fantasy:summary:starters", starterPoints, 1)}</div></div><div class="league-summary-card"><div class="league-summary-label">STATUS</div><div class="league-summary-value ${injured ? "" : "green"}">${injured ? `${num(injured)} INJ` : "READY"}</div></div></div>`;
    const opponentPointsMap = data.opponentMatchup && data.opponentMatchup.players_points || {};
    const opponentColumn = opponentRoster ? rosterColumnMarkup("MATCHUP OPPONENT", opponentRoster, players, opponentPointsMap, "opponent") : `<section class="roster-side opponent"><div class="roster-side-heading"><span class="roster-side-name">MATCHUP OPPONENT</span><span class="roster-side-role">WAITING</span></div><div class="empty-state">OPPONENT ROSTER WILL APPEAR WHEN THE MATCHUP FEED RESPONDS</div></section>`;
    setHTML("sleeperContent", `${summary}${matchupMarkup(data, roster, data.users, CONFIG.sleeperTeamName)}<div class="matchup-rosters">${rosterColumnMarkup("YOUR ROSTER", roster, players, pointsMap, "own")}${opponentColumn}</div><div class="league-note">Roster photos use the Sleeper player image CDN, with an official ESPN roster headshot fallback. Injury probability is a median estimate from available public practice plus ESPN and NFL news signals—not an official designation.</div>`);
  }

  function renderESPNLeague() {
    setText("espnMeta", state.espn.data ? "CONNECTED" : "AUTH NEEDED");
    const matchup = `<div class="matchup-card"><div class="matchup-team"><div class="matchup-team-label">YOUR TEAM</div><div class="matchup-team-name">${esc(CONFIG.espnTeamName)}</div><div class="matchup-team-score">${num("—")}</div></div><div class="matchup-vs">VS</div><div class="matchup-team away"><div class="matchup-team-label">OPPONENT</div><div class="matchup-team-name">ESPN MATCHUP</div><div class="matchup-team-score">${num("—")}</div></div><div class="matchup-meta">WEEK ${esc(state.week)} • ${state.espn.data ? "SECURE DATA READY" : "SECURE SYNC NEEDED"}</div></div>`;
    if (state.espn.data) {
      setHTML("espnContent", `${matchup}<div class="roster-section"><div class="roster-section-heading"><span>STARTERS</span><span>ESPN SYNC</span></div><div class="secure-note"><h3>ESPN DATA CONNECTION READY</h3><p>Your ESPN roster and scoring settings can populate this same starters/bench layout once the secure connector returns the league response.</p><div class="league-id">LEAGUE <span class="num">${esc(CONFIG.espnLeagueId)}</span> • ${esc(CONFIG.season)}</div></div></div><div class="league-note">No ESPN password, login cookie, or token is stored in this dashboard.</div>`);
      return;
    }
    setHTML("espnContent", `${matchup}<div class="secure-note"><h3>ESPN STARTERS + BENCH NEED A SECURE SYNC</h3><p>This public GitHub page cannot read a private ESPN league cookie. To make it load, use a trusted connector or import the roster/scoring response. A public ESPN league may load after you verify the league ID and season, but never paste a password into this page.</p><div class="league-id">LEAGUE <span class="num">${esc(CONFIG.espnLeagueId)}</span> • ${esc(CONFIG.season)} • ${esc(CONFIG.espnTeamName)}</div></div><div class="roster-section"><div class="roster-section-heading"><span>STARTERS + BENCH</span><span>WAITING</span></div><div class="empty-state">ESPN ROSTER WILL APPEAR AFTER SECURE SYNC</div></div><div class="league-note">No ESPN password, login cookie, or token is stored in this dashboard.</div>`);
  }

  function renderFantasy() {
    renderSleeperLeague();
    renderESPNLeague();
    wireAvatarFallbacks();
    animateFantasyScores();
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
    const matchup = (matchupList || []).find((candidate) => Number(candidate.roster_id) === 11) || {};
    const opponentMatchup = (matchupList || []).find((candidate) => candidate.matchup_id != null && String(candidate.matchup_id) === String(matchup.matchup_id) && Number(candidate.roster_id) !== 11) || {};
    const opponentRoster = (rosters || []).find((candidate) => Number(candidate.roster_id) === Number(opponentMatchup.roster_id)) || null;
    state.sleeper = { league, users, rosters, matchup, opponentMatchup, opponentRoster, matchups: matchupList || [], players: state.players };
  }

  async function loadInjuries() {
    if (state.injury.saved && Date.now() - state.injury.saved < CONFIG.injuryCacheMs) return;
    const roster = sleeperRoster();
    const opponent = state.sleeper && state.sleeper.opponentRoster;
    const ids = [...new Set([...rosterPlayerIds(roster), ...rosterPlayerIds(opponent)])];
    const teams = [...new Set(ids.map((id) => state.players[id] && String(state.players[id].team || "").toUpperCase()).filter((team) => espnTeamId(team)))];
    const byPlayer = new Map();
    const rosterResponses = await Promise.allSettled(teams.map(async (team) => ({ team, data: await getJSON(API.teamRoster(espnTeamId(team))) })));
    rosterResponses.forEach((result) => {
      if (result.status !== "fulfilled") return;
      const { team, data } = result.value;
      const athletes = data && data.team && (data.team.athletes || data.team.roster && data.team.roster.athletes) || data && data.athletes || [];
      athletes.forEach((athlete) => {
        const name = athlete && (athlete.fullName || athlete.displayName || athlete.shortName);
        const key = normalizeName(name);
        if (!key) return;
        const injuries = Array.isArray(athlete.injuries) ? athlete.injuries : [];
        byPlayer.set(key, {
          team,
          athlete,
          injury: injuries[0] || null,
          headshot: athlete.headshot && (athlete.headshot.href || athlete.headshot.original) || ""
        });
      });
    });
    let news = [];
    try {
      const newsPayload = await getJSON(API.news());
      news = newsPayload && newsPayload.articles || [];
    } catch (_) { /* News is an enhancement; injury status still renders. */ }
    let nflNews = [];
    try {
      const html = await getText(API.nflNews());
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const seen = new Set();
      const domNews = [...parsed.querySelectorAll('a[data-link_type="NEWS"]')].map((link) => {
        const headline = (link.getAttribute("title") || link.getAttribute("data-link_name") || link.textContent || "").replace(/\s+/g, " ").trim();
        const href = link.getAttribute("href") || "";
        return { headline, description: "", published: "", source: "NFL NEWS", href };
      });
      // The current NFL page also embeds its article cards in a streamed JSON
      // payload, so keep a small regex fallback for browsers that see no links
      // after parsing the HTML shell.
      const embeddedNews = [...html.matchAll(/\\?"title\\?":\\?"(.*?)(?:\\?"[,}])/g)].map((match) => ({
        headline: String(match[1] || "").replace(/\\"/g, '"').replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16))).replace(/\\\\/g, "\\").replace(/\s+/g, " ").trim(),
        description: "",
        published: "",
        source: "NFL NEWS",
        href: ""
      }));
      nflNews = [...domNews, ...embeddedNews].filter((article) => article.headline && !seen.has(article.headline) && seen.add(article.headline)).slice(0, 300);
    } catch (_) { /* NFL's HTML feed is optional when a browser blocks it. */ }
    state.injury = { saved: Date.now(), byPlayer, news, nflNews, teams };
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
      await Promise.all([loadFootball(), loadInjuries(), checkESPN()]);
      state.connected = true;
      state.lastSync = new Date();
      $("connectionDot").className = "status-dot live";
      setText("connectionText", "LIVE DATA CONNECTED");
      renderScoreBox(state.patriotsEvent, state.patriotsSummary);
      renderFantasy();
      setText("lastSync", `SYNC ${formatClock(state.lastSync)}`);
      setText("footerNote", state.patriotsEvent && eventState(state.patriotsEvent).live ? "PATRIOTS GAME CENTER LIVE • FANTASY ROSTER WATCH ACTIVE" : `PATRIOTS + FANTASY WATCH • WEEK ${state.week} • NEXT REFRESH ${CONFIG.refreshMs / 1000}S`);
    } catch (error) {
      console.error(error);
      state.connected = false;
      $("connectionDot").className = "status-dot offline";
      setText("connectionText", "RETRYING DATA FEED");
      setText("footerNote", "ONE OR MORE LIVE FEEDS DID NOT RESPOND • RETRYING AUTOMATICALLY");
      setText("lastSync", "SYNC ERROR");
      if (!state.sleeper) setHTML("sleeperContent", `<div class="empty-state">LIVE DATA DID NOT RESPOND • RETRYING AUTOMATICALLY</div>`);
    } finally { state.busy = false; }
  }

  function tickClock() { setText("clock", formatClock()); }
  tickClock();
  setInterval(tickClock, 1000);
  refresh();
  setInterval(refresh, CONFIG.refreshMs);
})();

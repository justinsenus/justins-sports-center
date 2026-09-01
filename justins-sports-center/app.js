const ESPN = {
  mlbScoreboard: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
  nflScoreboard: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
  mlbNews: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news",
  nflNews: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news",
  redSoxNews: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/bos/news",
  patriotsNews: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/ne/news"
};

const state = {
  mlb: { yesterday: [], today: [], tomorrow: [] },
  nfl: [],
  activeMlbDate: "today",
  news: []
};

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");

function ymd(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function shortDate(dateString) {
  const d = new Date(dateString);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function updateClock() {
  const now = new Date();
  $("clock").textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  $("dateLine").textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function competitionOf(event) {
  return event.competitions?.[0] || {};
}

function isFavorite(event) {
  const teams = competitionOf(event).competitors || [];
  return teams.some(c => ["BOS", "NE"].includes(c.team?.abbreviation));
}

function eventStatus(event) {
  const type = event.status?.type || {};
  return {
    state: type.state || "pre",
    detail: type.shortDetail || type.detail || "Scheduled",
    completed: Boolean(type.completed)
  };
}

function formatEvent(event) {
  const comp = competitionOf(event);
  const competitors = comp.competitors || [];
  const away = competitors.find(c => c.homeAway === "away") || competitors[0];
  const home = competitors.find(c => c.homeAway === "home") || competitors[1];
  const status = eventStatus(event);
  return { event, comp, away, home, status };
}

function teamLine(team) {
  if (!team) return "";
  const logo = team.team?.logo ? `<img src="${team.team.logo}" alt="">` : "";
  return `<div class="team-line">${logo}<span>${team.team?.abbreviation || team.team?.shortDisplayName || "TBD"}</span><span class="score-num">${team.score ?? ""}</span></div>`;
}

function renderGames(containerId, events, emptyText) {
  const el = $(containerId);
  if (!events?.length) {
    el.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return;
  }

  const ordered = [...events].sort((a, b) => {
    const aFav = isFavorite(a) ? 1 : 0;
    const bFav = isFavorite(b) ? 1 : 0;
    return bFav - aFav || new Date(a.date) - new Date(b.date);
  });

  el.innerHTML = ordered.map(e => {
    const { comp, away, home, status } = formatEvent(e);
    const live = status.state === "in";
    const statusClass = live ? "live-tag" : "";
    const note = live ? "LIVE" : status.completed ? "FINAL" : shortDate(e.date);
    const meta = live ? status.detail : status.completed ? status.detail : new Date(e.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `
      <div class="game-card ${isFavorite(e) ? "favorite" : ""}">
        <div class="team-col">
          ${teamLine(away)}
          ${teamLine(home)}
        </div>
        <div class="game-mid">
          ${live ? `<span class="${statusClass}">● LIVE</span>` : `<span>${note}</span>`}
          <div class="game-meta">${meta}</div>
        </div>
        <div class="game-meta" style="text-align:right">
          ${comp.venue?.fullName || ""}
        </div>
      </div>
    `;
  }).join("");
}

function findTeamEvent(events, abbr) {
  return events.find(e => competitionOf(e).competitors?.some(c => c.team?.abbreviation === abbr));
}

function renderPriority(teamAbbr, teamName, logo, event, targetId, fallbackText) {
  const target = $(targetId);
  if (!event) {
    target.innerHTML = `
      <div class="team-priority">
        <img src="${logo}" alt="${teamName}">
        <div>
          <div class="priority-name">${teamName}</div>
          <div class="priority-sub">${fallbackText}</div>
        </div>
        <div class="priority-score"><div class="big-score">—</div><div class="game-status upcoming">WATCHING SCHEDULE</div></div>
      </div>`;
    return;
  }

  const { away, home, status } = formatEvent(event);
  const mine = [away, home].find(c => c.team?.abbreviation === teamAbbr);
  const opp = mine === away ? home : away;
  const live = status.state === "in";
  const statusClass = live ? "live" : status.completed ? "final" : "upcoming";
  const score = status.completed || live ? `${mine?.score ?? "0"}–${opp?.score ?? "0"}` : "NEXT";
  const sub = status.completed
    ? `vs ${opp?.team?.displayName || "Opponent"}`
    : live
      ? `vs ${opp?.team?.displayName || "Opponent"}`
      : `${new Date(event.date).toLocaleDateString([], { month: "short", day: "numeric" })} · ${new Date(event.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  target.innerHTML = `
    <div class="team-priority">
      <img src="${mine?.team?.logo || logo}" alt="${teamName}">
      <div>
        <div class="priority-name">${teamName}</div>
        <div class="priority-sub">${sub}</div>
      </div>
      <div class="priority-score">
        <div class="big-score">${score}</div>
        <div class="game-status ${statusClass}">${live ? `● ${status.detail}` : status.completed ? "FINAL" : status.detail}</div>
      </div>
    </div>`;
}

function extractProbablePitcher(competitor) {
  const possible = [
    ...(competitor?.probables || []),
    ...(competitor?.probableAthletes || []),
    ...(competitor?.athletes || [])
  ];
  const p = possible[0];
  if (!p) return null;
  const athlete = p.athlete || p;
  return athlete.displayName || athlete.fullName || athlete.shortName || null;
}

function renderPitchingMatchup(events) {
  const redSoxEvents = events.filter(e => competitionOf(e).competitors?.some(c => c.team?.abbreviation === "BOS"));
  const upcoming = redSoxEvents
    .filter(e => !eventStatus(e).completed && eventStatus(e).state !== "in")
    .sort((a,b) => new Date(a.date) - new Date(b.date))[0];

  if (!upcoming) {
    $("pitchingMatchup").innerHTML = `<div class="empty-state">No upcoming Red Sox matchup found in the current schedule window.</div>`;
    return;
  }

  const { away, home } = formatEvent(upcoming);
  const bos = [away, home].find(c => c.team?.abbreviation === "BOS");
  const opp = bos === away ? home : away;
  const bosPitcher = extractProbablePitcher(bos) || "TBD";
  const oppPitcher = extractProbablePitcher(opp) || "TBD";

  $("pitchingMatchup").innerHTML = `
    <div class="matchup-head">${shortDate(upcoming.date).toUpperCase()} · ${competitionOf(upcoming).venue?.fullName || "VENUE TBD"}</div>
    <div class="matchup-teams">
      <div class="pitcher">
        <div class="pitcher-team">${away?.team?.abbreviation || "AWAY"}</div>
        <div class="pitcher-name">${extractProbablePitcher(away) || (away?.team?.abbreviation === "BOS" ? bosPitcher : oppPitcher)}</div>
        <div class="pitcher-note">PROBABLE STARTER</div>
      </div>
      <div class="vs">VS</div>
      <div class="pitcher right">
        <div class="pitcher-team">${home?.team?.abbreviation || "HOME"}</div>
        <div class="pitcher-name">${extractProbablePitcher(home) || (home?.team?.abbreviation === "BOS" ? bosPitcher : oppPitcher)}</div>
        <div class="pitcher-note">PROBABLE STARTER</div>
      </div>
    </div>
    <div class="matchup-time">${new Date(upcoming.date).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }).toUpperCase()}</div>`;
}

function articleArray(data) {
  return data.articles || data.feed || [];
}

function normalizeArticle(article, source) {
  return {
    title: article.headline || article.title || "Latest sports update",
    image: article.images?.[0]?.url || article.image?.url || "",
    source: article.source || source,
    published: article.published || article.lastModified || ""
  };
}

function renderNews(items) {
  const unique = [];
  const seen = new Set();
  for (const item of items) {
    if (!item?.title || seen.has(item.title)) continue;
    seen.add(item.title);
    unique.push(item);
  }
  $("newsFeed").innerHTML = unique.slice(0, 5).map(item => `
    <div class="news-item">
      ${item.image ? `<img src="${item.image}" alt="">` : `<div></div>`}
      <div>
        <div class="news-title">${item.title}</div>
        <div class="news-meta">${item.source || "SPORTS DESK"} ${item.published ? "· " + new Date(item.published).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}</div>
      </div>
    </div>
  `).join("") || `<div class="empty-state">No news loaded yet.</div>`;
}

function updateTicker() {
  const liveMlb = state.mlb[state.activeMlbDate]?.filter(e => eventStatus(e).state === "in") || [];
  const liveNfl = state.nfl.filter(e => eventStatus(e).state === "in");
  const games = [...liveMlb, ...liveNfl];

  const liveText = games.map(e => {
    const { away, home, status } = formatEvent(e);
    return `${away?.team?.abbreviation || ""} ${away?.score ?? 0} · ${home?.team?.abbreviation || ""} ${home?.score ?? 0} — ${status.detail}`;
  });

  const headlines = state.news.slice(0, 4).map(n => n.title);
  const parts = [
    liveText.length ? `LIVE SCORES: ${liveText.join("  •  ")}` : "NO LIVE GAMES RIGHT NOW — TRACKING UPCOMING MLB AND NFL ACTION",
    ...headlines
  ];
  $("tickerText").textContent = parts.join("  •  •  •  ");
}

async function loadAll() {
  $("mlbStatus").textContent = "UPDATING";
  $("nflStatus").textContent = "UPDATING";

  try {
    const [yesterday, today, tomorrow, nfl, mlbNews, nflNews, bosNews, neNews] = await Promise.all([
      fetchJSON(`${ESPN.mlbScoreboard}?dates=${ymd(-1)}`),
      fetchJSON(`${ESPN.mlbScoreboard}?dates=${ymd(0)}`),
      fetchJSON(`${ESPN.mlbScoreboard}?dates=${ymd(1)}`),
      fetchJSON(ESPN.nflScoreboard),
      fetchJSON(ESPN.mlbNews),
      fetchJSON(ESPN.nflNews),
      fetchJSON(ESPN.redSoxNews),
      fetchJSON(ESPN.patriotsNews)
    ]);

    state.mlb.yesterday = yesterday.events || [];
    state.mlb.today = today.events || [];
    state.mlb.tomorrow = tomorrow.events || [];
    state.nfl = nfl.events || [];

    state.news = [
      ...articleArray(bosNews).map(a => normalizeArticle(a, "RED SOX")),
      ...articleArray(neNews).map(a => normalizeArticle(a, "PATRIOTS")),
      ...articleArray(mlbNews).map(a => normalizeArticle(a, "MLB")),
      ...articleArray(nflNews).map(a => normalizeArticle(a, "NFL"))
    ];

    renderGames("mlbGames", state.mlb[state.activeMlbDate], "No MLB games found for this date.");
    renderGames("nflGames", state.nfl, "No NFL games found in the current schedule window.");

    const allMlb = [...state.mlb.yesterday, ...state.mlb.today, ...state.mlb.tomorrow];
    const redSoxEvent = findTeamEvent([
      ...state.mlb.today.filter(e => eventStatus(e).state === "in"),
      ...state.mlb.today,
      ...state.mlb.tomorrow,
      ...state.mlb.yesterday
    ], "BOS");
    const patriotsEvent = findTeamEvent(state.nfl, "NE");

    renderPriority("BOS", "BOSTON RED SOX", "https://a.espncdn.com/i/teamlogos/mlb/500/bos.png", redSoxEvent, "redSoxContent", "NO GAME IN CURRENT WINDOW");
    renderPriority("NE", "NEW ENGLAND PATRIOTS", "https://a.espncdn.com/i/teamlogos/nfl/500/ne.png", patriotsEvent, "patriotsContent", "NO GAME IN CURRENT NFL WINDOW");

    renderPitchingMatchup(allMlb);
    renderNews(state.news);
    updateTicker();

    $("mlbStatus").textContent = "LIVE";
    $("nflStatus").textContent = "LIVE";
    $("lastUpdated").textContent = `LAST SYNC — ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
  } catch (err) {
    console.error(err);
    $("mlbStatus").textContent = "RETRYING";
    $("nflStatus").textContent = "RETRYING";
    $("tickerText").textContent = "CONNECTION ISSUE — CHECK INTERNET ACCESS. DASHBOARD WILL RETRY AUTOMATICALLY.";
  }
}

document.querySelectorAll("[data-mlb-date]").forEach(button => {
  button.addEventListener("click", () => {
    state.activeMlbDate = button.dataset.mlbDate;
    document.querySelectorAll("[data-mlb-date]").forEach(b => b.classList.toggle("active", b === button));
    renderGames("mlbGames", state.mlb[state.activeMlbDate], "No MLB games found for this date.");
    updateTicker();
  });
});

updateClock();
setInterval(updateClock, 1000);
loadAll();
setInterval(loadAll, 30000);

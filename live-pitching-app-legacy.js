(() => {
  (() => {
    "use strict";
    const MLB = {
      schedule: "https://statsapi.mlb.com/api/v1/schedule",
      gameFeed: (pk) => `https://statsapi.mlb.com/api/v1.1/game/${pk}/feed/live`,
      person: (id, season) => `https://statsapi.mlb.com/api/v1/people/${id}?hydrate=${encodeURIComponent(`stats(group=[pitching],type=[season],season=${season})`)}`
    };
    const ESPN = {
      nflScores: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
      mlbScores: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
      mlbSummary: (id) => `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${id}`,
      nflSummary: (id) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`,
      mlbNews: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news",
      nflNews: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news",
      bosNews: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/bos/news",
      neNews: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/ne/news"
    };
    const BOS_ID = 111;
    const ROWS_PER_PAGE = 6;
    const RED_SOX_RED = "#ff2738";
    const TEAM_COLORS = {
      108: "#ff7580",
      109: "#ff6a71",
      110: "#ff8d40",
      111: RED_SOX_RED,
      112: "#81b6ff",
      113: "#ffc55f",
      114: "#ff5b70",
      115: "#84a8ff",
      116: "#ff6686",
      117: "#ffd659",
      118: "#ffd659",
      119: "#39c1ff",
      120: "#ff5e68",
      121: "#82b5ff",
      133: "#5ab3ff",
      134: "#5ab3ff",
      135: "#53c2ff",
      136: "#4de9d1",
      137: "#ff914d",
      138: "#ff6882",
      139: "#7fb6ea",
      140: "#ff7188",
      141: "#79eebb",
      142: "#63b2ff",
      143: "#ff6464",
      144: "#63b2ff",
      145: "#6fb3ef",
      146: "#57a5ff",
      147: "#9da4f0",
      158: "#82b2ff"
    };
    const state = {
      mlbGames: [],
      espnMlbEvents: [],
      nflGames: [],
      mlbPage: 0,
      nflPage: 0,
      previousScores: /* @__PURE__ */ new Map(),
      probabilities: { mlb: {}, nfl: {} },
      lineups: { bos: null, opp: null },
      lineupView: "bos",
      lineupContextPk: null,
      lineupUpdatedAt: 0,
      news: [],
      heroMlb: null,
      heroNfl: null,
      refreshBusy: false,
      oddsBusy: false
    };
    const $ = (id) => document.getElementById(id);
    const pad = (n) => {
      const value = String(n);
      return value.length < 2 ? `0${value}` : value;
    };
    const esc = (s) => String(s != null ? s : "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
    const clamp = (n, lo = 1, hi = 99) => Math.max(lo, Math.min(hi, Math.round(Number(n))));
    const num = (v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const flatten = (items, mapper) => {
      const out = [];
      (items || []).forEach((item) => (mapper(item) || []).forEach((value) => out.push(value)));
      return out;
    };
    function isoDate(offset = 0) {
      const d = /* @__PURE__ */ new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    function displayTime(value) {
      return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    function displayDate(value) {
      return new Date(value).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
    }
    function updateClock() {
      const d = /* @__PURE__ */ new Date();
      $("clock").textContent = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      $("dateLine").textContent = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
    }
    async function getJSON(url) {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return response.json();
    }
    function mlbScheduleUrl({ date, startDate, endDate, teamId } = {}) {
      const p = new URLSearchParams();
      p.set("sportId", "1");
      p.set("hydrate", "team,linescore,probablePitcher,broadcasts,venue");
      if (date) p.set("date", date);
      if (startDate) p.set("startDate", startDate);
      if (endDate) p.set("endDate", endDate);
      if (teamId) p.set("teamId", String(teamId));
      return `${MLB.schedule}?${p.toString()}`;
    }
    const flattenSchedule = (data) => flatten(data == null ? void 0 : data.dates, (d) => d.games);
    function mlbStatus(game) {
      var _a, _b;
      const abstract = ((_a = game == null ? void 0 : game.status) == null ? void 0 : _a.abstractGameState) || "";
      const detailed = ((_b = game == null ? void 0 : game.status) == null ? void 0 : _b.detailedState) || "";
      const live = abstract === "Live";
      const final = abstract === "Final" || /Final|Completed Early/.test(detailed);
      return { live, final, preview: !live && !final, detailed };
    }
    function nflParts(event) {
      var _a, _b;
      const competition = ((_a = event == null ? void 0 : event.competitions) == null ? void 0 : _a[0]) || {};
      const competitors = competition.competitors || [];
      return { competition, away: competitors.find((x) => x.homeAway === "away") || competitors[0], home: competitors.find((x) => x.homeAway === "home") || competitors[1], type: ((_b = event == null ? void 0 : event.status) == null ? void 0 : _b.type) || {} };
    }
    const nflIsLive = (e) => nflParts(e).type.state === "in";
    const nflIsFinal = (e) => !!nflParts(e).type.completed;
    const mlbTeamLogo = (team) => `https://www.mlbstatic.com/team-logos/${(team == null ? void 0 : team.id) || ""}.svg`;
    const teamAbbr = (team) => {
      var _a;
      return (team == null ? void 0 : team.abbreviation) || ((_a = team == null ? void 0 : team.teamCode) == null ? void 0 : _a.toUpperCase()) || ((team == null ? void 0 : team.name) || "TEAM").split(" ").slice(-1)[0].slice(0, 3).toUpperCase();
    };
    function scoreAnimationClass(key, score, live, leader) {
      const n = Number(score), old = state.previousScores.get(key);
      const changed = live && Number.isFinite(n) && Number.isFinite(old) && n > old;
      let cls = changed ? " score-change" : "";
      if (live && leader) cls += " live-leader";
      else if (leader) cls += " leader";
      return cls;
    }
    function rememberScore(key, score) {
      const n = Number(score);
      if (Number.isFinite(n)) state.previousScores.set(key, n);
    }
    function baseDiamond(linescore, mini = false) {
      const offense = (linescore == null ? void 0 : linescore.offense) || {};
      return `<div class="${mini ? "mini-diamond" : "diamond-wrap"}" aria-label="Base runners">
      <span class="base second ${offense.second ? "on" : ""}"></span><span class="base third ${offense.third ? "on" : ""}"></span><span class="base first ${offense.first ? "on" : ""}"></span><span class="base home"></span>
    </div>`;
    }
    function mlbInningText(game) {
      var _a;
      const ls = (game == null ? void 0 : game.linescore) || {};
      if (!ls.currentInning) return ((_a = game == null ? void 0 : game.status) == null ? void 0 : _a.detailedState) || "LIVE";
      const half = (ls.inningHalf || ls.inningState || "").toUpperCase();
      return `${half.startsWith("TOP") ? "TOP" : half.startsWith("BOT") ? "BOT" : half} ${ls.currentInning}`;
    }
    function mlbCountText(game) {
      var _a, _b, _c;
      const ls = (game == null ? void 0 : game.linescore) || {};
      return `<span class="green">${(_a = ls.balls) != null ? _a : 0}-${(_b = ls.strikes) != null ? _b : 0}</span><br>${(_c = ls.outs) != null ? _c : 0} OUT${ls.outs === 1 ? "" : "S"}`;
    }
    function parseRecord(summary) {
      const m = String(summary || "").match(/(\d+)\s*-\s*(\d+)/);
      return m ? { w: Number(m[1]), l: Number(m[2]) } : { w: null, l: null };
    }
    function recordProb(aw, al, hw, hl) {
      const a = Number(aw) + Number(al) > 0 ? Number(aw) / (Number(aw) + Number(al)) : null;
      const h = Number(hw) + Number(hl) > 0 ? Number(hw) / (Number(hw) + Number(hl)) : null;
      if (a == null || h == null) return { away: 50, home: 50 };
      const away = clamp(50 + (a - h) * 62 - 3, 18, 82);
      return { away, home: 100 - away };
    }
    function pairFromWinProb(node) {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      if (!node) return null;
      let away = num((_d = (_c = (_b = (_a = node.awayWinPercentage) != null ? _a : node.awayWinPercent) != null ? _b : node.awayTeamWinPercentage) != null ? _c : node.awayProbability) != null ? _d : node.awayPct);
      let home = num((_h = (_g = (_f = (_e = node.homeWinPercentage) != null ? _e : node.homeWinPercent) != null ? _f : node.homeTeamWinPercentage) != null ? _g : node.homeProbability) != null ? _h : node.homePct);
      if (away == null && home != null) away = 100 - home;
      if (home == null && away != null) home = 100 - away;
      return away != null && home != null ? { away: clamp(away), home: clamp(home) } : null;
    }
    function pairFromPredictor(pred) {
      var _a, _b, _c, _d, _e, _f;
      if (!pred) return null;
      const a = pred.awayTeam || pred.away || {}, h = pred.homeTeam || pred.home || {};
      let away = num((_c = (_b = (_a = a.gameProjection) != null ? _a : a.projectedWinPct) != null ? _b : a.winChance) != null ? _c : pred.awayChance);
      let home = num((_f = (_e = (_d = h.gameProjection) != null ? _d : h.projectedWinPct) != null ? _e : h.winChance) != null ? _f : pred.homeChance);
      if (away == null && home != null) away = 100 - home;
      if (home == null && away != null) home = 100 - away;
      return away != null && home != null ? { away: clamp(away), home: clamp(home) } : null;
    }
    function americanImplied(ml) {
      const n = num(ml);
      if (n == null || n === 0) return null;
      return n < 0 ? -n / (-n + 100) * 100 : 100 / (n + 100) * 100;
    }
    function pairFromMarketOdds(competition, awayTeam, homeTeam) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i;
      const o = (_a = competition == null ? void 0 : competition.odds) == null ? void 0 : _a[0];
      if (!o) return null;
      const awayMl = num((_e = (_d = (_b = o.awayTeamOdds) == null ? void 0 : _b.moneyLine) != null ? _d : (_c = o.awayTeamOdds) == null ? void 0 : _c.moneyline) != null ? _e : o.awayMoneyLine);
      const homeMl = num((_i = (_h = (_f = o.homeTeamOdds) == null ? void 0 : _f.moneyLine) != null ? _h : (_g = o.homeTeamOdds) == null ? void 0 : _g.moneyline) != null ? _i : o.homeMoneyLine);
      let ap = americanImplied(awayMl), hp = americanImplied(homeMl);
      if (ap != null && hp != null) {
        const total = ap + hp;
        return { away: clamp(ap / total * 100), home: clamp(hp / total * 100) };
      }
      const detail = String(o.details || o.detail || "").trim();
      const m = detail.match(/^([A-Z]{2,4})\s+([+-]?\d+(?:\.\d+)?)/i);
      if (m) {
        const fav = m[1].toUpperCase();
        const pts = Math.abs(parseFloat(m[2]));
        const favPct = clamp(50 + pts * 3.25, 52, 82);
        const aa = String((awayTeam == null ? void 0 : awayTeam.abbreviation) || "").toUpperCase(), ha = String((homeTeam == null ? void 0 : homeTeam.abbreviation) || "").toUpperCase();
        if (fav === aa) return { away: favPct, home: 100 - favPct };
        if (fav === ha) return { away: 100 - favPct, home: favPct };
      }
      return null;
    }
    function findEspnMlbEvent(game) {
      var _a, _b, _c, _d;
      const aa = teamAbbr((_b = (_a = game == null ? void 0 : game.teams) == null ? void 0 : _a.away) == null ? void 0 : _b.team), ha = teamAbbr((_d = (_c = game == null ? void 0 : game.teams) == null ? void 0 : _c.home) == null ? void 0 : _d.team);
      return state.espnMlbEvents.find((e) => {
        var _a2, _b2;
        const { away, home } = nflParts(e);
        return ((_a2 = away == null ? void 0 : away.team) == null ? void 0 : _a2.abbreviation) === aa && ((_b2 = home == null ? void 0 : home.team) == null ? void 0 : _b2.abbreviation) === ha;
      }) || null;
    }
    function initProbabilities() {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B;
      for (const g of state.mlbGames) {
        const ev = findEspnMlbEvent(g);
        const ep = ev ? nflParts(ev) : {};
        let p = pairFromMarketOdds(ep.competition, (_a = ep.away) == null ? void 0 : _a.team, (_b = ep.home) == null ? void 0 : _b.team) || pairFromPredictor(ev == null ? void 0 : ev.predictor) || pairFromPredictor((_d = (_c = ev == null ? void 0 : ev.competitions) == null ? void 0 : _c[0]) == null ? void 0 : _d.predictor);
        if (!p) {
          const ar = parseRecord((_g = (_f = (_e = ep.away) == null ? void 0 : _e.records) == null ? void 0 : _f[0]) == null ? void 0 : _g.summary), hr = parseRecord((_j = (_i = (_h = ep.home) == null ? void 0 : _h.records) == null ? void 0 : _i[0]) == null ? void 0 : _j.summary);
          p = ev ? recordProb(ar.w, ar.l, hr.w, hr.l) : recordProb((_m = (_l = (_k = g.teams) == null ? void 0 : _k.away) == null ? void 0 : _l.leagueRecord) == null ? void 0 : _m.wins, (_p = (_o = (_n = g.teams) == null ? void 0 : _n.away) == null ? void 0 : _o.leagueRecord) == null ? void 0 : _p.losses, (_s = (_r = (_q = g.teams) == null ? void 0 : _q.home) == null ? void 0 : _r.leagueRecord) == null ? void 0 : _s.wins, (_v = (_u = (_t = g.teams) == null ? void 0 : _t.home) == null ? void 0 : _u.leagueRecord) == null ? void 0 : _v.losses);
        }
        state.probabilities.mlb[g.gamePk] = p;
      }
      for (const e of state.nflGames) {
        const { competition, away, home } = nflParts(e);
        let p = pairFromMarketOdds(competition, away == null ? void 0 : away.team, home == null ? void 0 : home.team) || pairFromPredictor(e == null ? void 0 : e.predictor) || pairFromPredictor((_x = (_w = e == null ? void 0 : e.competitions) == null ? void 0 : _w[0]) == null ? void 0 : _x.predictor);
        if (!p) {
          const ar = parseRecord((_z = (_y = away == null ? void 0 : away.records) == null ? void 0 : _y[0]) == null ? void 0 : _z.summary), hr = parseRecord((_B = (_A = home == null ? void 0 : home.records) == null ? void 0 : _A[0]) == null ? void 0 : _B.summary);
          p = recordProb(ar.w, ar.l, hr.w, hr.l);
        }
        state.probabilities.nfl[e.id] = p;
      }
    }
    async function refreshLiveProbabilities() {
      const jobs = [];
      for (const g of state.mlbGames.filter((x) => mlbStatus(x).live)) {
        const ev = findEspnMlbEvent(g);
        if (!(ev == null ? void 0 : ev.id)) continue;
        jobs.push(getJSON(ESPN.mlbSummary(ev.id)).then((d) => {
          var _a, _b, _c;
          const p = Array.isArray(d == null ? void 0 : d.winprobability) && pairFromWinProb(d.winprobability[d.winprobability.length - 1]) || pairFromPredictor(d == null ? void 0 : d.predictor) || pairFromPredictor((_c = (_b = (_a = d == null ? void 0 : d.header) == null ? void 0 : _a.competitions) == null ? void 0 : _b[0]) == null ? void 0 : _c.predictor);
          if (p) state.probabilities.mlb[g.gamePk] = p;
        }).catch(() => {
        }));
      }
      for (const e of state.nflGames.filter(nflIsLive)) {
        jobs.push(getJSON(ESPN.nflSummary(e.id)).then((d) => {
          var _a, _b, _c;
          const p = Array.isArray(d == null ? void 0 : d.winprobability) && pairFromWinProb(d.winprobability[d.winprobability.length - 1]) || pairFromPredictor(d == null ? void 0 : d.predictor) || pairFromPredictor((_c = (_b = (_a = d == null ? void 0 : d.header) == null ? void 0 : _a.competitions) == null ? void 0 : _b[0]) == null ? void 0 : _c.predictor);
          if (p) state.probabilities.nfl[e.id] = p;
        }).catch(() => {
        }));
      }
      await Promise.all(jobs);
    }
    function leftProb(kind, id, leftScore, rightScore, live) {
      var _a;
      const p = (_a = state.probabilities[kind]) == null ? void 0 : _a[id];
      if (p && Number.isFinite(p.away)) return clamp(p.away);
      if (live) return clamp(50 + (Number(leftScore) - Number(rightScore)) * 8, 12, 88);
      return 50;
    }
    function oddsBar(pct, hero = false, leftLabel = "AWAY", rightLabel = "HOME") {
      const c = Math.max(4, Math.min(96, Math.round(pct))), r = 100 - c;
      return `<div class="win-prob ${hero ? "hero-prob" : "score-prob"}">
      <div class="prob-labels">
        <span class="prob-side left"><b>${esc(leftLabel)}</b><strong>${c}%</strong></span>
        <span class="prob-title">WIN PROB</span>
        <span class="prob-side right"><strong>${r}%</strong><b>${esc(rightLabel)}</b></span>
      </div>
      <div class="prob-track"><span class="prob-left" style="width:${c}%"></span><span class="prob-marker" style="left:${c}%"></span></div>
    </div>`;
    }
    function lastName(name) {
      const parts = String(name || "TBD").trim().split(/\s+/);
      return parts[parts.length - 1] || "TBD";
    }
    function mlbPitcherMini(game) {
      var _a, _b, _c, _d, _e, _f;
      const a = lastName((_c = (_b = (_a = game == null ? void 0 : game.teams) == null ? void 0 : _a.away) == null ? void 0 : _b.probablePitcher) == null ? void 0 : _c.fullName), h = lastName((_f = (_e = (_d = game == null ? void 0 : game.teams) == null ? void 0 : _d.home) == null ? void 0 : _e.probablePitcher) == null ? void 0 : _f.fullName);
      return `<div class="row-detail-title">STARTERS</div><div class="pitcher-mini">${esc(a)} <span>vs</span> ${esc(h)}</div>`;
    }
    function nflMarketLines(competition, away, home) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
      const o = ((_a = competition == null ? void 0 : competition.odds) == null ? void 0 : _a[0]) || {};
      const detail = String(o.details || "").trim();
      const total = num(o.overUnder);
      const awayMl = num((_d = (_b = o.awayTeamOdds) == null ? void 0 : _b.moneyLine) != null ? _d : (_c = o.awayTeamOdds) == null ? void 0 : _c.moneyline);
      const homeMl = num((_g = (_e = o.homeTeamOdds) == null ? void 0 : _e.moneyLine) != null ? _g : (_f = o.homeTeamOdds) == null ? void 0 : _f.moneyline);
      const spread = detail || (num(o.spread) != null ? `${((_h = away == null ? void 0 : away.team) == null ? void 0 : _h.abbreviation) || "AWY"} ${num(o.spread) > 0 ? "+" : ""}${num(o.spread)}` : "\u2014");
      const mlParts = [];
      if (awayMl != null) mlParts.push(`${((_i = away == null ? void 0 : away.team) == null ? void 0 : _i.abbreviation) || "AWY"} ${awayMl > 0 ? "+" : ""}${awayMl}`);
      if (homeMl != null) mlParts.push(`${((_j = home == null ? void 0 : home.team) == null ? void 0 : _j.abbreviation) || "HME"} ${homeMl > 0 ? "+" : ""}${homeMl}`);
      return [
        ["SPREAD", spread],
        ["TOTAL", total != null ? `O/U ${total}` : "\u2014"],
        ["ML", mlParts.join(" / ") || "\u2014"]
      ];
    }
    function nflPregameInfo(competition, away, home) {
      const lines = nflMarketLines(competition, away, home);
      return `<div class="row-detail-title">BETTING</div><div class="bet-lines">${lines.map(([k, v]) => `<div class="bet-line"><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>`;
    }
    function nflLiveInfo(competition, type) {
      var _a, _b;
      const s = (competition == null ? void 0 : competition.situation) || {};
      const dd = s.downDistanceText || s.shortDownDistanceText || s.possessionText || (type == null ? void 0 : type.shortDetail) || "LIVE";
      const possession = ((_b = (_a = ((competition == null ? void 0 : competition.competitors) || []).find((x) => String(x.id) === String(s.possession))) == null ? void 0 : _a.team) == null ? void 0 : _b.abbreviation) || "";
      const yard = s.yardLine != null ? `BALL ${s.yardLine}` : "";
      return `<div class="row-detail-title live-title">LIVE GAME</div><div class="live-detail">${esc(dd)}</div><div class="live-sub">${esc([possession, yard].filter(Boolean).join(" \u2022 "))}</div>`;
    }
    function mlbSort(games) {
      return [...games].sort((a, b) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
        const as = mlbStatus(a), bs = mlbStatus(b);
        const live = Number(bs.live) - Number(as.live);
        if (live) return live;
        const aBos = Number(((_c = (_b = (_a = a.teams) == null ? void 0 : _a.away) == null ? void 0 : _b.team) == null ? void 0 : _c.id) === BOS_ID || ((_f = (_e = (_d = a.teams) == null ? void 0 : _d.home) == null ? void 0 : _e.team) == null ? void 0 : _f.id) === BOS_ID), bBos = Number(((_i = (_h = (_g = b.teams) == null ? void 0 : _g.away) == null ? void 0 : _h.team) == null ? void 0 : _i.id) === BOS_ID || ((_l = (_k = (_j = b.teams) == null ? void 0 : _j.home) == null ? void 0 : _k.team) == null ? void 0 : _l.id) === BOS_ID);
        if (bBos !== aBos) return bBos - aBos;
        const final = Number(as.final) - Number(bs.final);
        if (final) return final;
        return new Date(a.gameDate) - new Date(b.gameDate);
      });
    }
    function nflSort(games) {
      return [...games].sort((a, b) => {
        const live = Number(nflIsLive(b)) - Number(nflIsLive(a));
        if (live) return live;
        const ap = nflParts(a), bp = nflParts(b);
        const an = Number([ap.away, ap.home].some((x) => {
          var _a;
          return ((_a = x == null ? void 0 : x.team) == null ? void 0 : _a.abbreviation) === "NE";
        })), bn = Number([bp.away, bp.home].some((x) => {
          var _a;
          return ((_a = x == null ? void 0 : x.team) == null ? void 0 : _a.abbreviation) === "NE";
        }));
        if (bn !== an) return bn - an;
        return new Date(a.date) - new Date(b.date);
      });
    }
    function renderMlbHero(game) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r;
      const el = $("redSoxHero");
      if (!game) {
        el.innerHTML = `<div class="hero-loading">NO RED SOX GAME FOUND</div>`;
        return;
      }
      const st = mlbStatus(game), away = game.teams.away, home = game.teams.home, as = (_a = away.score) != null ? _a : 0, hs = (_b = home.score) != null ? _b : 0, aKey = `mlb:${game.gamePk}:away`, hKey = `mlb:${game.gamePk}:home`, pct = leftProb("mlb", game.gamePk, as, hs, st.live);
      const middle = st.preview ? `<div class="hero-center-panel"><div class="hero-at-clean">AT</div></div>` : `<div class="hero-center-panel"><div class="hero-score-center"><div class="hero-score away-score${scoreAnimationClass(aKey, as, st.live, Number(as) > Number(hs))}">${as}</div><div class="score-divider">\u2013</div><div class="hero-score home-score${scoreAnimationClass(hKey, hs, st.live, Number(hs) > Number(as))}">${hs}</div></div>${st.live ? `<div class="hero-live-detail mlb-live-detail">${baseDiamond(game.linescore, true)}<div class="hero-live-copy"><b>${esc(mlbInningText(game))}</b><span>${(_d = (_c = game.linescore) == null ? void 0 : _c.balls) != null ? _d : 0}-${(_f = (_e = game.linescore) == null ? void 0 : _e.strikes) != null ? _f : 0} \u2022 ${(_h = (_g = game.linescore) == null ? void 0 : _g.outs) != null ? _h : 0} OUT${((_i = game.linescore) == null ? void 0 : _i.outs) === 1 ? "" : "S"}</span></div></div>` : ""}</div>`;
      const headerDetail = st.live ? mlbInningText(game) : st.final ? "FINAL" : "";
      const bottomInfo = st.live ? "" : st.final ? displayDate(game.gameDate) : `${displayDate(game.gameDate)}  \u2022  ${displayTime(game.gameDate)}  \u2022  ${esc(((_j = game.venue) == null ? void 0 : _j.name) || "")}`;
      el.classList.toggle("is-live", st.live);
      el.innerHTML = `<div class="hero-kicker red-text"><span class="hero-kicker-main">MLB  \u2022  ${st.live ? "LIVE IN PROGRESS" : st.final ? "LAST GAME" : "NEXT GAME"}</span>${headerDetail ? `<span class="hero-kicker-detail">${esc(headerDetail)}</span>` : ""}${st.live ? `<span class="hero-live-pill"><span class="status-dot red"></span>LIVE</span>` : ""}</div>
      <div class="hero-main hero-balanced"><div class="hero-team"><img class="hero-team-logo" src="${mlbTeamLogo(away.team)}" alt=""><div><div class="hero-abbr">${esc(teamAbbr(away.team))}</div><div class="hero-city">${esc(away.team.teamName || away.team.name)}</div><div class="hero-record">${esc((_l = (_k = away.leagueRecord) == null ? void 0 : _k.wins) != null ? _l : "\u2013")}-${esc((_n = (_m = away.leagueRecord) == null ? void 0 : _m.losses) != null ? _n : "\u2013")}</div></div></div>${middle}<div class="hero-team right"><div><div class="hero-abbr">${esc(teamAbbr(home.team))}</div><div class="hero-city">${esc(home.team.teamName || home.team.name)}</div><div class="hero-record">${esc((_p = (_o = home.leagueRecord) == null ? void 0 : _o.wins) != null ? _p : "\u2013")}-${esc((_r = (_q = home.leagueRecord) == null ? void 0 : _q.losses) != null ? _r : "\u2013")}</div></div><img class="hero-team-logo" src="${mlbTeamLogo(home.team)}" alt=""></div></div>
      ${bottomInfo ? `<div class="next-info hero-bottom-info">${bottomInfo}</div>` : ""}${oddsBar(pct, true, teamAbbr(away.team), teamAbbr(home.team))}`;
      rememberScore(aKey, as);
      rememberScore(hKey, hs);
    }
    function renderPatriotsHero(event) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
      const el = $("patriotsHero");
      if (!event) {
        el.innerHTML = `<div class="hero-loading">NO PATRIOTS GAME FOUND</div>`;
        return;
      }
      const { competition, away, home, type } = nflParts(event), live = type.state === "in", final = !!type.completed, as = Number((_a = away == null ? void 0 : away.score) != null ? _a : 0), hs = Number((_b = home == null ? void 0 : home.score) != null ? _b : 0), aKey = `nfl:${event.id}:away`, hKey = `nfl:${event.id}:home`, pct = leftProb("nfl", event.id, as, hs, live);
      const liveText = type.shortDetail || type.detail || "LIVE";
      const mid = live || final ? `<div class="hero-center-panel"><div class="hero-score-center"><div class="hero-score away-score${scoreAnimationClass(aKey, as, live, as > hs)}">${as}</div><div class="score-divider">\u2013</div><div class="hero-score home-score${scoreAnimationClass(hKey, hs, live, hs > as)}">${hs}</div></div>${live ? `<div class="hero-live-detail nfl-live-detail"><b>${esc(liveText)}</b><span>${esc(((_c = competition == null ? void 0 : competition.situation) == null ? void 0 : _c.downDistanceText) || ((_d = competition == null ? void 0 : competition.situation) == null ? void 0 : _d.possessionText) || "")}</span></div>` : ""}</div>` : `<div class="hero-center-panel"><div class="hero-at-clean">AT</div></div>`;
      const record = (x) => {
        var _a2, _b2;
        return ((_b2 = (_a2 = x == null ? void 0 : x.records) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.summary) || "0-0";
      }, venue = ((_e = competition == null ? void 0 : competition.venue) == null ? void 0 : _e.fullName) || "", broadcast = flatten(competition == null ? void 0 : competition.broadcasts, (b) => b.names).join(" / ");
      const bottomInfo = live ? "" : final ? "FINAL" : `${displayDate(event.date)}  \u2022  ${displayTime(event.date)}${venue ? `  \u2022  ${esc(venue)}` : ""}${broadcast ? `  \u2022  ${esc(broadcast)}` : ""}`;
      el.classList.toggle("is-live", live);
      el.innerHTML = `<div class="hero-kicker blue-text"><span class="hero-kicker-main">NFL  \u2022  ${live ? "LIVE IN PROGRESS" : final ? "FINAL" : "NEXT GAME"}</span>${live ? `<span class="hero-kicker-detail">${esc(liveText)}</span><span class="hero-live-pill nfl-live-pill"><span class="status-dot blue"></span>LIVE</span>` : final ? `<span class="hero-kicker-detail">FINAL</span>` : ""}</div>
      <div class="hero-main hero-balanced"><div class="hero-team"><img class="hero-team-logo" src="${((_f = away == null ? void 0 : away.team) == null ? void 0 : _f.logo) || ""}" alt=""><div><div class="hero-abbr">${esc(((_g = away == null ? void 0 : away.team) == null ? void 0 : _g.abbreviation) || "AWAY")}</div><div class="hero-city">${esc(((_h = away == null ? void 0 : away.team) == null ? void 0 : _h.shortDisplayName) || ((_i = away == null ? void 0 : away.team) == null ? void 0 : _i.displayName) || "")}</div><div class="hero-record">${esc(record(away))}</div></div></div>${mid}<div class="hero-team right"><div><div class="hero-abbr">${esc(((_j = home == null ? void 0 : home.team) == null ? void 0 : _j.abbreviation) || "HOME")}</div><div class="hero-city">${esc(((_k = home == null ? void 0 : home.team) == null ? void 0 : _k.shortDisplayName) || ((_l = home == null ? void 0 : home.team) == null ? void 0 : _l.displayName) || "")}</div><div class="hero-record">${esc(record(home))}</div></div><img class="hero-team-logo" src="${((_m = home == null ? void 0 : home.team) == null ? void 0 : _m.logo) || ""}" alt=""></div></div>
      ${bottomInfo ? `<div class="next-info hero-bottom-info">${esc(bottomInfo)}</div>` : ""}${oddsBar(pct, true, teamAbbr(away.team), teamAbbr(home.team))}`;
      rememberScore(aKey, as);
      rememberScore(hKey, hs);
    }
    function renderMlbRows() {
      const games = mlbSort(state.mlbGames), pages = Math.max(1, Math.ceil(games.length / ROWS_PER_PAGE));
      state.mlbPage %= pages;
      const slice = games.slice(state.mlbPage * ROWS_PER_PAGE, state.mlbPage * ROWS_PER_PAGE + ROWS_PER_PAGE);
      $("mlbPageLabel").textContent = pages > 1 ? `TODAY  ${state.mlbPage + 1}/${pages}` : "TODAY";
      const html = slice.map((game) => {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const st = mlbStatus(game), away = game.teams.away, home = game.teams.home, as = (_a = away.score) != null ? _a : 0, hs = (_b = home.score) != null ? _b : 0, aKey = `mlb:${game.gamePk}:away`, hKey = `mlb:${game.gamePk}:home`, pct = leftProb("mlb", game.gamePk, as, hs, st.live);
        const field = st.live ? `<div class="row-mini-field">${baseDiamond(game.linescore, true)}</div>` : "";
        const status = st.live ? `<div class="score-status-cell"><div class="score-status live">LIVE<small>${esc(mlbInningText(game))}</small></div>${field}<div class="mini-count">${(_d = (_c = game.linescore) == null ? void 0 : _c.balls) != null ? _d : 0}-${(_f = (_e = game.linescore) == null ? void 0 : _e.strikes) != null ? _f : 0} \u2022 ${(_h = (_g = game.linescore) == null ? void 0 : _g.outs) != null ? _h : 0} OUT</div></div>` : st.final ? `<div class="score-status-cell"><div class="score-status final">FINAL<small>${displayDate(game.gameDate)}</small></div></div>` : `<div class="score-status-cell"><div class="score-status upcoming">${displayTime(game.gameDate)}<small>${displayDate(game.gameDate)}</small></div>${field}</div>`;
        const detail = `<div class="row-detail">${mlbPitcherMini(game)}${oddsBar(pct, false, teamAbbr(away.team), teamAbbr(home.team))}</div>`;
        const row = `<div class="score-row mlb-score-row">${status}<div class="row-team"><img src="${mlbTeamLogo(away.team)}" alt=""><span class="row-team-name">${esc(teamAbbr(away.team))}</span></div><div class="row-score${scoreAnimationClass(aKey, as, st.live, Number(as) > Number(hs))}">${st.preview ? "\u2013" : as}</div><div class="score-separator">|</div><div class="row-score${scoreAnimationClass(hKey, hs, st.live, Number(hs) > Number(as))}">${st.preview ? "\u2013" : hs}</div><div class="row-team right"><span class="row-team-name">${esc(teamAbbr(home.team))}</span><img src="${mlbTeamLogo(home.team)}" alt=""></div>${detail}</div>`;
        rememberScore(aKey, as);
        rememberScore(hKey, hs);
        return row;
      }).join("");
      $("mlbRows").innerHTML = html + Array.from({ length: Math.max(0, ROWS_PER_PAGE - slice.length) }, () => `<div class="empty-row">\u2014</div>`).join("");
    }
    function renderNflRows() {
      const games = nflSort(state.nflGames), pages = Math.max(1, Math.ceil(games.length / ROWS_PER_PAGE));
      state.nflPage %= pages;
      const slice = games.slice(state.nflPage * ROWS_PER_PAGE, state.nflPage * ROWS_PER_PAGE + ROWS_PER_PAGE);
      $("nflPageLabel").textContent = pages > 1 ? `CURRENT  ${state.nflPage + 1}/${pages}` : "CURRENT";
      const html = slice.map((event) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _i;
        const { competition, away, home, type } = nflParts(event), live = type.state === "in", final = !!type.completed, as = Number((_a = away == null ? void 0 : away.score) != null ? _a : 0), hs = Number((_b = home == null ? void 0 : home.score) != null ? _b : 0), aKey = `nfl:${event.id}:away`, hKey = `nfl:${event.id}:home`, pct = leftProb("nfl", event.id, as, hs, live);
        const status = live ? `<div class="score-status-cell"><div class="score-status live">LIVE<small>${esc(type.shortDetail || type.detail || "")}</small></div></div>` : final ? `<div class="score-status-cell"><div class="score-status final">FINAL<small>${esc(type.shortDetail || "")}</small></div></div>` : `<div class="score-status-cell"><div class="score-status upcoming">${displayDate(event.date)}<small>${displayTime(event.date)}</small></div></div>`;
        const detail = `<div class="row-detail nfl-detail">${live ? nflLiveInfo(competition, type) : final ? `<div class="row-detail-title">FINAL</div><div class="live-detail">${esc(((_c = competition == null ? void 0 : competition.venue) == null ? void 0 : _c.fullName) || "")}</div>` : nflPregameInfo(competition, away, home)}${oddsBar(pct, false, ((_d = away == null ? void 0 : away.team) == null ? void 0 : _d.abbreviation) || "AWAY", ((_e = home == null ? void 0 : home.team) == null ? void 0 : _e.abbreviation) || "HOME")}</div>`;
        const row = `<div class="score-row nfl-score-row">${status}<div class="row-team"><img src="${((_f = away == null ? void 0 : away.team) == null ? void 0 : _f.logo) || ""}" alt=""><span class="row-team-name">${esc(((_g = away == null ? void 0 : away.team) == null ? void 0 : _g.abbreviation) || "")}</span></div><div class="row-score${scoreAnimationClass(aKey, as, live, as > hs)}">${live || final ? as : "\u2013"}</div><div class="score-separator">${live || final ? "|" : "AT"}</div><div class="row-score${scoreAnimationClass(hKey, hs, live, hs > as)}">${live || final ? hs : "\u2013"}</div><div class="row-team right"><span class="row-team-name">${esc(((_h = home == null ? void 0 : home.team) == null ? void 0 : _h.abbreviation) || "")}</span><img src="${((_i = home == null ? void 0 : home.team) == null ? void 0 : _i.logo) || ""}" alt=""></div>${detail}</div>`;
        rememberScore(aKey, as);
        rememberScore(hKey, hs);
        return row;
      }).join("");
      $("nflRows").innerHTML = html + Array.from({ length: Math.max(0, ROWS_PER_PAGE - slice.length) }, () => `<div class="empty-row">\u2014</div>`).join("");
    }
    function chooseRedSoxHero(todayGames, nearGames) {
      const isBos = (g) => {
        var _a, _b, _c, _d, _e, _f;
        return ((_c = (_b = (_a = g.teams) == null ? void 0 : _a.away) == null ? void 0 : _b.team) == null ? void 0 : _c.id) === BOS_ID || ((_f = (_e = (_d = g.teams) == null ? void 0 : _d.home) == null ? void 0 : _e.team) == null ? void 0 : _f.id) === BOS_ID;
      };
      const todayBos = todayGames.filter(isBos);
      const live = todayBos.find((g) => mlbStatus(g).live);
      if (live) return live;
      const latestFinal = nearGames.filter((g) => isBos(g) && mlbStatus(g).final).sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate))[0];
      if (latestFinal) return latestFinal;
      return nearGames.filter((g) => isBos(g) && mlbStatus(g).preview).sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate))[0] || null;
    }
    function choosePatriotsHero(events) {
      const ne = events.filter((e) => {
        var _a, _b;
        const { away, home } = nflParts(e);
        return ((_a = away == null ? void 0 : away.team) == null ? void 0 : _a.abbreviation) === "NE" || ((_b = home == null ? void 0 : home.team) == null ? void 0 : _b.abbreviation) === "NE";
      });
      return ne.find(nflIsLive) || ne.filter((e) => !nflIsFinal(e)).sort((a, b) => new Date(a.date) - new Date(b.date))[0] || ne.filter(nflIsFinal).sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
    }
    function findNextBosGame(nearGames) {
      const now = Date.now();
      return nearGames.filter((g) => {
        var _a, _b, _c, _d, _e, _f;
        return ((_c = (_b = (_a = g.teams) == null ? void 0 : _a.away) == null ? void 0 : _b.team) == null ? void 0 : _c.id) === BOS_ID || ((_f = (_e = (_d = g.teams) == null ? void 0 : _d.home) == null ? void 0 : _e.team) == null ? void 0 : _f.id) === BOS_ID;
      }).filter((g) => mlbStatus(g).preview && new Date(g.gameDate).getTime() >= now - 2 * 60 * 60 * 1e3).sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate))[0] || null;
    }
    function findLiveBosGame(todayGames) {
      return todayGames.find((g) => {
        var _a, _b, _c, _d, _e, _f;
        return mlbStatus(g).live && (((_c = (_b = (_a = g.teams) == null ? void 0 : _a.away) == null ? void 0 : _b.team) == null ? void 0 : _c.id) === BOS_ID || ((_f = (_e = (_d = g.teams) == null ? void 0 : _d.home) == null ? void 0 : _e.team) == null ? void 0 : _f.id) === BOS_ID);
      }) || null;
    }
    function gameTv(game) {
      var _a, _b, _c, _d;
      const side = ((_c = (_b = (_a = game == null ? void 0 : game.teams) == null ? void 0 : _a.home) == null ? void 0 : _b.team) == null ? void 0 : _c.id) === BOS_ID ? "home" : "away";
      const tv = ((game == null ? void 0 : game.broadcasts) || []).filter((b) => String(b.type).toUpperCase() === "TV");
      if (!tv.length) return "TBD";
      return ((_d = tv.find((b) => b.homeAway === side) || tv.find((b) => b.isNational) || tv[0]) == null ? void 0 : _d.name) || "TBD";
    }
    async function pitcherStats(personId) {
      var _a, _b, _c;
      if (!personId) return null;
      try {
        const data = await getJSON(MLB.person(personId, (/* @__PURE__ */ new Date()).getFullYear())), person = (_a = data == null ? void 0 : data.people) == null ? void 0 : _a[0], stat = ((_b = flatten(person == null ? void 0 : person.stats, (x) => x.splits)[0]) == null ? void 0 : _b.stat) || {};
        return { name: (person == null ? void 0 : person.fullName) || "TBD", hand: ((_c = person == null ? void 0 : person.pitchHand) == null ? void 0 : _c.code) || "", wins: stat.wins, losses: stat.losses, era: stat.era, whip: stat.whip };
      } catch (e) {
        return null;
      }
    }
    function setDetailMode(live) {
      const nextHeader = document.querySelector(".next-panel .detail-header");
      if (nextHeader) {
        nextHeader.classList.toggle("live-mode", live);
        nextHeader.textContent = live ? "LIVE RED SOX GAME" : "NEXT RED SOX MATCHUP";
      }
      const pitcherHeader = document.querySelector(".pitchers-panel .detail-header");
      if (pitcherHeader) {
        pitcherHeader.classList.toggle("live-mode", live);
        pitcherHeader.innerHTML = `${live ? "LIVE STARTING PITCHERS" : "STARTING PITCHERS"} <span id="tvNetwork" class="tv-badge">TV: TBD</span>`;
      }
    }
    function livePitcherFromFeed(feed, team) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B;
      const boxTeam = teamBox(feed, (_a = team == null ? void 0 : team.team) == null ? void 0 : _a.id) || {};
      const linescore = ((_b = feed == null ? void 0 : feed.liveData) == null ? void 0 : _b.linescore) || {};
      const currentSection = [linescore.defense, linescore.offense].find((section) => {
        var _a2, _b2;
        return String((_a2 = section == null ? void 0 : section.team) == null ? void 0 : _a2.id) === String((_b2 = team == null ? void 0 : team.team) == null ? void 0 : _b2.id);
      });
      const currentId = (_c = currentSection == null ? void 0 : currentSection.pitcher) == null ? void 0 : _c.id;
      const probableId = (_d = team == null ? void 0 : team.probablePitcher) == null ? void 0 : _d.id;
      const ids = [];
      if (currentId) ids.push(currentId);
      if (probableId) ids.push(probableId);
      (boxTeam.pitchers || []).forEach((id2) => {
        if (ids.indexOf(id2) < 0) ids.push(id2);
      });
      const players = boxTeam.players || {};
      const id = ids.find((pid) => {
        var _a2, _b2;
        return (_b2 = (_a2 = players[`ID${pid}`]) == null ? void 0 : _a2.stats) == null ? void 0 : _b2.pitching;
      }) || ids[0];
      const player = id ? players[`ID${id}`] || {} : {};
      const stats = ((_e = player.stats) == null ? void 0 : _e.pitching) || {};
      const season = ((_f = player.seasonStats) == null ? void 0 : _f.pitching) || {};
      return {
        name: ((_g = player.person) == null ? void 0 : _g.fullName) || ((_h = team == null ? void 0 : team.probablePitcher) == null ? void 0 : _h.fullName) || "STARTER TBD",
        hand: ((_j = (_i = player.person) == null ? void 0 : _i.pitchHand) == null ? void 0 : _j.code) || ((_l = (_k = team == null ? void 0 : team.probablePitcher) == null ? void 0 : _k.pitchHand) == null ? void 0 : _l.code) || "",
        current: !!currentId && String(currentId) === String(id),
        innings: (_m = stats.inningsPitched) != null ? _m : "\u2014",
        pitches: (_p = (_o = (_n = stats.numberOfPitches) != null ? _n : stats.pitchesThrown) != null ? _o : stats.pitches) != null ? _p : "\u2014",
        strikes: (_r = (_q = stats.numberOfStrikes) != null ? _q : stats.strikes) != null ? _r : "\u2014",
        balls: (_s = stats.balls) != null ? _s : "\u2014",
        hits: (_t = stats.hits) != null ? _t : "\u2014",
        runs: (_u = stats.runs) != null ? _u : "\u2014",
        earnedRuns: (_v = stats.earnedRuns) != null ? _v : "\u2014",
        walks: (_x = (_w = stats.baseOnBalls) != null ? _w : stats.walks) != null ? _x : "\u2014",
        strikeOuts: (_z = (_y = stats.strikeOuts) != null ? _y : stats.strikeouts) != null ? _z : "\u2014",
        era: (_A = season.era) != null ? _A : "\u2014",
        whip: (_B = season.whip) != null ? _B : "\u2014"
      };
    }
    function livePitcherCard(team, p, right = false) {
      var _a, _b, _c;
      const name = (p == null ? void 0 : p.name) || ((_a = team == null ? void 0 : team.probablePitcher) == null ? void 0 : _a.fullName) || "STARTER TBD";
      const hand = (p == null ? void 0 : p.hand) ? `${p.hand}HP` : "";
      const teamName = ((_b = team == null ? void 0 : team.team) == null ? void 0 : _b.teamName) || ((_c = team == null ? void 0 : team.team) == null ? void 0 : _c.name) || "TEAM";
      const stat = (label, value) => `<div class="live-pitcher-stat"><span>${label}</span><b>${esc(value != null ? value : "\u2014")}</b></div>`;
      const handLine = [hand, (p == null ? void 0 : p.innings) && `${p.innings} IP`].filter(Boolean).join(" \u2022 ");
      return `<div class="live-pitcher-card ${right ? "opp" : "bos"}">
      <div class="live-pitcher-head"><img src="${mlbTeamLogo(team.team)}" alt=""><div><div class="live-pitcher-team">${esc(teamAbbr(team.team))} \u2022 ${esc(teamName)} <span class="live-pitcher-state">${(p == null ? void 0 : p.current) ? "ON MOUND" : "LIVE"}</span></div><div class="live-pitcher-name">${esc(name)}</div><div class="live-pitcher-hand">${esc(handLine)}</div></div></div>
      <div class="live-pitcher-grid">${stat("PITCH", p == null ? void 0 : p.pitches)}${stat("STR", p == null ? void 0 : p.strikes)}${stat("BALL", p == null ? void 0 : p.balls)}${stat("BB", p == null ? void 0 : p.walks)}${stat("K", p == null ? void 0 : p.strikeOuts)}${stat("H", p == null ? void 0 : p.hits)}${stat("R", p == null ? void 0 : p.runs)}${stat("ER", p == null ? void 0 : p.earnedRuns)}</div>
    </div>`;
    }
    async function renderLivePitching(game) {
      var _a, _b, _c, _d;
      setDetailMode(true);
      if (!game) {
        $("nextMatchup").innerHTML = `<div class="detail-loading">NO LIVE RED SOX GAME</div>`;
        $("pitchers").innerHTML = `<div class="detail-loading">LIVE PITCHING DATA TBD</div>`;
        return;
      }
      const away = game.teams.away, home = game.teams.home, bos = away.team.id === BOS_ID ? away : home, opp = away.team.id === BOS_ID ? home : away;
      await renderNextMatchup(game);
      setDetailMode(true);
      $("tvNetwork").textContent = `TV: ${gameTv(game)}`;
      const center = document.querySelector("#nextMatchup .match-center-stack");
      if (center) {
        const as = (_a = away.score) != null ? _a : 0, hs = (_b = home.score) != null ? _b : 0;
        center.innerHTML = `<div class="match-at-box live-at-box">LIVE</div><div class="match-center-red live-score-line">${as} \u2013 ${hs}</div><div class="match-center-red small">${esc(mlbInningText(game))}</div><div class="match-center-red small">${esc(((_c = game.venue) == null ? void 0 : _c.name) || ((_d = game.status) == null ? void 0 : _d.detailedState) || "")}</div>`;
      }
      try {
        const feed = await getJSON(MLB.gameFeed(game.gamePk));
        const bosP = livePitcherFromFeed(feed, bos), oppP = livePitcherFromFeed(feed, opp);
        $("pitchers").innerHTML = `<div class="live-pitching-wrap">${livePitcherCard(bos, bosP)}<div class="live-pitching-vs">VS</div>${livePitcherCard(opp, oppP, true)}</div>`;
      } catch (e) {
        console.warn("Live pitching failed", e);
        $("pitchers").innerHTML = `<div class="detail-loading">LIVE PITCHING DATA RETRYING\u2026</div>`;
      }
    }
    async function renderNextMatchup(game) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
      setDetailMode(false);
      if (!game) {
        $("nextMatchup").innerHTML = `<div class="detail-loading">NO UPCOMING GAME FOUND</div>`;
        $("pitchers").innerHTML = `<div class="detail-loading">PROBABLES TBD</div>`;
        $("tvNetwork").textContent = "TV: TBD";
        return;
      }
      const away = game.teams.away, home = game.teams.home;
      const bos = away.team.id === BOS_ID ? away : home, opp = away.team.id === BOS_ID ? home : away;
      $("tvNetwork").textContent = `TV: ${gameTv(game)}`;
      $("nextMatchup").innerHTML = `<div class="match-team"><img src="${mlbTeamLogo(bos.team)}" alt=""><div><div class="match-abbr">${esc(teamAbbr(bos.team))}</div><div class="match-name">${esc(bos.team.teamName || bos.team.name)}</div><div class="match-record">${esc((_b = (_a = bos.leagueRecord) == null ? void 0 : _a.wins) != null ? _b : "\u2013")}-${esc((_d = (_c = bos.leagueRecord) == null ? void 0 : _c.losses) != null ? _d : "\u2013")}</div></div></div><div class="match-center-stack"><div class="match-at-box">AT</div><div class="match-center-red">${displayDate(game.gameDate)} \u2022 ${displayTime(game.gameDate)}</div><div class="match-center-red small">${esc(((_e = game.venue) == null ? void 0 : _e.name) || "")}</div><div class="match-center-red small">${esc(gameTv(game))}</div></div><div class="match-team right"><div><div class="match-abbr">${esc(teamAbbr(opp.team))}</div><div class="match-name">${esc(opp.team.teamName || opp.team.name)}</div><div class="match-record">${esc((_g = (_f = opp.leagueRecord) == null ? void 0 : _f.wins) != null ? _g : "\u2013")}-${esc((_i = (_h = opp.leagueRecord) == null ? void 0 : _h.losses) != null ? _i : "\u2013")}</div></div><img src="${mlbTeamLogo(opp.team)}" alt=""></div>`;
      const [bosP, oppP] = await Promise.all([pitcherStats((_j = bos.probablePitcher) == null ? void 0 : _j.id), pitcherStats((_k = opp.probablePitcher) == null ? void 0 : _k.id)]);
      const box = (team, p, right = false) => {
        var _a2, _b2, _c2;
        const name = (p == null ? void 0 : p.name) || ((_a2 = team.probablePitcher) == null ? void 0 : _a2.fullName) || "TBD", hand = (p == null ? void 0 : p.hand) ? `${p.hand}HP` : "", line = p && p.era ? `${(_b2 = p.wins) != null ? _b2 : "\u2013"}-${(_c2 = p.losses) != null ? _c2 : "\u2013"} \u2022 ${p.era} ERA${p.whip ? ` \u2022 ${p.whip} WHIP` : ""}` : "SEASON STATS TBD";
        return `<div class="pitcher ${right ? "right" : ""}">${right ? "" : `<img src="${mlbTeamLogo(team.team)}" alt="">`}<div><div class="pitcher-name">${esc(name)}</div><div class="pitcher-hand">${esc(hand)}</div><div class="pitcher-stat">${esc(line)}</div></div>${right ? `<img src="${mlbTeamLogo(team.team)}" alt="">` : ""}</div>`;
      };
      $("pitchers").innerHTML = `${box(bos, bosP)}<div class="pitcher-vs">VS</div>${box(opp, oppP, true)}`;
    }
    function teamBox(feed, teamId) {
      var _a, _b, _c, _d, _e, _f;
      const side = ((_c = (_b = (_a = feed == null ? void 0 : feed.gameData) == null ? void 0 : _a.teams) == null ? void 0 : _b.home) == null ? void 0 : _c.id) === teamId ? "home" : "away";
      return ((_f = (_e = (_d = feed == null ? void 0 : feed.liveData) == null ? void 0 : _d.boxscore) == null ? void 0 : _e.teams) == null ? void 0 : _f[side]) || null;
    }
    function seasonLineupFromBox(boxTeam) {
      const order = (boxTeam == null ? void 0 : boxTeam.battingOrder) || [], players = (boxTeam == null ? void 0 : boxTeam.players) || {};
      return order.slice(0, 9).map((id, i) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const p = players[`ID${id}`] || {}, s = ((_a = p.seasonStats) == null ? void 0 : _a.batting) || {};
        return { order: i + 1, name: ((_b = p.person) == null ? void 0 : _b.fullName) || "Player", pos: ((_c = p.position) == null ? void 0 : _c.abbreviation) || "\u2014", v1: (_d = s.avg) != null ? _d : "\u2014", v2: (_e = s.homeRuns) != null ? _e : "\u2014", v3: (_f = s.rbi) != null ? _f : "\u2014", v4: (_g = s.ops) != null ? _g : "\u2014" };
      });
    }
    function liveLineupFromBox(boxTeam) {
      const order = (boxTeam == null ? void 0 : boxTeam.battingOrder) || [], players = (boxTeam == null ? void 0 : boxTeam.players) || {};
      return order.slice(0, 9).map((id, i) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const p = players[`ID${id}`] || {}, s = ((_a = p.stats) == null ? void 0 : _a.batting) || {};
        return { order: i + 1, name: ((_b = p.person) == null ? void 0 : _b.fullName) || "Player", pos: ((_c = p.position) == null ? void 0 : _c.abbreviation) || "\u2014", v1: (_d = s.atBats) != null ? _d : 0, v2: (_e = s.hits) != null ? _e : 0, v3: (_f = s.runs) != null ? _f : 0, v4: (_g = s.rbi) != null ? _g : 0 };
      });
    }
    async function recentCompletedGame(teamId) {
      try {
        const d = await getJSON(mlbScheduleUrl({ startDate: isoDate(-7), endDate: isoDate(0), teamId }));
        return flattenSchedule(d).filter((g) => mlbStatus(g).final).sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate))[0] || null;
      } catch (e) {
        return null;
      }
    }
    async function buildPregameLineup(teamId, nextGame, teamName) {
      if (nextGame == null ? void 0 : nextGame.gamePk) {
        try {
          const feed = await getJSON(MLB.gameFeed(nextGame.gamePk)), rows = seasonLineupFromBox(teamBox(feed, teamId));
          if (rows.length >= 9) return { rows, label: "OFFICIAL", title: `${teamName.toUpperCase()} LINEUP`, mode: "season" };
        } catch (e) {
        }
      }
      const prev = await recentCompletedGame(teamId);
      if (prev == null ? void 0 : prev.gamePk) {
        try {
          const feed = await getJSON(MLB.gameFeed(prev.gamePk)), rows = seasonLineupFromBox(teamBox(feed, teamId));
          if (rows.length) return { rows, label: "PROJECTED \u2022 LAST GAME", title: `${teamName.toUpperCase()} LINEUP`, mode: "season" };
        } catch (e) {
        }
      }
      return { rows: [], label: "PROJECTED", title: `${teamName.toUpperCase()} LINEUP`, mode: "season" };
    }
    async function buildLiveLineups(liveGame) {
      const feed = await getJSON(MLB.gameFeed(liveGame.gamePk));
      const away = liveGame.teams.away, home = liveGame.teams.home;
      const bos = away.team.id === BOS_ID ? away : home, opp = away.team.id === BOS_ID ? home : away;
      return { bos: { rows: liveLineupFromBox(teamBox(feed, BOS_ID)), label: "LIVE STATS", title: "RED SOX LIVE BATTING", mode: "live", accent: RED_SOX_RED }, opp: { rows: liveLineupFromBox(teamBox(feed, opp.team.id)), label: "LIVE STATS", title: `${(opp.team.teamName || opp.team.name).toUpperCase()} LIVE BATTING`, mode: "live", accent: TEAM_COLORS[opp.team.id] || "#7fbfff" } };
    }
    async function refreshLineupContext(liveGame, nextGame) {
      if (liveGame) {
        try {
          state.lineups = await buildLiveLineups(liveGame);
          state.lineupContextPk = `live:${liveGame.gamePk}`;
          state.lineupUpdatedAt = Date.now();
          drawLineup(state.lineupView);
          return;
        } catch (e) {
          console.warn("Live lineup failed", e);
        }
      }
      if (!nextGame) return;
      const away = nextGame.teams.away, home = nextGame.teams.home, opp = away.team.id === BOS_ID ? home : away;
      const [bos, other] = await Promise.all([buildPregameLineup(BOS_ID, nextGame, "RED SOX"), buildPregameLineup(opp.team.id, nextGame, opp.team.teamName || opp.team.name)]);
      bos.accent = RED_SOX_RED;
      other.accent = TEAM_COLORS[opp.team.id] || "#7fbfff";
      state.lineups = { bos, opp: other };
      state.lineupContextPk = `next:${nextGame.gamePk}`;
      state.lineupUpdatedAt = Date.now();
      drawLineup(state.lineupView);
    }
    function setLineupHeaders(mode) {
      const labels = mode === "live" ? ["#", "PLAYER", "POS", "AB", "H", "R", "RBI"] : ["#", "PLAYER", "POS", "AVG", "HR", "RBI", "OPS"];
      for (let i = 1; i <= 7; i++) $(`col${i}`).textContent = labels[i - 1];
    }
    function drawLineup(view = state.lineupView) {
      var _a;
      const data = (_a = state.lineups) == null ? void 0 : _a[view];
      if (!data) return;
      state.lineupView = view;
      $("lineupTitle").textContent = data.title;
      $("lineupMode").textContent = data.label;
      $("lineupPanel").style.setProperty("--lineup-accent", view === "bos" ? RED_SOX_RED : data.accent || "#7fbfff");
      $("lineupPanel").classList.toggle("live-stats", data.mode === "live");
      setLineupHeaders(data.mode);
      const rows = data.rows || [];
      $("lineupRows").innerHTML = rows.length ? rows.slice(0, 9).map((p) => `<div class="lineup-row"><span class="num">${p.order}</span><span class="player-name">${esc(p.name).toUpperCase()}</span><span class="pos">${esc(p.pos)}</span><span class="stat">${esc(p.v1)}</span><span class="stat">${esc(p.v2)}</span><span class="stat">${esc(p.v3)}</span><span class="stat">${esc(p.v4)}</span></div>`).join("") : Array.from({ length: 9 }, (_, i) => `<div class="lineup-row"><span class="num">${i + 1}</span><span class="player-name">LINEUP TBD</span><span class="pos">\u2014</span><span class="stat">\u2014</span><span class="stat">\u2014</span><span class="stat">\u2014</span><span class="stat">\u2014</span></div>`).join("");
    }
    function normalizeNews(data, source) {
      return ((data == null ? void 0 : data.articles) || []).map((a) => ({ title: a.headline || a.title, source: a.source || source })).filter((x) => x.title);
    }
    function renderTicker() {
      const liveMlb = state.mlbGames.filter((g) => mlbStatus(g).live).slice(0, 4).map((g) => {
        var _a, _b;
        const a = g.teams.away, h = g.teams.home;
        return `LIVE ${teamAbbr(a.team)} ${(_a = a.score) != null ? _a : 0} \u2013 ${(_b = h.score) != null ? _b : 0} ${teamAbbr(h.team)}  ${mlbInningText(g)}  ${leftProb("mlb", g.gamePk, a.score, h.score, true)}%`;
      });
      const liveNfl = state.nflGames.filter(nflIsLive).slice(0, 3).map((e) => {
        var _a, _b;
        const { away, home, type } = nflParts(e);
        return `LIVE ${away.team.abbreviation} ${(_a = away.score) != null ? _a : 0} \u2013 ${(_b = home.score) != null ? _b : 0} ${home.team.abbreviation}  ${type.shortDetail || type.detail || ""}  ${leftProb("nfl", e.id, away.score, home.score, true)}%`;
      });
      const headlines = state.news.slice(0, 9).map((n) => n.title), items = [...liveMlb, ...liveNfl, ...headlines];
      const html = (items.length ? items : ["SPORTS DATA CONNECTED"]).map((x) => `${esc(x)} <span class="bullet">\u2022</span>`).join(" ");
      $("newsTicker").innerHTML = `${html} ${html}`;
    }
    async function refreshCore() {
      if (state.refreshBusy) return;
      state.refreshBusy = true;
      try {
        const [todayMlb, nearBos, espnMlb, nfl] = await Promise.all([getJSON(mlbScheduleUrl({ date: isoDate(0) })), getJSON(mlbScheduleUrl({ startDate: isoDate(-7), endDate: isoDate(10), teamId: BOS_ID })), getJSON(ESPN.mlbScores), getJSON(ESPN.nflScores)]);
        state.mlbGames = flattenSchedule(todayMlb);
        state.espnMlbEvents = (espnMlb == null ? void 0 : espnMlb.events) || [];
        state.nflGames = (nfl == null ? void 0 : nfl.events) || [];
        initProbabilities();
        await refreshLiveProbabilities();
        const nearGames = flattenSchedule(nearBos), heroGame = chooseRedSoxHero(state.mlbGames, nearGames), patriotGame = choosePatriotsHero(state.nflGames), nextGame = findNextBosGame(nearGames), liveGame = findLiveBosGame(state.mlbGames);
        state.heroMlb = heroGame;
        state.heroNfl = patriotGame;
        renderMlbHero(heroGame);
        renderPatriotsHero(patriotGame);
        renderMlbRows();
        renderNflRows();
        if (liveGame) await renderLivePitching(liveGame);
        else await renderNextMatchup(nextGame);
        const contextKey = liveGame ? `live:${liveGame.gamePk}` : nextGame ? `next:${nextGame.gamePk}` : null;
        const shouldRefreshLineup = !!liveGame || contextKey !== state.lineupContextPk || Date.now() - state.lineupUpdatedAt > 12e4;
        if (shouldRefreshLineup) await refreshLineupContext(liveGame, nextGame);
        else drawLineup(state.lineupView);
        $("lastSync").textContent = `SYNC ${(/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
        renderTicker();
      } catch (err) {
        console.error(err);
        $("lastSync").textContent = "SYNC RETRY";
      } finally {
        state.refreshBusy = false;
      }
    }
    async function refreshNews() {
      try {
        const [bos, ne, mlb, nfl] = await Promise.all([getJSON(ESPN.bosNews), getJSON(ESPN.neNews), getJSON(ESPN.mlbNews), getJSON(ESPN.nflNews)]);
        const all = [...normalizeNews(bos, "RED SOX"), ...normalizeNews(ne, "PATRIOTS"), ...normalizeNews(mlb, "MLB"), ...normalizeNews(nfl, "NFL")], seen = /* @__PURE__ */ new Set();
        state.news = all.filter((x) => x.title && !seen.has(x.title) && seen.add(x.title));
        renderTicker();
      } catch (e) {
        console.warn("News refresh failed", e);
      }
    }
    function autoRotate() {
      const mp = Math.max(1, Math.ceil(state.mlbGames.length / ROWS_PER_PAGE)), np = Math.max(1, Math.ceil(state.nflGames.length / ROWS_PER_PAGE));
      if (mp > 1) {
        state.mlbPage = (state.mlbPage + 1) % mp;
        renderMlbRows();
      }
      if (np > 1) {
        state.nflPage = (state.nflPage + 1) % np;
        renderNflRows();
      }
    }
    function rotateLineup() {
      var _a;
      if (!((_a = state.lineups) == null ? void 0 : _a.opp)) return;
      state.lineupView = state.lineupView === "bos" ? "opp" : "bos";
      drawLineup(state.lineupView);
    }
    async function fastOddsRefresh() {
      if (state.oddsBusy || !state.mlbGames.some((g) => mlbStatus(g).live) && !state.nflGames.some(nflIsLive)) return;
      state.oddsBusy = true;
      try {
        await refreshLiveProbabilities();
        if (state.heroMlb) renderMlbHero(state.heroMlb);
        if (state.heroNfl) renderPatriotsHero(state.heroNfl);
        renderMlbRows();
        renderNflRows();
        renderTicker();
      } finally {
        state.oddsBusy = false;
      }
    }
    updateClock();
    setInterval(updateClock, 1e3);
    refreshCore();
    refreshNews();
    setInterval(refreshCore, 15e3);
    setInterval(refreshNews, 5 * 60 * 1e3);
    setInterval(autoRotate, 11e3);
    setInterval(rotateLineup, 9e3);
    setInterval(fastOddsRefresh, 1e3);
  })();
})();

(() => {
  "use strict";

  const BOS_ID = 111;
  const TEAM_LOGO = (id) => `https://www.mlbstatic.com/team-logos/${id}.svg`;
  const API = {
    schedule: "https://statsapi.mlb.com/api/v1/schedule",
    feed: (pk) => `https://statsapi.mlb.com/api/v1.1/game/${pk}/feed/live`,
    person: (id, season) => `https://statsapi.mlb.com/api/v1/people/${id}?hydrate=${encodeURIComponent(`stats(group=[pitching],type=[season],season=${season})`)}`
  };

  const state = { game: null, feed: null, next: null, lastSync: null, busy: false, demo: false };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
  const n = (value, fallback = "—") => `<span class="num">${esc(value == null || value === "" ? fallback : value)}</span>`;
  const numText = (value, fallback = "—") => String(value == null || value === "" ? fallback : value);
  const pad = (value) => String(value).padStart(2, "0");

  async function getJSON(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  }

  function isoDate(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function scheduleUrl(startDate, endDate) {
    const params = new URLSearchParams({ sportId: "1", teamId: String(BOS_ID), startDate, endDate, hydrate: "team,linescore,probablePitcher,broadcasts,venue" });
    return `${API.schedule}?${params}`;
  }

  function gamesFrom(data) { return (data && data.dates || []).flatMap((day) => day.games || []); }
  function status(game) {
    const s = game && game.status || {};
    const live = s.abstractGameState === "Live";
    const final = s.abstractGameState === "Final" || /Final|Completed Early/.test(s.detailedState || "");
    return { live, final, preview: !live && !final };
  }
  function team(game, side) { return game && game.teams && game.teams[side]; }
  function isBoston(game) { return [team(game, "away"), team(game, "home")].some((x) => x && x.team && Number(x.team.id) === BOS_ID); }
  function opponent(game) { return Number(team(game, "away").team.id) === BOS_ID ? team(game, "home") : team(game, "away"); }
  function bostonSide(game) { return Number(team(game, "away").team.id) === BOS_ID ? "away" : "home"; }
  function teamName(teamData) {
    if (!teamData || !teamData.team) return "TEAM";
    if (Number(teamData.team.id) === BOS_ID) return "Boston Red Sox";
    const location = teamData.team.locationName || "";
    const shortName = teamData.team.teamName || teamData.team.name || "Team";
    return location && shortName.toLowerCase().indexOf(location.toLowerCase()) !== 0 ? `${location} ${shortName}` : shortName;
  }
  function teamAbbr(teamData) { return teamData && (teamData.team.abbreviation || teamData.team.teamCode || teamName(teamData).slice(0, 3).toUpperCase()) || "TEAM"; }
  function record(teamData) {
    const r = teamData && teamData.leagueRecord;
    return r && r.wins != null && r.losses != null ? `${r.wins}–${r.losses}` : "—";
  }
  function time(value) { return value ? new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "TBD"; }
  function dateTime(value) { return value ? new Date(value).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }).toUpperCase() + " • " + time(value) : "TBD"; }

  function inningText(game) {
    const linescore = game && game.linescore || {};
    if (!linescore.currentInning) return game && game.status && game.status.detailedState || "NEXT GAME";
    const half = String(linescore.inningHalf || linescore.inningState || "").toUpperCase();
    return `${half.indexOf("TOP") === 0 ? "TOP" : half.indexOf("BOT") === 0 ? "BOTTOM" : half} ${linescore.currentInning}`;
  }

  function activeBases(linescore) {
    const offense = linescore && linescore.offense || {};
    return [offense.first ? "first" : "", offense.second ? "second" : "", offense.third ? "third" : ""].filter(Boolean);
  }

  function diamond(linescore) {
    const active = activeBases(linescore);
    return `<div class="diamond" aria-label="Base runners">
      ${active.map((base) => `<span class="base-marker ${base}"></span>`).join("")}
      <span class="base-labels"><span class="b2">2B</span><span class="b1">1B</span><span class="bh">HOME</span><span class="b3">3B</span></span>
    </div>`;
  }

  function baseText(linescore) {
    const active = activeBases(linescore);
    if (!active.length) return "BASES EMPTY";
    return active.map((base) => ({ first: "RUNNER ON 1ST", second: "RUNNER ON 2ND", third: "RUNNER ON 3RD" }[base])).join(" • ");
  }

  function scoreBox(game, next) {
    const live = game && status(game).live;
    const final = game && status(game).final;
    const selected = game || next;
    if (!selected) return `<div class="score-topline"><div class="score-title">JUSTIN'S RED SOX LIVE</div><span class="state-pill">NO GAME FOUND</span></div><div class="loading-state">MLB SCHEDULE WILL RETRY AUTOMATICALLY</div>`;
    const away = team(selected, "away"), home = team(selected, "home"), bos = Number(away.team.id) === BOS_ID ? away : home, opp = Number(away.team.id) === BOS_ID ? home : away;
    const linescore = selected.linescore || {};
    const bosScore = live || final ? numText(bos.score, "0") : "—";
    const oppScore = live || final ? numText(opp.score, "0") : "—";
    const center = live ? `${esc(inningText(selected))}<div class="inning-detail">${n(linescore.outs || 0)} OUT • COUNT ${n(linescore.balls || 0)}–${n(linescore.strikes || 0)}</div><div class="base-row">${diamond(linescore)}<span class="base-copy">${esc(baseText(linescore))}</span></div>` : `<div class="inning-label">${final ? "FINAL" : "NEXT GAME"}</div><div class="inning-detail">${esc(dateTime(selected.gameDate))}</div><div class="base-row"><span class="base-copy">${final ? "GAME COMPLETE" : esc(selected.venue && selected.venue.name || "VENUE TBD")}</span></div>`;
    return `<div class="score-topline"><div class="score-title">JUSTIN'S RED SOX LIVE</div><span class="state-pill ${live ? "live" : ""}">${live ? "LIVE • " + esc(inningText(selected)) : final ? "FINAL" : "NEXT GAME"}</span><span class="sample-pill">${state.demo ? "DEMO DATA" : "READ-ONLY LIVE FEED"}</span></div>
      <div class="score-main">
        <div class="team-side home"><img class="team-logo" src="${TEAM_LOGO(bos.team.id)}" alt="${esc(teamName(bos))}"><div class="team-copy"><div class="team-name">${esc(teamName(bos))}</div><div class="team-record">${live || final ? "HOME" : "HOME • NEXT"} • ${n(record(bos))}</div></div><div class="score-stack"><div class="score-label">BOS SCORE</div><div class="score-number">${n(bosScore)}</div></div></div>
        <div class="score-center"><div class="inning-label">${center}</div></div>
        <div class="team-side away"><img class="team-logo" src="${TEAM_LOGO(opp.team.id)}" alt="${esc(teamName(opp))}"><div class="team-copy"><div class="team-name">${esc(teamName(opp))}</div><div class="team-record">${live || final ? "AWAY" : "AWAY • NEXT"} • ${n(record(opp))}</div></div><div class="score-stack"><div class="score-label">${esc(teamAbbr(opp))} SCORE</div><div class="score-number">${n(oppScore)}</div></div></div>
      </div>`;
  }

  function teamBox(feed, teamId) {
    const side = feed && feed.gameData && feed.gameData.teams && feed.gameData.teams.home && Number(feed.gameData.teams.home.id) === Number(teamId) ? "home" : "away";
    return feed && feed.liveData && feed.liveData.boxscore && feed.liveData.boxscore.teams && feed.liveData.boxscore.teams[side] || null;
  }

  function livePitcher(feed, teamData) {
    const box = teamBox(feed, teamData.team.id) || {};
    const linescore = feed && feed.liveData && feed.liveData.linescore || {};
    const section = [linescore.defense, linescore.offense].find((x) => x && x.team && Number(x.team.id) === Number(teamData.team.id));
    const currentId = section && section.pitcher && section.pitcher.id;
    const probableId = teamData.probablePitcher && teamData.probablePitcher.id;
    const ids = [currentId, probableId].filter(Boolean);
    (box.pitchers || []).forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); });
    const players = box.players || {};
    const id = ids.find((pid) => players[`ID${pid}`] && players[`ID${pid}`].stats && players[`ID${pid}`].stats.pitching) || ids[0];
    const player = id ? players[`ID${id}`] || {} : {};
    const stats = player.stats && player.stats.pitching || {};
    const season = player.seasonStats && player.seasonStats.pitching || {};
    return {
      name: player.person && player.person.fullName || teamData.probablePitcher && teamData.probablePitcher.fullName || "STARTER TBD",
      hand: player.person && player.person.pitchHand && player.person.pitchHand.code || teamData.probablePitcher && teamData.probablePitcher.pitchHand && teamData.probablePitcher.pitchHand.code || "",
      current: !!currentId && String(currentId) === String(id),
      innings: stats.inningsPitched || "—", pitches: stats.numberOfPitches != null ? stats.numberOfPitches : stats.pitchesThrown != null ? stats.pitchesThrown : "—",
      strikes: stats.numberOfStrikes != null ? stats.numberOfStrikes : stats.strikes != null ? stats.strikes : "—", balls: stats.balls != null ? stats.balls : "—",
      walks: stats.baseOnBalls != null ? stats.baseOnBalls : stats.walks != null ? stats.walks : "—", strikeOuts: stats.strikeOuts != null ? stats.strikeOuts : stats.strikeouts != null ? stats.strikeouts : "—",
      hits: stats.hits != null ? stats.hits : "—", runs: stats.runs != null ? stats.runs : "—", earnedRuns: stats.earnedRuns != null ? stats.earnedRuns : "—", era: season.era || "—", whip: season.whip || "—"
    };
  }

  function pitcherCard(teamData, pitcher, away) {
    const stats = [["PITCH", pitcher.pitches], ["STR", pitcher.strikes], ["BALL", pitcher.balls], ["BB", pitcher.walks], ["K", pitcher.strikeOuts], ["H", pitcher.hits], ["R", pitcher.runs], ["ER", pitcher.earnedRuns]];
    return `<article class="pitcher-card ${away ? "away" : ""}"><div class="pitcher-top"><img class="pitcher-logo" src="${TEAM_LOGO(teamData.team.id)}" alt=""><div class="pitcher-copy"><div class="live-label">${pitcher.current ? "ON MOUND" : "LIVE PITCHER"}</div><div class="pitcher-name">${esc(pitcher.name)}</div><div class="pitcher-meta">${esc(teamAbbr(teamData))} • ${esc(pitcher.hand ? pitcher.hand + "HP" : "PITCHER" )} • ${n(pitcher.innings)} IP <span class="num-inline">${n(pitcher.era)} ERA / ${n(pitcher.whip)} WHIP</span></div></div><span class="team-chip">${esc(teamAbbr(teamData))}</span></div><div class="stat-grid">${stats.map(([label, value]) => `<div class="stat-cell"><div class="stat-label">${label}</div><div class="stat-value">${n(value)}</div></div>`).join("")}</div></article>`;
  }

  function fallbackPitcher(teamData) {
    const p = teamData.probablePitcher || {};
    return { name: p.fullName || "STARTER TBD", hand: p.pitchHand && p.pitchHand.code || "", innings: "—", pitches: "—", strikes: "—", balls: "—", walks: "—", strikeOuts: "—", hits: "—", runs: "—", earnedRuns: "—", era: "—", whip: "—", current: false };
  }

  function renderPitching(game, feed) {
    if (!game) {
      $("pitchingMeta").textContent = "NEXT GAME";
      $("pitchingContent").innerHTML = `<div class="loading-state">STARTING PITCHERS WILL APPEAR WITH THE NEXT MATCHUP</div>`;
      return;
    }
    const away = team(game, "away"), home = team(game, "home"), bos = Number(away.team.id) === BOS_ID ? away : home, opp = Number(away.team.id) === BOS_ID ? home : away;
    const live = status(game).live;
    const bosP = live && feed ? livePitcher(feed, bos) : fallbackPitcher(bos);
    const oppP = live && feed ? livePitcher(feed, opp) : fallbackPitcher(opp);
    $("pitchingMeta").textContent = live ? "LIVE • P / STR / BALL / BB / K" : "PROBABLES";
    $("pitchingContent").className = "panel-content pitching-content";
    $("pitchingContent").innerHTML = pitcherCard(bos, bosP, false) + pitcherCard(opp, oppP, true);
  }

  function liveLineup(feed, teamId) {
    const box = teamBox(feed, teamId) || {}, order = box.battingOrder || [], players = box.players || {};
    return order.slice(0, 9).map((id, index) => {
      const p = players[`ID${id}`] || {}, s = p.stats && p.stats.batting || {};
      return { order: index + 1, name: p.person && p.person.fullName || "PLAYER", pos: p.position && p.position.abbreviation || "—", line: `${s.atBats != null ? s.atBats : 0}–${s.hits != null ? s.hits : 0}  •  ${s.rbi != null ? s.rbi : 0} RBI`, id: Number(id) };
    });
  }

  function renderLineup(game, feed) {
    if (!game) {
      $("lineupMeta").textContent = "WAITING";
      $("lineupContent").innerHTML = `<div class="loading-state">LINEUP WILL APPEAR WITH THE NEXT GAME</div>`;
      return;
    }
    const bosSide = bostonSide(game), bos = team(game, bosSide), live = status(game).live;
    const rows = live && feed ? liveLineup(feed, BOS_ID) : [];
    const linescore = game.linescore || {};
    const offense = feed && feed.liveData && feed.liveData.linescore && feed.liveData.linescore.offense;
    const currentId = offense && offense.team && Number(offense.team.id) === BOS_ID && offense.batter && offense.batter.id;
    const current = currentId && rows.find((row) => row.id === Number(currentId));
    $("lineupMeta").textContent = live && rows.length ? "LIVE STATS" : "LINEUP PENDING";
    if (!rows.length) {
      $("lineupContent").innerHTML = `<div class="loading-state">LINEUP NOT POSTED YET<br><span class="num">${esc(dateTime(game.gameDate))}</span></div>`;
      return;
    }
    $("lineupContent").innerHTML = `<div class="at-bat-card"><div class="eyebrow">${current ? "AT THE PLATE" : "RED SOX BATTING ORDER"}</div><div class="at-bat-name">${esc(current ? current.name : rows[0].name)}</div><div class="at-bat-detail">${esc(current ? current.pos : rows[0].pos)} • ${current ? "LIVE BATTER" : "LINEUP"} • COUNT ${n(linescore.balls || 0)}–${n(linescore.strikes || 0)}</div></div><div class="lineup-rows">${rows.map((row) => `<div class="lineup-row ${current && current.id === row.id ? "active" : ""}"><span class="lineup-number num">${n(row.order)}</span><span class="lineup-name">${esc(row.name)}</span><span class="lineup-pos">${esc(row.pos)}</span><span class="lineup-line">${row.line.replace(/(\d+)/g, '<span class="num">$1</span>')}</span></div>`).join("")}</div><div class="on-deck"><div class="on-deck-label">ON DECK</div><div class="on-deck-name">${esc((current && rows[(rows.indexOf(current) + 1) % rows.length] || rows[1] || rows[0]).name)}</div></div>`;
  }

  function pitchEvents(feed) {
    const plays = feed && feed.liveData && feed.liveData.plays && feed.liveData.plays.allPlays || [];
    const current = feed && feed.liveData && feed.liveData.plays && feed.liveData.plays.currentPlay;
    const source = current && current.playEvents && current.playEvents.length ? [current] : plays.slice(-1);
    const events = source.flatMap((play) => play.playEvents || []).filter((event) => event.isPitch);
    return events.slice(-4).map((event, index) => {
      const details = event.details || {}, pitch = event.pitchData || {}, type = pitch.isSpecialEvent ? "PLAY" : details.type && (details.type.description || details.type.code) || "PITCH";
      const speed = pitch.startSpeed != null ? Math.round(pitch.startSpeed) : "—";
      const result = details.call && (details.call.description || details.call.code) || "PITCH";
      const coords = pitch.coordinates || {};
      const px = coords.pX == null ? 50 : Math.max(8, Math.min(92, 50 + Number(coords.pX) * 19));
      const py = coords.pZ == null ? 50 : Math.max(8, Math.min(92, 74 - (Number(coords.pZ) - 2.5) * 19));
      return { short: details.type && details.type.code || String(index + 1), type, speed, result, px, py };
    });
  }

  function recentPlays(feed) {
    const plays = feed && feed.liveData && feed.liveData.plays && feed.liveData.plays.allPlays || [];
    return plays.slice(-3).reverse().map((play) => {
      const result = play.result || {}, about = play.about || {};
      return { time: about.startTime ? time(about.startTime) : "LIVE", text: result.description || result.event || "Play update", tag: result.eventType === "home_run" ? "HR" : result.event || "PLAY" };
    });
  }

  function winProbability(game) {
    const away = team(game, "away"), home = team(game, "home"), bos = Number(away.team.id) === BOS_ID ? away : home, opp = Number(away.team.id) === BOS_ID ? home : away;
    const scoreDelta = Number(bos.score || 0) - Number(opp.score || 0);
    return Math.max(18, Math.min(82, Math.round(50 + scoreDelta * 7 + (bostonSide(game) === "home" ? 3 : 0))));
  }

  function renderBreakdown(game, feed) {
    const live = game && status(game).live;
    if (!game || !live || !feed) {
      $("breakdownMeta").textContent = live ? "PITCH FEED PENDING" : "NEXT GAME";
      $("breakdownContent").innerHTML = `<div class="loading-state">${live ? "PITCH TRACK WILL APPEAR AFTER THE FIRST LIVE PITCH" : "REAL-TIME BREAKDOWN WILL ACTIVATE WHEN THE GAME STARTS"}</div>`;
      return;
    }
    const linescore = feed.liveData && feed.liveData.linescore || game.linescore || {};
    const currentPlay = feed.liveData && feed.liveData.plays && feed.liveData.plays.currentPlay || {};
    const box = teamBox(feed, BOS_ID) || {}, players = box.players || {}, batterId = linescore.offense && linescore.offense.batter && linescore.offense.batter.id;
    const batter = batterId && players[`ID${batterId}`] && players[`ID${batterId}`].person && players[`ID${batterId}`].person.fullName || "CURRENT BATTER";
    const pitches = pitchEvents(feed), plays = recentPlays(feed), count = currentPlay.count || {};
    const dots = pitches.map((pitch, index) => `<span class="zone-dot ${["red", "blue", "amber", "green"][index % 4]}" style="left:${pitch.px}%;top:${pitch.py}%">${esc(pitch.short)}</span>`).join("");
    const pitchRows = pitches.length ? pitches.slice().reverse().map((pitch, index) => `<div class="pitch-row ${index === 0 ? "latest" : ""}"><span class="pitch-index num">${index + 1}</span>${esc(pitch.type)} • <span class="pitch-speed">${n(pitch.speed)} MPH</span> • ${esc(pitch.result)}</div>`).join("") : `<div class="pitch-row">AWAITING PITCH DATA</div>`;
    const playRows = plays.length ? plays.map((play, index) => `<div class="play-row"><span class="play-time num">${esc(play.time)}</span><span class="play-text">${esc(play.text)}</span><span class="play-tag">${esc(play.tag)}</span></div>`).join("") : `<div class="play-row"><span class="play-text">NO PLAY UPDATES YET</span></div>`;
    const prob = winProbability(game);
    $("breakdownMeta").textContent = "LIVE • REFRESH 15S";
    $("breakdownContent").innerHTML = `<div class="current-at-bat"><div class="breakdown-batter"><div class="eyebrow">CURRENT AT-BAT</div><h3>${esc(batter)}</h3><div class="situation">COUNT ${n(count.balls || 0)}–${n(count.strikes || 0)} • ${n(linescore.outs || 0)} OUT • ${esc(baseText(linescore))}</div><div class="pitch-track-title">PITCH TRACK</div><div class="pitch-list">${pitchRows}</div></div><div class="zone-wrap"><div><div class="strike-zone">${dots}</div><div class="zone-caption">STRIKE ZONE</div></div></div></div><div class="probability"><div class="probability-line"><span>WIN PROBABILITY</span><span class="win-value">BOS ${n(prob)}%</span></div><div class="prob-bar"><div class="prob-fill" style="width:${prob}%"></div></div></div><div class="plays-title">LAST 3 PLAYS</div><div class="play-list">${playRows}</div><div class="sync-line">FEED LAST SYNC • <span class="num">${state.lastSync ? Math.max(0, Math.round((Date.now() - state.lastSync) / 1000)) : 0}</span> SEC AGO</div>`;
  }

  function findGames(games) {
    const sorted = games.filter(isBoston).sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
    const live = sorted.find((game) => status(game).live);
    const now = Date.now();
    const next = sorted.find((game) => status(game).preview && new Date(game.gameDate).getTime() >= now - 2 * 60 * 60 * 1000);
    const final = sorted.filter((game) => status(game).final).sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate))[0];
    return { live, next, final };
  }

  async function refresh() {
    if (state.busy) return;
    state.busy = true;
    try {
      const data = await getJSON(scheduleUrl(isoDate(-3), isoDate(10)));
      const games = gamesFrom(data), found = findGames(games);
      // Once a live game ends, move the top box to the next matchup when one
      // is available.  The final score remains available in the feed history,
      // while the Jeep display is ready for the next Red Sox game.
      state.game = found.live || found.next || found.final || null;
      state.next = found.next;
      state.demo = false;
      if (found.live) {
        try { state.feed = await getJSON(API.feed(found.live.gamePk)); } catch (error) { state.feed = null; }
      } else state.feed = null;
      const primaryGame = found.live || found.next || found.final;
      $("scoreBox").innerHTML = scoreBox(primaryGame, found.next);
      renderPitching(primaryGame, state.feed);
      renderLineup(primaryGame, state.feed);
      renderBreakdown(primaryGame, state.feed);
      state.lastSync = Date.now();
      $("connectionDot").className = "status-dot live";
      $("connectionText").textContent = found.live ? "LIVE DATA CONNECTED" : "MLB DATA CONNECTED";
      $("notice").textContent = found.live ? "Live Red Sox data refreshes automatically. Display is read-only." : "No live Red Sox game right now. The next matchup will replace this state automatically.";
    } catch (error) {
      console.warn("Jeep Red Sox refresh failed", error);
      state.demo = true;
      $("connectionDot").className = "status-dot offline";
      $("connectionText").textContent = "LIVE DATA RETRYING";
      $("notice").textContent = "MLB feed is temporarily unavailable; the display will retry automatically.";
      if (!state.game && !state.next) {
        $("scoreBox").innerHTML = scoreBox(null, null);
        renderPitching(null, null); renderLineup(null, null); renderBreakdown(null, null);
      }
    } finally { state.busy = false; }
  }

  function updateClock() { $("clock").textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
  updateClock();
  setInterval(updateClock, 1000);
  refresh();
  setInterval(refresh, 15000);
})();

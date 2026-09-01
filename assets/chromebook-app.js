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
    108:"#ff7580",109:"#ff6a71",110:"#ff8d40",111:RED_SOX_RED,112:"#81b6ff",113:"#ffc55f",114:"#ff5b70",115:"#84a8ff",
    116:"#ff6686",117:"#ffd659",118:"#ffd659",119:"#39c1ff",120:"#ff5e68",121:"#82b5ff",133:"#5ab3ff",134:"#5ab3ff",
    135:"#53c2ff",136:"#4de9d1",137:"#ff914d",138:"#ff6882",139:"#7fb6ea",140:"#ff7188",141:"#79eebb",142:"#63b2ff",
    143:"#ff6464",144:"#63b2ff",145:"#6fb3ef",146:"#57a5ff",147:"#9da4f0",158:"#82b2ff"
  };

  const state = {
    mlbGames: [],
    espnMlbEvents: [],
    nflGames: [],
    mlbPage: 0,
    nflPage: 0,
    previousScores: new Map(),
    probabilities: {mlb:{}, nfl:{}},
    lineups: {bos:null, opp:null},
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
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  const clamp = (n, lo=1, hi=99) => Math.max(lo, Math.min(hi, Math.round(Number(n))));
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

  function isoDate(offset = 0) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function displayTime(value) { return new Date(value).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"}); }
  function displayDate(value) { return new Date(value).toLocaleDateString([], {weekday:"short", month:"short", day:"numeric"}).toUpperCase(); }
  function updateClock() {
    const d = new Date();
    $("clock").textContent = d.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
    $("dateLine").textContent = d.toLocaleDateString([], {weekday:"short", month:"short", day:"numeric"}).toUpperCase();
  }
  async function getJSON(url) {
    const response = await fetch(url, {cache:"no-store"});
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  }
  function mlbScheduleUrl({date,startDate,endDate,teamId}={}) {
    const p = new URLSearchParams();
    p.set("sportId","1"); p.set("hydrate","team,linescore,probablePitcher,broadcasts,venue");
    if (date) p.set("date",date); if (startDate) p.set("startDate",startDate); if (endDate) p.set("endDate",endDate); if (teamId) p.set("teamId",String(teamId));
    return `${MLB.schedule}?${p.toString()}`;
  }
  const flattenSchedule = (data) => (data?.dates || []).flatMap(d => d.games || []);

  function mlbStatus(game) {
    const abstract = game?.status?.abstractGameState || "";
    const detailed = game?.status?.detailedState || "";
    const live = abstract === "Live";
    const final = abstract === "Final" || /Final|Completed Early/.test(detailed);
    return {live, final, preview:!live && !final, detailed};
  }
  function nflParts(event) {
    const competition = event?.competitions?.[0] || {};
    const competitors = competition.competitors || [];
    return {competition, away:competitors.find(x=>x.homeAway==="away")||competitors[0], home:competitors.find(x=>x.homeAway==="home")||competitors[1], type:event?.status?.type||{}};
  }
  const nflIsLive = (e) => nflParts(e).type.state === "in";
  const nflIsFinal = (e) => !!nflParts(e).type.completed;
  const mlbTeamLogo = (team) => `https://www.mlbstatic.com/team-logos/${team?.id || ""}.svg`;
  const teamAbbr = (team) => team?.abbreviation || team?.teamCode?.toUpperCase() || (team?.name || "TEAM").split(" ").slice(-1)[0].slice(0,3).toUpperCase();

  function scoreAnimationClass(key, score, live, leader) {
    const n = Number(score), old = state.previousScores.get(key);
    const changed = live && Number.isFinite(n) && Number.isFinite(old) && n > old;
    let cls = changed ? " score-change" : "";
    if (live && leader) cls += " live-leader"; else if (leader) cls += " leader";
    return cls;
  }
  function rememberScore(key, score) { const n=Number(score); if(Number.isFinite(n)) state.previousScores.set(key,n); }

  function baseDiamond(linescore, mini=false) {
    const offense = linescore?.offense || {};
    return `<div class="${mini ? "mini-diamond" : "diamond-wrap"}" aria-label="Base runners">
      <span class="base second ${offense.second ? "on" : ""}"></span><span class="base third ${offense.third ? "on" : ""}"></span><span class="base first ${offense.first ? "on" : ""}"></span><span class="base home"></span>
    </div>`;
  }
  function mlbInningText(game) {
    const ls=game?.linescore||{}; if(!ls.currentInning) return game?.status?.detailedState||"LIVE";
    const half=(ls.inningHalf||ls.inningState||"").toUpperCase();
    return `${half.startsWith("TOP")?"TOP":half.startsWith("BOT")?"BOT":half} ${ls.currentInning}`;
  }
  function mlbCountText(game) {
    const ls=game?.linescore||{};
    return `<span class="green">${ls.balls??0}-${ls.strikes??0}</span><br>${ls.outs??0} OUT${ls.outs===1?"":"S"}`;
  }

  function parseRecord(summary) {
    const m=String(summary||"").match(/(\d+)\s*-\s*(\d+)/); return m?{w:Number(m[1]),l:Number(m[2])}:{w:null,l:null};
  }
  function recordProb(aw,al,hw,hl) {
    const a=(Number(aw)+Number(al))>0?Number(aw)/(Number(aw)+Number(al)):null;
    const h=(Number(hw)+Number(hl))>0?Number(hw)/(Number(hw)+Number(hl)):null;
    if(a==null||h==null) return {away:50,home:50};
    const away=clamp(50+(a-h)*62-3,18,82); return {away,home:100-away};
  }
  function pairFromWinProb(node) {
    if(!node) return null;
    let away=num(node.awayWinPercentage ?? node.awayWinPercent ?? node.awayTeamWinPercentage ?? node.awayProbability ?? node.awayPct);
    let home=num(node.homeWinPercentage ?? node.homeWinPercent ?? node.homeTeamWinPercentage ?? node.homeProbability ?? node.homePct);
    if(away==null&&home!=null) away=100-home; if(home==null&&away!=null) home=100-away;
    return away!=null&&home!=null?{away:clamp(away),home:clamp(home)}:null;
  }
  function pairFromPredictor(pred) {
    if(!pred) return null;
    const a=pred.awayTeam||pred.away||{}, h=pred.homeTeam||pred.home||{};
    let away=num(a.gameProjection ?? a.projectedWinPct ?? a.winChance ?? pred.awayChance);
    let home=num(h.gameProjection ?? h.projectedWinPct ?? h.winChance ?? pred.homeChance);
    if(away==null&&home!=null) away=100-home; if(home==null&&away!=null) home=100-away;
    return away!=null&&home!=null?{away:clamp(away),home:clamp(home)}:null;
  }
  function americanImplied(ml) {
    const n=num(ml); if(n==null||n===0) return null;
    return n<0 ? (-n)/((-n)+100)*100 : 100/(n+100)*100;
  }
  function pairFromMarketOdds(competition, awayTeam, homeTeam) {
    const o=competition?.odds?.[0]; if(!o) return null;
    const awayMl=num(o.awayTeamOdds?.moneyLine ?? o.awayTeamOdds?.moneyline ?? o.awayMoneyLine);
    const homeMl=num(o.homeTeamOdds?.moneyLine ?? o.homeTeamOdds?.moneyline ?? o.homeMoneyLine);
    let ap=americanImplied(awayMl), hp=americanImplied(homeMl);
    if(ap!=null&&hp!=null) { const total=ap+hp; return {away:clamp(ap/total*100),home:clamp(hp/total*100)}; }
    const detail=String(o.details||o.detail||'').trim();
    const m=detail.match(/^([A-Z]{2,4})\s+([+-]?\d+(?:\.\d+)?)/i);
    if(m) {
      const fav=m[1].toUpperCase(); const pts=Math.abs(parseFloat(m[2]));
      const favPct=clamp(50 + pts*3.25, 52, 82);
      const aa=String(awayTeam?.abbreviation||'').toUpperCase(), ha=String(homeTeam?.abbreviation||'').toUpperCase();
      if(fav===aa) return {away:favPct,home:100-favPct};
      if(fav===ha) return {away:100-favPct,home:favPct};
    }
    return null;
  }
  function findEspnMlbEvent(game) {
    const aa=teamAbbr(game?.teams?.away?.team), ha=teamAbbr(game?.teams?.home?.team);
    return state.espnMlbEvents.find(e=>{const {away,home}=nflParts(e); return away?.team?.abbreviation===aa && home?.team?.abbreviation===ha;})||null;
  }
  function initProbabilities() {
    for(const g of state.mlbGames) {
      const ev=findEspnMlbEvent(g); const ep=ev?nflParts(ev):{};
      let p=pairFromMarketOdds(ep.competition,ep.away?.team,ep.home?.team)||pairFromPredictor(ev?.predictor)||pairFromPredictor(ev?.competitions?.[0]?.predictor);
      if(!p) {
        const ar=parseRecord(ep.away?.records?.[0]?.summary), hr=parseRecord(ep.home?.records?.[0]?.summary);
        p=ev?recordProb(ar.w,ar.l,hr.w,hr.l):recordProb(g.teams?.away?.leagueRecord?.wins,g.teams?.away?.leagueRecord?.losses,g.teams?.home?.leagueRecord?.wins,g.teams?.home?.leagueRecord?.losses);
      }
      state.probabilities.mlb[g.gamePk]=p;
    }
    for(const e of state.nflGames) {
      const {competition,away,home}=nflParts(e);
      let p=pairFromMarketOdds(competition,away?.team,home?.team)||pairFromPredictor(e?.predictor)||pairFromPredictor(e?.competitions?.[0]?.predictor);
      if(!p) {const ar=parseRecord(away?.records?.[0]?.summary),hr=parseRecord(home?.records?.[0]?.summary);p=recordProb(ar.w,ar.l,hr.w,hr.l);}
      state.probabilities.nfl[e.id]=p;
    }
  }
  async function refreshLiveProbabilities() {
    const jobs=[];
    for(const g of state.mlbGames.filter(x=>mlbStatus(x).live)) {
      const ev=findEspnMlbEvent(g); if(!ev?.id) continue;
      jobs.push(getJSON(ESPN.mlbSummary(ev.id)).then(d=>{
        const p=(Array.isArray(d?.winprobability)&&pairFromWinProb(d.winprobability.at(-1)))||pairFromPredictor(d?.predictor)||pairFromPredictor(d?.header?.competitions?.[0]?.predictor);
        if(p) state.probabilities.mlb[g.gamePk]=p;
      }).catch(()=>{}));
    }
    for(const e of state.nflGames.filter(nflIsLive)) {
      jobs.push(getJSON(ESPN.nflSummary(e.id)).then(d=>{
        const p=(Array.isArray(d?.winprobability)&&pairFromWinProb(d.winprobability.at(-1)))||pairFromPredictor(d?.predictor)||pairFromPredictor(d?.header?.competitions?.[0]?.predictor);
        if(p) state.probabilities.nfl[e.id]=p;
      }).catch(()=>{}));
    }
    await Promise.all(jobs);
  }
  function leftProb(kind,id,leftScore,rightScore,live) {
    const p=state.probabilities[kind]?.[id]; if(p&&Number.isFinite(p.away)) return clamp(p.away);
    if(live) return clamp(50+(Number(leftScore)-Number(rightScore))*8,12,88); return 50;
  }
  function oddsBar(pct, hero=false, leftLabel="AWAY", rightLabel="HOME") {
    const c=Math.max(4,Math.min(96,Math.round(pct))), r=100-c;
    return `<div class="win-prob ${hero?"hero-prob":"score-prob"}">
      <div class="prob-labels">
        <span class="prob-side left"><b>${esc(leftLabel)}</b><strong>${c}%</strong></span>
        <span class="prob-title">WIN PROB</span>
        <span class="prob-side right"><strong>${r}%</strong><b>${esc(rightLabel)}</b></span>
      </div>
      <div class="prob-track"><span class="prob-left" style="width:${c}%"></span><span class="prob-marker" style="left:${c}%"></span></div>
    </div>`;
  }

  function lastName(name) {
    const parts=String(name||"TBD").trim().split(/\s+/); return parts[parts.length-1]||"TBD";
  }
  function mlbPitcherMini(game) {
    const a=lastName(game?.teams?.away?.probablePitcher?.fullName), h=lastName(game?.teams?.home?.probablePitcher?.fullName);
    return `<div class="row-detail-title">STARTERS</div><div class="pitcher-mini">${esc(a)} <span>vs</span> ${esc(h)}</div>`;
  }
  function nflMarketLines(competition, away, home) {
    const o=competition?.odds?.[0]||{};
    const detail=String(o.details||"").trim();
    const total=num(o.overUnder);
    const awayMl=num(o.awayTeamOdds?.moneyLine ?? o.awayTeamOdds?.moneyline);
    const homeMl=num(o.homeTeamOdds?.moneyLine ?? o.homeTeamOdds?.moneyline);
    const spread=detail || (num(o.spread)!=null ? `${away?.team?.abbreviation||"AWY"} ${num(o.spread)>0?"+":""}${num(o.spread)}` : "—");
    const mlParts=[]; if(awayMl!=null) mlParts.push(`${away?.team?.abbreviation||"AWY"} ${awayMl>0?"+":""}${awayMl}`); if(homeMl!=null) mlParts.push(`${home?.team?.abbreviation||"HME"} ${homeMl>0?"+":""}${homeMl}`);
    return [
      ["SPREAD",spread],
      ["TOTAL",total!=null?`O/U ${total}`:"—"],
      ["ML",mlParts.join(" / ")||"—"]
    ];
  }
  function nflPregameInfo(competition,away,home) {
    const lines=nflMarketLines(competition,away,home);
    return `<div class="row-detail-title">BETTING</div><div class="bet-lines">${lines.map(([k,v])=>`<div class="bet-line"><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>`;
  }
  function nflLiveInfo(competition,type) {
    const s=competition?.situation||{};
    const dd=s.downDistanceText||s.shortDownDistanceText||s.possessionText||type?.shortDetail||"LIVE";
    const possession=(competition?.competitors||[]).find(x=>String(x.id)===String(s.possession))?.team?.abbreviation || "";
    const yard=s.yardLine!=null?`BALL ${s.yardLine}`:"";
    return `<div class="row-detail-title live-title">LIVE GAME</div><div class="live-detail">${esc(dd)}</div><div class="live-sub">${esc([possession,yard].filter(Boolean).join(" • "))}</div>`;
  }

  function mlbSort(games) {
    return [...games].sort((a,b)=>{const as=mlbStatus(a),bs=mlbStatus(b); const live=Number(bs.live)-Number(as.live); if(live)return live; const aBos=Number(a.teams?.away?.team?.id===BOS_ID||a.teams?.home?.team?.id===BOS_ID),bBos=Number(b.teams?.away?.team?.id===BOS_ID||b.teams?.home?.team?.id===BOS_ID); if(bBos!==aBos)return bBos-aBos; const final=Number(as.final)-Number(bs.final); if(final)return final; return new Date(a.gameDate)-new Date(b.gameDate);});
  }
  function nflSort(games) {
    return [...games].sort((a,b)=>{const live=Number(nflIsLive(b))-Number(nflIsLive(a));if(live)return live;const ap=nflParts(a),bp=nflParts(b);const an=Number([ap.away,ap.home].some(x=>x?.team?.abbreviation==="NE")),bn=Number([bp.away,bp.home].some(x=>x?.team?.abbreviation==="NE"));if(bn!==an)return bn-an;return new Date(a.date)-new Date(b.date);});
  }

  function renderMlbHero(game) {
    const el=$("redSoxHero"); if(!game){el.innerHTML=`<div class="hero-loading">NO RED SOX GAME FOUND</div>`;return;}
    const st=mlbStatus(game),away=game.teams.away,home=game.teams.home,as=away.score??0,hs=home.score??0,aKey=`mlb:${game.gamePk}:away`,hKey=`mlb:${game.gamePk}:home`,pct=leftProb("mlb",game.gamePk,as,hs,st.live);
    const middle=st.preview
      ? `<div class="hero-center-panel"><div class="hero-at-clean">AT</div></div>`
      : `<div class="hero-center-panel"><div class="hero-score-center"><div class="hero-score away-score${scoreAnimationClass(aKey,as,st.live,Number(as)>Number(hs))}">${as}</div><div class="score-divider">–</div><div class="hero-score home-score${scoreAnimationClass(hKey,hs,st.live,Number(hs)>Number(as))}">${hs}</div></div>${st.live?`<div class="hero-live-detail mlb-live-detail">${baseDiamond(game.linescore,true)}<div class="hero-live-copy"><b>${esc(mlbInningText(game))}</b><span>${game.linescore?.balls??0}-${game.linescore?.strikes??0} • ${game.linescore?.outs??0} OUT${game.linescore?.outs===1?"":"S"}</span></div></div>`:""}</div>`;
    const headerDetail=st.live?mlbInningText(game):st.final?"FINAL":"";
    const bottomInfo=st.live?"":st.final?displayDate(game.gameDate):`${displayDate(game.gameDate)}  •  ${displayTime(game.gameDate)}  •  ${esc(game.venue?.name||"")}`;
    el.classList.toggle("is-live",st.live);
    el.innerHTML=`<div class="hero-kicker red-text"><span class="hero-kicker-main">MLB  •  ${st.live?"LIVE IN PROGRESS":st.final?"LAST GAME":"NEXT GAME"}</span>${headerDetail?`<span class="hero-kicker-detail">${esc(headerDetail)}</span>`:""}${st.live?`<span class="hero-live-pill"><span class="status-dot red"></span>LIVE</span>`:""}</div>
      <div class="hero-main hero-balanced"><div class="hero-team"><img class="hero-team-logo" src="${mlbTeamLogo(away.team)}" alt=""><div><div class="hero-abbr">${esc(teamAbbr(away.team))}</div><div class="hero-city">${esc(away.team.teamName||away.team.name)}</div><div class="hero-record">${esc(away.leagueRecord?.wins??"–")}-${esc(away.leagueRecord?.losses??"–")}</div></div></div>${middle}<div class="hero-team right"><div><div class="hero-abbr">${esc(teamAbbr(home.team))}</div><div class="hero-city">${esc(home.team.teamName||home.team.name)}</div><div class="hero-record">${esc(home.leagueRecord?.wins??"–")}-${esc(home.leagueRecord?.losses??"–")}</div></div><img class="hero-team-logo" src="${mlbTeamLogo(home.team)}" alt=""></div></div>
      ${bottomInfo?`<div class="next-info hero-bottom-info">${bottomInfo}</div>`:""}${oddsBar(pct,true,teamAbbr(away.team),teamAbbr(home.team))}`;
    rememberScore(aKey,as);rememberScore(hKey,hs);
  }

  function renderPatriotsHero(event) {
    const el=$("patriotsHero"); if(!event){el.innerHTML=`<div class="hero-loading">NO PATRIOTS GAME FOUND</div>`;return;}
    const {competition,away,home,type}=nflParts(event),live=type.state==="in",final=!!type.completed,as=Number(away?.score??0),hs=Number(home?.score??0),aKey=`nfl:${event.id}:away`,hKey=`nfl:${event.id}:home`,pct=leftProb("nfl",event.id,as,hs,live);
    const liveText=type.shortDetail||type.detail||"LIVE";
    const mid=live||final
      ? `<div class="hero-center-panel"><div class="hero-score-center"><div class="hero-score away-score${scoreAnimationClass(aKey,as,live,as>hs)}">${as}</div><div class="score-divider">–</div><div class="hero-score home-score${scoreAnimationClass(hKey,hs,live,hs>as)}">${hs}</div></div>${live?`<div class="hero-live-detail nfl-live-detail"><b>${esc(liveText)}</b><span>${esc(competition?.situation?.downDistanceText||competition?.situation?.possessionText||"")}</span></div>`:""}</div>`
      : `<div class="hero-center-panel"><div class="hero-at-clean">AT</div></div>`;
    const record=x=>x?.records?.[0]?.summary||"0-0",venue=competition?.venue?.fullName||"",broadcast=(competition?.broadcasts||[]).flatMap(b=>b.names||[]).join(" / ");
    const bottomInfo=live?"":final?"FINAL":`${displayDate(event.date)}  •  ${displayTime(event.date)}${venue?`  •  ${esc(venue)}`:""}${broadcast?`  •  ${esc(broadcast)}`:""}`;
    el.classList.toggle("is-live",live);
    el.innerHTML=`<div class="hero-kicker blue-text"><span class="hero-kicker-main">NFL  •  ${live?"LIVE IN PROGRESS":final?"FINAL":"NEXT GAME"}</span>${live?`<span class="hero-kicker-detail">${esc(liveText)}</span><span class="hero-live-pill nfl-live-pill"><span class="status-dot blue"></span>LIVE</span>`:final?`<span class="hero-kicker-detail">FINAL</span>`:""}</div>
      <div class="hero-main hero-balanced"><div class="hero-team"><img class="hero-team-logo" src="${away?.team?.logo||""}" alt=""><div><div class="hero-abbr">${esc(away?.team?.abbreviation||"AWAY")}</div><div class="hero-city">${esc(away?.team?.shortDisplayName||away?.team?.displayName||"")}</div><div class="hero-record">${esc(record(away))}</div></div></div>${mid}<div class="hero-team right"><div><div class="hero-abbr">${esc(home?.team?.abbreviation||"HOME")}</div><div class="hero-city">${esc(home?.team?.shortDisplayName||home?.team?.displayName||"")}</div><div class="hero-record">${esc(record(home))}</div></div><img class="hero-team-logo" src="${home?.team?.logo||""}" alt=""></div></div>
      ${bottomInfo?`<div class="next-info hero-bottom-info">${esc(bottomInfo)}</div>`:""}${oddsBar(pct,true,teamAbbr(away.team),teamAbbr(home.team))}`;
    rememberScore(aKey,as);rememberScore(hKey,hs);
  }

  function renderMlbRows() {
    const games=mlbSort(state.mlbGames),pages=Math.max(1,Math.ceil(games.length/ROWS_PER_PAGE));state.mlbPage%=pages;const slice=games.slice(state.mlbPage*ROWS_PER_PAGE,state.mlbPage*ROWS_PER_PAGE+ROWS_PER_PAGE);$("mlbPageLabel").textContent=pages>1?`TODAY  ${state.mlbPage+1}/${pages}`:"TODAY";
    const html=slice.map(game=>{
      const st=mlbStatus(game),away=game.teams.away,home=game.teams.home,as=away.score??0,hs=home.score??0,aKey=`mlb:${game.gamePk}:away`,hKey=`mlb:${game.gamePk}:home`,pct=leftProb("mlb",game.gamePk,as,hs,st.live);
      const field=st.live?`<div class="row-mini-field">${baseDiamond(game.linescore,true)}</div>`:"";
      const status=st.live
        ? `<div class="score-status-cell"><div class="score-status live">LIVE<small>${esc(mlbInningText(game))}</small></div>${field}<div class="mini-count">${game.linescore?.balls??0}-${game.linescore?.strikes??0} • ${game.linescore?.outs??0} OUT</div></div>`
        : st.final
          ? `<div class="score-status-cell"><div class="score-status final">FINAL<small>${displayDate(game.gameDate)}</small></div></div>`
          : `<div class="score-status-cell"><div class="score-status upcoming">${displayTime(game.gameDate)}<small>${displayDate(game.gameDate)}</small></div>${field}</div>`;
      const detail=`<div class="row-detail">${mlbPitcherMini(game)}${oddsBar(pct,false,teamAbbr(away.team),teamAbbr(home.team))}</div>`;
      const row=`<div class="score-row mlb-score-row">${status}<div class="row-team"><img src="${mlbTeamLogo(away.team)}" alt=""><span class="row-team-name">${esc(teamAbbr(away.team))}</span></div><div class="row-score${scoreAnimationClass(aKey,as,st.live,Number(as)>Number(hs))}">${st.preview?"–":as}</div><div class="score-separator">|</div><div class="row-score${scoreAnimationClass(hKey,hs,st.live,Number(hs)>Number(as))}">${st.preview?"–":hs}</div><div class="row-team right"><span class="row-team-name">${esc(teamAbbr(home.team))}</span><img src="${mlbTeamLogo(home.team)}" alt=""></div>${detail}</div>`;
      rememberScore(aKey,as);rememberScore(hKey,hs);return row;
    }).join("");
    $("mlbRows").innerHTML=html+Array.from({length:Math.max(0,ROWS_PER_PAGE-slice.length)},()=>`<div class="empty-row">—</div>`).join("");
  }

  function renderNflRows() {
    const games=nflSort(state.nflGames),pages=Math.max(1,Math.ceil(games.length/ROWS_PER_PAGE));state.nflPage%=pages;const slice=games.slice(state.nflPage*ROWS_PER_PAGE,state.nflPage*ROWS_PER_PAGE+ROWS_PER_PAGE);$("nflPageLabel").textContent=pages>1?`CURRENT  ${state.nflPage+1}/${pages}`:"CURRENT";
    const html=slice.map(event=>{
      const {competition,away,home,type}=nflParts(event),live=type.state==="in",final=!!type.completed,as=Number(away?.score??0),hs=Number(home?.score??0),aKey=`nfl:${event.id}:away`,hKey=`nfl:${event.id}:home`,pct=leftProb("nfl",event.id,as,hs,live);
      const status=live
        ? `<div class="score-status-cell"><div class="score-status live">LIVE<small>${esc(type.shortDetail||type.detail||"")}</small></div></div>`
        : final
          ? `<div class="score-status-cell"><div class="score-status final">FINAL<small>${esc(type.shortDetail||"")}</small></div></div>`
          : `<div class="score-status-cell"><div class="score-status upcoming">${displayDate(event.date)}<small>${displayTime(event.date)}</small></div></div>`;
      const detail=`<div class="row-detail nfl-detail">${live?nflLiveInfo(competition,type):final?`<div class="row-detail-title">FINAL</div><div class="live-detail">${esc(competition?.venue?.fullName||"")}</div>`:nflPregameInfo(competition,away,home)}${oddsBar(pct,false,away?.team?.abbreviation||"AWAY",home?.team?.abbreviation||"HOME")}</div>`;
      const row=`<div class="score-row nfl-score-row">${status}<div class="row-team"><img src="${away?.team?.logo||""}" alt=""><span class="row-team-name">${esc(away?.team?.abbreviation||"")}</span></div><div class="row-score${scoreAnimationClass(aKey,as,live,as>hs)}">${live||final?as:"–"}</div><div class="score-separator">${live||final?"|":"AT"}</div><div class="row-score${scoreAnimationClass(hKey,hs,live,hs>as)}">${live||final?hs:"–"}</div><div class="row-team right"><span class="row-team-name">${esc(home?.team?.abbreviation||"")}</span><img src="${home?.team?.logo||""}" alt=""></div>${detail}</div>`;
      rememberScore(aKey,as);rememberScore(hKey,hs);return row;
    }).join("");
    $("nflRows").innerHTML=html+Array.from({length:Math.max(0,ROWS_PER_PAGE-slice.length)},()=>`<div class="empty-row">—</div>`).join("");
  }

  function chooseRedSoxHero(todayGames,nearGames) {
    const isBos=g=>g.teams?.away?.team?.id===BOS_ID||g.teams?.home?.team?.id===BOS_ID;
    const todayBos=todayGames.filter(isBos);
    const live=todayBos.find(g=>mlbStatus(g).live);
    if(live)return live;

    // Keep the most recent COMPLETED Red Sox game in the large timing card
    // until the next Boston game actually goes live. The separate matchup card
    // on the right still shows the upcoming game.
    const latestFinal=nearGames.filter(g=>isBos(g)&&mlbStatus(g).final)
      .sort((a,b)=>new Date(b.gameDate)-new Date(a.gameDate))[0];
    if(latestFinal)return latestFinal;

    return nearGames.filter(g=>isBos(g)&&mlbStatus(g).preview)
      .sort((a,b)=>new Date(a.gameDate)-new Date(b.gameDate))[0]||null;
  }
  function choosePatriotsHero(events) {const ne=events.filter(e=>{const {away,home}=nflParts(e);return away?.team?.abbreviation==="NE"||home?.team?.abbreviation==="NE";});return ne.find(nflIsLive)||ne.filter(e=>!nflIsFinal(e)).sort((a,b)=>new Date(a.date)-new Date(b.date))[0]||ne.filter(nflIsFinal).sort((a,b)=>new Date(b.date)-new Date(a.date))[0]||null;}
  function findNextBosGame(nearGames) {const now=Date.now();return nearGames.filter(g=>g.teams?.away?.team?.id===BOS_ID||g.teams?.home?.team?.id===BOS_ID).filter(g=>mlbStatus(g).preview&&new Date(g.gameDate).getTime()>=now-2*60*60*1000).sort((a,b)=>new Date(a.gameDate)-new Date(b.gameDate))[0]||null;}
  function findLiveBosGame(todayGames) {return todayGames.find(g=>mlbStatus(g).live&&(g.teams?.away?.team?.id===BOS_ID||g.teams?.home?.team?.id===BOS_ID))||null;}
  function gameTv(game) {const side=game?.teams?.home?.team?.id===BOS_ID?"home":"away";const tv=(game?.broadcasts||[]).filter(b=>String(b.type).toUpperCase()==="TV");if(!tv.length)return"TBD";return (tv.find(b=>b.homeAway===side)||tv.find(b=>b.isNational)||tv[0])?.name||"TBD";}

  async function pitcherStats(personId) {
    if(!personId)return null;try{const data=await getJSON(MLB.person(personId,new Date().getFullYear())),person=data?.people?.[0],stat=person?.stats?.flatMap(x=>x.splits||[])?.[0]?.stat||{};return{name:person?.fullName||"TBD",hand:person?.pitchHand?.code||"",wins:stat.wins,losses:stat.losses,era:stat.era,whip:stat.whip};}catch{return null;}
  }

  async function renderNextMatchup(game) {
    if(!game){$("nextMatchup").innerHTML=`<div class="detail-loading">NO UPCOMING GAME FOUND</div>`;$("pitchers").innerHTML=`<div class="detail-loading">PROBABLES TBD</div>`;$("tvNetwork").textContent="TV: TBD";return;}
    const away=game.teams.away,home=game.teams.home;const bos=away.team.id===BOS_ID?away:home,opp=away.team.id===BOS_ID?home:away;$("tvNetwork").textContent=`TV: ${gameTv(game)}`;
    $("nextMatchup").innerHTML=`<div class="match-team"><img src="${mlbTeamLogo(bos.team)}" alt=""><div><div class="match-abbr">${esc(teamAbbr(bos.team))}</div><div class="match-name">${esc(bos.team.teamName||bos.team.name)}</div><div class="match-record">${esc(bos.leagueRecord?.wins??"–")}-${esc(bos.leagueRecord?.losses??"–")}</div></div></div><div class="match-center-stack"><div class="match-at-box">AT</div><div class="match-center-red">${displayDate(game.gameDate)} • ${displayTime(game.gameDate)}</div><div class="match-center-red small">${esc(game.venue?.name||"")}</div><div class="match-center-red small">${esc(gameTv(game))}</div></div><div class="match-team right"><div><div class="match-abbr">${esc(teamAbbr(opp.team))}</div><div class="match-name">${esc(opp.team.teamName||opp.team.name)}</div><div class="match-record">${esc(opp.leagueRecord?.wins??"–")}-${esc(opp.leagueRecord?.losses??"–")}</div></div><img src="${mlbTeamLogo(opp.team)}" alt=""></div>`;
    const [bosP,oppP]=await Promise.all([pitcherStats(bos.probablePitcher?.id),pitcherStats(opp.probablePitcher?.id)]);
    const box=(team,p,right=false)=>{const name=p?.name||team.probablePitcher?.fullName||"TBD",hand=p?.hand?`${p.hand}HP`:"",line=p&&p.era?`${p.wins??"–"}-${p.losses??"–"} • ${p.era} ERA${p.whip?` • ${p.whip} WHIP`:""}`:"SEASON STATS TBD";return `<div class="pitcher ${right?"right":""}">${right?"":`<img src="${mlbTeamLogo(team.team)}" alt="">`}<div><div class="pitcher-name">${esc(name)}</div><div class="pitcher-hand">${esc(hand)}</div><div class="pitcher-stat">${esc(line)}</div></div>${right?`<img src="${mlbTeamLogo(team.team)}" alt="">`:""}</div>`;};
    $("pitchers").innerHTML=`${box(bos,bosP)}<div class="pitcher-vs">VS</div>${box(opp,oppP,true)}`;
  }

  function teamBox(feed,teamId) {const side=feed?.gameData?.teams?.home?.id===teamId?"home":"away";return feed?.liveData?.boxscore?.teams?.[side]||null;}
  function seasonLineupFromBox(boxTeam) {
    const order=boxTeam?.battingOrder||[],players=boxTeam?.players||{};return order.slice(0,9).map((id,i)=>{const p=players[`ID${id}`]||{},s=p.seasonStats?.batting||{};return{order:i+1,name:p.person?.fullName||"Player",pos:p.position?.abbreviation||"—",v1:s.avg??"—",v2:s.homeRuns??"—",v3:s.rbi??"—",v4:s.ops??"—"};});
  }
  function liveLineupFromBox(boxTeam) {
    const order=boxTeam?.battingOrder||[],players=boxTeam?.players||{};return order.slice(0,9).map((id,i)=>{const p=players[`ID${id}`]||{},s=p.stats?.batting||{};return{order:i+1,name:p.person?.fullName||"Player",pos:p.position?.abbreviation||"—",v1:s.atBats??0,v2:s.hits??0,v3:s.runs??0,v4:s.rbi??0};});
  }
  async function recentCompletedGame(teamId) {try{const d=await getJSON(mlbScheduleUrl({startDate:isoDate(-7),endDate:isoDate(0),teamId}));return flattenSchedule(d).filter(g=>mlbStatus(g).final).sort((a,b)=>new Date(b.gameDate)-new Date(a.gameDate))[0]||null;}catch{return null;}}
  async function buildPregameLineup(teamId,nextGame,teamName) {
    if(nextGame?.gamePk){try{const feed=await getJSON(MLB.gameFeed(nextGame.gamePk)),rows=seasonLineupFromBox(teamBox(feed,teamId));if(rows.length>=9)return{rows,label:"OFFICIAL",title:`${teamName.toUpperCase()} LINEUP`,mode:"season"};}catch{}}
    const prev=await recentCompletedGame(teamId);if(prev?.gamePk){try{const feed=await getJSON(MLB.gameFeed(prev.gamePk)),rows=seasonLineupFromBox(teamBox(feed,teamId));if(rows.length)return{rows,label:"PROJECTED • LAST GAME",title:`${teamName.toUpperCase()} LINEUP`,mode:"season"};}catch{}}
    return{rows:[],label:"PROJECTED",title:`${teamName.toUpperCase()} LINEUP`,mode:"season"};
  }
  async function buildLiveLineups(liveGame) {
    const feed=await getJSON(MLB.gameFeed(liveGame.gamePk));const away=liveGame.teams.away,home=liveGame.teams.home;const bos=away.team.id===BOS_ID?away:home,opp=away.team.id===BOS_ID?home:away;
    return {bos:{rows:liveLineupFromBox(teamBox(feed,BOS_ID)),label:"LIVE STATS",title:"RED SOX LIVE BATTING",mode:"live",accent:RED_SOX_RED},opp:{rows:liveLineupFromBox(teamBox(feed,opp.team.id)),label:"LIVE STATS",title:`${(opp.team.teamName||opp.team.name).toUpperCase()} LIVE BATTING`,mode:"live",accent:TEAM_COLORS[opp.team.id]||"#7fbfff"}};
  }
  async function refreshLineupContext(liveGame,nextGame) {
    if(liveGame) {
      try{state.lineups=await buildLiveLineups(liveGame);state.lineupContextPk=`live:${liveGame.gamePk}`;state.lineupUpdatedAt=Date.now();drawLineup(state.lineupView);return;}catch(e){console.warn("Live lineup failed",e);}
    }
    if(!nextGame)return;const away=nextGame.teams.away,home=nextGame.teams.home,opp=away.team.id===BOS_ID?home:away;const [bos,other]=await Promise.all([buildPregameLineup(BOS_ID,nextGame,"RED SOX"),buildPregameLineup(opp.team.id,nextGame,opp.team.teamName||opp.team.name)]);bos.accent=RED_SOX_RED;other.accent=TEAM_COLORS[opp.team.id]||"#7fbfff";state.lineups={bos,opp:other};state.lineupContextPk=`next:${nextGame.gamePk}`;state.lineupUpdatedAt=Date.now();drawLineup(state.lineupView);
  }
  function setLineupHeaders(mode) {const labels=mode==="live"?["#","PLAYER","POS","AB","H","R","RBI"]:["#","PLAYER","POS","AVG","HR","RBI","OPS"];for(let i=1;i<=7;i++)$(`col${i}`).textContent=labels[i-1];}
  function drawLineup(view=state.lineupView) {
    const data=state.lineups?.[view];if(!data)return;state.lineupView=view;$("lineupTitle").textContent=data.title;$("lineupMode").textContent=data.label;$("lineupPanel").style.setProperty("--lineup-accent",view==="bos"?RED_SOX_RED:(data.accent||"#7fbfff"));$("lineupPanel").classList.toggle("live-stats",data.mode==="live");setLineupHeaders(data.mode);
    const rows=data.rows||[];$("lineupRows").innerHTML=rows.length?rows.slice(0,9).map(p=>`<div class="lineup-row"><span class="num">${p.order}</span><span class="player-name">${esc(p.name).toUpperCase()}</span><span class="pos">${esc(p.pos)}</span><span class="stat">${esc(p.v1)}</span><span class="stat">${esc(p.v2)}</span><span class="stat">${esc(p.v3)}</span><span class="stat">${esc(p.v4)}</span></div>`).join(""):Array.from({length:9},(_,i)=>`<div class="lineup-row"><span class="num">${i+1}</span><span class="player-name">LINEUP TBD</span><span class="pos">—</span><span class="stat">—</span><span class="stat">—</span><span class="stat">—</span><span class="stat">—</span></div>`).join("");
  }

  function normalizeNews(data,source){return(data?.articles||[]).map(a=>({title:a.headline||a.title,source:a.source||source})).filter(x=>x.title);}
  function renderTicker(){const liveMlb=state.mlbGames.filter(g=>mlbStatus(g).live).slice(0,4).map(g=>{const a=g.teams.away,h=g.teams.home;return`LIVE ${teamAbbr(a.team)} ${a.score??0} – ${h.score??0} ${teamAbbr(h.team)}  ${mlbInningText(g)}  ${leftProb("mlb",g.gamePk,a.score,h.score,true)}%`;});const liveNfl=state.nflGames.filter(nflIsLive).slice(0,3).map(e=>{const {away,home,type}=nflParts(e);return`LIVE ${away.team.abbreviation} ${away.score??0} – ${home.score??0} ${home.team.abbreviation}  ${type.shortDetail||type.detail||""}  ${leftProb("nfl",e.id,away.score,home.score,true)}%`;});const headlines=state.news.slice(0,9).map(n=>n.title),items=[...liveMlb,...liveNfl,...headlines];const html=(items.length?items:["SPORTS DATA CONNECTED"]).map(x=>`${esc(x)} <span class="bullet">•</span>`).join(" ");$("newsTicker").innerHTML=`${html} ${html}`;}

  async function refreshCore() {
    if(state.refreshBusy)return;state.refreshBusy=true;
    try{
      const [todayMlb,nearBos,espnMlb,nfl]=await Promise.all([getJSON(mlbScheduleUrl({date:isoDate(0)})),getJSON(mlbScheduleUrl({startDate:isoDate(-7),endDate:isoDate(10),teamId:BOS_ID})),getJSON(ESPN.mlbScores),getJSON(ESPN.nflScores)]);
      state.mlbGames=flattenSchedule(todayMlb);state.espnMlbEvents=espnMlb?.events||[];state.nflGames=nfl?.events||[];initProbabilities();await refreshLiveProbabilities();
      const nearGames=flattenSchedule(nearBos),heroGame=chooseRedSoxHero(state.mlbGames,nearGames),patriotGame=choosePatriotsHero(state.nflGames),nextGame=findNextBosGame(nearGames),liveGame=findLiveBosGame(state.mlbGames);
      state.heroMlb=heroGame;state.heroNfl=patriotGame;
      renderMlbHero(heroGame);renderPatriotsHero(patriotGame);renderMlbRows();renderNflRows();await renderNextMatchup(nextGame);
      const contextKey=liveGame?`live:${liveGame.gamePk}`:nextGame?`next:${nextGame.gamePk}`:null;const shouldRefreshLineup=!!liveGame||contextKey!==state.lineupContextPk||Date.now()-state.lineupUpdatedAt>120000;
      if(shouldRefreshLineup) await refreshLineupContext(liveGame,nextGame); else drawLineup(state.lineupView);
      $("lastSync").textContent=`SYNC ${new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}`;renderTicker();
    }catch(err){console.error(err);$("lastSync").textContent="SYNC RETRY";}finally{state.refreshBusy=false;}
  }
  async function refreshNews(){try{const [bos,ne,mlb,nfl]=await Promise.all([getJSON(ESPN.bosNews),getJSON(ESPN.neNews),getJSON(ESPN.mlbNews),getJSON(ESPN.nflNews)]);const all=[...normalizeNews(bos,"RED SOX"),...normalizeNews(ne,"PATRIOTS"),...normalizeNews(mlb,"MLB"),...normalizeNews(nfl,"NFL")],seen=new Set();state.news=all.filter(x=>x.title&&!seen.has(x.title)&&seen.add(x.title));renderTicker();}catch(e){console.warn("News refresh failed",e);}}
  function autoRotate(){const mp=Math.max(1,Math.ceil(state.mlbGames.length/ROWS_PER_PAGE)),np=Math.max(1,Math.ceil(state.nflGames.length/ROWS_PER_PAGE));if(mp>1){state.mlbPage=(state.mlbPage+1)%mp;renderMlbRows();}if(np>1){state.nflPage=(state.nflPage+1)%np;renderNflRows();}}
  function rotateLineup(){if(!state.lineups?.opp)return;state.lineupView=state.lineupView==="bos"?"opp":"bos";drawLineup(state.lineupView);}
  async function fastOddsRefresh(){
    if(state.oddsBusy||(!state.mlbGames.some(g=>mlbStatus(g).live)&&!state.nflGames.some(nflIsLive)))return;
    state.oddsBusy=true;
    try{await refreshLiveProbabilities();if(state.heroMlb)renderMlbHero(state.heroMlb);if(state.heroNfl)renderPatriotsHero(state.heroNfl);renderMlbRows();renderNflRows();renderTicker();}
    finally{state.oddsBusy=false;}
  }

  updateClock();setInterval(updateClock,1000);refreshCore();refreshNews();setInterval(refreshCore,15000);setInterval(refreshNews,5*60*1000);setInterval(autoRotate,11000);setInterval(rotateLineup,9000);setInterval(fastOddsRefresh,1000);
})();

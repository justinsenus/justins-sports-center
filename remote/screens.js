(() => {
  'use strict';
  const app=window.FantasyCenter, esc=app.escape, n=app.format;
  const labels={overview:'MATCHUP CENTER',matchups:'STARTERS',players:'PLAYERS',injuries:'INJURY WATCH',live:'LIVE NFL GAMES',stock:'LEAGUE STOCK BOARD',league:'LEAGUE MATCHUPS',patriots:'PATRIOTS',games:'NFL GAME CENTER'};
  const gameState=g=>g?.competitions?.[0]?.status?.type || g?.status?.type || {};
  const sideColor=(league,name)=> (league.teams || []).find(t=>t.name===name)?.teamColor || '#9ca3af';
  const previousScores=new Map();
  const movement=(key,value)=>{const old=previousScores.get(key);previousScores.set(key,value);return old===undefined||Math.abs(value-old)<.05?'':value>old?'score-up':'score-down';};
  function hero(m) {
    const l=m.league;
    return `<section class="tv-matchup"><div class="tv-side" style="--side:${esc(sideColor(l,l.ownName))}"><div class="tv-team-title">${l.ownAvatar?`<img src="${esc(l.ownAvatar)}" alt="">`:''}<h1>${esc(l.ownName)}</h1></div><strong class="tv-big-score ${movement(m.ui.league+':'+(m.ui.matchupId||'mine')+':own',m.ownActual)}">${n(m.ownActual)}</strong><div class="tv-estimate">EST. FINISH <b>${n(m.ownFinish)}</b></div></div><div class="tv-versus"><span>WEEK ${esc(l.week)}</span><b>VS</b><small>${m.winChance}% / ${100-m.winChance}%</small></div><div class="tv-side" style="--side:${esc(sideColor(l,l.opponentName))}"><div class="tv-team-title">${l.opponentAvatar?`<img src="${esc(l.opponentAvatar)}" alt="">`:''}<h1>${esc(l.opponentName)}</h1></div><strong class="tv-big-score ${movement(m.ui.league+':'+(m.ui.matchupId||'mine')+':opponent',m.opponentActual)}">${n(m.opponentActual)}</strong><div class="tv-estimate">EST. FINISH <b>${n(m.opponentFinish)}</b></div></div></section>`;
  }
  function player(m) {
    const p=m.player;
    if(!p)return `<div class="tv-loading">Loading selected player from ${esc(m.ui.league.toUpperCase())}…</div>`;
    const team=(m.league.teams||[]).find(t=>(t.players||[]).some(x=>String(x.player_id)===String(p.player_id)));
    return `<section class="tv-player" style="--side:${esc(team?.teamColor||'#ff7a00')}"><div class="tv-player-identity">${app.markup.face(p,'large')}<div class="tv-player-text"><span>${esc(p.position)} · ${esc(p.team)} · ${esc(p.status||'UPCOMING')}</span><h1>${esc(p.full_name||p.name)}</h1><p>${esc(team?.name||'')}<br>${esc(app.markup.gameLabel(p))}</p></div><div class="tv-player-points"><b>${n(p.actual??p.points)}</b><span>FANTASY POINTS</span><strong>PROJ ${n(p.projected,1,'WAITING')}</strong></div></div><div class="tv-player-stats"><h2>PLAYER STATS</h2>${app.markup.stats(p,'tv-stat-grid')}<p>STATS REPORTED BY ${esc(m.ui.league.toUpperCase())} · LIVE DATA CONTINUES</p></div></section>`;
  }
  function gameCard(g,large=false) {
    const competitors=g?.competitions?.[0]?.competitors||[], s=gameState(g);
    const sides=competitors.slice().sort((a,b)=>(a.homeAway==='away'?-1:1)-(b.homeAway==='away'?-1:1));
    return `<article class="tv-game ${large?'featured':''}"><span class="tv-game-state ${s.state==='in'?'is-live':''}">${esc(s.shortDetail||s.description||'SCHEDULED')}</span><div class="tv-game-sides">${sides.map(t=>`<div><img src="${esc(t.team?.logo||'')}" alt="${esc(t.team?.abbreviation||'')}"><strong>${esc(t.team?.displayName||t.team?.abbreviation||'TEAM')}</strong><b>${esc(t.score??'—')}</b></div>`).join('')}</div><small>${esc(g.name||'NFL')} · ${esc(g.date?new Date(g.date).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'}):'')}</small></article>`;
  }
  function games(m) {
    const list=m.games||[];
    const chosen=m.ui.gameId ? list.find(g=>String(g.id)===m.ui.gameId) : m.ui.view==='patriots'?list.find(g=>(g.competitions?.[0]?.competitors||[]).some(t=>['NE','New England Patriots'].includes(t.team?.abbreviation)||t.team?.displayName==='New England Patriots')):null;
    if(chosen)return `<div class="tv-featured-game">${gameCard(chosen,true)}</div>`;
    return `<div class="tv-games-grid">${list.slice().sort((a,b)=>(gameState(b).state==='in'?1:0)-(gameState(a).state==='in'?1:0)).slice(0,12).map(g=>gameCard(g)).join('')||'<div class="tv-loading">NFL schedule feed is waiting for a provider update.</div>'}</div>`;
  }
  function roster(m) {
    const l=m.league;
    return `<div class="tv-rosters">${['own','opponent'].map(side=>`<section style="--side:${esc(sideColor(l,side==='own'?l.ownName:l.opponentName))}"><h2>${esc(side==='own'?l.ownName:l.opponentName)}</h2>${(l[side]||[]).filter(p=>m.ui.view==='injuries'?/OUT|IR|DOUBTFUL|QUESTIONABLE|INJURY/i.test(p.status||p.injury_status||''):m.ui.view==='players'?true:p.starter!==false).slice(0,16).map(p=>`<div class="tv-roster-row">${app.markup.face(p,'small')}<span><b>${esc(p.full_name||p.name)}</b><small>${esc(p.position)} · ${esc(p.team)} · ${esc(p.status||'UPCOMING')}</small></span><strong>${n(p.actual??p.points)}</strong><small>PROJ ${n(p.projected,1,'—')}</small></div>`).join('')}</section>`).join('')}</div>`;
  }
  if(document.body.dataset.screen==='tv') {
    window.FantasyTV={render:()=>{
      const m=app.model(), l=m.league, stage=document.getElementById('tvStage');
      document.getElementById('tvContext').textContent=m.ui.league.toUpperCase()+' · '+labels[m.ui.view];
      document.getElementById('tvFeedStatus').textContent=m.loading?'DATA FEEDS CONNECTING':m.error?'PROVIDER FEED PARTIAL':'LIVE LEAGUE DATA';
      document.getElementById('tvFeedStatus').className=m.error?'feed-partial':'';
      document.getElementById('tvUpdated').textContent=m.updated?'UPDATED '+new Date(m.updated).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'WAITING FOR PROVIDERS';
      if(m.loading){stage.innerHTML='<div class="tv-loading">Loading live Sleeper + ESPN data…</div>';return;}
      if(!l.ready || l.id !== m.ui.league){stage.innerHTML='<div class="tv-loading">'+esc(m.ui.league.toUpperCase())+' league feed is unavailable. Scores will appear when the provider reconnects.</div>';return;}
      if(m.ui.playerId){stage.innerHTML=player(m);stage.dataset.scene='player';return;}
      stage.dataset.scene=m.ui.view;
      if(['live','games','patriots'].includes(m.ui.view)){stage.innerHTML=games(m);return;}
      if(m.ui.view==='stock'){stage.innerHTML=app.markup.stock(l);return;}
      if(m.ui.view==='league'){stage.innerHTML=app.markup.league(l);return;}
      if(['matchups','players','injuries'].includes(m.ui.view)){stage.innerHTML=hero(m)+roster(m);return;}
      stage.innerHTML=hero(m)+`<div class="tv-overview-bottom">${app.markup.momentum(l)}${app.markup.feed(l)}</div>`;
    }};
    setInterval(()=>{document.getElementById('tvClock').textContent=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});},1000);
    app.render();
  } else {
    document.getElementById('myMatchup')?.addEventListener('click',()=>app.dispatch({matchupId:null,playerId:null,view:'overview'}));
    document.getElementById('closeOnTV')?.addEventListener('click',()=>app.dispatch({playerId:null}));
    document.addEventListener('fantasy:render',()=>{
      const ui=app.getUI();
      document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===ui.view));
      document.querySelectorAll('[data-league]').forEach(b=>b.classList.toggle('active',b.dataset.league===ui.league));
      if(document.getElementById('onTV'))document.getElementById('onTV').textContent=(ui.playerId?'PLAYER DETAIL':labels[ui.view])+' · '+ui.league.toUpperCase();
    });
    let start=null;
    const workspace=document.getElementById('workspace');
    workspace.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')start={x:e.clientX,y:e.clientY};});
    workspace.addEventListener('pointerup',e=>{
      if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;
      if(Math.abs(dx)<100||Math.abs(dx)<Math.abs(dy)*1.6)return;
      const views=['overview','stock','league','live','patriots'];let index=views.indexOf(app.getUI().view);
      index=(Math.max(0,index)+(dx<0?1:-1)+views.length)%views.length;
      app.dispatch({view:views[index],playerId:null});
    });
    workspace.addEventListener('pointercancel',()=>{start=null;});
  }
})();

(() => {
  'use strict';
  const app = window.FantasyCenter, esc = app.escape, fmt = app.format;
  const tv = document.body.dataset.screen === 'tv';
  const $ = id => document.getElementById(id);
  const patch=(element,markup)=>window.FantasyDOM?window.FantasyDOM.patch(element,markup):element.innerHTML=markup;
  const actual = p => app.data.actual(p);
  const ownColor = '#f47b35';
  const finite = value => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const color = (l, name) => (l.teams || []).find(t => t.name === name)?.teamColor || '#aca0e5';
  const dot = c => '<i class="team-dot" style="--team-color:'+esc(c)+'"></i>';
  const labels = {overview:'Matchup',players:'Players',league:'League matchups',stock:'Stock board',patriots:'Patriots',matchups:'Both teams',injuries:'Injuries',live:'NFL games',games:'NFL games'};
  const icons = {
    overview:'<path d="M4 20V10h4v10m4 0V4h4v16m4 0V7h3v13"/>',
    players:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4m3-17a3 3 0 0 1 0 6m1 5a5 5 0 0 1 3 5"/>',
    league:'<circle cx="8" cy="7" r="3"/><circle cx="18" cy="8" r="2"/><path d="M2 21v-4a6 6 0 0 1 12 0v4m2-7a5 5 0 0 1 6 5v2"/>',
    stock:'<path d="M3 18 9 12l4 3 8-11m-6 0h6v6"/>',
    patriots:'<path d="M6 4c6-3 14 3 15 9S13 25 7 20 0 7 6 4Zm1 5 10 9m-8-7 3-3m0 6 3-3"/>'
  };
  const icon = key => '<svg viewBox="0 0 26 26" aria-hidden="true">'+icons[key]+'</svg>';
  const time = value => value ? new Date(value).toLocaleString([], {timeZone:'America/New_York',weekday:'short',hour:'numeric',minute:'2-digit'}) : '';
  let activeWindows=[];
  const rankSeries=series=>series.slice().sort((a,b)=>b.value-a.value || String(a.name).localeCompare(String(b.name)));
  function rangeControls() {
    const range=app.getUI().chartRange || 'week';
    return tv?'<span class="chart-range-label">'+(range==='hour'?'Live hour':'Full week · compressed')+'</span>':'<div class="chart-range-controls" role="group" aria-label="Chart time range"><button type="button" data-chart-range="week" aria-pressed="'+(range==='week')+'">Full week</button><button type="button" data-chart-range="hour" aria-pressed="'+(range==='hour')+'">Live hour</button></div>';
  }
  let latestScope = '', scoreSnapshots = new Map(), lastStage = '', lastPlayer = '';
  function normalizeHistory(raw, series) {
    let history = (raw || []).filter(p => p && Array.isArray(p.values)).map(p => ({at:p.at || null,values:p.values.map(v=>finite(v) ?? 0)}));
    const zero = {at:null,values:series.map(()=>0),baseline:true,synthetic:true};
    if (!history.length || history[0].values.some(v=>Math.abs(v)>.001)) history.unshift(zero);
    else history[0] = {...history[0],baseline:true};
    const current = series.map(s=>s.value);
    if (!history.length || current.some((v,i)=>Math.abs(v-(history[history.length-1].values[i] || 0))>.001)) history.push({at:null,values:current});
    if (history.length===1) history.push({at:null,values:current});
    return history;
  }
  function geometry(history, timeline=false, slim=false) {
    const values = history.flatMap(h=>h.values);
    const highest = Math.max(50,...values), lowest = Math.min(0,...values);
    const rough = (highest-lowest)/4, magnitude = Math.pow(10,Math.floor(Math.log10(rough)));
    const step = [1,2,2.5,5,10].find(s=>s*magnitude>=rough)*magnitude;
    const min = Math.floor(lowest/step)*step, max = Math.ceil(highest/step)*step;
    const left=42,right=600,top=slim?8:18,bottom=slim?87:169;
    const x = i=>left+(history[i].index ?? i)/Math.max(1,history.length-1)*(right-left);
    const y = v=>bottom-(v-min)/(max-min)*(bottom-top);
    return {min,max,step,left,right,top,bottom,x,y};
  }
  function chart(series, raw, options={}) {
    const tracked=normalizeHistory(raw,series);
    const range=app.getUI().chartRange || 'week';
    const history=window.FantasyTimeline?window.FantasyTimeline.select(tracked,{range,windows:activeWindows}):tracked;
    if(history.length===1)history.push({...history[0],index:1,displayOnly:true});
    const g=geometry(history,false,options.slim), endLabels=!options.league;
    let grid='', axes='', lines='';
    for(let tick=g.min;tick<=g.max+.001;tick+=g.step) {
      const yy=g.y(tick);
      grid+='<path d="M'+g.left+' '+yy+'H'+g.right+'"/><text x="32" y="'+(yy+4)+'" text-anchor="end">'+fmt(tick,0)+'</text>';
    }
    const observed=history.filter(h=>h.at && !h.baseline && !h.displayOnly);
    const lastIndex=history.length-1;
    const indices=[0,...new Set([Math.round(lastIndex/3),Math.round(lastIndex*2/3)].filter(i=>i>0 && i<lastIndex)),lastIndex];
    const seenLabels=new Set();
    indices.forEach((index,i)=>{
      const xx=g.x(index);
      let label=index===0?(range==='hour'?'Window start':'Start'):index===lastIndex?'Latest':time(history[index]?.at);
      if(!label || seenLabels.has(label))return;
      seenLabels.add(label);
      axes+='<text x="'+g.x(index)+'" y="'+(options.slim?114:196)+'" text-anchor="'+(index===0?'start':index===lastIndex?'end':'middle')+'">'+esc(label)+'</text>';
    });
    const yLabels=series.map(s=>g.y(s.value));
    if(endLabels && yLabels.length===2 && Math.abs(yLabels[0]-yLabels[1])<15) {
      const mid=(yLabels[0]+yLabels[1])/2;
      const first=yLabels[0]<=yLabels[1]?0:1;
      yLabels[first]=Math.max(g.top,mid-8);yLabels[1-first]=Math.min(g.bottom+3,mid+8);
    }
    series.forEach((s,index)=>{
      const points=history.map((h,i)=>[g.x(i),g.y(h.values[index] || 0)]);
      let path='M'+points[0].join(' ');
      points.slice(1).forEach((p,i)=>{path+=i===0 && history[0].baseline?'L'+p.join(' '):'H'+p[0]+'V'+p[1];});
      const stride=Math.max(1,Math.ceil(points.length/35));
      const dots=points.filter((_,i)=>i>0 && i%stride===0).map(p=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="1.6"/>').join('');
      lines+='<g class="glass-series" style="--series:'+esc(s.color)+'"><path d="'+path+'"/>'+dots+'<circle class="chart-end" cx="'+g.right+'" cy="'+g.y(s.value)+'" r="3.8"/>'+
        (endLabels?'<text class="chart-end-label" x="616" y="'+(yLabels[index]+4)+'">'+fmt(s.value)+'</text>':'')+'</g>';
    });
    const recordNote=range==='hour'?(activeWindows.length?'Live hour · last 60 recorded active minutes':'Live hour · waiting for observed games'):observed.length?'Full week · recorded since '+time(observed[0].at):'Full week · history starts on this screen';
    return '<div class="glass-chart-wrap"><svg class="glass-chart" viewBox="0 0 '+(endLabels?680:624)+' '+(options.slim?126:208)+'" preserveAspectRatio="none" role="img" aria-label="'+esc(options.title || 'Fantasy points history')+'"><g class="glass-chart-grid">'+grid+'</g><g class="glass-chart-times">'+axes+'</g>'+lines+'</svg></div>'+
      '<div class="chart-caption"><span>'+esc(recordNote)+'</span><span>'+Math.max(0,history.filter(h=>!h.displayOnly).length-1)+' updates</span></div>';
  }
  function dataFor(m, all=false) {
    const l=m.league, teams=l.teams || [];
    const started=all?m.leagueStarted:m.started;
    const items=all?teams: [l.ownName,l.opponentName].map(name=>teams.find(t=>t.name===name) || {name,teamColor:color(l,name)});
    const series=items.map((t,i)=>({id:String(t.id),name:t.name,color:t.teamColor || (i===0?ownColor:'#aca0e5'),
      value:all?(started?(finite(t.total)??0):(finite(t.projected)??0)):(m.started?(i===0?m.ownActual:m.opponentActual):(i===0?m.ownFinish:m.opponentFinish))}));
    const raw=all || !m.started ? (m.teamHistory || []).map(h=>({at:h.at,values:series.map(s=>finite(h.totals?.[s.id]) ?? 0)})) :
      (m.history || []).map(h=>({at:h.at,values:[h.own,h.opponent]}));
    return {series,raw};
  }
  function legend(series, totals=false) {
    return '<div class="chart-legend">'+series.map(s=>'<span>'+dot(s.color)+'<span>'+esc(s.name)+'</span>'+(totals?'<b>'+fmt(s.value)+'</b>':'')+'</span>').join('')+'</div>';
  }
  function momentum(m) {
    const data=dataFor(m);
    return '<section class="glass-panel matchup-chart"><div class="panel-title"><h2>'+ (m.started?'Matchup scoring':'Matchup projections')+'</h2>'+legend(data.series)+'</div>'+
      rangeControls()+chart(data.series,data.raw,{projected:!m.started,title:'Recorded matchup points for '+m.league.ownName+' and '+m.league.opponentName})+'</section>';
  }
  function leagueStock(m, large=false) {
    const data=dataFor(m,true);
    return '<section class="glass-panel league-chart '+(large?'expanded-chart':'')+'"><div class="panel-title"><h2>League stock</h2><span>'+data.series.length+' teams · '+(m.leagueStarted?'points':'projections')+'</span></div>'+
      rangeControls()+'<div class="league-chart-body">'+chart(data.series,data.raw,{league:true,projected:!m.leagueStarted,title:'All league teams on one shared points scale'})+
      legend(rankSeries(data.series),true)+'</div></section>';
  }
  function row(p, side, compact=false) {
    const flagged=app.getUI().flaggedPlayers?.[app.getUI().league+':'+p.player_id];
    const c=p.fantasyTeamColor || (side==='own'?ownColor:'#aca0e5'), status=p.status || 'Upcoming';
    const projected=finite(p.projected) ?? finite(p.consensus?.value);
    return '<button class="roster-row '+(compact?'compact-row':'')+'" data-player-id="'+esc(p.player_id)+'" data-side="'+side+'" style="--team-color:'+esc(c)+'" type="button" aria-label="Open '+esc(p.full_name || p.name)+' stats">'+app.markup.face(p,'small')+
      '<span class="roster-name"><b>'+(flagged?'<i class="player-flag-mark" aria-label="Flagged player">★</i> ':'')+esc(p.full_name || p.name)+'</b><small>'+esc(p.position || 'UTIL')+' · '+esc(p.team || 'FA')+'<span class="player-status '+(status==='LIVE'?'live':'')+'">'+esc(status)+'</span></small></span>'+
      '<span class="roster-points"><b>'+fmt(actual(p))+'</b><small>Proj '+fmt(projected,1,'—')+'</small></span></button>';
  }
  function roster(m,side) {
    const l=m.league, players=l[side] || [], name=side==='own'?l.ownName:l.opponentName;
    const starters=players.filter(p=>p.starter!==false),bench=players.filter(p=>p.starter===false);
    return '<section class="glass-panel full-roster '+side+'" style="--team-color:'+esc(color(l,name))+';--roster-count:'+players.length+'"><div class="panel-title"><h2>'+dot(color(l,name))+esc(name)+'</h2><span>'+players.length+' players</span></div>'+
      '<div class="roster-scroll" data-scroll-key="roster-'+side+'"><div class="roster-divider"><span>Starters</span><span>Pts / proj</span></div>'+
      starters.map(p=>row(p,side)).join('')+(bench.length?'<div class="roster-divider bench-divider"><span>Bench / reserve</span><span>'+bench.length+'</span></div>'+bench.map(p=>row(p,side)).join(''):'')+
      (!players.length?'<p class="empty-state">Waiting for the roster feed.</p>':'')+'</div></section>';
  }
  function matchups(m, large=false) {
    return '<section class="glass-panel league-matchups '+(large?'expanded-matchups':'')+'"><div class="panel-title"><h2>League matchups</h2><span>Week '+esc(m.league.week)+'</span></div><div class="matchup-list" data-scroll-key="league-matchups">'+(m.matchups || []).map(r=>{
      const gap=r.homeScore-r.awayScore, name=gap>0?r.home.name:r.away.name, state=Math.abs(gap)<.05?'Tied':(m.started?'Leads by ':'Projected +')+fmt(Math.abs(gap));
      return '<'+(tv?'article':'button')+' class="league-pair" style="--home-color:'+esc(r.home.teamColor)+';--away-color:'+esc(r.away.teamColor)+'" '+(tv?'':'type="button" data-matchup-id="'+esc(r.id)+'"')+'><span class="league-pair-side">'+dot(r.home.teamColor)+'<b>'+esc(r.home.name)+'</b><strong>'+fmt(r.homeScore)+'</strong></span>'+
        '<span class="league-pair-side away">'+dot(r.away.teamColor)+'<b>'+esc(r.away.name)+'</b><strong>'+fmt(r.awayScore)+'</strong></span><small>'+esc(Math.abs(gap)<.05?'Tied':name)+' · '+esc(state)+'</small></'+(tv?'article':'button')+'>';
    }).join('')+'</div></section>';
  }
  function feed(m) {
    const players=m.league.allPlayers || [], events=m.events || [];
    return '<section class="glass-panel league-feed"><div class="panel-title"><h2>League scoring</h2><span>All teams</span></div><div class="feed-list" data-scroll-key="scoring-feed">'+(events.length?events.slice(0,5).map(event=>{
      const p=players.find(p=>String(p.player_id)===String(event.playerId)) || {player_id:event.playerId,full_name:event.name,headshot:event.headshot,team:event.team};
      return '<'+(tv?'article':'button')+' class="feed-row" '+(tv?'':'type="button" data-player-id="'+esc(event.playerId)+'"')+' style="--team-color:'+esc(event.teamColor)+'">'+app.markup.face(p,'small')+
        '<span><b>'+esc(event.name)+'</b><small>'+dot(event.teamColor)+esc(event.fantasyTeamName || p.fantasyTeamName || 'League player')+'</small></span><strong>'+fmt(event.total)+
        '<small class="'+(event.delta<0?'negative':'positive')+'">'+(event.snapshot?'Snapshot':(event.delta>0?'+':'')+fmt(event.delta))+'</small></strong></'+(tv?'article':'button')+'>';
    }).join(''):'<p class="empty-state">Scoring updates will appear with the player’s fantasy team.</p>')+'</div></section>';
  }
  function selected(m, full=false) {
    if(window.FantasyPlayerDetails)return window.FantasyPlayerDetails.render(m,full);
    const p=m.player;if(!p)return '';
    const owner=p.fantasyTeamName || (m.league.teams || []).find(t=>(t.players || []).some(x=>String(x.player_id)===String(p.player_id)))?.name || '';
    return '<section class="glass-selected '+(full?'tv-player-detail':'')+'" style="--team-color:'+esc(p.fantasyTeamColor || color(m.league,owner))+'"><div class="detail-heading"><span>Player stats</span>'+
      (!tv?'<button type="button" data-close-player="true" aria-label="Close player stats">✕</button>':'')+'</div><div class="selected-identity">'+app.markup.face(p,'large')+'<div><h2>'+esc(p.full_name || p.name)+'</h2><p>'+esc(p.position)+' · '+esc(p.team)+' · '+esc(p.status || 'Upcoming')+'</p><span>'+dot(p.fantasyTeamColor || color(m.league,owner))+esc(owner)+'</span></div><strong>'+fmt(actual(p))+'<small>Fantasy points</small></strong></div>'+
      '<p class="selected-game">'+esc(app.markup.gameLabel(p))+' · Proj '+fmt(p.projected,1,'—')+'</p>'+
      '<div class="detail-stats-scroll" data-scroll-key="player-stats">'+app.markup.stats(p,'detail-stat-grid')+
      (p.news || p.news_headline?'<p class="player-news">'+esc(p.news || p.news_headline)+'</p>':'')+'</div>'+
      (!tv?'<div class="selected-actions"><button type="button" class="primary-action" data-player-id="'+esc(p.player_id)+'">Show on TV</button><button type="button" data-close-player="true">Close player</button></div>':'')+'</section>';
  }
  function hero(m) {
    const l=m.league;
    return '<section class="glass-panel score-band">'+['own','opponent'].map((side,i)=>{
      const name=i?l.opponentName:l.ownName, score=i?m.opponentActual:m.ownActual, projection=i?m.opponentFinish:m.ownFinish, record=i?l.opponentRecord:l.ownRecord;
      return (i?'<span class="score-vs">vs</span>':'')+'<div class="score-side '+side+'" style="--team-color:'+esc(color(l,name))+'"><div class="score-team">'+dot(color(l,name))+'<h1>'+esc(name)+'</h1><small>'+esc(app.data.record(record))+'</small></div><div class="score-number"><strong>'+fmt(score)+'</strong><span>Proj <b>'+fmt(projection)+'</b></span></div></div>';
    }).join('')+'</section>';
  }
  function overview(m) {
    return '<div class="home-grid">'+roster(m,'own')+'<div class="home-center">'+momentum(m)+leagueStock(m)+
      '<div class="home-secondary">'+injuries(m,true)+feed(m)+'</div></div>'+roster(m,'opponent')+'</div>';
  }
  function playerList(m) {
    const teams=m.league.teams || [];
    return '<div class="all-team-rosters">'+teams.map(t=>'<section class="glass-panel team-players"><div class="panel-title"><h2>'+dot(t.teamColor)+esc(t.name)+'</h2><span>'+t.players.length+' players</span></div>'+t.players.map(p=>row(p,'league')).join('')+'</section>').join('')+'</div>';
  }
  function injuries(m,compact=false) {
    const details=window.FantasyPlayerDetails;details?.fetchData();
    const seen=new Set(),ordered=[...(m.league.own || []),...(m.league.opponent || []),...(m.league.allPlayers || [])].filter(p=>!seen.has(String(p.player_id)) && seen.add(String(p.player_id)));
    const players=ordered.map(p=>({p,report:details?.injurySummary(p) || {status:p.injury_status || p.injuryStatus,source:'League roster'}})).filter(({report:r})=>/OUT|IR|DOUBTFUL|QUESTIONABLE|PUP|INJURY/i.test(r.status || ''));
    return '<section class="glass-panel injury-updates"><div class="panel-title"><h2>Injury updates</h2><span>'+players.length+' reports</span></div><div class="injury-update-list">'+(players.length?(compact?players.slice(0,4):players).map(({p,report:r})=>
      '<'+(tv?'article':'button')+' class="injury-update-row" '+(tv?'':'type="button" data-player-id="'+esc(p.player_id)+'"')+' style="--team-color:'+esc(p.fantasyTeamColor || '#aca0e5')+'"><span><b>'+esc(p.full_name || p.name)+'</b><strong>'+esc(r.status)+'</strong></span><small>'+esc([r.injury,r.practice || 'Practice not reported'].filter(Boolean).join(' · '))+'</small><small>'+esc(r.source)+(r.week?' · W'+esc(r.week):'')+(r.date?' · '+esc(r.date):' · Undated')+'</small></'+(tv?'article':'button')+'>').join(''):'<p class="empty-state">'+(details?.injurySummary({}).loading?'Checking dated injury reports…':'No injury designations reported in the current feeds.')+'</p>')+'</div>'+(compact?'<button class="injury-view-all" type="button" data-view="injuries">All injury reports →</button>':'')+'</section>';
  }
  function games(m) {
    let events=m.games || [];
    if(m.ui.gameId)events=events.filter(g=>String(g.id)===String(m.ui.gameId));
    else if(m.ui.view==='patriots')events=events.filter(g=>(g.competitions?.[0]?.competitors || []).some(t=>t.team?.abbreviation==='NE'));
    return '<div class="glass-games">'+events.map(g=>{
      const status=g.competitions?.[0]?.status?.type || g.status?.type || {};
      return '<'+(tv?'article':'button')+' class="glass-panel game-card" '+(tv?'':'type="button" data-game-id="'+esc(g.id)+'"')+'><span>'+esc(status.shortDetail || status.description || 'Scheduled')+'</span>'+
        (g.competitions?.[0]?.competitors || []).map(t=>'<div><img src="'+esc(t.team?.logo || '')+'" alt=""><b>'+esc(t.team?.displayName)+'</b><strong>'+esc(t.score ?? '—')+'</strong></div>').join('')+
        '<small>'+esc(g.date?new Date(g.date).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'}):'')+'</small></'+(tv?'article':'button')+'>';
    }).join('')+'</div>'+(events.length?'':'<p class="empty-state">The NFL schedule is waiting for the next provider update.</p>');
  }
  function wiggle(m) {
    if(m.loading || !m.league.ready)return;
    const scope=m.ui.league+':'+m.league.week+':'+(m.ui.matchupId || 'mine');
    const signature=[m.ownActual,m.opponentActual,...(m.league.teams || []).map(t=>t.total)].join('|');
    const previous=scoreSnapshots.get(scope);
    if(latestScope===scope && previous && previous!==signature) {
      const mascot=$('headerMascot');
      mascot.classList.remove('score-wiggle');void mascot.offsetWidth;mascot.classList.add('score-wiggle');
    }
    latestScope=scope;scoreSnapshots.set(scope,signature);
  }
  function render(options={}) {
    const m=app.model(),l=m.league, ui=m.ui;
    if(window.FantasyTimeline)activeWindows=window.FantasyTimeline.observe(ui.league+':'+l.week,m.games || []);
    const scrolls=new Map([...document.querySelectorAll('[data-scroll-key]')].map(e=>[e.dataset.scrollKey,e.scrollTop]));
    const stage=$('workspace'), drawer=$('playerDrawer'), active=document.activeElement;
    const activePlayer=active?.dataset?.playerId;
    wiggle(m);
    document.body.dataset.view=ui.view;document.body.dataset.player=ui.playerId?'open':'closed';
    $('weekLabel').textContent='Week '+(l.week || '—');
    if($('tvContext'))$('tvContext').textContent=ui.league==='espn'?'ESPN':'Sleeper';
    document.querySelectorAll('[data-league]').forEach(b=>{b.classList.toggle('active',b.dataset.league===ui.league);b.setAttribute('aria-pressed',String(b.dataset.league===ui.league));});
    document.querySelectorAll('[data-view]').forEach(b=>{const current=b.dataset.view===ui.view;b.classList.toggle('active',current);b.setAttribute('aria-current',current?'page':'false');});
    if($('myMatchup'))$('myMatchup').classList.toggle('active',ui.view==='overview' && !ui.matchupId);
    const providerLabel=m.loading?'Connecting feeds':!l.ready?ui.league.toUpperCase()+' unavailable':m.stale?'Saved ESPN snapshot':ui.league==='espn'?'ESPN league data':'Sleeper league data';
    $('sourceStatus').textContent=providerLabel;
    $('lastSync').textContent=(m.stale?'Saved ':'Updated ')+time(m.providerUpdated || m.updated);
    if(!options.skipHero)patch($('matchupHero'),m.loading?'<div class="glass-panel loading-state">Connecting your leagues…</div>':l.ready?hero(m):'<div class="glass-panel empty-state">The '+ui.league.toUpperCase()+' feed is reconnecting. <button data-action="refresh" type="button">Retry feed</button></div>');
    const stageKey=ui.league+':'+ui.view+':'+(ui.matchupId || 'mine');
    if(!options.skipWorkspace) {
      if(!l.ready || m.loading)patch(stage,'');
      else if(tv && ui.playerId)patch(stage,selected(m,true));
      else if(['patriots','live','games'].includes(ui.view))patch(stage,games(m));
      else if(ui.view==='stock')patch(stage,leagueStock(m,true));
      else if(ui.view==='league')patch(stage,matchups(m,true));
      else if(ui.view==='players')patch(stage,playerList(m));
      else if(ui.view==='injuries')patch(stage,injuries(m));
      else patch(stage,overview(m));
    }
    const selectedChanged=lastPlayer!==String(ui.playerId || '');
    patch(drawer,!tv?selected(m):'');
    drawer.classList.toggle('open',Boolean(!tv && m.player));drawer.hidden=!(!tv && m.player);
    if($('onTV'))$('onTV').textContent=ui.playerId?'Player stats':labels[ui.view] || 'Matchup';
    document.querySelectorAll('[data-scroll-key]').forEach(e=>{
      if(lastStage===stageKey && (!selectedChanged || e.dataset.scrollKey!=='player-stats'))e.scrollTop=scrolls.get(e.dataset.scrollKey) || 0;
    });
    if(activePlayer && !selectedChanged)document.querySelector('[data-player-id="'+CSS.escape(activePlayer)+'"]')?.focus({preventScroll:true});
    if(selectedChanged && !tv && m.player)drawer.querySelector('[data-close-player]')?.focus({preventScroll:true});
    lastStage=stageKey;lastPlayer=String(ui.playerId || '');
  }
  window.FantasyGlassCharts={normalizeHistory,geometry,chart,rankSeries,rangeControls};
  window.FantasyGlass={render,dataFor};
  $('headerMascot').addEventListener('animationend',e=>e.currentTarget.classList.remove('score-wiggle'));
  document.addEventListener('click',event=>{
    const range=event.target.closest('[data-chart-range]');
    if(range && !tv)app.dispatch({chartRange:range.dataset.chartRange});
    if(event.target.closest('#myMatchup'))app.dispatch({view:'overview',matchupId:null,playerId:null,gameId:null});
  });
  document.addEventListener('fantasy:session',()=>{if($('onTV'))$('onTV').textContent=app.getUI().playerId?'Player stats':labels[app.getUI().view] || 'Matchup';});
  app.render();
})();

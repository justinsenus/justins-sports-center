(() => {
  'use strict';
  if (document.body.dataset.screen !== 'tv') return;
  const app=window.FantasyCenter, glass=window.FantasyGlass, baseRender=glass.render;
  const esc=app.escape, fmt=app.format, charts=window.FantasyGlassCharts;
  const dot=c=>'<i class="team-dot" style="--team-color:'+esc(c)+'"></i>';
  const finite=v=>v!==null && v!=='' && Number.isFinite(Number(v))?Number(v):null;
  const teamColor=(l,name)=>(l.teams || []).find(t=>t.name===name)?.teamColor || '#aca0e5';
  function row(p,bench=false) {
    const name=p.full_name || p.name || 'Player', projection=finite(p.projected) ?? finite(p.consensus?.value);
    const c=p.fantasyTeamColor || '#aca0e5';
    return '<article class="tv-roster-row '+(bench?'tv-bench-row':'tv-starter-row')+'" data-tv-player="'+esc(p.player_id)+'" style="--team-color:'+esc(c)+'" title="'+esc(name)+'">'+app.markup.face(p,'small')+
      '<span class="tv-player-name"><b>'+esc(name)+'</b><small>'+esc(p.position || 'UTIL')+' · '+esc(p.team || 'FA')+(bench?'':'<span class="tv-player-status '+(p.status==='LIVE'?'live':'')+'">'+esc(p.status || 'Upcoming')+'</span>')+'</small></span>'+
      '<span class="tv-player-score"><b>'+fmt(app.data.actual(p))+'</b>'+(!bench?'<small>Proj '+fmt(projection,1,'—')+'</small>':'')+'</span></article>';
  }
  function roster(m,side) {
    const l=m.league, players=l[side] || [], starters=players.filter(p=>p.starter!==false), bench=players.filter(p=>p.starter===false);
    const name=side==='own'?l.ownName:l.opponentName;
    return '<section class="glass-panel tv-roster" style="--team-color:'+esc(teamColor(l,name))+';--starter-count:'+Math.max(1,starters.length)+';--starter-space:'+Math.max(1,starters.length)+'fr;--bench-space:'+Math.max(1,Math.ceil(bench.length/2))+'fr;--bench-rows:'+Math.max(1,Math.ceil(bench.length/2))+'"><div class="tv-panel-title"><h2>'+dot(teamColor(l,name))+esc(name)+'</h2><span>'+players.length+' players</span></div>'+
      '<div class="tv-roster-body '+(bench.length?'':'no-bench')+'"><div class="tv-roster-label"><b>Starters</b><span>Points / projection</span></div><div class="tv-starters">'+starters.map(p=>row(p)).join('')+'</div>'+
      (bench.length?'<div class="tv-roster-label"><b>Bench & reserve</b><span>'+bench.length+' players</span></div><div class="tv-bench">'+bench.map(p=>row(p,true)).join('')+'</div>':'')+'</div></section>';
  }
  function legend(series) {
    return '<div class="tv-chart-legend">'+series.map(s=>'<span>'+dot(s.color)+'<b>'+esc(s.name)+'</b><strong>'+fmt(s.value)+'</strong></span>').join('')+'</div>';
  }
  function momentum(m) {
    const d=glass.dataFor(m);
    return '<section class="glass-panel tv-momentum"><div class="tv-panel-title"><h2>'+ (m.started?'Matchup scoring':'Matchup projections')+'</h2><span>'+(m.started?'Fantasy points':'Upcoming week')+'</span></div>'+legend(d.series)+
      charts.chart(d.series,d.raw,{timeline:true,projected:!m.started,title:'Recorded matchup points for '+m.league.ownName+' and '+m.league.opponentName})+'</section>';
  }
  function stock(m) {
    const d=glass.dataFor(m,true), ranked=d.series.slice().sort((a,b)=>b.value-a.value);
    return '<section class="glass-panel tv-stock"><div class="tv-panel-title"><h2>League stock</h2><span>'+d.series.length+' teams · '+(m.leagueStarted?'points':'projections')+'</span></div><div class="tv-stock-body">'+
      '<div class="tv-stock-chart">'+charts.chart(d.series,d.raw,{timeline:true,league:true,projected:!m.leagueStarted,title:'All league teams on one shared points scale'})+'</div>'+legend(ranked)+'</div></section>';
  }
  function page(items,size,now=Date.now()) {
    const pages=Math.max(1,Math.ceil(items.length/size)), current=Math.floor(now/15000)%pages;
    return {items:items.slice(current*size,(current+1)*size),current:current+1,pages};
  }
  function matchups(m,large=false) {
    const list=m.matchups || [], size=window.innerHeight<900?2:3, visible=large?{items:list,current:1,pages:1}:page(list,size);
    return '<section class="glass-panel tv-league '+(large?'tv-league-full':'')+'"><div class="tv-panel-title"><h2>League matchups</h2><span>'+ (visible.pages>1?visible.current+' / '+visible.pages:'Week '+esc(m.league.week))+'</span></div><div class="tv-matchup-list">'+visible.items.map(r=>{
      const gap=r.homeScore-r.awayScore, status=Math.abs(gap)<.05?'Tied':(m.leagueStarted?'Leads by ':'Projected +')+fmt(Math.abs(gap));
      return '<article class="tv-matchup"><div class="tv-matchup-team '+(gap>0?'leading':'')+'" style="--team-color:'+esc(r.home.teamColor)+'">'+dot(r.home.teamColor)+'<b>'+esc(r.home.name)+'</b><strong>'+fmt(r.homeScore)+'</strong></div><div class="tv-matchup-team '+(gap<0?'leading':'')+'" style="--team-color:'+esc(r.away.teamColor)+'">'+dot(r.away.teamColor)+'<b>'+esc(r.away.name)+'</b><strong>'+fmt(r.awayScore)+'</strong></div><small>'+esc(status)+'</small></article>';
    }).join('')+'</div></section>';
  }
  function feed(m) {
    const players=m.league.allPlayers || [], events=(m.events || []), size=window.innerHeight<900?2:3;
    return '<section class="glass-panel tv-feed"><div class="tv-panel-title"><h2>League scoring</h2><span>All teams</span></div><div class="tv-feed-list">'+(events.length?events.slice(0,size).map(e=>{
      const p=players.find(p=>String(p.player_id)===String(e.playerId)) || {player_id:e.playerId,full_name:e.name,headshot:e.headshot,team:e.team};
      return '<article class="tv-feed-row" style="--team-color:'+esc(e.teamColor)+'">'+app.markup.face(p,'small')+'<span class="tv-feed-name"><b>'+esc(e.name)+'</b><small>'+dot(e.teamColor)+esc(e.fantasyTeamName || p.fantasyTeamName || 'League player')+'</small></span><strong>'+fmt(e.total)+'<small class="'+(e.delta<0?'negative':'positive')+'">'+(e.snapshot?'Snapshot':(e.delta>0?'+':'')+fmt(e.delta))+'</small></strong></article>';
    }).join(''):'<p class="empty-state">New scoring plays will appear here with their fantasy team.</p>')+'</div></section>';
  }
  function overview(m) {
    return '<div class="tv-overview">'+roster(m,'own')+'<div class="tv-center">'+momentum(m)+stock(m)+'<div class="tv-secondary">'+matchups(m)+feed(m)+'</div></div>'+roster(m,'opponent')+'</div>';
  }
  function viewport() {
    document.documentElement.style.setProperty('--tv-height',window.innerHeight+'px');
    document.body.dataset.tvDensity=window.innerHeight<680?'compact':'normal';
  }
  viewport();window.addEventListener('resize',()=>{viewport();app.render()});
  glass.render=()=>{
    baseRender();
    const m=app.model();
    if(m.loading || !m.league.ready || m.ui.playerId)return;
    if(['overview','matchups'].includes(m.ui.view))document.getElementById('workspace').innerHTML=overview(m);
    else if(m.ui.view==='league')document.getElementById('workspace').innerHTML=matchups(m,true);
  };
  window.FantasyTV={overview,roster,matchups,feed,page};
  app.render();
})();

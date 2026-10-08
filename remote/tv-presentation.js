(() => {
  'use strict';
  if (document.body.dataset.screen !== 'tv') return;
  const app=window.FantasyCenter, glass=window.FantasyGlass, baseRender=glass.render;
  const esc=app.escape, fmt=app.format, charts=window.FantasyGlassCharts;
  const patch=(element,markup)=>window.FantasyDOM?window.FantasyDOM.patch(element,markup):element.innerHTML=markup;
  const dot=c=>'<i class="team-dot" style="--team-color:'+esc(c)+'"></i>';
  const finite=v=>v!==null && v!=='' && Number.isFinite(Number(v))?Number(v):null;
  const teamColor=(l,name)=>(l.teams || []).find(t=>t.name===name)?.teamColor || '#aca0e5';
  function gameInfo(p,m={}) {
    const event=p.event, competition=event?.competitions?.[0], type=competition?.status?.type || event?.status?.type || {};
    const list=competition?.competitors || [], aliases={WSH:'WAS',JAC:'JAX',LVR:'LV'};
    const code=value=>aliases[String(value || '').toUpperCase()] || String(value || '').toUpperCase();
    const own=list.find(c=>code(c.team?.abbreviation)===code(p.team));
    const other=list.find(c=>code(c.team?.abbreviation)!==code(p.team));
    const opponent=other?.team?.abbreviation || '', at=own?.homeAway==='away'?'@':'vs';
    const suffix=opponent?' '+at+' '+opponent:'';
    if(type.state==='in' || !event && p.status==='LIVE')return {phase:'live',label:'LIVE'+(type.shortDetail?' · '+type.shortDetail:suffix)};
    if(type.state==='post' || !event && p.status==='FINAL')return {phase:'final',label:'FINAL'+suffix};
    if(event && Number.isFinite(Date.parse(event.date))) {
      const when=new Date(event.date).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',minute:'2-digit'});
      return {phase:'upcoming',label:when+suffix,title:when+' ET'+suffix};
    }
    if(p.status==='BYE' || p.status==='NO GAME' && (m.games || []).length>=12 && p.team && p.team!=='FA')return {phase:'bye',label:'Bye · Week '+(m.league?.week || '—')};
    return {phase:'pending',label:'Game time pending'};
  }
  function injuryInfo(p) {
    const report=window.FantasyPlayerDetails?.injurySummary(p);
    const roster=p.injury_status || p.injuryStatus || '';
    const status=String(roster || report?.status || (/OUT|IR|DOUBTFUL|QUESTIONABLE|PUP|INJUR/i.test(p.status || '')?p.status:''));
    const normalized=status.toUpperCase().replace(/[\s-]+/g,'_');
    const label=/INJUR.*RESERVE|^IR$/.test(normalized)?'IR':/OUT/.test(normalized)?'OUT':/DOUBTFUL/.test(normalized)?'D':/QUESTIONABLE/.test(normalized)?'Q':/PUP/.test(normalized)?'PUP':/INJUR/.test(normalized)?'INJ':null;
    return label?{label,title:[status,report?.injury,report?.practice].filter(Boolean).join(' · ')}:null;
  }
  function row(p,bench=false,m={}) {
    const flagged=app.getUI().flaggedPlayers?.[app.getUI().league+':'+p.player_id];
    const name=p.full_name || p.name || 'Player', projection=finite(p.projected) ?? finite(p.consensus?.value);
    const c=p.fantasyTeamColor || '#aca0e5', game=gameInfo(p,m), injury=injuryInfo(p);
    const injuryMarkup=injury?'<span class="tv-injury-badge" role="img" aria-label="'+esc('Injury: '+injury.title)+'" title="'+esc(injury.title)+'"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 2h6v5h5v6h-5v5H7v-5H2V7h5z"/></svg><span>'+esc(injury.label)+'</span></span>':'';
    return '<article class="tv-roster-row '+(bench?'tv-bench-row':'tv-starter-row')+' '+(injury?'has-injury ':'')+'is-'+game.phase+'" data-tv-player="'+esc(p.player_id)+'" style="--team-color:'+esc(c)+'" title="'+esc(name+' · '+(p.position || 'UTIL')+' · '+(p.team || 'FA'))+'">'+
      '<span class="tv-player-photo '+(['DEF','DST','D/ST'].includes(p.position)?'is-defense':'')+'">'+app.markup.face(p,'small')+'<small>'+esc(p.position || 'UTIL')+'</small></span>'+
      '<span class="tv-player-name"><span class="tv-player-name-line"><b>'+(flagged?'<i class="player-flag-mark" aria-label="Flagged player">★</i> ':'')+esc(name)+'</b>'+injuryMarkup+'</span><small class="tv-player-game '+game.phase+'" title="'+esc(game.title || game.label)+'">'+(game.phase==='live'?'<i class="tv-live-dot" aria-hidden="true"></i>':'')+esc(game.label)+'</small></span>'+
      '<span class="tv-player-score"><b>'+fmt(app.data.actual(p))+'</b><small class="tv-player-projection"><span>PROJ</span> <strong>'+fmt(projection,1,'—')+'</strong></small></span></article>';
  }
  function roster(m,side) {
    const l=m.league, players=l[side] || [], starters=players.filter(p=>p.starter!==false), bench=players.filter(p=>p.starter===false);
    const name=side==='own'?l.ownName:l.opponentName;
    const benchSlots=window.innerHeight<650?1:window.innerHeight<850?2:3, visible=page(bench,benchSlots), shown=new Set(visible.items.map(p=>String(p.player_id)));
    return '<section class="glass-panel tv-roster tv-roster-'+side+'" style="--team-color:'+esc(teamColor(l,name))+';--starter-count:'+Math.max(1,starters.length)+';--starter-space:'+Math.max(1,starters.length)+'fr;--bench-space:'+Math.max(1,visible.items.length)+'fr;--bench-rows:'+Math.max(1,visible.items.length)+'"><div class="tv-panel-title"><h2>'+dot(teamColor(l,name))+esc(name)+'</h2><span>'+players.length+' players · ET</span></div>'+
      '<div class="tv-roster-body '+(bench.length?'':'no-bench')+'"><div class="tv-roster-label"><b>Starters</b><span>PTS / PROJ</span></div><div class="tv-starters">'+starters.map(p=>row(p,false,m)).join('')+'</div>'+
      (bench.length?'<div class="tv-roster-label"><b>Bench & reserve</b><span>'+bench.length+' players'+(visible.pages>1?' · '+visible.current+'/'+visible.pages:'')+'</span></div><div class="tv-bench">'+bench.map(p=>row(p,true,m).replace('<article ', '<article '+(shown.has(String(p.player_id))?'':'hidden '))).join('')+'</div>':'')+'</div></section>';
  }
  function legend(series) {
    return '<div class="tv-chart-legend">'+series.map(s=>'<span>'+dot(s.color)+'<b>'+esc(s.name)+'</b><strong>'+fmt(s.value)+'</strong></span>').join('')+'</div>';
  }
  function momentum(m) {
    const d=glass.dataFor(m);
    return '<section class="glass-panel tv-momentum"><div class="tv-panel-title"><h2>'+ (m.started?'Matchup scoring':'Matchup projections')+'</h2><span>'+(m.started?'Fantasy points':'Upcoming week')+'</span></div>'+legend(d.series)+
      charts.rangeControls()+charts.chart(d.series,d.raw,{slim:true,projected:!m.started,title:'Recorded matchup points for '+m.league.ownName+' and '+m.league.opponentName})+'</section>';
  }
  function stock(m) {
    const d=glass.dataFor(m,true), ranked=charts.rankSeries(d.series);
    return '<section class="glass-panel tv-stock"><div class="tv-panel-title"><h2>League stock</h2><span>'+d.series.length+' teams · '+(m.leagueStarted?'points':'projections')+'</span></div>'+charts.rangeControls()+'<div class="tv-stock-body">'+
      '<div class="tv-stock-chart">'+charts.chart(d.series,d.raw,{league:true,projected:!m.leagueStarted,title:'All league teams on one shared points scale'})+'</div>'+legend(ranked)+'</div></section>';
  }
  function page(items,size,now=Date.now()) {
    const pages=Math.max(1,Math.ceil(items.length/size)), current=Math.floor(now/15000)%pages;
    return {items:Array.from({length:Math.min(items.length,size)},(_,i)=>items[(current*size+i)%items.length]),current:current+1,pages};
  }
  function matchups(m,large=false) {
    const list=m.matchups || [], size=window.innerHeight<650?1:window.innerHeight<1050?2:3, visible=large?{items:list,current:1,pages:1}:page(list,size);
    return '<section class="glass-panel tv-league '+(large?'tv-league-full':'')+'"><div class="tv-panel-title"><h2>League matchups</h2><span>'+ (visible.pages>1?visible.current+' / '+visible.pages:'Week '+esc(m.league.week))+'</span></div><div class="tv-matchup-list">'+visible.items.map(r=>{
      const gap=r.homeScore-r.awayScore, status=Math.abs(gap)<.05?'Tied':(m.leagueStarted?'Leads by ':'Projected +')+fmt(Math.abs(gap));
      return '<article class="tv-matchup" style="--home-color:'+esc(r.home.teamColor)+';--away-color:'+esc(r.away.teamColor)+'"><div class="tv-matchup-team '+(gap>0?'leading':'')+'" style="--team-color:'+esc(r.home.teamColor)+'">'+dot(r.home.teamColor)+'<b>'+esc(r.home.name)+'</b><strong>'+fmt(r.homeScore)+'</strong></div><div class="tv-matchup-team away '+(gap<0?'leading':'')+'" style="--team-color:'+esc(r.away.teamColor)+'">'+dot(r.away.teamColor)+'<b>'+esc(r.away.name)+'</b><strong>'+fmt(r.awayScore)+'</strong></div><small>'+esc(status)+'</small></article>';
    }).join('')+'</div></section>';
  }
  function feed(m) {
    const players=m.league.allPlayers || [], events=(m.events || []), size=window.innerHeight<650?2:window.innerHeight<800?4:5;
    const visible=page(events.slice(0,12),size);
    return '<section class="glass-panel tv-feed"><div class="tv-panel-title"><h2>League scoring</h2><span>All teams</span></div><div class="tv-feed-list">'+(events.length?visible.items.map(e=>{
      const p=players.find(p=>String(p.player_id)===String(e.playerId)) || {player_id:e.playerId,full_name:e.name,headshot:e.headshot,team:e.team};
      return '<article class="tv-feed-row" style="--team-color:'+esc(e.teamColor)+'">'+app.markup.face(p,'small')+'<span class="tv-feed-name"><b>'+esc(e.name)+'</b><small>'+dot(e.teamColor)+esc(e.fantasyTeamName || p.fantasyTeamName || 'League player')+'</small></span><strong>'+fmt(e.total)+'<small class="'+(e.delta<0?'negative':'positive')+'">'+(e.snapshot?'Snapshot':(e.delta>0?'+':'')+fmt(e.delta))+'</small></strong></article>';
    }).join(''):'<p class="empty-state">New scoring plays will appear here with their fantasy team.</p>')+'</div></section>';
  }
  function injuries(m) {
    const details=window.FantasyPlayerDetails;
    details?.fetchData();
    const seen=new Set(),flags=m.ui.flaggedPlayers || {},players=[...(m.league.own || []),...(m.league.opponent || []),...(m.league.allPlayers || [])]
      .filter(p=>!seen.has(String(p.player_id)) && seen.add(String(p.player_id)));
    const entries=players.map(p=>({p,report:details?.injurySummary(p) || {status:p.injury_status || p.injuryStatus,source:'League roster'}}))
      .filter(({report})=>report.status && /OUT|IR|DOUBTFUL|QUESTIONABLE|PUP|INJUR/i.test(report.status))
      .sort((a,b)=>Number(Boolean(flags[m.ui.league+':'+b.p.player_id]))-Number(Boolean(flags[m.ui.league+':'+a.p.player_id])));
    const visible=page(entries,window.innerHeight<650?2:window.innerHeight<1250?3:4);
    return '<section class="glass-panel tv-injuries"><div class="tv-panel-title"><h2>Injury updates</h2><span>'+(entries.length?entries.length+' reports'+(visible.pages>1?' · '+visible.current+'/'+visible.pages:''):'Checking reports')+'</span></div><div class="tv-injury-list">'+
      (entries.length?visible.items.map(({p,report:r})=>'<article class="tv-injury-row" style="--team-color:'+esc(p.fantasyTeamColor || '#aca0e5')+'"><div><b>'+esc(p.full_name || p.name)+'</b><strong>'+esc(r.status)+'</strong></div><p>'+esc([r.injury,r.practice || 'Practice not reported'].filter(Boolean).join(' · '))+'</p><small>'+esc(r.source)+(r.week?' · W'+esc(r.week):'')+(r.date?' · '+esc(r.date):' · Undated')+'</small></article>').join(''):
        '<p class="empty-state">'+(details?.injurySummary(players[0] || {}).loading?'Checking dated injury reports…':'No injury designations reported. Use the player’s News & injury tab for more detail.')+'</p>')+'</div></section>';
  }
  function fantasyStrip(m) {
    const visible=page(m.matchups || [],3);
    return '<section class="glass-panel tv-score-strip tv-fantasy-strip" aria-label="All fantasy matchup scores"><div class="tv-strip-label"><h2>Fantasy scores</h2><span>Week '+esc(m.league.week)+(visible.pages>1?' · '+visible.current+'/'+visible.pages:'')+'</span></div><div class="tv-strip-cards">'+visible.items.map(r=>
      '<article class="tv-strip-matchup" style="--home-color:'+esc(r.home.teamColor)+';--away-color:'+esc(r.away.teamColor)+'">'+[r.home,r.away].map((t,i)=>'<div style="--team-color:'+esc(t.teamColor)+'">'+dot(t.teamColor)+'<b>'+esc(t.name)+'</b><strong>'+fmt(m.leagueStarted?(i?r.awayScore:r.homeScore):(finite(t.total) ?? 0))+'</strong></div>').join('')+'</article>').join('')+'</div></section>';
  }
  function nflStrip(m) {
    const games=[...(m.nflGames || m.games || [])].sort((a,b)=>{
      const rank=e=>({in:0,pre:1,post:2}[e.status?.type?.state || e.competitions?.[0]?.status?.type?.state] ?? 3);
      return rank(a)-rank(b) || Date.parse(a.date || 0)-Date.parse(b.date || 0);
    });
    const visible=page(games,window.innerWidth<1600?6:8);
    const safeLogo=v=>{try{const u=new URL(v);return u.protocol==='https:'?u.href:null;}catch(_){return null}};
    return '<section class="glass-panel tv-score-strip tv-nfl-strip" aria-label="All NFL scores"><div class="tv-strip-label"><h2>NFL scores</h2><span>Week '+esc(m.nflWeek || m.league.week)+(visible.pages>1?' · '+visible.current+'/'+visible.pages:'')+'</span></div><div class="tv-nfl-cards" style="--nfl-count:'+Math.max(1,visible.items.length)+'">'+
      (games.length?visible.items.map(e=>{
        const comp=e.competitions?.[0],type=e.status?.type || comp?.status?.type || {},list=comp?.competitors || [],away=list.find(c=>c.homeAway==='away') || list[0],home=list.find(c=>c.homeAway==='home') || list[1];
        const when=Number.isFinite(Date.parse(e.date))?new Date(e.date).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',minute:'2-digit'}):'Scheduled';
        const status=type.state==='in'?(type.shortDetail || 'Live'):type.state==='post'?'Final':when;
        return '<article class="tv-nfl-game '+(type.state==='in'?'is-live':'')+'"><small>'+esc(status)+'</small>'+[away,home].filter(Boolean).map(c=>{
          const logo=safeLogo(c.team?.logo),score=type.state==='pre'?'—':fmt(finite(c.score),0,'—');
          return '<div>'+(logo?'<img src="'+esc(logo)+'" alt="'+esc(c.team?.displayName || c.team?.abbreviation || 'NFL team')+'" loading="eager">':'')+'<b>'+esc(c.team?.abbreviation || 'NFL')+'</b><strong>'+score+'</strong></div>';
        }).join('')+'</article>';
      }).join(''):'<p class="empty-state">NFL scoreboard is connecting.</p>')+'</div></section>';
  }
  function strips(m) {
    return '<div class="tv-score-strips">'+fantasyStrip(m)+nflStrip(m)+'</div>';
  }
  function overview(m) {
    return '<div class="tv-overview">'+roster(m,'own')+'<div class="tv-center">'+momentum(m)+stock(m)+'<div class="tv-secondary">'+injuries(m)+feed(m)+'</div></div>'+roster(m,'opponent')+'</div>';
  }
  function hero(m) {
    const l=m.league, home=teamColor(l,l.ownName), away=teamColor(l,l.opponentName);
    const left=Math.max(0,finite(m.ownFinish) ?? 0),right=Math.max(0,finite(m.opponentFinish) ?? 0),share=left+right?left/(left+right)*100:50;
    return '<section class="glass-panel score-band tv-score-band">'+['own','opponent'].map((side,i)=>{
      const name=i?l.opponentName:l.ownName,score=i?m.opponentActual:m.ownActual,record=i?l.opponentRecord:l.ownRecord;
      return (i?'<span class="score-vs">vs</span>':'')+'<div class="score-side '+side+'" style="--team-color:'+esc(i?away:home)+'"><div class="score-team">'+dot(i?away:home)+'<h1>'+esc(name)+'</h1><small>'+esc(app.data.record(record))+'</small></div><div class="score-number"><strong>'+fmt(score)+'</strong></div></div>';
    }).join('')+'<div class="tv-projections" style="--home-color:'+esc(home)+';--away-color:'+esc(away)+';--home-share:'+share+'%"><div class="tv-projection-labels"><span>'+dot(home)+'Projected finish <b>'+fmt(m.ownFinish)+'</b></span><small>Live projection</small><span>Projected finish <b>'+fmt(m.opponentFinish)+'</b>'+dot(away)+'</span></div><div class="tv-projection-line" aria-label="Projected finish '+esc(l.ownName)+' '+fmt(m.ownFinish)+', '+esc(l.opponentName)+' '+fmt(m.opponentFinish)+'"><i></i><i></i></div></div></section>';
  }
  function viewport() {
    document.documentElement.style.setProperty('--tv-height',window.innerHeight+'px');
    document.body.dataset.tvDensity=window.innerHeight<800?'compact':'normal';
  }
  viewport();window.addEventListener('resize',()=>{viewport();app.render()});
  glass.render=()=>{
    const m=app.model();
    const ready=!m.loading && m.league.ready, overviewScene=ready && !m.ui.playerId && ['overview','matchups'].includes(m.ui.view), leagueScene=ready && !m.ui.playerId && m.ui.view==='league';
    baseRender({skipHero:ready,skipWorkspace:overviewScene || leagueScene});
    if(ready)patch(document.getElementById('matchupHero'),hero(m));
    const ticker=document.getElementById('scoreStrips');
    if(ticker && ready)patch(ticker,strips(m));
    if(m.loading || !m.league.ready || m.ui.playerId)return;
    if(overviewScene)patch(document.getElementById('workspace'),overview(m));
    else if(leagueScene)patch(document.getElementById('workspace'),matchups(m,true));
  };
  window.FantasyTV={overview,roster,row,gameInfo,injuryInfo,matchups,feed,page,hero,injuries,fantasyStrip,nflStrip,strips};
  app.render();
})();

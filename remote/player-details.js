(() => {
  'use strict';
  const app=window.FantasyCenter,esc=app.escape,fmt=app.format,tv=document.body.dataset.screen==='tv';
  const root=document.body.dataset.root || './';
  let intel=null,consensus=null,loading=false,lastFetch=0;
  const num=v=>v==null || v==='' || typeof v==='boolean'?null:Number.isFinite(Number(v))?Number(v):null;
  const key=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
  const team=v=>({WSH:'WAS',JAC:'JAX',LA:'LAR'}[v] || v || 'FA');
  const date=v=>v && Number.isFinite(Date.parse(v))?new Date(v).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):null;
  const reportDay=v=>v && /^\d{4}-\d{2}-\d{2}$/.test(v)?new Date(v+'T12:00:00').toLocaleDateString([],{month:'short',day:'numeric'}):null;
  const url=v=>{try{const u=new URL(v);return /^https?:$/.test(u.protocol)?u.href:null;}catch(_){return null;}};
  const pointLink=(href,label)=>url(href)?'<a href="'+esc(url(href))+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':esc(label);
  const dot=c=>'<i class="team-dot" style="--team-color:'+esc(c)+'"></i>';
  function playerData(p) {
    const wanted=key(p.full_name || p.name)+':'+team(p.team);
    return intel?.players?.[wanted] || Object.values(intel?.players || {}).find(r=>key(r.name)===key(p.full_name || p.name) && team(r.team)===team(p.team));
  }
  function average(p,week) {
    const pool=consensus?.periods?.[week]?.players || (Number(consensus?.week)===Number(week)?consensus?.players || {}:{});
    const row=pool[p.player_id] || Object.values(pool).find(r=>key(r.name)===key(p.full_name || p.name) && team(r.team)===team(p.team));
    const seen=new Set(),sources=(row?.sources || []).filter(r=>num(r.value)!==null && Number(r.season)===2026 && Number(r.week)===Number(week) && r.scoring==='PPR' && !seen.has(r.source) && seen.add(r.source));
    const values=sources.map(r=>Number(r.value));
    return {sources,value:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null};
  }
  function injurySummary(p) {
    const data=playerData(p),reports=data?.reports || [];
    const report=reports.find(r=>r.source==='NFL.com') || reports.find(r=>r.source==='CBS Sports') || reports.find(r=>r.source==='FantasyPros') || reports[0];
    const status=report?.status || p.injury_status || p.injuryStatus || (/OUT|IR|DOUBTFUL|QUESTIONABLE|PUP/i.test(p.status || '')?p.status:null);
    return {status,practice:report?.practice || p.practice_participation || null,injury:report?.injury || null,week:report?.week || intel?.week || null,
      source:report?.source || 'League roster',date:reportDay(report?.reported_date) || date(report?.reported_at) || null,url:url(report?.url),
      reported:Boolean(report),loading:loading || !intel};
  }
  function coverage() {
    const sources=intel?.sources || [],available=sources.filter(s=>s.status==='available').length;
    return '<details class="player-source-coverage"><summary>'+available+' / '+(intel?.source_count || 30)+' news sources accessible'+(date(intel?.checked_at)?' · Checked '+esc(date(intel.checked_at)):'')+'</summary><p>News coverage and numeric projection contributors are counted separately.</p>'+
      (sources.length?'<ul>'+sources.map(s=>'<li>'+pointLink(s.url,s.name)+'<span>'+esc(s.status==='available'?s.matched_count+' player headlines':s.reason || s.status.replaceAll('_',' '))+'</span></li>').join('')+'</ul>':'<p>Source checks are loading. Unavailable reports are excluded.</p>')+'</details>';
  }
  function news(p) {
    const data=playerData(p),reports=data?.reports || [];
    const report=reports.find(r=>r.source==='NFL.com') || reports.find(r=>r.source==='CBS Sports') || reports.find(r=>r.source==='FantasyPros') || reports[0];
    const rawStatus=p.injury_status || p.injuryStatus || (/OUT|IR|DOUBTFUL|QUESTIONABLE|PUP/i.test(p.status || '')?p.status:null);
    const status=report?.status || rawStatus || 'No injury designation reported';
    const practice=report?.practice || p.practice_participation || 'Not reported';
    const chance=reports.find(r=>num(r.play_probability)!==null);
    const chanceValue=chance?num(chance.play_probability):null;
    const probability=chanceValue!==null?fmt(chanceValue,0)+'%'+(chance.probability_type==='confirmed_out'?' · Confirmed out':' · Provider estimate'):'Not published';
    const period=report?.week || intel?.week;
    const reportLine=(report?.source || (tv?'League roster':app.getUI().league==='espn'?'ESPN roster':'Sleeper roster'))+(period?' · Injury report week '+period:' · Current roster status');
    const seen=new Set(),items=(data?.news || []).filter(n=>!seen.has(n.source) && seen.add(n.source)).slice(0,tv?7:8);
    return '<div class="player-health"><div><small>Injury status</small><b>'+esc(status)+'</b></div><div><small>Latest practice</small><b>'+esc(practice)+'</b></div><div><small>Chance of playing'+(chance?.week?' · Week '+chance.week:'')+'</small><b>'+esc(probability)+'</b></div></div>'+
      '<p class="player-report-note">'+pointLink(report?.url,reportLine)+(reportDay(report?.reported_date)?' · Report dated '+esc(reportDay(report.reported_date)):date(report?.reported_at)?' · Reported '+esc(date(report.reported_at)):' · Publication time not supplied')+'</p>'+
      (report?.injury?'<p class="player-report-note">Reported issue: '+esc(report.injury)+'</p>':'')+
      '<p class="player-report-note">Injury reports describe current availability; the stats above are for Week '+esc(app.model().league.week)+'.</p>'+
      '<div class="player-headlines">'+(items.length?items.map(n=>{
        const words=n.title.split(/\s+/),headline=words.slice(0,22).join(' ')+(words.length>22?'…':'');
        return '<article><small>'+esc(n.source_name)+' · '+esc(date(n.published_at) || 'Publication date unavailable')+'</small>'+pointLink(n.url,headline)+'</article>';
      }).join(''):'<p class="empty-state">'+(loading?'Checking player reports…':'No matching public headlines found in the latest source check.')+'</p>')+'</div>'+coverage();
  }
  function projections(p,m) {
    const a=average(p,m.league.week),native=num(p.projected);
    return '<div class="player-projection-summary"><div><small>'+esc(m.ui.league==='espn'?'ESPN league projection':'Sleeper projection')+' · Week '+esc(m.league.week)+'</small><b>'+fmt(native,1,'—')+'</b></div><div><small>Source average · PPR</small><b>'+fmt(a.value,1,'—')+'</b><span>'+a.sources.length+' contributing '+(a.sources.length===1?'source':'sources')+'</span></div></div>'+
      '<p class="player-report-note">Arithmetic mean of available '+esc(2026)+' Week '+esc(m.league.week)+' PPR values. Missing sources, other weeks, and other scoring formats are excluded.</p>'+
      (m.ui.league==='espn'?'<p class="player-report-note">ESPN’s league scoring controls your matchup totals. The PPR average is shown separately.</p>':'')+
      (a.sources.length?'<div class="player-projection-sources">'+a.sources.map(s=>'<div><span>'+esc(s.label || s.source)+'</span><b>'+fmt(s.value)+'</b></div>').join('')+'</div><p class="player-report-note">Source range '+fmt(a.min)+'–'+fmt(a.max)+' points.</p>':'<p class="empty-state">No verified same-week numeric average is available for this player yet.</p>')+
      '<p class="player-report-note">Projected player statistics</p>'+statGrid(p,true)+coverage();
  }
  function statGrid(p,projected=false) {
    const rows=(app.data.stats?.(p) || []).filter(s=>Boolean(s.projected || /^PROJ /i.test(s.label))===projected && !/^(?:PROJ )?STAT \d+$/i.test(s.label));
    return '<div class="detail-stat-grid">'+(rows.length?rows.map(s=>'<div><b>'+fmt(s.value,Number.isInteger(Number(s.value))?0:1)+'</b><small>'+esc(s.label.replace(/^PROJ /i,''))+'</small></div>').join(''):'<div class="player-stats-empty">'+(projected?'No projected stat line reported.':'No actual player stats reported for this scoring week yet.')+'</div>')+'</div>';
  }
  function render(m,full=false) {
    const p=m.player;if(!p)return '';
    fetchData();
    const owner=p.fantasyTeamName || (m.league.teams || []).find(t=>(t.players || []).some(x=>String(x.player_id)===String(p.player_id)))?.name || '';
    const color=p.fantasyTeamColor || '#aca0e5',flagKey=m.ui.league+':'+p.player_id,flagged=Boolean(m.ui.flaggedPlayers?.[flagKey]);
    const tab=['stats','news','projections'].includes(m.ui.playerTab)?m.ui.playerTab:'stats';
    const tabs=[['stats','Stats'],['news','News & injury'],['projections','Projections']];
    return '<section class="glass-selected '+(full?'tv-player-detail':'')+'" style="--team-color:'+esc(color)+'"><div class="detail-heading"><span>Player details</span><div class="player-detail-tools">'+
      (!tv?'<button class="player-flag-control '+(flagged?'flagged':'')+'" type="button" data-detail-player="'+esc(p.player_id)+'" data-detail-tab="'+tab+'" data-flag-player="'+esc(flagKey)+'" aria-pressed="'+flagged+'" aria-label="'+(flagged?'Unflag':'Flag')+' '+esc(p.full_name || p.name)+'">'+(flagged?'★ Flagged':'☆ Flag')+'</button><button type="button" data-close-player="true" aria-label="Close player stats">✕</button>':flagged?'<span class="player-flag-mark">★ Flagged</span>':'')+'</div></div>'+
      '<div class="selected-identity">'+app.markup.face(p,'large')+'<div><h2>'+esc(p.full_name || p.name)+'</h2><p>'+esc(p.position)+' · '+esc(p.team)+' · '+esc(p.status || 'Upcoming')+'</p><span>'+dot(color)+esc(owner)+'</span></div><strong>'+fmt(app.data.actual(p))+'<small>Fantasy points</small></strong></div>'+
      '<p class="selected-game">'+esc(app.markup.gameLabel(p))+' · Week '+esc(m.league.week)+' · Proj '+fmt(p.projected,1,'—')+'</p>'+
      '<div class="player-detail-tabs" '+(!tv?'role="tablist" aria-label="Player information"':'')+'>'+tabs.map(([id,label])=>tv?'<span class="'+(tab===id?'active':'')+'">'+label+'</span>':'<button type="button" role="tab" aria-selected="'+(tab===id)+'" class="'+(tab===id?'active':'')+'" data-detail-player="'+esc(p.player_id)+'" data-player-tab="'+id+'">'+label+'</button>').join('')+'</div>'+
      '<div class="detail-stats-scroll" data-scroll-key="player-'+tab+'" '+(!tv?'role="tabpanel"':'')+'>'+(tab==='news'?news(p):tab==='projections'?projections(p,m):statGrid(p))+'</div>'+
      (!tv?'<div class="selected-actions"><button type="button" class="primary-action" data-player-id="'+esc(p.player_id)+'">Show on TV</button><button type="button" data-close-player="true">Close player</button></div>':'')+'</section>';
  }
  async function fetchData() {
    if(loading || Date.now()-lastFetch<300000)return;
    loading=true;lastFetch=Date.now();
    const values=await Promise.allSettled(['player-intel-data.json','consensus-data.json'].map(name=>fetch(root+name+'?v='+Math.floor(Date.now()/300000),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Unavailable');return r.json();})));
    if(values[0].status==='fulfilled')intel=values[0].value;
    if(values[1].status==='fulfilled')consensus=values[1].value;
    loading=false;app.render();
  }
  document.addEventListener('click',e=>{
    if(tv)return;
    const b=e.target.closest('[data-player-tab],[data-flag-player]');if(!b)return;
    const playerId=b.dataset.detailPlayer || app.getUI().playerId;
    if(b.dataset.playerTab)app.dispatch({playerId,playerTab:b.dataset.playerTab});
    else app.dispatch({playerId,playerTab:b.dataset.detailTab || app.getUI().playerTab || 'stats',playerFlag:{[b.dataset.flagPlayer]:!app.getUI().flaggedPlayers?.[b.dataset.flagPlayer]}});
  });
  window.FantasyPlayerDetails={render,average,playerData,injurySummary,fetchData};
  app.render();
})();

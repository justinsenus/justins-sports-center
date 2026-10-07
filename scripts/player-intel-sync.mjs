import {readFile,writeFile} from 'node:fs/promises';
import {SOURCES,nameKey,articles,discoveredFeed,matchNews,dedupeNews,officialInjuries,dailyInjuries,playProbability} from './player-intel-lib.mjs';
const season=Number(process.env.SEASON || 2026),league=process.env.SLEEPER_LEAGUE_ID || '1387635903379300352';
const now=new Date().toISOString(),fpKey=process.env.FANTASYPROS_API_KEY || '';
const outputPath='patriots-fantasy-touch/player-intel-data.json';
async function request(url,json=false,headers={}) {
  const r=await fetch(url,{headers:{Accept:json?'application/json':'application/rss+xml, application/atom+xml, text/html','User-Agent':'Justin Fantasy Command Center / personal news links',...headers},signal:AbortSignal.timeout(18000)});
  if(!r.ok)throw new Error('HTTP '+r.status);
  const limit=json?24*1024*1024:12*1024*1024;
  if(Number(r.headers.get('content-length'))>limit)throw new Error('Response too large');
  const body=await r.text();if(body.length>limit)throw new Error('Response too large');
  // Respect publisher verification walls; no alternate route is probed.
  if(/<title[^>]*>\s*(Just a moment|Access Denied|Verify)/i.test(body))throw new Error('Publisher verification required');
  return json?JSON.parse(body):body;
}
async function saved(path) {try{return JSON.parse(await readFile(path,'utf8'));}catch(_){return null;}}
const teamKey=t=>({WSH:'WAS',JAC:'JAX',LA:'LAR'}[t] || t || 'FA');
async function loadPlayers() {
  const [pool,rosters,state,espn]=await Promise.all([
    request('https://api.sleeper.app/v1/players/nfl',true),
    request('https://api.sleeper.app/v1/league/'+league+'/rosters',true),
    request('https://api.sleeper.app/v1/state/nfl',true),saved('patriots-fantasy/espn-data.json')]);
  const rows=new Map();
  const add=(p,id,provider)=>{
    const name=p.full_name || p.name || p.fullName;if(!name || /^(DEF|DST|D\/ST)$/i.test(p.position || ''))return;
    const team=teamKey(p.team),key=nameKey(name)+':'+team;
    const row=rows.get(key) || {key,name,team,ids:{},provider_reports:[]};row.ids[provider]=String(id);
    const status=p.injury_status || p.injuryStatus || (/^(OUT|IR|DOUBTFUL|QUESTIONABLE|PUP|SUSPENDED)$/i.test(p.status || '')?p.status:null);
    const practice=p.practice_participation || p.practiceParticipation || null;
    if(status || practice)row.provider_reports.push({source:provider==='sleeper'?'Sleeper roster':'ESPN roster',status,practice,injury:p.injury_body_part || p.injuryBodyPart || null,reported_at:null,checked_at:now,week:null,play_probability:null});
    rows.set(key,row);
  };
  for(const r of rosters)for(const id of r.players || [])if(pool[id])add(pool[id],id,'sleeper');
  const espnTeams=espn?.leagueTeams || [espn?.myTeam,espn?.opponent];
  for(const t of espnTeams) {
    const ps=Array.isArray(t?.players)?t.players:Object.values(t?.players || {});
    for(const p of [...(t?.starters || []),...(t?.bench || []),...ps])add(p,p.player_id || p.playerId || p.id,'espn');
  }
  const week=Math.max(Number(state.display_week || state.week || 1),Number(espn?.scoringPeriodId || 0));
  return {players:[...rows.values()],week};
}
async function sourceNews(source,players) {
  const result={...source,status:'unavailable',checked_at:now,article_count:0,matched_count:0};
  try {
    let body,rows;
    if(source.id==='espn') {
      const data=await request('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=100',true);
      rows=(data.articles || []).map(a=>({title:a.headline,url:a.links?.web?.href,published_at:a.published || null})).filter(r=>r.title && r.url);
      body='';
    } else {body=await request(source.url);rows=articles(body,source.url);}
    const feed=discoveredFeed(body,source.url);
    if(feed) {body=await request(feed);rows=articles(body,feed);result.feed=feed;}
    const matched=matchNews(rows,players,source);
    result.article_count=rows.length;result.matched_count=matched.length;
    result.status=rows.length?'available':'no_public_headlines';
    return {source:result,news:matched};
  }catch(e){result.reason=e.message;return {source:result,news:[]};}
}
async function main() {
  const {players,week}=await loadPlayers();const results=[];
  for(let i=0;i<SOURCES.length;i+=6)results.push(...await Promise.all(SOURCES.slice(i,i+6).map(s=>sourceNews(s,players))));
  const url='https://www.nfl.com/injuries/league/'+season+'/reg'+week;
  let official=[],reportStatus='unavailable';
  try {official=officialInjuries(await request(url),season,week,players,url);reportStatus=official.length?'available':'No verified report for this week';}catch(_){}
  const cbsURL='https://www.cbssports.com/nfl/injuries/daily/';let cbs=[],cbsStatus='unavailable';
  try {cbs=dailyInjuries(await request(cbsURL),season,week,players,cbsURL);cbsStatus=cbs.length?'available':'no_verified_same_week_reports';}catch(_){}
  let fpReports=[],fpStatus='not_configured';
  if(fpKey) {
    try {
      const data=await request('https://api.fantasypros.com/public/v2/json/nfl/injuries?season='+season+'&week='+week,true,{'x-api-key':fpKey});
      const rows=Array.isArray(data)?data:data.players || data.injuries || data.data || [];
      if(!Array.isArray(rows))throw new Error('Unrecognized injury response');
      for(const r of rows) {
        const name=r.player_name || r.name || r.player?.name || r.full_name;
        const p=players.find(p=>nameKey(p.name)===nameKey(name));if(!p)continue;
        if(r.week!=null && Number(r.week)!==week || r.season!=null && Number(r.season)!==season)continue;
        fpReports.push({player_key:p.key,source:'FantasyPros',week,season,status:r.injury_status || r.status || null,
          practice:r.practice_status || r.practice_participation || null,injury:r.injury || r.body_part || null,
          reported_at:r.updated_at || r.date || null,checked_at:now,play_probability:playProbability(r),probability_type:'provider_model',url:'https://www.fantasypros.com/nfl/player-news.php'});
      }fpStatus=fpReports.length?'available':'no_matching_reports';
    }catch(e){fpStatus=e.message;}
  }
  const news=dedupeNews(results.flatMap(r=>r.news));
  const output={schema_version:1,season,week,checked_at:now,source_count:SOURCES.length,sources:results.map(r=>r.source),
    injury_sources:[{name:'NFL.com',status:reportStatus,url},{name:'CBS Sports daily report',status:cbsStatus,url:cbsURL},{name:'FantasyPros injury API',status:fpStatus}],
    players:Object.fromEntries(players.map(p=>[p.key,{...p,news:news.filter(n=>n.player_key===p.key).slice(0,30),
      reports:[...official.filter(r=>r.player_key===p.key).map(r=>({...r,reported_at:null,checked_at:now})),...cbs.filter(r=>r.player_key===p.key).map(r=>({...r,checked_at:now})),...fpReports.filter(r=>r.player_key===p.key),...p.provider_reports]}])),
    notes:['Thirty news publishers are checked; source availability is reported separately from projection coverage.',
      'Headlines without publication dates are labeled as undated. Missing practice reports or play probabilities remain unknown.',
      'Injury status is not a modeled probability. A confirmed Out designation is 0% for that report week.',
      'Article bodies and credentials are not included.']};
  await writeFile(outputPath,JSON.stringify(output,null,2)+'\n');
  console.log('Saved player news for '+players.length+' players: '+results.filter(r=>r.source.status==='available').length+'/'+SOURCES.length+' public sources, '+news.length+' matched headlines, '+official.length+' verified NFL reports.');
}
main().catch(e=>{console.error('Player news sync failed: '+e.message);process.exitCode=1;});

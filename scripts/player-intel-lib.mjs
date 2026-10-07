// Public headlines and factual reports only; article bodies stay with publishers.
export const SOURCES = [
  ['nfl','NFL.com','https://www.nfl.com/news/'],
  ['espn','ESPN','https://www.espn.com/nfl/'],
  ['cbs','CBS Sports','https://www.cbssports.com/fantasy/football/players/news/all/'],
  ['yahoo','Yahoo Sports','https://sports.yahoo.com/nfl/rss.xml'],
  ['nbc','NBC Sports','https://www.nbcsports.com/fantasy/football/player-news'],
  ['fox','FOX Sports','https://www.foxsports.com/nfl'],
  ['usatoday','USA TODAY','https://www.usatoday.com/sports/nfl/'],
  ['ap','Associated Press','https://apnews.com/hub/nfl'],
  ['si','Sports Illustrated','https://www.si.com/nfl'],
  ['athletic','The Athletic','https://www.nytimes.com/athletic/nfl/'],
  ['bleacher','Bleacher Report','https://bleacherreport.com/nfl'],
  ['sportingnews','Sporting News','https://www.sportingnews.com/us/nfl'],
  ['fantasypros','FantasyPros','https://www.fantasypros.com/nfl/player-news.php'],
  ['rotoballer','RotoBaller','https://www.rotoballer.com/feed'],
  ['rotowire','RotoWire','https://www.rotowire.com/rss/news.php?sport=NFL'],
  ['footballguys','Footballguys','https://www.footballguys.com/news'],
  ['4for4','4for4','https://www.4for4.com/news'],
  ['fantasylife','Fantasy Life','https://www.fantasylife.com/articles/nfl'],
  ['fantasyalarm','Fantasy Alarm','https://www.fantasyalarm.com/articles/nfl'],
  ['fftoday','FFToday','https://www.fftoday.com/news/'],
  ['draftsharks','Draft Sharks','https://www.draftsharks.com/fantasy-football-news'],
  ['etr','Establish The Run','https://establishtherun.com/feed/'],
  ['fantasypoints','Fantasy Points','https://www.fantasypoints.com/nfl/articles'],
  ['pff','PFF','https://www.pff.com/news'],
  ['playerprofiler','PlayerProfiler','https://www.playerprofiler.com/news/'],
  ['sixpack','Fantasy Six Pack','https://fantasysixpack.net/feed/'],
  ['razzball','Razzball','https://football.razzball.com/feed/'],
  ['pfn','Pro Football Network','https://www.profootballnetwork.com/feed/'],
  ['patriots','Patriots.com','https://www.patriots.com/news/'],
  ['rumors','Pro Football Rumors','https://www.profootballrumors.com/feed']
].map(([id,name,url])=>({id,name,url}));
export const num=v=>v==null || v==='' || typeof v==='boolean'?null:Number.isFinite(Number(v))?Number(v):null;
export const nameKey=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
export function text(v) {
  return String(v||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&apos;|&#39;/gi,"'").replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
}
export const safeURL=(value,base)=>{try{const u=new URL(value,base);return u.protocol==='https:' || u.protocol==='http:'?u.href:null;}catch(_){return null;}};
const tag=(s,t)=>text(s.match(new RegExp('<'+t+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+t+'>','i'))?.[1]);
const date=v=>v && Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
export function articles(body,base) {
  const out=[];
  const items=body.match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi)||[];
  for(const item of items) {
    const title=tag(item,'title'),url=safeURL(tag(item,'link') || item.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1],base);
    const published_at=date(tag(item,'pubDate') || tag(item,'published') || tag(item,'updated') || tag(item,'dc:date'));
    if(title && url)out.push({title,url,published_at});
  }
  if(!items.length) {
    // Structured articles preserve dates when a publisher exposes them.
    for(const match of body.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const visit=x=>{if(Array.isArray(x))return x.forEach(visit);if(!x||typeof x!=='object')return;
          if(/Article|NewsArticle|BlogPosting/.test(String(x['@type']))) {
            const title=text(x.headline || x.name),url=safeURL(x.url || x.mainEntityOfPage?.['@id'],base);
            if(title && url)out.push({title,url,published_at:date(x.datePublished || x.dateModified)});
          }
          if(x['@graph'])visit(x['@graph']);if(x.itemListElement)visit(x.itemListElement);if(x.item)visit(x.item);
        };visit(JSON.parse(match[1]));
      }catch(_){}
    }
    for(const match of body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const title=text(match[2]),url=safeURL(text(match[1]),base);
      if(title.length>=24 && title.length<=240 && url && new URL(url).hostname.replace(/^www\./,'')===new URL(base).hostname.replace(/^www\./,''))out.push({title,url,published_at:null});
    }
  }
  const unique=new Map();for(const row of out)if(!unique.has(row.url) || !unique.get(row.url).published_at)unique.set(row.url,row);
  return [...unique.values()];
}
export function discoveredFeed(body,base) {
  for(const match of body.matchAll(/<link\b[^>]*>/gi)) {
    if(!/application\/(rss\+xml|atom\+xml)/i.test(match[0]))continue;
    const url=safeURL(match[0].match(/href=["']([^"']+)["']/i)?.[1],base);
    if(url && new URL(url).hostname===new URL(base).hostname)return url;
  }return null;
}
export function matchNews(rows,players,source,now=Date.now()) {
  const matches=[];
  for(const row of rows) {
    const when=Date.parse(row.published_at);
    if(Number.isFinite(when) && (when>now+3600000 || when<now-10*86400000))continue;
    const titleKey=nameKey(row.title);
    for(const p of players) {
      const key=nameKey(p.name);if(key.length<8 || !titleKey.includes(key))continue;
      matches.push({player_key:p.key,source:source.id,source_name:source.name,title:row.title,url:row.url,published_at:row.published_at});
    }
  }return matches;
}
export function dedupeNews(rows) {
  const seen=new Set();return rows.slice().sort((a,b)=>(Date.parse(b.published_at)||0)-(Date.parse(a.published_at)||0)).filter(r=>{
    const key=r.player_key+':'+nameKey(r.title);if(seen.has(key))return false;seen.add(key);return true;
  });
}
export function playProbability(row) {
  // Status labels and in-season injury risk are never converted to a weekly chance.
  for(const key of ['play_probability','playProbability','probability_of_playing','percent_chance_to_play']) {
    const raw=num(row?.[key]);if(raw===null)continue;
    const value=raw<=1?raw*100:raw;if(value>=0 && value<=100)return Math.round(value);
  }return null;
}
export function projectionMean(rows,season,week,scoring) {
  const seen=new Set(), valid=rows.filter(r=>r && Number(r.season)===Number(season) && Number(r.week)===Number(week) && r.scoring===scoring && num(r.value)!==null && !seen.has(r.source) && seen.add(r.source));
  const values=valid.map(r=>Number(r.value));
  return {value:values.length?Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(1)):null,count:valid.length,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,sources:valid};
}
export function officialInjuries(html,season,week,players,url) {
  const title=text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  if(!new RegExp('Week\\s*'+week+'\\b','i').test(title) || !title.includes(String(season)))return [];
  const reports=[];
  for(const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells=[...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>text(m[1]));
    if(cells.length<5)continue;
    const p=players.find(p=>nameKey(p.name)===nameKey(cells[0]));if(!p)continue;
    reports.push({player_key:p.key,season,week,injury:cells[2]||null,practice:cells[3]||null,status:cells[4]||null,source:'NFL.com',url,play_probability:/^out$/i.test(cells[4])?0:null,probability_type:/^out$/i.test(cells[4])?'confirmed_out':null});
  }return reports;
}
export function dailyInjuries(html,season,week,players,url,now=Date.now()) {
  const out=[];
  for(const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells=[...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>text(m[1]));
    if(cells.length<5)continue;
    const p=players.find(p=>nameKey(cells[1]).includes(nameKey(p.name)));if(!p)continue;
    const description=cells[cells.length-1],reportedWeek=Number(description.match(/\bfor Week\s+(\d+)/i)?.[1]);
    if(reportedWeek!==Number(week))continue; // Return-week forecasts do not describe this week's availability.
    const preceding=text(html.slice(0,match.index));
    const dates=[...preceding.matchAll(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Z][a-z]+\s+\d{1,2},\s+20\d{2})/g)];
    const day=dates[dates.length-1]?.[1];if(!day || !day.includes(String(season)))continue;
    const dayStamp=Date.parse(day+' 12:00:00 GMT');
    if(dayStamp>now+86400000 || dayStamp<now-7*86400000)continue;
    const reported_date=new Date(dayStamp).toISOString().slice(0,10);
    const status=description.match(/\b(Questionable|Doubtful|Out|Inactive|IR)\b/i)?.[1] || null;
    const practice=description.match(/\b(Did Not Practice|Limited Practice|Full Practice|Full Participation|Limited Participation|DNP)\b/i)?.[1] || null;
    out.push({player_key:p.key,season,week,source:'CBS Sports',url,status,practice,injury:cells[3] || null,reported_date,reported_at:null,
      play_probability:/^out$/i.test(status || '')?0:null,probability_type:/^out$/i.test(status || '')?'confirmed_out':null});
  }return out;
}

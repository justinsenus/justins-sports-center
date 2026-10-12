(() => {
  'use strict';
  const canvas = document.getElementById('nativeCanvas');
  if (!canvas || !window.FantasyCenter) return;
  const ctx = canvas.getContext('2d', {alpha:false});
  if (!ctx) return;
  const app = window.FantasyCenter;
  const sizes = {
    one:   {cols:1,rows:1,label:'1 MODULE · 128 × 64'},
    four:  {cols:2,rows:2,label:'4 MODULES · 256 × 128'},
    eight: {cols:4,rows:2,label:'8 MODULES · 512 × 128'},
    sixteen:{cols:4,rows:4,label:'16 MODULES · 512 × 256'}
  };
  const $ = id => document.getElementById(id);
  let chosen = sizes.four;
  let auto = true, manualScene = 0, lastSceneAt = Date.now();
  let demoUntil = 0, shakeUntil = 0, lastMeta = '';
  const baseline = new Map();
  const now = () => Date.now();
  const glyphs = {
    'A':['01110','10001','10001','11111','10001','10001','10001'],
    'B':['11110','10001','10001','11110','10001','10001','11110'],
    'C':['01111','10000','10000','10000','10000','10000','01111'],
    'D':['11110','10001','10001','10001','10001','10001','11110'],
    'E':['11111','10000','10000','11110','10000','10000','11111'],
    'F':['11111','10000','10000','11110','10000','10000','10000'],
    'G':['01111','10000','10000','10111','10001','10001','01111'],
    'H':['10001','10001','10001','11111','10001','10001','10001'],
    'I':['11111','00100','00100','00100','00100','00100','11111'],
    'J':['00111','00010','00010','00010','10010','10010','01100'],
    'K':['10001','10010','10100','11000','10100','10010','10001'],
    'L':['10000','10000','10000','10000','10000','10000','11111'],
    'M':['10001','11011','10101','10101','10001','10001','10001'],
    'N':['10001','11001','10101','10011','10001','10001','10001'],
    'O':['01110','10001','10001','10001','10001','10001','01110'],
    'P':['11110','10001','10001','11110','10000','10000','10000'],
    'Q':['01110','10001','10001','10001','10101','10010','01101'],
    'R':['11110','10001','10001','11110','10100','10010','10001'],
    'S':['01111','10000','10000','01110','00001','00001','11110'],
    'T':['11111','00100','00100','00100','00100','00100','00100'],
    'U':['10001','10001','10001','10001','10001','10001','01110'],
    'V':['10001','10001','10001','10001','10001','01010','00100'],
    'W':['10001','10001','10001','10101','10101','10101','01010'],
    'X':['10001','10001','01010','00100','01010','10001','10001'],
    'Y':['10001','10001','01010','00100','00100','00100','00100'],
    'Z':['11111','00001','00010','00100','01000','10000','11111'],
    '0':['01110','10011','10101','10101','11001','10001','01110'],
    '1':['00100','01100','00100','00100','00100','00100','01110'],
    '2':['01110','10001','00001','00010','00100','01000','11111'],
    '3':['11110','00001','00001','01110','00001','00001','11110'],
    '4':['00010','00110','01010','10010','11111','00010','00010'],
    '5':['11111','10000','10000','11110','00001','00001','11110'],
    '6':['01111','10000','10000','11110','10001','10001','01110'],
    '7':['11111','00001','00010','00100','01000','01000','01000'],
    '8':['01110','10001','10001','01110','10001','10001','01110'],
    '9':['01110','10001','10001','01111','00001','00001','11110'],
    '.':['00000','00000','00000','00000','00000','00110','00110'],
    ':':['00000','00110','00110','00000','00110','00110','00000'],
    '+':['00000','00100','00100','11111','00100','00100','00000'],
    '-':['00000','00000','00000','11111','00000','00000','00000'],
    '/':['00001','00001','00010','00100','01000','10000','10000'],
    '#':['01010','01010','11111','01010','11111','01010','01010'],
    '?':['01110','10001','00001','00010','00100','00000','00100'],
    '!':['00100','00100','00100','00100','00100','00000','00100'],
    '%':['11001','11010','00010','00100','01000','01011','10011'],
    ' ' :['00000','00000','00000','00000','00000','00000','00000']
  };
  const ink={bg:'#03080f',panel:'#081825',line:'#194057',white:'#f0f7ff',
    orange:'#ff912c',blue:'#75ccff',green:'#54eab3',muted:'#7c9db7',red:'#ff5d6e',gold:'#ffdb74'};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const number = (v,d=1) => {
    if(v==null || v==='') return '--';
    const n=Number(v);
    return Number.isFinite(n)?n.toFixed(d):'--';
  };
  const upper=v=>String(v??'').replace(/\s+/g,' ').trim().toUpperCase();
  const short=(v,max)=>upper(v).slice(0,max);
  function box(x,y,w,h,color) {ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function stroke(x,y,w,h,color) {
    box(x,y,w,1,color);box(x,y+h-1,w,1,color);box(x,y,1,h,color);box(x+w-1,y,1,h,color);
  }
  function label(raw,x,y,color=ink.white,s=1,maxWidth=999) {
    const text=upper(raw), length=Math.max(0,Math.floor(maxWidth/(s*6)));
    const chars=text.slice(0,length);
    ctx.fillStyle=color;
    for(let ci=0;ci<chars.length;ci++){
      const g=glyphs[chars[ci]]||glyphs['?'];
      for(let ry=0;ry<7;ry++)for(let rx=0;rx<5;rx++)if(g[ry][rx]==='1')
        ctx.fillRect((x+ci*6*s+rx*s)|0,(y+ry*s)|0,s,s);
    }
    return chars.length*6*s;
  }
  function panel(x,y,w,h,title,color=ink.blue) {
    box(x,y,w,h,ink.panel);stroke(x,y,w,h,ink.line);
    if(title)label(title,x+4,y+4,color,1,w-8);
  }
  const numeric=p=>Number(p && (p.actual ?? p.points ?? 0))||0;
  const starters=(m,key)=>((m?.league?.[key])||[]).filter(p=>p.starter!==false);
  function drawMascot(x,y,w,h){
    if(!mascot.complete || !mascot.naturalWidth) return;
    ctx.imageSmoothingEnabled=false;
    const j=now()<shakeUntil?Math.round(Math.sin(now()/48)*4):0;
    const sw=mascot.naturalWidth,sh=mascot.naturalHeight;
    const scale=Math.min(w/sw,h/sh),tw=Math.round(sw*scale),th=Math.round(sh*scale);
    ctx.drawImage(mascot,(x+(w-tw)/2+j)|0,(y+(h-th)/2)|0,tw,th);
  }
  const mascot=new Image();
  mascot.src='../patriots-fantasy-touch/assets/justin-mascot-cutout.png';
  mascot.addEventListener('load',draw);
  function getModel(){try{return app.model()}catch(_){return null}}
  function trackScores(m) {
    if(!m || m.loading || !m.league?.ready || !m.started)return;
    const n=Number(m.ownActual);
    if(!Number.isFinite(n))return;
    const key=[m.ui?.league||m.league.id||'',m.league.week||'',m.league.ownName||''].join('|');
    const prev=baseline.get(key);
    baseline.set(key,n);
    if(prev!==undefined && n>prev+0.001)shakeUntil=now()+1050;
  }
  function hero(m,w,compact) {
    const league=m?.league||{};
    const isLive=m?.started;
    const mine=isLive?m?.ownActual:m?.ownFinish;
    const theirs=isLive?m?.opponentActual:m?.opponentFinish;
    const own=league.ownName||'MY TEAM',opp=league.opponentName||'OPPONENT';
    if(w===128) {
      label(short(own,11),4,17,ink.orange,1,68);
      label(number(mine),5,29,ink.white,2,118);
      label(short(opp,11),4,48,ink.blue,1,68);
      label(number(theirs),82,46,ink.white,1,42);
      return;
    }
    const big=w>=512, center=w/2, size=big && !compact?4:2;
    const heroTop=big?21:19;
    const leftX=big?14:7,rightX=big?center+46:center+22;
    label(own,leftX,heroTop,ink.orange,big?2:1,center-(big?93:39));
    label(opp,rightX,heroTop,ink.blue,big?2:1,w-rightX-7);
    label(number(mine),leftX,heroTop+(big?19:15),ink.white,size,center-(big?85:35));
    label(number(theirs),rightX,heroTop+(big?19:15),ink.white,size,w-rightX-3);
    drawMascot(center-(big?30:18),big?16:15,big?60:36,big?62:39);
  }
  function scoreRows(m,x,y,w,h) {
    panel(x,y,w,h,'LEAGUE SCORING',ink.gold);
    const events=(m?.events||[]).filter(Boolean);
    const count=Math.max(1,Math.floor((h-19)/13)),offset=Math.floor(now()/9000)*count;
    if(!events.length){label('NO NEW SCORING',x+5,y+20,ink.muted,1,w-10);return;}
    for(let i=0;i<Math.min(count,events.length);i++){
      const e=events[(offset+i)%events.length],ry=y+17+i*13;
      const pts=(Number(e.delta)>0?'+':'')+number(e.delta);
      label(e.name||'PLAYER',x+5,ry,ink.white,1,w-60);
      label(pts,x+w-55,ry,Number(e.delta)<0?ink.red:ink.green,1,52);
    }
  }
  function drawRoster(m,x,y,w,h,key) {
    const mine=key==='own',name=mine?'MY STARTERS':'OPP STARTERS';
    panel(x,y,w,h,name,mine?ink.orange:ink.blue);
    const rows=starters(m,key);
    const lineH=13, count=Math.max(1,Math.floor((h-21)/lineH));
    const start=rows.length>count?(Math.floor(now()/8500)*count)%rows.length:0;
    if(!rows.length){label('WAITING FOR ROSTER',x+4,y+20,ink.muted,1,w-8);return}
    for(let i=0;i<Math.min(count,rows.length);i++){
      const p=rows[(start+i)%rows.length],yy=y+17+i*lineH;
      label((p.position||'')+' '+(p.full_name||p.name||'PLAYER'),x+4,yy,ink.white,1,w-41);
      const val=number(numeric(p));
      label(val,x+w-38,yy,mine?ink.orange:ink.blue,1,34);
    }
  }
  function trend(m,x,y,w,h) {
    panel(x,y,w,h,'MATCHUP STOCK',ink.green);
    const data=(m?.history||[]).slice(-64);
    const raw=data.length>1?data.map(row=>[Number(row.own)||0,Number(row.opponent)||0]):
      [[0,0],[Number(m?.ownActual)||0,Number(m?.opponentActual)||0]];
    const vals=raw.flat(),max=Math.max(1,...vals),min=Math.min(0,...vals);
    const gx=x+5,gy=y+17,gw=w-10,gh=h-24;
    for(let k=0;k<2;k++) {
      const color=k?ink.blue:ink.orange;
      for(let i=1;i<raw.length;i++){
        const xa=gx+(i-1)*(gw-1)/(raw.length-1),xb=gx+i*(gw-1)/(raw.length-1);
        const ya=gy+gh-1-((raw[i-1][k]-min)/(max-min))*(gh-2);
        const yb=gy+gh-1-((raw[i][k]-min)/(max-min))*(gh-2);
        const n=Math.max(1,Math.ceil(Math.max(Math.abs(xb-xa),Math.abs(yb-ya))));
        for(let j=0;j<=n;j++){const t=j/n;box(Math.round(xa+(xb-xa)*t),Math.round(ya+(yb-ya)*t),1,1,color);}
      }
    }
  }
  function stock(m,x,y,w,h) {
    panel(x,y,w,h,'LEAGUE STOCK · TOP 5',ink.blue);
    const teams=(m?.league?.teams||[]).filter(Boolean).map(t=>({
      name:t.name||'TEAM',val:Number(m?.leagueStarted?t.total:t.projected??t.total)||0
    })).sort((a,b)=>b.val-a.val);
    if(!teams.length){label('WAITING FOR TEAMS',x+4,y+18,ink.muted,1,w-8);return;}
    const top=teams.slice(0,5),max=Math.max(1,...top.map(t=>t.val));
    const rowHeight=Math.max(9,Math.min(13,Math.floor((h-20)/top.length)));
    for(let i=0;i<top.length;i++){
      const yy=y+17+i*rowHeight;
      label(short(top[i].name,13),x+4,yy,i===0?ink.gold:ink.white,1,Math.max(30,w*.58));
      box(x+Math.round(w*.6),yy+1,Math.max(1,Math.round((w*.34)*top[i].val/max)),4,i===0?ink.orange:ink.blue);
    }
  }
  function ticker(m,x,y,w,title,isNFL) {
    box(x,y,w,11,ink.panel);
    label(title,x+4,y+2,isNFL?ink.blue:ink.orange,1,48);
    let t='';
    if(isNFL){
      const games=(m?.nflGames||m?.games||[]);
      if(games.length) {
        const game=games[Math.floor(now()/6500)%games.length];
        const comp=game?.competitions?.[0],teams=comp?.competitors||[];
        t=teams.map(c=>(c.team?.abbreviation||'NFL')+' '+(c.score??'-')).join(' / ');
      } else t='NFL SCHEDULE PENDING';
    }else{
      const games=m?.matchups||[];
      if(games.length){
        const game=games[Math.floor(now()/6500)%games.length];
        t=(game.home?.name||'HOME')+' '+number(game.homeScore)+' / '+(game.away?.name||'AWAY')+' '+number(game.awayScore);
      }else t='FANTASY MATCHUPS PENDING';
    }
    label(t,x+58,y+2,ink.white,1,w-65);
  }
  function compactScene(m,w,h,scene) {
    const areaY=w===128?56:64,areaH=w===128?8:h-areaY-25;
    if(w===128) {
      label(scene===0?'LIVE SCORES':scene===1?'STARTERS ROTATE':'P2.5 EXACT',4,56,ink.muted,1,120);
      return;
    }
    if(scene===0)scoreRows(m,5,areaY,w-10,areaH);
    else if(scene===1){
      const cw=Math.floor((w-15)/2);
      drawRoster(m,5,areaY,cw,areaH,'own');
      drawRoster(m,10+cw,areaY,w-15-cw,areaH,'opponent');
    }else{
      const tw=Math.round((w-15)*.57);
      trend(m,5,areaY,tw,areaH);
      stock(m,10+tw,areaY,w-15-tw,areaH);
    }
    ticker(m,5,h-23,w-10,'FANTASY',false);
    ticker(m,5,h-12,w-10,'NFL',true);
  }
  function fullScene(m,w,h) {
    const py=89,span=77;
    drawRoster(m,6,py,163,span,'own');
    drawRoster(m,174,py,163,span,'opponent');
    scoreRows(m,342,py,w-348,span);
    trend(m,6,171,331,57);
    stock(m,342,171,w-348,57);
    ticker(m,6,h-24,w-12,'FANTASY',false);
    ticker(m,6,h-13,w-12,'NFL',true);
  }
  function draw() {
    const w=chosen.cols*128,h=chosen.rows*64;
    if(canvas.width!==w)canvas.width=w;
    if(canvas.height!==h)canvas.height=h;
    ctx.imageSmoothingEnabled=false;
    box(0,0,w,h,ink.bg);
    stroke(0,0,w,h,ink.line);
    const m=getModel();
    trackScores(m);
    const l=m?.league||{};
    const leagueLabel=(m?.ui?.league||'SLEEPER').toUpperCase();
    label(leagueLabel,5,4,ink.orange,1,Math.max(20,w/3));
    label('WEEK '+(l.week??'--')+(m?.started?' LIVE':' PREGAME'),Math.floor(w*.38),4,ink.blue,1,w*.6-4);
    box(4,13,w-8,1,ink.line);
    if(m?.loading || !l.ready){
      label('CONNECTING FANTASY FEEDS',5,Math.max(23,Math.floor(h/2)),ink.gold,1,w-10);
    }else {
      if(now()<demoUntil) {label('DEMO +6.4',Math.max(5,w-83),14,ink.green,1,80);}
      hero({...m,ownActual:now()<demoUntil?(Number(m.ownActual)||0)+6.4:m.ownActual},w,h<200);
      const scene=auto?Math.floor((now()-lastSceneAt)/10000)%3:manualScene;
      if(h>=200)fullScene(m,w,h);else compactScene(m,w,h,scene);
      if(h<200 && w>128)label('VIEW '+(scene+1)+'/3',w-57,h-34,ink.muted,1,54);
    }
    const c=chosen;
    const mmW=c.cols*320,mmH=c.rows*160;
    const meta=c.label+' · '+mmW+' × '+mmH+' MM · P2.5 · '+(m?.loading?'CONNECTING':!l.ready?'FEED UNAVAILABLE':m?.stale?'STALE DATA':'LIVE FEED');
    if(lastMeta!==meta){$('nativeReadout').textContent=meta;lastMeta=meta}
    $('nativeCanvas').setAttribute('aria-label','Pixel-native LED fantasy scoreboard, '+w+' by '+h+' physical pixels');
  }
  function pick(key) {
    chosen=sizes[key]||sizes.four;
    const {cols,rows}=chosen;
    const i=$('nativeSize');if(i)i.value=key;
    const url=new URL(location.href);url.searchParams.set('modules',key);
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    const screen=$('nativeCanvas');
    screen.style.aspectRatio=(cols*128)+' / '+(rows*64);
    draw();
  }
  $('nativeSize')?.addEventListener('change',e=>pick(e.target.value));
  $('nativePause')?.addEventListener('click',()=>{
    auto=!auto;manualScene=Math.floor((now()-lastSceneAt)/10000)%3;lastSceneAt=now();
    $('nativePause').textContent=auto?'Pause rotation':'Resume rotation';draw();
  });
  $('nativeNext')?.addEventListener('click',()=>{
    manualScene=(auto?Math.floor((now()-lastSceneAt)/10000):manualScene)+1;
    manualScene%=3;auto=false;
    $('nativePause').textContent='Resume rotation';draw();
  });
  $('nativeDemo')?.addEventListener('click',()=>{
    demoUntil=now()+2300;shakeUntil=now()+1050;draw();
  });
  $('nativePair')?.addEventListener('click',()=>document.getElementById('remoteToggle')?.click());
  $('nativeFull')?.addEventListener('click',async()=>{
    try {if(document.fullscreenElement)await document.exitFullscreen();else await $('nativeStage').requestFullscreen();}
    catch(_){$('nativeStatus').textContent='Use the TV browser fullscreen option.'}
  });
  document.addEventListener('fantasy:session',()=>{draw()});
  window.setInterval(draw,250);
  const initial=new URL(location.href).searchParams.get('modules');
  pick(sizes[initial]?initial:'four');
  window.FantasyLEDNative={draw,pick,getSize:()=>({...chosen}),sizes};
})();
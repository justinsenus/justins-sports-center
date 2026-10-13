(() => {
  'use strict';
  const canvas = document.getElementById('nativeCanvas');
  if (!canvas || !window.FantasyCenter) return;
  const ctx = canvas.getContext('2d', {alpha:false});
  if (!ctx) return;
  const app = window.FantasyCenter;
  const sizes = {
    twentyfour: {cols:6,rows:4,width:768,height:256,label:'6 ACROSS × 4 DOWN · P2.5 · 768 × 256'},
    tv: {cols:6,rows:4,width:768,height:432,label:'65-INCH TV · 16:9 · LED-STYLE VIEW'}
  };
  const $ = id => document.getElementById(id);
  let chosen = sizes.twentyfour;
  let auto = true, manualScene = 0, lastSceneAt = Date.now();
  let demoUntil = 0, shakeUntil = 0, lastMeta = '', demoBase = 0;
  let celebrationValue = 0;
  // Transition points only on actual provider changes, never on a fresh first load.
  const transitions=new Map();
  function animatedPoints(key,raw) {
    const n=Number(raw);
    if(raw==null || raw==='' || !Number.isFinite(n))return {value:null,delta:0,fraction:1,changed:false};
    let entry=transitions.get(key);
    if(!entry){entry={from:n,to:n,start:0,delta:0};transitions.set(key,entry);}
    if(Math.abs(n-entry.to)>.001) {
      const old=entry.to;
      entry={from:old,to:n,start:now(),delta:n-old};
      transitions.set(key,entry);
    }
    const progress=entry.start?Math.min(1,Math.max(0,(now()-entry.start)/1050)):1;
    const ease=1-Math.pow(1-progress,3);
    return {value:entry.from+(entry.to-entry.from)*ease,delta:entry.delta,
      fraction:progress,changed:entry.start>0 && progress<1};
  }
  const scopeFor=m=>[m?.ui?.league||m?.league?.id||'sleeper',m?.league?.week||''].join(':');
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
    "'":['00100','00100','00010','00000','00000','00000','00000'],
    ',':['00000','00000','00000','00000','00110','00110','00100'],
    '&':['01100','10010','10100','01000','10101','10010','01101'],
    '@':['01110','10001','10111','10101','10111','10000','01111'],
    '(':['00010','00100','01000','01000','01000','00100','00010'],
    ')':['01000','00100','00010','00010','00010','00100','01000'],
    ' ' :['00000','00000','00000','00000','00000','00000','00000']
  };
  const ink={bg:'#01040b',panel:'#030a18',line:'#2258ba',white:'#d8f7ff',
    orange:'#ff912c',blue:'#67bcff',green:'#54eab3',muted:'#90b2d2',red:'#ff5d6e',gold:'#ffdb74'};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const number = (v,d=1) => {
    if(v==null || v==='') return '--';
    const n=Number(v);
    return Number.isFinite(n)?n.toFixed(d):'--';
  };
  const upper=v=>String(v??'').replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ').trim().toUpperCase();
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
  function textWidth(raw,s=1){return Math.max(0,upper(raw).length*6*s-s);}
  function rightLabel(raw,right,y,color=ink.white,s=1,maxWidth=999){
    const n=Math.min(upper(raw).length,Math.floor(maxWidth/(6*s)));
    label(raw,right-Math.max(0,n*6*s-s),y,color,s,maxWidth);
  }
  function centered(raw,cx,y,color=ink.white,s=1){label(raw,Math.round(cx-textWidth(raw,s)/2),y,color,s);}
  function playerName(p){
    const name=String(p.full_name||p.name||'PLAYER').trim();
    const words=name.split(/\s+/);
    return words.length>1?words[0][0]+'. '+words.slice(1).join(' '):name;
  }
  const numeric=p=>Number(p && (p.actual ?? p.points ?? 0))||0;
  const starters=(m,key)=>((m?.league?.[key])||[]).filter(p=>p.starter!==false);
  const ledPalette=['#FF9638','#40D9FF','#68F58C','#FC76E8','#FFE76B','#B9A0FF',
    '#FF849E','#75F1D3','#91BFFF','#FFBC71','#CCF889','#F4A5FF','#83ECFF','#FFAED6'];
  function brightenModel(raw){
    if(!raw?.league)return raw;
    const all=raw.league.teams||[],byId=new Map(),byName=new Map();
    const mine=t=>t.isOwnFantasyTeam||/^(THE BIG SENUS|GUMBYS? BIG D)$/.test(upper(t.name).replace(/'/g,''));
    const ordered=all.slice().sort((a,b)=>String(a.id??a.name).localeCompare(String(b.id??b.name),undefined,{numeric:true}));
    let index=1;
    const teams=ordered.map(t=>{
      const teamColor=mine(t)?ledPalette[0]:ledPalette[1+(index++-1)%(ledPalette.length-1)];
      byId.set(String(t.id),teamColor);byName.set(upper(t.name),teamColor);
      return {...t,teamColor};
    });
    const tint=(id,name,fallback)=>byId.get(String(id))||byName.get(upper(name))||fallback;
    const ownColor=tint(null,raw.league.ownName,ledPalette[0]),opponentColor=tint(null,raw.league.opponentName,ledPalette[1]);
    const player=(p,fallback)=>({...p,fantasyTeamColor:tint(p.fantasyTeamId,p.fantasyTeamName,fallback)});
    return {...raw,league:{...raw.league,teams,ownColor,opponentColor,
      own:(raw.league.own||[]).map(p=>player(p,ownColor)),opponent:(raw.league.opponent||[]).map(p=>player(p,opponentColor)),
      allPlayers:(raw.league.allPlayers||[]).map(p=>player(p,ownColor))},
      player:raw.player?player(raw.player,ownColor):raw.player,
      events:(raw.events||[]).map(e=>({...e,teamColor:tint(e.fantasyTeamId,e.fantasyTeamName,ledPalette[1])})),
      matchups:(raw.matchups||[]).map(g=>({...g,home:{...g.home,teamColor:tint(g.home?.id,g.home?.name,ledPalette[0])},away:{...g.away,teamColor:tint(g.away?.id,g.away?.name,ledPalette[1])}}))};
  }
  const sideInk=(m,side)=>side==='own'?(m?.league?.ownColor||ledPalette[0]):(m?.league?.opponentColor||ledPalette[1]);
  // Crop transparent margins before reducing the mascot into true LED pixels.
  // For a tall mascot, keep the head and cap instead of shrinking the whole body.
  const mascot=new Image();
  let mascotCrop=null;
  function prepareMascot(){
    try {
      const off=document.createElement('canvas');
      off.width=mascot.naturalWidth;off.height=mascot.naturalHeight;
      const c=off.getContext('2d',{willReadFrequently:true});
      if(!c)return;
      c.drawImage(mascot,0,0);
      const pixels=c.getImageData(0,0,off.width,off.height).data;
      let l=off.width,t=off.height,r=0,b=0;
      const step=Math.max(1,Math.floor(Math.max(off.width,off.height)/1300));
      for(let y=0;y<off.height;y+=step)for(let x=0;x<off.width;x+=step){
        if(pixels[(y*off.width+x)*4+3]>40){
          l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);
        }
      }
      if(r>l && b>t){
        const bw=r-l+step,bh=b-t+step,pad=Math.round(bw*.05);
        mascotCrop={x:Math.max(0,l-pad),y:Math.max(0,t-pad),
          w:Math.min(off.width-l+pad,bw+pad*2),
          h:Math.min(off.height-t+pad,bh>bw*1.45?Math.round(bw*1.17):bh+pad*2)};
      }
    }catch(_){} // CORS-protected assets still render using the uncropped image.
  }
  // Native pixel art: render the source head into a small transparent image,
  // then scale with nearest-neighbor. Never draw a background badge or circle.
  let pixelPortrait=null;
  function makePixelPortrait(){
    if(!mascot.naturalWidth)return;
    const crop=mascotCrop||{x:0,y:0,w:mascot.naturalWidth,h:mascot.naturalHeight};
    const off=document.createElement('canvas');off.width=64;off.height=64;
    const g=off.getContext('2d',{willReadFrequently:true});if(!g)return;
    g.clearRect(0,0,64,64);g.imageSmoothingEnabled=false;
    const scale=Math.min(62/crop.w,62/crop.h);
    const dw=Math.round(crop.w*scale),dh=Math.round(crop.h*scale);
    g.drawImage(mascot,crop.x,crop.y,crop.w,crop.h,Math.round((64-dw)/2),Math.round((64-dh)/2),dw,dh);
    try{
      // Reduce color banding gently without replacing transparent edges.
      const id=g.getImageData(0,0,64,64),p=id.data;
      for(let i=0;i<p.length;i+=4)if(p[i+3]>0){
        p[i]=Math.round(p[i]/24)*24;
        p[i+1]=Math.round(p[i+1]/24)*24;
        p[i+2]=Math.round(p[i+2]/24)*24;
      }
      g.putImageData(id,0,0);
    }catch(_){}
    pixelPortrait=off;
  }
  function drawMascot(x,y,w,h){
    if(!mascot.complete||!mascot.naturalWidth){
      label('JS',x+w/2-12,y+h/2-9,ink.orange,2,30);return;
    }
    if(!pixelPortrait)makePixelPortrait();
    ctx.imageSmoothingEnabled=false;
    const jiggle=now()<shakeUntil?Math.round(Math.sin(now()/39)*3):0;
    if(pixelPortrait){
      const ratio=Math.min(w/64,h/64);
      const width=Math.round(64*ratio),height=Math.round(64*ratio);
      ctx.drawImage(pixelPortrait,Math.round(x+(w-width)/2+jiggle),Math.round(y+(h-height)/2),width,height);
    }
  }
  mascot.addEventListener('load',()=>{prepareMascot();makePixelPortrait();canvas.dataset.mascotReady='true';draw()});
  mascot.addEventListener('error',()=>{if(!mascot.src.includes('justin-mascot-cutout.png'))mascot.src='../patriots-fantasy-touch/assets/justin-mascot-cutout.png'});
  mascot.src='../patriots-fantasy-touch/assets/justin-led-mascot-blue-64.png?v=1';
  function getModel(){try{return brightenModel(app.model())}catch(_){return null}}
  function trackScores(m) {
    if(!m || m.loading || !m.league?.ready || !m.started)return;
    const n=Number(m.ownActual);
    if(!Number.isFinite(n))return;
    const key=[m.ui?.league||m.league.id||'',m.league.week||'',m.league.ownName||''].join('|');
    const prev=baseline.get(key);
    baseline.set(key,n);
    if(prev!==undefined && n>prev+.001){
      shakeUntil=now()+2400;
      celebrationValue=n-prev;
    }
  }
  function celebration(w) {
    if(now()>=shakeUntil)return;
    const time=now(),strength=clamp((shakeUntil-time)/2400,0,1),hh=chosen.height===256?70:99;
    const cx=Math.floor(w/2);
    // Pixel confetti and arcade jackpot rays stay INSIDE actual P2.5 resolution.
    const colors=[ink.orange,ink.gold,ink.green,ink.white];
    for(let i=0;i<45;i++){
      const angle=i*2.3999,dist=23+(1-strength)*55+(i%5)*3;
      const x=Math.round(cx+Math.cos(angle)*dist);
      const y=Math.round(hh*.52+Math.sin(angle)*dist*.43);
      if(x>w/2-92&&x<w/2+92&&y>15&&y<hh-6)box(x,y,(i%3===0?3:2),2,colors[i%4]);
    }
    if(Math.floor(time/125)%2===0){
      box(5,hh-3,cx-9,2,ink.green);
    }
  }

  const teamTint=(team,fallback)=>/^#[\da-f]{6}$/i.test(String(team||''))?team:fallback;
  function hero(m,w,h){
    const league=m?.league||{},compact=h===256,cx=w/2,hh=compact?70:99;
    const ownColor=sideInk(m,'own'),opponentColor=sideInk(m,'opponent');
    const a=animatedPoints(scopeFor(m)+(m.animationPreview?'|preview-own':'|hero-own'),m?.ownActual);
    const b=animatedPoints(scopeFor(m)+'|hero-opp',m?.opponentActual);
    panel(4,16,w-8,hh-16,'');
    const ownName=league.ownName||'MY TEAM',oppName=league.opponentName||'OPPONENT';
    const ownScale=textWidth(ownName,2)<=180?2:1,oppScale=textWidth(oppName,2)<=180?2:1;
    box(12,28,5,5,ownColor);label(ownName,23,compact?25:25,ink.white,ownScale,180);
    box(w-17,28,5,5,opponentColor);rightLabel(oppName,w-23,compact?25:25,ink.white,oppScale,180);
    const record=raw=>app.data?.record?.(raw)||'';
    label(record(league.ownRecord),23,compact?43:49,ink.muted,1,186);
    rightLabel(record(league.opponentRecord),w-23,compact?43:49,ink.muted,1,186);
    const ownOwner=league.ownOwner,oppOwner=league.opponentOwner;
    if(!compact){
      if(ownOwner)label('OWNER '+ownOwner,23,61,ink.muted,1,204);
      if(oppOwner)rightLabel('OWNER '+oppOwner,w-23,61,ink.muted,1,204);
    }
    // Fixed, mirrored score slots reserve room for three-digit totals.
    const scoreSize=compact?4:5,scoreY=compact?30:42;
    centered(number(a.value),cx-120,scoreY,a.changed?(a.delta>0?ink.green:ink.red):ink.white,scoreSize);
    centered(number(b.value),cx+120,scoreY,b.changed?(b.delta>0?ink.green:ink.red):ink.white,scoreSize);
    label('PROJ '+number(m?.ownFinish),23,hh-14,ownColor,1,204);
    rightLabel('PROJ '+number(m?.opponentFinish),w-23,hh-14,opponentColor,1,204);
    drawMascot(cx-36,compact?12:16,72,compact?48:72);
    centered('VS',cx,compact?59:88,ink.white,1);
    box(5,hh-3,cx-9,2,ownColor);box(cx+4,hh-3,cx-9,2,opponentColor);
    if(a.changed)centered((a.delta>0?'+':'')+number(a.delta),cx-120,hh-13,a.delta>0?ink.green:ink.red,1);
    celebration(w);
  }

  function scoreRows(m,x,y,w,h){
    panel(x,y,w,h,'LIVE LEAGUE SCORING',ink.blue);
    const events=(m?.events||[]).filter(Boolean);
    const rowH=18,count=Math.max(1,Math.floor((h-15)/rowH));
    const offset=Math.floor(now()/8000)*count;
    if(!events.length){
      label(m?.started?'WAITING FOR NEW SCORING PLAYS':'AWAITING KICKOFF',x+5,y+16,ink.muted,1,w-10);
      return;
    }
    for(let i=0;i<Math.min(count,events.length);i++){
      const e=events[(offset+i)%events.length],yy=y+16+i*rowH,change=Number(e.delta);
      const color=change<0?ink.red:change>0?ink.green:ink.muted;
      box(x+3,yy,2,Math.min(15,h-17),teamTint(e.teamColor,ink.blue));
      const owner=(e.fantasyTeamOwner?' / '+e.fantasyTeamOwner:'');
      label((e.name||'PLAYER')+' / '+(e.fantasyTeamName||'LEAGUE TEAM')+owner,x+9,yy,ink.white,1,w-77);
      rightLabel((change>0?'+':'')+number(e.delta),x+w-6,yy,color,1,66);
      if(h>=46)label('TOTAL '+number(e.total),x+9,yy+9,ink.muted,1,w-20);
    }
  }

  function drawRoster(m,x,y,w,h,key){
    const mine=key==='own',color=sideInk(m,key),compact=h<150;
    const all=m?.league?.[key]||[],rows=all.filter(p=>p.starter!==false);
    panel(x,y,w,h,(mine?'MY':'OPPONENT')+' STARTERS',ink.blue);
    rightLabel('PTS',x+w-5,y+4,ink.blue,1,24);
    const top=y+17,rowH=compact?8:18,capacity=Math.max(1,Math.floor((h-18)/rowH));
    const page=Math.floor(now()/15000)%Math.max(1,Math.ceil(rows.length/capacity));
    const visible=rows.slice(page*capacity,(page+1)*capacity);
    if(!rows.length){label('WAITING FOR ROSTER',x+5,top,ink.muted,1,w-10);return;}
    const scope=scopeFor(m);
    for(let i=0;i<visible.length;i++){
      const p=visible[i],yy=top+i*rowH;
      const selected=String(m?.ui?.playerId||'')===String(p.player_id);
      if(selected)box(x+2,yy-1,w-4,10,'#22435b');
      const keyId=scope+(m.animationPreview?'|preview-p|':'|p|')+String(p.player_id??p.id??p.name);
      const points=animatedPoints(keyId,numeric(p));
      let delta=points.changed?points.delta:0;
      box(x+4,yy+1,2,6,delta>0?ink.green:delta<0?ink.red:color);
      label(p.position||'FLX',x+9,yy,ink.blue,1,25);
      label(playerName(p),x+37,yy,selected?ink.gold:ink.white,1,w-76);
      rightLabel(number(points.value),x+w-5,yy,points.changed?(delta>0?ink.green:ink.red):ink.white,1,38);
      if(!compact){
        const schedule=String(app.markup?.gameLabel?.(p)||p.status||'').replace(/<[^>]*>/g,'');
        label(schedule,x+37,yy+9,p.status==='LIVE'?ink.green:ink.muted,1,w-76);
        rightLabel('P '+number(p.projected),x+w-5,yy+9,color,1,44);
        box(x+4,yy+16,w-8,1,'#102442');
      }
    }
    if(!compact && top+visible.length*rowH+19<y+h){
      const by=top+visible.length*rowH+4,bench=all.filter(p=>p.starter===false),count=Math.floor((y+h-by-13)/18);
      if(count>0&&bench.length)label('BENCH',x+7,by,ink.muted,1,w-14);
      bench.slice(0,Math.max(0,count)).forEach((p,i)=>{
        label((p.position||'')+' '+playerName(p),x+9,by+12+i*18,ink.muted,1,w-52);
        rightLabel(number(numeric(p)),x+w-5,by+12+i*18,ink.muted,1,38);
      });
    }
  }

  function plot(data,x,y,w,h) {
    const series=data.series||[],raw=(data.raw||[]).filter(r=>r&&Array.isArray(r.values));
    const values=raw.length?raw:[{values:series.map(s=>s.value)}];
    const all=values.flatMap(r=>r.values).filter(v=>Number.isFinite(Number(v))).map(Number);
    const max=Math.max(25,...all,...series.map(s=>Number(s.value)||0)),min=Math.min(0,...all);
    const gx=x+21,gy=y+1,gw=w-24,gh=Math.max(8,h-12);
    const ticks=gh<22?2:3;
    for(let k=0;k<ticks;k++){
      const v=min+(max-min)*k/(ticks-1),yy=gy+gh-1-(v-min)/(max-min)*(gh-1);
      box(gx,yy,gw,1,'#102442');rightLabel(number(v,0),gx-4,yy-3,ink.muted,1,20);
    }
    const px=i=>gx+(values.length===1?gw-1:i*(gw-1)/(values.length-1));
    const py=v=>gy+gh-1-(Number(v)-min)/(max-min)*(gh-1);
    for(let k=0;k<series.length;k++){
      const color=teamTint(series[k].color,k?ink.blue:ink.orange);
      // Historical provider samples only; first load has a single point.
      for(let i=1;i<values.length;i++){
        const xa=px(i-1),xb=px(i),ya=py(values[i-1].values[k]??series[k].value),yb=py(values[i].values[k]??series[k].value);
        box(xa,ya,Math.max(1,xb-xa),1,color);box(xb,Math.min(ya,yb),1,Math.max(1,Math.abs(yb-ya)),color);
      }
      const yy=clamp(Math.round(py(series[k].value)),gy,gy+gh-1);
      box(gx+gw-2,yy-1,3,3,color);
    }
    label(values.length>1?'START':'RECORDED',gx,gy+gh+2,ink.muted,1,58);
    rightLabel('LATEST',gx+gw,gy+gh+2,ink.muted,1,42);
  }
  function chartData(m,all=false){
    try{return window.FantasyGlass.dataFor(m,all)}catch(_){return {series:[],raw:[]}}
  }
  function trend(m,x,y,w,h) {
    panel(x,y,w,h,m?.started?'MATCHUP SCORING':'MATCHUP PROJECTIONS',ink.blue);
    const data=chartData(m),colors=[sideInk(m,'own'),sideInk(m,'opponent')];
    data.series.forEach((s,i)=>s.color=colors[i]);
    for(let i=0;i<Math.min(2,data.series.length);i++){
      const cx=x+5+i*Math.floor(w/2);
      box(cx,y+15,3,3,colors[i]);label(data.series[i].name,cx+7,y+13,ink.muted,1,Math.floor(w/2)-49);
      rightLabel(number(data.series[i].value),cx+Math.floor(w/2)-8,y+13,colors[i],1,38);
    }
    plot(data,x+3,y+24,w-6,h-28);
  }
  function stock(m,x,y,w,h) {
    const data=chartData(m,true),all=data.series||[];
    panel(x,y,w,h,'LEAGUE STOCK / '+all.length+' TEAMS',ink.blue);
    const count=Math.max(1,Math.floor((h-16)/11)),ranked=all.slice().sort((a,b)=>b.value-a.value);
    const page=Math.floor(now()/12000)%Math.max(1,Math.ceil(ranked.length/count));
    const shown=ranked.slice(page*count,(page+1)*count),legendW=Math.floor(w*.46),chartW=w-legendW-7;
    plot(data,x+3,y+16,chartW,h-21);
    const lx=x+chartW+9;
    shown.forEach((t,i)=>{
      const yy=y+17+i*11,team=(m?.league?.teams||[]).find(q=>String(q.id)===String(t.id));
      box(lx,yy+1,3,3,teamTint(t.color,ink.blue));
      label((team?.ownerLabel?team.ownerLabel+' / ':'')+t.name,lx+6,yy,ink.white,1,legendW-45);
      rightLabel(number(t.value),x+w-5,yy,ink.white,1,38);
    });
    if(!all.length)label('WAITING FOR TEAMS',x+5,y+18,ink.muted,1,w-10);
  }
  function injuryPanel(m,x,y,w,h){
    panel(x,y,w,h,'INJURY UPDATES',ink.blue);
    const list=[...(m?.league?.own||[]),...(m?.league?.opponent||[])].filter(p=>p.injury_status&&/OUT|IR|Q|DOUBT|PUP|QUESTION/i.test(p.injury_status));
    const count=Math.max(1,Math.floor((h-17)/11)),page=Math.floor(now()/12000)%Math.max(1,Math.ceil(list.length/count));
    list.slice(page*count,(page+1)*count).forEach((p,i)=>{
      const status=upper(p.injury_status),flag=status.includes('QUESTION')?'Q':status.includes('DOUBT')?'D':status;
      label(playerName(p),x+5,y+17+i*11,ink.white,1,w-42);
      rightLabel(flag,x+w-5,y+17+i*11,ink.gold,1,32);
    });
    if(!list.length)label('NO INJURY FLAGS',x+5,y+17,ink.muted,1,w-10);
  }
  function detailPanel(m,x,y,w,h,scene){
    const p=m?.ui?.playerId?(m?.player||[...(m?.league?.own||[]),...(m?.league?.opponent||[])].find(t=>String(t.player_id)===String(m.ui.playerId))):null;
    if(p){
      panel(x,y,w,h,'SELECTED PLAYER',ink.gold);
      label((p.position||'')+' '+(p.full_name||p.name||'PLAYER'),x+5,y+17,ink.white,1,w-10);
      label('PTS '+number(numeric(p))+' / PROJ '+number(p.projected),x+5,y+28,ink.green,1,w-10);
      label('STATUS '+(p.injury_status||p.status||'ACTIVE'),x+5,y+39,ink.muted,1,w-10);
      return;
    }
    if(scene===1)trend(m,x,y,w,h);
    else if(scene===2){
      panel(x,y,w,h,'INJURIES / STATUS',ink.red);
      const flagged=[...(m?.league?.own||[]),...(m?.league?.opponent||[])].filter(p=>p.injury_status&&/OUT|IR|Q|D|PUP|QUESTION/i.test(p.injury_status));
      for(let i=0;i<Math.min(4,flagged.length);i++)label(
        (flagged[i].full_name||flagged[i].name||'PLAYER')+' '+flagged[i].injury_status,
        x+5,y+16+i*9,ink.white,1,w-10);
      if(!flagged.length)label('NO FLAGGED STARTERS',x+5,y+19,ink.muted,1,w-10);
    }else stock(m,x,y,w,h);
  }
  function scrollTicker(m,x,y,w,title,isNFL){
    const h=12;box(x,y,w,h,ink.panel);box(x,y,2,h,isNFL?ink.blue:ink.orange);
    const titleWidth=isNFL?35:88;
    label(title,x+5,y+2,isNFL?ink.blue:ink.orange,1,titleWidth-5);
    const entries=[];
    if(isNFL){
      for(const game of (m?.nflGames||m?.games||[]).slice(0,20)){
        const comp=game?.competitions?.[0],arr=comp?.competitors||[];
        const status=game?.status?.type?.state||comp?.status?.type?.state||'pre';
        if(arr.length<2)continue;
        for(const t of arr){
          const points=Number(t.score),opp=arr.find(o=>o!==t),oppPoints=Number(opp?.score);
          const isPlaying=status!=='pre' && Number.isFinite(points)&&Number.isFinite(oppPoints);
          entries.push({text:(t.team?.abbreviation||t.team?.shortDisplayName||'NFL')+' '+(status==='pre'?'--':(t.score??'--')),
            color:isPlaying?(points>oppPoints?ink.green:points<oppPoints?ink.red:ink.white):ink.blue});
        }
        entries.push({text:status==='in'?'LIVE':status==='post'?'FINAL':'UPCOMING',color:ink.muted});
      }
    }else{
      const games=(m?.matchups||[]).slice(0,16);
      for(const g of games){
        const a=Number(g.homeScore),b=Number(g.awayScore),live=m?.leagueStarted;
        entries.push({text:(g.home?.name||'HOME')+(g.home?.ownerLabel?' ('+g.home.ownerLabel+')':'')+' '+number(g.homeScore),
          color:live&&Number.isFinite(a)&&Number.isFinite(b)?(a>b?ink.green:a<b?ink.red:ink.white):teamTint(g.home?.teamColor,ink.orange)});
        entries.push({text:(g.away?.name||'AWAY')+(g.away?.ownerLabel?' ('+g.away.ownerLabel+')':'')+' '+number(g.awayScore),
          color:live&&Number.isFinite(a)&&Number.isFinite(b)?(b>a?ink.green:b<a?ink.red:ink.white):teamTint(g.away?.teamColor,ink.blue)});
      }
      const all=[...(m?.league?.own||[]),...(m?.league?.opponent||[])].filter(p=>p.starter!==false);
      for(const p of all)entries.push({
        text:(p.position||'')+' '+(p.full_name||p.name||'PLAYER')+' '+number(numeric(p)),
        color:p.side==='opponent'?ink.blue:ink.orange
      });
    }
    if(!entries.length)entries.push({text:isNFL?'NFL SCORES PENDING':'FANTASY SCORES PENDING',color:ink.muted});
    const widths=entries.map(e=>Math.max(50,upper(e.text).length*6+19));
    const total=widths.reduce((a,b)=>a+b,0);
    const scroll=Math.floor(now()*(isNFL?0.029:0.037))%Math.max(1,total);
    const left=x+titleWidth,right=x+w-3;
    ctx.save();ctx.beginPath();ctx.rect(left,y+1,right-left,h-2);ctx.clip();
    for(const offset of [-scroll,total-scroll]){
      let pos=left+offset;
      for(let i=0;i<entries.length;i++){
        if(pos+widths[i]>=left&&pos<right){
          box(pos,y+4,3,3,entries[i].color);
          label(entries[i].text,pos+8,y+2,ink.white,1,widths[i]-11);
        }
        pos+=widths[i];
        if(pos>right)break;
      }
    }
    ctx.restore();
  }
  function fantasyLogo(m,side,x,y,size){
    const league=m?.league||{},name=side==='own'?league.ownName:league.opponentName;
    const team=(league.teams||[]).find(t=>t.name===name);
    const isMine=team?.isOwnFantasyTeam||/^(THE BIG SENUS|GUMBYS? BIG D)$/.test(upper(name).replace(/'/g,''));
    if(isMine){drawMascot(x,y,size,size);return;}
    const avatar=(side==='own'?league.ownAvatar:league.opponentAvatar)||team?.avatar||team?.logo||'';
    if(drawPhoto(avatar,x,y,size,size))return;
    const c=sideInk(m,side);
    stroke(x,y,size,size,c);
    const initials=upper(name).split(' ').filter(Boolean).map(n=>n[0]).slice(0,2).join('')||'FT';
    centered(initials,x+size/2,y+Math.floor((size-7)/2),c,1);
  }
  function fantasyTotals(m,x,y,w,h){
    const compact=h<25,labelW=74,mid=x+Math.floor(w/2)+labelW/2,gap=3;
    panel(x,y,w,h,'');
    label('FANTASY',x+5,y+(compact?6:5),ink.blue,1,63);
    if(!compact)label('WEEK '+(m.league?.week||'--'),x+5,y+18,ink.muted,1,63);
    box(x+labelW-3,y+2,1,h-4,ink.line);
    const slotW=Math.floor((w-labelW-gap*3)/2);
    for(let i=0;i<2;i++){
      const side=i?'opponent':'own',left=x+labelW+i*(slotW+gap),c=sideInk(m,side);
      const name=i?m.league?.opponentName:m.league?.ownName,size=compact?14:22;
      const key=scopeFor(m)+(m.animationPreview?'|preview-card-':'|card-')+side;
      const points=animatedPoints(key,i?m.opponentActual:m.ownActual),scoreScale=compact?1:2;
      const score=number(points.value),scoreRoom=compact?41:78;
      fantasyLogo(m,side,left+4,y+Math.floor((h-size)/2),size);
      label(name||'TEAM',left+size+10,y+(compact?6:5),ink.white,1,slotW-size-scoreRoom-18);
      if(!compact){const owner=i?m.league?.opponentOwner:m.league?.ownOwner;
        label(owner||'WEEKLY MATCHUP',left+size+10,y+17,c,1,slotW-size-scoreRoom-18);}
      rightLabel(score,left+slotW-5,y+(compact?6:8),points.changed?(points.delta>0?ink.green:ink.red):c,scoreScale,scoreRoom);
      box(left+2,y+h-2,slotW-4,1,c);
      if(i)box(left-2,y+3,1,h-6,ink.line);
    }
  }
  function gameTime(g,state){
    if(state==='in')return 'LIVE '+String(g.status?.type?.shortDetail||g.competitions?.[0]?.status?.type?.shortDetail||'');
    if(state==='post')return 'FINAL';
    const date=new Date(g.date||g.competitions?.[0]?.date||'');
    if(!Number.isFinite(date.getTime()))return 'SCHEDULED';
    return date.toLocaleDateString('en-US',{timeZone:'America/New_York',weekday:'short'})+' '+date.toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).replace(' AM','A').replace(' PM','P');
  }
  function nflCards(m,x,y,w,h){
    panel(x,y,w,h,'');
    const games=(m.nflGames||m.games||[]).filter(g=>g.competitions?.[0]?.competitors?.length>=2),count=6,labelW=71;
    const page=Math.floor(now()/13000)%Math.max(1,Math.ceil(games.length/count));
    const shown=Array.from({length:Math.min(count,games.length)},(_,i)=>games[(page*count+i)%games.length]);
    label('NFL',x+6,y+5,ink.blue,1,63);
    label('W'+(m.nflWeek||m.league?.week||'--'),x+6,y+16,ink.muted,1,63);
    if(h>=38&&games.length>count)label((page+1)+'/'+Math.ceil(games.length/count),x+6,y+29,ink.muted,1,63);
    box(x+labelW-3,y+2,1,h-4,ink.line);
    if(!games.length){label('NFL SCORES PENDING',x+labelW+9,y+12,ink.muted,1,w-labelW-20);return;}
    const cw=Math.floor((w-labelW-3)/count),compact=h<38;
    shown.forEach((g,i)=>{
      const left=x+labelW+i*cw,comp=g.competitions[0],state=g.status?.type?.state||comp.status?.type?.state||'pre';
      const teams=comp.competitors.slice().sort((a,b)=>(a.homeAway==='away'?0:1)-(b.homeAway==='away'?0:1));
      label(gameTime(g,state),left+3,y+3,state==='in'?ink.green:ink.muted,1,cw-8);
      for(let j=0;j<2;j++){
        const t=teams[j],team=t.team||{},yy=y+(compact?12+j*10:14+j*15);
        const src=team.logo||team.logos?.[0]?.href||(team.abbreviation?'https://a.espncdn.com/i/teamlogos/nfl/500/'+String(team.abbreviation).toLowerCase()+'.png':'');
        const logoW=compact?14:18,logoH=compact?9:14;
        if(!drawPhoto(src,left+3,yy-1,logoW,logoH)){
          box(left+5,yy+1,6,5,'#'+String(team.color||'40D9FF').replace('#',''));
        }
        label(team.abbreviation||'NFL',left+logoW+7,yy+(compact?0:3),ink.white,1,26);
        const score=state==='pre'?'--':String(t.score??'--');
        rightLabel(score,left+cw-5,yy,state==='in'?ink.green:ink.white,compact?1:2,compact?29:42);
      }
      if(i)box(left-1,y+2,1,h-4,ink.line);
    });
    canvas.dataset.logoCount=String([...photoCache.values()].filter(v=>v?.complete&&v.naturalWidth).length);
  }
  function bottomCards(m,w,h){
    const compact=h===256,nflH=compact?31:44,fantasyH=compact?18:30;
    const nflY=h-nflH-3,fantasyY=nflY-fantasyH-3;
    fantasyTotals(m,4,fantasyY,w-8,fantasyH);nflCards(m,4,nflY,w-8,nflH);
  }
  // Equal starter columns flank both charts; score cards keep stable positions.
  function fullScene(m,w,h){
    const compact=h===256,gap=4,top=compact?74:103,bottom=compact?172:307;
    const rosterW=200,rightX=w-gap-rosterW,cx=gap*2+rosterW,cw=rightX-cx-gap;
    const bodyH=bottom-top,upperH=Math.floor((bodyH-gap)*.54);
    drawRoster(m,gap,top,rosterW,bodyH,'own');
    drawRoster(m,rightX,top,rosterW,bodyH,'opponent');
    trend(m,cx,top,cw,upperH);
    stock(m,cx,top+upperH+gap,cw,bodyH-upperH-gap);
    const supportY=bottom+gap,supportH=compact?24:35;
    injuryPanel(m,gap,supportY,rosterW,supportH);
    scoreRows(m,cx,supportY,w-cx-gap,supportH);
    bottomCards(m,w,h);
  }

  function allPlayers(m){
    const l=m?.league||{},seen=new Set();
    return [...(l.own||[]),...(l.opponent||[]),...(l.allPlayers||[]),
      ...(l.teams||[]).flatMap(t=>t.players||[])].filter(p=>{
      if(!p)return false;
      const key=String(p.player_id??p.id??p.full_name??p.name);
      if(seen.has(key))return false;seen.add(key);return true;
    });
  }
  function chosenPlayer(m){
    const id=m?.ui?.playerId;
    if(id==null || id==='')return null;
    const match=allPlayers(m).find(p=>String(p.player_id??p.id)===String(id));
    return match||((m?.player && String(m.player.player_id??m.player.id)===String(id))?m.player:null);
  }
  function statEntries(p,tab){
    if(tab==='projections'){
      const src=Array.isArray(p.projectedGameStats)?p.projectedGameStats:[];
      return src.filter(q=>Number.isFinite(Number(q?.value))).map(q=>({label:q.label||q.name||'PROJ',value:q.value}));
    }
    try{
      const arr=window.FantasyCenter?.data?.stats?.(p);
      if(Array.isArray(arr)&&arr.length)return arr.filter(q=>Number.isFinite(Number(q?.value)));
    }catch(_){}
    const list=Array.isArray(p.gameStats)?p.gameStats:[];
    if(list.length)return list.filter(q=>Number.isFinite(Number(q?.value)));
    return [['RECEPTIONS',p.rec??p.receptions],['RECEIVING YARDS',p.rec_yd??p.receiving_yards],
      ['RUSHING YARDS',p.rush_yd??p.rushing_yards],['PASS YARDS',p.pass_yd??p.passing_yards],
      ['PASS TD',p.pass_td],['RUSH TD',p.rush_td],['REC TD',p.rec_td],['TARGETS',p.rec_tgt]]
      .filter(([,v])=>v!==undefined&&v!==null).map(([label,value])=>({label,value}));
  }
  const photoCache=new Map();
  function drawPhoto(src,x,y,w,h) {
    const u=String(src||'');
    if(!/^https:\/\//i.test(u))return false;
    if(!photoCache.has(u)){
      const img=new Image();
      photoCache.set(u,img);
      img.onload=draw;img.onerror=()=>{photoCache.set(u,null)};
      img.src=u;
    }
    const image=photoCache.get(u);
    if(!image?.complete||!image.naturalWidth)return false;
    const ratio=Math.min(w/image.naturalWidth,h/image.naturalHeight);
    const cw=Math.round(image.naturalWidth*ratio),ch=Math.round(image.naturalHeight*ratio);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(image,Math.round(x+(w-cw)/2),Math.round(y+(h-ch)/2),cw,ch);
    return true;
  }
  function playerScene(m,p,w,h) {
    const tab=m.ui?.playerTab||'stats',x=8,y=17,body=h-47;
    panel(x,y,w-16,body,'PLAYER CENTER / '+upper(tab),ink.orange);
    const large=h>=380,headW=large?105:77;
    const photo=(p.headshot||p.photo||p.image||p.avatar||'');
    if(!drawPhoto(photo,x+12,y+18,headW,large?108:80))
      label(short((p.position||'')+' '+(p.team||''),12),x+14,y+44,ink.blue,1,headW-8);
    const px=x+headW+23, rightW=w-px-20;
    label(p.full_name||p.name||'SELECTED PLAYER',px,y+19,ink.white,2,rightW);
    label((p.position||'FLEX')+' / '+(p.team||'NFL')+' / '+(p.status||'PREGAME'),
      px,y+42,ink.blue,1,rightW);
    label('ACTUAL POINTS',px,y+62,ink.muted,1,150);
    label(number(numeric(p)),px,y+75,ink.green,3,140);
    label('PROJECTED '+number(p.projected),px+152,y+76,p.fantasyTeamColor||sideInk(m,'own'),1,rightW-154);
    if(tab==='news'){
      label('INJURY STATUS / PLAYER NEWS',x+12,y+126,ink.gold,1,w-40);
      label(p.injury_status||p.injuryStatus||p.status||'NO INJURY FLAG',
        x+12,y+146,p.injury_status?ink.red:ink.green,2,w-45);
      label('LIVE REPORTS APPEAR WHEN SUPPLIED BY THE FEED',
        x+12,y+174,ink.muted,1,w-45);
    }else{
      const rows=statEntries(p,tab);
      const top=y+(large?151:119);
      const columns=2,cw=Math.floor((w-30)/2),rowH=large?22:18;
      panel(x+6,top-11,w-28,Math.max(16,body-(top-y)+4),
        tab==='projections'?'PROJECTED GAME STATS':'LIVE GAME STATS',ink.blue);
      if(!rows.length)label('NO DETAILED STATS IN PROVIDER FEED',x+14,top+10,ink.muted,1,w-39);
      rows.slice(0,Math.max(2,Math.floor((h-top-49)/rowH)*columns)).forEach((s,i)=>{
        const col=i%2,row=Math.floor(i/2),sx=x+12+col*cw,sy=top+6+row*rowH;
        label(s.label||'STAT',sx,sy,ink.muted,1,cw-38);
        label(number(s.value,Number.isInteger(Number(s.value))?0:1),
          sx+cw-40,sy,ink.white,1,36);
      });
    }
    scrollTicker(m,6,h-27,w-12,'FANTASY + PLAYERS',false);
    scrollTicker(m,6,h-14,w-12,'NFL',true);
  }
  function matchupsScene(m,w,h){
    const list=m.matchups||[],x=7,bodyY=32,room=h-64;
    panel(6,17,w-12,h-46,'LEAGUE MATCHUPS · '+list.length+' GAMES',ink.gold);
    if(!list.length){label('WAITING FOR MATCHUP FEED',x+7,45,ink.muted,1,w-20);}
    const per=Math.max(1,Math.floor(room/26));
    const offset=(Math.floor(now()/10500)*per)%Math.max(1,list.length);
    for(let i=0;i<Math.min(per,list.length);i++){
      const g=list[(offset+i)%list.length],yy=bodyY+i*26;
      const a=Number(g.homeScore),b=Number(g.awayScore),c1=a>b?ink.green:a<b?ink.red:ink.orange,c2=b>a?ink.green:b<a?ink.red:ink.blue;
      label((g.home?.name||'HOME')+(g.home?.ownerLabel?' / '+g.home.ownerLabel:''),x+7,yy,c1,1,Math.round(w*.42));
      label(number(g.homeScore),Math.round(w*.43),yy,ink.white,1,54);
      label((g.away?.name||'AWAY')+(g.away?.ownerLabel?' / '+g.away.ownerLabel:''),Math.round(w*.58),yy,c2,1,Math.round(w*.27));
      label(number(g.awayScore),w-53,yy,ink.white,1,48);
      box(x+5,yy+12,w-26,1,ink.line);
    }
    scrollTicker(m,6,h-27,w-12,'FANTASY + PLAYERS',false);
    scrollTicker(m,6,h-14,w-12,'NFL',true);
  }
  function gameScene(m,w,h){
    const games=[...(m.nflGames||m.games||[])];
    const selected=games.find(g=>String(g.id)===String(m.ui?.gameId));
    const shown=selected?[selected]:games;
    panel(6,17,w-12,h-46,selected?'SELECTED NFL GAME':'NFL SCORES AND GAMES',ink.blue);
    const capacity=Math.max(1,Math.floor((h-63)/38));
    const offset=selected?0:(Math.floor(now()/11500)*capacity)%Math.max(1,shown.length);
    if(!shown.length)label('NO NFL GAMES RETURNED',14,51,ink.muted,1,w-25);
    for(let i=0;i<Math.min(capacity,shown.length);i++){
      const g=shown[(offset+i)%shown.length],list=g.competitions?.[0]?.competitors||[];
      const yy=38+i*38,status=g.status?.type?.shortDetail||g.status?.type?.name||'SCHEDULED';
      label(upper(list[0]?.team?.displayName||list[0]?.team?.abbreviation||'AWAY'),
        16,yy,ink.blue,1,Math.round(w*.43));
      label(list[0]?.score??'--',Math.round(w*.44),yy,ink.white,2,68);
      label(upper(list[1]?.team?.displayName||list[1]?.team?.abbreviation||'HOME'),
        Math.round(w*.6),yy,ink.orange,1,Math.round(w*.25));
      label(list[1]?.score??'--',w-54,yy,ink.white,2,50);
      label(status,16,yy+18,ink.muted,1,w-26);
      box(12,yy+31,w-24,1,ink.line);
    }
    scrollTicker(m,6,h-27,w-12,'FANTASY + PLAYERS',false);
    scrollTicker(m,6,h-14,w-12,'NFL',true);
  }
  function contextScene(m,w,h,view){
    const y=20,room=h-50;
    if(view==='stock'){
      trend(m,8,y,Math.floor(w*.61),room);
      stock(m,14+Math.floor(w*.61),y,w-22-Math.floor(w*.61),room);
    }else if(view==='injuries'){
      panel(8,y,w-16,room,'LEAGUE INJURY REPORT',ink.red);
      const entries=allPlayers(m).filter(p=>/OUT|IR|DOUBTFUL|QUESTIONABLE|PUP|INJUR/i.test(String(p.injury_status||p.injuryStatus||'')));
      const capacity=Math.max(1,Math.floor((room-18)/17));
      const at=Math.floor(now()/10000)*capacity;
      if(!entries.length)label('NO INJURY UPDATES AVAILABLE',15,y+26,ink.green,1,w-30);
      for(let i=0;i<Math.min(entries.length,capacity);i++){
        const p=entries[(at+i)%entries.length],yy=y+17+i*17;
        label(p.full_name||p.name||'PLAYER',15,yy,ink.white,1,Math.round(w*.48));
        label(p.injury_status||p.injuryStatus,w*.54,yy,ink.red,1,w*.41);
        label((p.position||'')+' '+(p.team||''),15,yy+8,ink.muted,1,w-30);
      }
    }else {
      panel(8,y,w-16,room,'LIVE LEAGUE SCORING',ink.green);
      scoreRows(m,12,y+15,w-24,room-19);
    }
    scrollTicker(m,6,h-27,w-12,'FANTASY + PLAYERS',false);
    scrollTicker(m,6,h-14,w-12,'NFL',true);
  }
  function draw() {
    const w=chosen.width,h=chosen.height;
    if(canvas.width!==w)canvas.width=w;
    if(canvas.height!==h)canvas.height=h;
    ctx.imageSmoothingEnabled=false;
    box(0,0,w,h,ink.bg);stroke(0,0,w,h,ink.line);
    const live=getModel();trackScores(live);
    let m=live;
    if(now()<demoUntil&&live?.league?.ready){
      const first=(live.league.own||[]).find(p=>p.starter!==false);
      const own=(live.league.own||[]).map(p=>p===first?{...p,actual:numeric(p)+6.4}:p);
      m={...live,animationPreview:true,ownActual:demoBase+6.4,
        ui:{...live.ui,view:'overview',playerId:null,gameId:null},league:{...live.league,own},
        events:[{name:'DEMO '+(first?playerName(first):'SCORING PLAY'),fantasyTeamName:live.league.ownName,
          fantasyTeamOwner:live.league.ownOwner,delta:6.4,total:first?numeric(first)+6.4:demoBase+6.4,
          teamColor:sideInk(live,'own')},...(live.events||[])]};
    }
    canvas.dataset.animationPreview=m?.animationPreview?'true':'false';
    const league=m?.league||{},ui=m?.ui||{},view=upper(ui.view||'OVERVIEW');
    // Tiny ID label, so nearly the entire native LED budget shows game data.
    label(upper(ui.league||'SLEEPER')+' WEEK '+(league.week??'--'),
      8,5,ink.blue,1,220);
    rightLabel(chosen===sizes.twentyfour?'6X4 P2.5 / 768X256':'TV / 16:9',w-8,5,ink.muted,1,220);
    if(view!=='OVERVIEW')centered(view,w/2,5,ink.muted,1);
    if(m?.loading || !league.ready){
      label('CONNECTING FANTASY FEEDS',12,Math.floor(h/2),ink.gold,1,w-24);
    }else{
      const player=chosenPlayer(m);
      if(player)playerScene(m,player,w,h);
      else if(ui.gameId!=null&&ui.gameId!=='' || ['games','patriots'].includes(ui.view))
        gameScene(m,w,h);
      else if(['matchups','league'].includes(ui.view))
        matchupsScene(m,w,h);
      else if(['stock','injuries','live'].includes(ui.view))
        contextScene(m,w,h,ui.view);
      else {
        if(m.animationPreview)centered('ANIMATION PREVIEW +6.4',w/2,5,ink.green,1);
        hero(m,w,h);
        fullScene(m,w,h);
      }
    }
    const mmW=chosen.cols*320,mmH=chosen.rows*160;
    const remote=window.FantasyRemote?.getStatus?.();
    const textStatus=document.getElementById('remoteStatus')?.textContent?.trim()||'Controller status unavailable';
    const dataState=m?.loading?'FEED LOADING':!league.ready?(m?.error||'FEED UNAVAILABLE'):m?.stale?'STALE FANTASY DATA':'FANTASY DATA READY';
    const conn=remote?(remote.paired?(remote.connected?'PAIRED':'RECONNECTING'):'NOT PAIRED'):'WAITING FOR PAIRING';
    const meta=chosen.label+(chosen===sizes.twentyfour?' · '+mmW+' × '+mmH+' MM':' · BUILD PREVIEW SHOWS THE PHYSICAL PANEL SHAPE')+' · '+dataState+' · '+conn;
    if(lastMeta!==meta){$('nativeReadout').textContent=meta;lastMeta=meta}
    const stage=$('nativeStatus'),message=m?.animationPreview?'ANIMATION PREVIEW · live scores remain unchanged':textStatus+' · '+dataState;
    if(stage&&stage.textContent!==message)stage.textContent=message;
    canvas.setAttribute('aria-label',(m?.animationPreview?'Animation preview. ':'')+(chosen===sizes.twentyfour?'P2.5 physical board preview':'TV LED-style scoreboard')+', '+w+' by '+h+' pixels. '+(league.ownName||'My team')+' '+number(m?.ownActual)+' vs '+(league.opponentName||'opponent')+' '+number(m?.opponentActual));
    for(const key of ['sleeper','espn'])$('nativeLeague'+(key==='sleeper'?'Sleeper':'Espn'))?.setAttribute('aria-pressed',String(ui.league===key));
  }

  function pick(key) {
    chosen=key==='tv'&&document.body.dataset.tvLedCanvas==='1'?sizes.tv:sizes.twentyfour;
    const {cols,rows}=chosen;
    const i=$('nativeSize');if(i)i.value=key;
    const url=new URL(location.href);url.searchParams.set('modules','twentyfour');url.searchParams.set('display',chosen===sizes.tv?'tv':'build');
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    const screen=$('nativeCanvas');
    screen.style.aspectRatio=chosen.width+' / '+chosen.height;
    document.body.dataset.ledDisplay=chosen===sizes.tv?'tv':'build';
    $('nativeTV')?.setAttribute('aria-pressed',String(chosen===sizes.tv));
    $('nativeBuild')?.setAttribute('aria-pressed',String(chosen===sizes.twentyfour));
    fitCanvas();draw();
  }
  function fitCanvas(){
    const stage=$('nativeStage');if(!stage)return;
    const roomW=stage.clientWidth-8,roomH=stage.clientHeight-8;
    let scale=Math.min(roomW/chosen.width,roomH/chosen.height);
    // Preserve the canvas proportions, including the wider physical 6x4 build.
    scale=Math.max(.1,scale);
    canvas.style.width=Math.floor(chosen.width*scale)+'px';canvas.style.height=Math.floor(chosen.height*scale)+'px';
  }
  window.addEventListener('resize',fitCanvas);
  document.addEventListener('fullscreenchange',fitCanvas);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(fitCanvas).observe($('nativeStage'));
  $('nativeTV')?.addEventListener('click',()=>pick('tv'));
  $('nativeBuild')?.addEventListener('click',()=>pick('twentyfour'));
  for(const key of ['sleeper','espn'])$('nativeLeague'+(key==='sleeper'?'Sleeper':'Espn'))?.addEventListener('click',()=>{app.dispatch({league:key,matchupId:null,playerId:null,gameId:null,view:'overview'});draw()});
  $('nativeHome')?.addEventListener('click',()=>{app.dispatch({view:'overview',playerId:null,gameId:null});draw()});
  $('nativeSize')?.addEventListener('change',e=>pick(e.target.value));
  const kiosk=$('nativeKiosk'),exit=$('nativeExit');
  function setKiosk(enabled){
    document.body.classList.toggle('native-kiosk',Boolean(enabled));
    kiosk?.setAttribute('aria-pressed',String(Boolean(enabled)));
    if(kiosk)kiosk.textContent=enabled?'Screen only active':'Screen only';
    fitCanvas();
  }
  kiosk?.addEventListener('click',()=>setKiosk(!document.body.classList.contains('native-kiosk')));
  exit?.addEventListener('click',async()=>{
    if(document.fullscreenElement)try{await document.exitFullscreen()}catch(_){}
    setKiosk(false);
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&document.body.classList.contains('native-kiosk'))setKiosk(false);
  });
  $('nativePause')?.addEventListener('click',()=>{
    auto=!auto;manualScene=Math.floor((now()-lastSceneAt)/10000)%3;lastSceneAt=now();
    $('nativePause').textContent=auto?'Pause rotation':'Resume rotation';draw();
  });
  $('nativeNext')?.addEventListener('click',()=>{
    manualScene=(auto?Math.floor((now()-lastSceneAt)/10000):manualScene)+1;
    manualScene%=3;auto=false;
    $('nativePause').textContent='Resume rotation';draw();
  });
  function previewAnimation(){
    const m=getModel();if(!m?.league?.ready)return;
    demoBase=Number(m.ownActual)||0;
    const seed=n=>({from:n,to:n,start:0,delta:0});
    for(const suffix of ['|preview-own','|preview-card-own'])transitions.set(scopeFor(m)+suffix,seed(demoBase));
    const p=(m.league.own||[]).find(p=>p.starter!==false);
    if(p)transitions.set(scopeFor(m)+'|preview-p|'+String(p.player_id??p.id??p.name),seed(numeric(p)));
    demoUntil=now()+5500;shakeUntil=now()+2400;celebrationValue=6.4;draw();
  }
  $('nativeDemo')?.addEventListener('click',previewAnimation);
  $('nativePair')?.addEventListener('click',()=>document.getElementById('remoteToggle')?.click());
  $('nativeFull')?.addEventListener('click',async()=>{
    try {if(document.fullscreenElement)await document.exitFullscreen();else await $('nativeStage').requestFullscreen();}
    catch(_){$('nativeStatus').textContent='Use the TV browser fullscreen option.'}
  });
  document.addEventListener('fantasy:session',e=>{
    if(e.detail?.paired)document.getElementById('pairPanel')?.classList.add('hidden');
    draw();
  });
  // Reloads may resume an already paired room before the native renderer loads.
  window.setTimeout(()=>{
    if(window.FantasyRemote?.getStatus?.().paired)document.getElementById('pairPanel')?.classList.add('hidden');
    draw();
  },850);
  window.setInterval(draw,120);
  const initial=new URL(location.href).searchParams.get('modules');
  const display=new URL(location.href).searchParams.get('display');
  pick(document.body.dataset.tvLedCanvas==='1'&&display!=='build'?'tv':'twentyfour');
  window.FantasyLEDNative={draw,pick,previewAnimation,getSize:()=>({...chosen}),sizes};
})();

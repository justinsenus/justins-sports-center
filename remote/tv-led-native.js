(() => {
  'use strict';
  const canvas = document.getElementById('nativeCanvas');
  if (!canvas || !window.FantasyCenter) return;
  const ctx = canvas.getContext('2d', {alpha:false});
  if (!ctx) return;
  const app = window.FantasyCenter;
  const sizes = {
    sixteen:    {cols:4,rows:4,label:'16 MODULES · 512 × 256'},
    twentyfour: {cols:4,rows:6,label:'24 MODULES · 512 × 384'}
  };
  const $ = id => document.getElementById(id);
  let chosen = sizes.sixteen;
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
    "'":['00100','00100','00010','00000','00000','00000','00000'],
    ',':['00000','00000','00000','00000','00110','00110','00100'],
    '&':['01100','10010','10100','01000','10101','10010','01101'],
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
    const off=document.createElement('canvas');off.width=40;off.height=44;
    const g=off.getContext('2d',{willReadFrequently:true});if(!g)return;
    g.clearRect(0,0,40,44);g.imageSmoothingEnabled=false;
    const scale=Math.min(38/crop.w,42/crop.h);
    const dw=Math.round(crop.w*scale),dh=Math.round(crop.h*scale);
    g.drawImage(mascot,crop.x,crop.y,crop.w,crop.h,Math.round((40-dw)/2),Math.round((44-dh)/2),dw,dh);
    try{
      // Reduce color banding gently without replacing transparent edges.
      const id=g.getImageData(0,0,40,44),p=id.data;
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
      const ratio=Math.min((w-3)/40,(h-2)/44);
      const width=Math.round(40*ratio),height=Math.round(44*ratio);
      ctx.drawImage(pixelPortrait,Math.round(x+(w-width)/2+jiggle),Math.round(y+(h-height)/2),width,height);
    }
  }
  mascot.src='../patriots-fantasy-touch/assets/justin-mascot-cutout.png';
  mascot.addEventListener('load',()=>{prepareMascot();makePixelPortrait();draw()});
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
  const teamTint=(team,fallback)=>/^#[\da-f]{6}$/i.test(String(team||''))?team:fallback;
  function hero(m,w,h){
    const league=m?.league||{},isLive=Boolean(m?.started);
    const mine=isLive?m?.ownActual:m?.ownFinish;
    const theirs=isLive?m?.opponentActual:m?.opponentFinish;
    const own=league.ownName||'MY TEAM',opp=league.opponentName||'OPPONENT';
    const a=Number(mine),b=Number(theirs),valid=Number.isFinite(a)&&Number.isFinite(b);
    const ownColor=isLive&&valid?(a>b?ink.green:a<b?ink.red:ink.orange):ink.orange;
    const oppColor=isLive&&valid?(b>a?ink.green:b<a?ink.red:ink.blue):ink.blue;
    const center=Math.floor(w/2),left=Math.max(12,Math.round(w*.09)),right=center+Math.max(65,Math.round(w*.085));
    const labelSize=w>850?2:1,scoreSize=w>850?5:w>600?4:3;
    label(own,left,21,ownColor,labelSize,center-left-57);
    label(opp,right,21,oppColor,labelSize,w-right-9);
    label(number(mine),left,40,ink.white,scoreSize,center-left-57);
    label(number(theirs),right,40,ink.white,scoreSize,w-right-8);
    // Size favors face legibility, while the gutters keep both scores outside its area.
    const portrait=w>850?100:w>600?90:77;
    drawMascot(center-portrait/2,11,portrait,portrait-7);
    if(isLive && valid){
      label(a>b?'LEADING':a<b?'TRAILING':'TIED',left,70,ownColor,1,88);
      label(b>a?'LEADING':b<a?'TRAILING':'TIED',right,70,oppColor,1,88);
    }else{
      label('PROJECTED',left,70,ink.muted,1,90);
      label('PROJECTED',right,70,ink.muted,1,90);
    }
  }
  function scoreRows(m,x,y,w,h){
    panel(x,y,w,h,'LEAGUE SCORING · ALL TEAMS',ink.gold);
    const events=(m?.events||[]).filter(Boolean);
    const rowH=19,count=Math.max(1,Math.floor((h-21)/rowH));
    const offset=Math.floor(now()/8500)*count;
    if(!events.length){label(m?.started?'NO NEW SCORING':'AWAITING KICKOFF',x+5,y+22,ink.muted,1,w-10);return;}
    for(let i=0;i<Math.min(count,events.length);i++){
      const e=events[(offset+i)%events.length],ry=y+16+i*rowH,change=Number(e.delta);
      const color=change<0?ink.red:change>0?ink.green:ink.muted;
      label(e.name||'PLAYER',x+5,ry,ink.white,1,w-63);
      label((change>0?'+':'')+number(e.delta),x+w-56,ry,color,1,53);
      label(e.fantasyTeamName||'LEAGUE',x+5,ry+9,ink.muted,1,w-67);
      label('PTS '+number(e.total),x+w-66,ry+9,ink.gold,1,64);
    }
  }
  function drawRoster(m,x,y,w,h,key){
    const mine=key==='own',name=mine?'MY STARTERS':'OPP STARTERS',baseColor=mine?ink.orange:ink.blue;
    const team=(m?.league?.teams||[]).find(t=>t?.name===(mine?m.league.ownName:m.league.opponentName));
    const color=teamTint(team?.teamColor,baseColor);
    panel(x,y,w,h,name,color);
    const rows=starters(m,key);
    const capacity=Math.floor((h-19)/10);
    const lineH=Math.max(10,Math.min(12,Math.floor((h-19)/Math.max(1,rows.length))));
    if(!rows.length){label('WAITING FOR ROSTER',x+4,y+24,ink.muted,1,w-8);return;}
    if(rows.length>capacity)label('OVERFLOW '+(rows.length-capacity),x+w-87,y+4,ink.red,1,83);
    // Never silently rotate starters off the physical 4x4 scoreboard.
    for(let i=0;i<Math.min(rows.length,capacity);i++){
      const p=rows[i],yy=y+15+i*lineH;
      const selected=String(m?.ui?.playerId||'')===String(p.player_id);
      if(selected)box(x+2,yy-1,w-4,9,'#22435b');
      box(x+4,yy+1,2,5,color);
      label((p.position||'')+' '+(p.full_name||p.name||'PLAYER'),x+9,yy,
        selected?ink.gold:ink.white,1,w-49);
      const val=number(numeric(p));
      label(val,x+w-39,yy,selected?ink.gold:baseColor,1,36);
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
    panel(x,y,w,h,h>=68?'LEAGUE STOCK · TOP 5':'LEAGUE STOCK · TOP 3',ink.blue);
    const teams=(m?.league?.teams||[]).filter(Boolean).map(t=>({
      name:t.name||'TEAM',val:Number(m?.leagueStarted?t.total:t.projected??t.total)||0
    })).sort((a,b)=>b.val-a.val);
    if(!teams.length){label('WAITING FOR TEAMS',x+4,y+18,ink.muted,1,w-8);return;}
    const count=h>=68?5:3,top=teams.slice(0,count),max=Math.max(1,...top.map(t=>t.val));
    const rowHeight=Math.max(9,Math.min(13,Math.floor((h-20)/top.length)));
    for(let i=0;i<top.length;i++){
      const yy=y+17+i*rowHeight;
      label(short(top[i].name,13),x+4,yy,i===0?ink.gold:ink.white,1,Math.max(30,w*.58));
      box(x+Math.round(w*.6),yy+1,Math.max(1,Math.round((w*.34)*top[i].val/max)),4,i===0?ink.orange:ink.blue);
    }
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
        entries.push({text:(g.home?.name||'HOME')+' '+number(g.homeScore),
          color:live&&Number.isFinite(a)&&Number.isFinite(b)?(a>b?ink.green:a<b?ink.red:ink.white):teamTint(g.home?.teamColor,ink.orange)});
        entries.push({text:(g.away?.name||'AWAY')+' '+number(g.awayScore),
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
  // Keep the primary product layout predictable: both starter columns,
  // a readable league-scoring feed, and uninterrupted native-pixel ribbons.
  function fullScene(m,w,h){
    const gap=6,bodyY=83,bodyBottom=h-29,bodyH=bodyBottom-bodyY;
    const rosterW=Math.floor((w-gap*4)*.305),rightX=gap*3+rosterW*2;
    const rightW=w-rightX-gap;
    drawRoster(m,gap,bodyY,rosterW,bodyH,'own');
    drawRoster(m,gap*2+rosterW,bodyY,rosterW,bodyH,'opponent');
    scoreRows(m,rightX,bodyY,rightW,bodyH);
    scrollTicker(m,6,h-27,w-12,'FANTASY + PLAYERS',false);
    scrollTicker(m,6,h-14,w-12,'NFL',true);
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
    label('PROJECTED '+number(p.projected),px+152,y+76,ink.gold,1,rightW-154);
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
      label(g.home?.name||'HOME',x+7,yy,c1,1,Math.round(w*.42));
      label(number(g.homeScore),Math.round(w*.43),yy,ink.white,1,54);
      label(g.away?.name||'AWAY',Math.round(w*.58),yy,c2,1,Math.round(w*.27));
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
    const w=chosen.cols*128,h=chosen.rows*64;
    if(canvas.width!==w)canvas.width=w;
    if(canvas.height!==h)canvas.height=h;
    ctx.imageSmoothingEnabled=false;
    box(0,0,w,h,ink.bg);stroke(0,0,w,h,ink.line);
    const m=getModel();trackScores(m);
    const league=m?.league||{},ui=m?.ui||{},view=upper(ui.view||'OVERVIEW');
    label(upper(ui.league||'SLEEPER'),6,4,ink.orange,1,Math.round(w*.22));
    label('WEEK '+(league.week??'--')+' / '+view,Math.floor(w*.29),4,ink.blue,1,w*.59);
    box(4,13,w-8,1,ink.line);
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
        const demo=now()<demoUntil;
        if(demo)label('DEMO +6.4',w-85,15,ink.green,1,80);
        hero({...m,ownActual:demo?(Number(m.ownActual)||0)+6.4:m.ownActual,
          ownFinish:demo?(Number(m.ownFinish)||0)+6.4:m.ownFinish},w,h);
        fullScene(m,w,h);
      }
    }
    const mmW=chosen.cols*320,mmH=chosen.rows*160;
    const remote=window.FantasyRemote?.getStatus?.();
    const textStatus=document.getElementById('remoteStatus')?.textContent?.trim()||'Controller status unavailable';
    const dataState=m?.loading?'FEED LOADING':!league.ready?(m?.error||'FEED UNAVAILABLE'):m?.stale?'STALE FANTASY DATA':'FANTASY DATA READY';
    const conn=remote?(remote.paired?(remote.connected?'PAIRED':'RECONNECTING'):'NOT PAIRED'):'WAITING FOR PAIRING';
    const meta=chosen.label+' · '+mmW+' × '+mmH+' MM · P2.5 · '+dataState+' · '+conn;
    if(lastMeta!==meta){$('nativeReadout').textContent=meta;lastMeta=meta}
    const stage=$('nativeStatus'),message=textStatus+' · '+dataState;
    if(stage&&stage.textContent!==message)stage.textContent=message;
    canvas.setAttribute('aria-label','Pixel-native LED fantasy scoreboard, '+w+' by '+h+' physical pixels');
  }

  function pick(key) {
    chosen=sizes[key]||sizes.sixteen;
    const {cols,rows}=chosen;
    const i=$('nativeSize');if(i)i.value=key;
    const url=new URL(location.href);url.searchParams.set('modules',key);
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    const screen=$('nativeCanvas');
    screen.style.aspectRatio=(cols*128)+' / '+(rows*64);
    draw();
  }
  $('nativeSize')?.addEventListener('change',e=>pick(e.target.value));
  const kiosk=$('nativeKiosk'),exit=$('nativeExit');
  function setKiosk(enabled){
    document.body.classList.toggle('native-kiosk',Boolean(enabled));
    kiosk?.setAttribute('aria-pressed',String(Boolean(enabled)));
    if(kiosk)kiosk.textContent=enabled?'LED screen active':'LED screen only';
  }
  kiosk?.addEventListener('click',()=>setKiosk(!document.body.classList.contains('native-kiosk')));
  exit?.addEventListener('click',()=>setKiosk(false));
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
  $('nativeDemo')?.addEventListener('click',()=>{
    demoUntil=now()+2300;shakeUntil=now()+1050;draw();
  });
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
  pick(sizes[initial]?initial:'sixteen');
  window.FantasyLEDNative={draw,pick,getSize:()=>({...chosen}),sizes};
})();
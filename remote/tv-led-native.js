(() => {
  'use strict';
  const canvas = document.getElementById('nativeCanvas');
  if (!canvas || !window.FantasyCenter) return;
  const ctx = canvas.getContext('2d', {alpha:false});
  if (!ctx) return;
  const app = window.FantasyCenter;
  const sizes = {
    sixteen:    {cols:4,rows:4,label:'16 MODULES · 512 × 256'},
    twentyfour: {cols:6,rows:4,label:'24 MODULES · 768 × 256'},
    fortyeight: {cols:8,rows:6,label:'48 MODULES · 1024 × 384'}
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
  function drawMascot(x,y,w,h){
    const cx=Math.round(x+w/2), cy=Math.round(y+h/2);
    ctx.fillStyle='#112f45';ctx.beginPath();ctx.arc(cx,cy,Math.min(w,h)/2,0,Math.PI*2);ctx.fill();
    if(!mascot.complete || !mascot.naturalWidth){
      label('JS',x+w/2-11,y+h/2-4,ink.orange,2,30);return;
    }
    ctx.imageSmoothingEnabled=false;
    const j=now()<shakeUntil?Math.round(Math.sin(now()/37)*4):0;
    const crop=mascotCrop||{x:0,y:0,w:mascot.naturalWidth,h:mascot.naturalHeight};
    const scale=Math.min((w-4)/crop.w,(h-4)/crop.h);
    const tw=Math.max(1,Math.round(crop.w*scale)),th=Math.max(1,Math.round(crop.h*scale));
    ctx.drawImage(mascot,crop.x,crop.y,crop.w,crop.h,
      Math.round(x+(w-tw)/2+j),Math.round(y+(h-th)/2),tw,th);
  }
  mascot.src='../patriots-fantasy-touch/assets/justin-mascot-cutout.png';
  mascot.addEventListener('load',()=>{prepareMascot();draw()});
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
    const rowH=h>175?18:17,count=Math.max(1,Math.floor((h-19)/rowH));
    const offset=Math.floor(now()/8500)*count;
    if(!events.length){label(m?.started?'NO NEW SCORING':'AWAITING KICKOFF',x+5,y+22,ink.muted,1,w-10);return;}
    for(let i=0;i<Math.min(count,events.length);i++){
      const e=events[(offset+i)%events.length],ry=y+17+i*rowH,change=Number(e.delta);
      const color=change<0?ink.red:change>0?ink.green:ink.muted;
      label(e.name||'PLAYER',x+5,ry,ink.white,1,w-63);
      label((change>0?'+':'')+number(e.delta),x+w-56,ry,color,1,53);
      label(e.fantasyTeamName||'LEAGUE',x+5,ry+8,ink.muted,1,w-67);
      label('PTS '+number(e.total),x+w-66,ry+8,ink.gold,1,64);
    }
  }
  function drawRoster(m,x,y,w,h,key){
    const mine=key==='own',name=mine?'MY STARTERS':'OPP STARTERS',baseColor=mine?ink.orange:ink.blue;
    const team=(m?.league?.teams||[]).find(t=>t?.name===(mine?m.league.ownName:m.league.opponentName));
    const color=teamTint(team?.teamColor,baseColor);
    panel(x,y,w,h,name,color);
    const rows=starters(m,key);
    const capacity=Math.floor((h-20)/8);
    const lineH=Math.max(8,Math.min(12,Math.floor((h-21)/Math.max(1,rows.length))));
    if(!rows.length){label('WAITING FOR ROSTER',x+4,y+24,ink.muted,1,w-8);return;}
    if(rows.length>capacity)label('OVERFLOW '+(rows.length-capacity),x+w-87,y+4,ink.red,1,83);
    // Never silently rotate starters off the physical 4x4 scoreboard.
    for(let i=0;i<Math.min(rows.length,capacity);i++){
      const p=rows[i],yy=y+16+i*lineH;
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
  function detailPanel(m,x,y,w,h,scene){
    const p=m?.player||[...(m?.league?.own||[]),...(m?.league?.opponent||[])].find(t=>String(t.player_id)===String(m?.ui?.playerId));
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
  function fullScene(m,w,h,scene){
    const gap=6,bodyY=83,bodyBottom=h-29,bodyH=bodyBottom-bodyY;
    const leftW=Math.floor((w-gap*4)*.32),middleW=leftW;
    const rightX=gap*3+leftW+middleW,rightW=w-rightX-gap;
    drawRoster(m,gap,bodyY,leftW,bodyH,'own');
    drawRoster(m,gap*2+leftW,bodyY,middleW,bodyH,'opponent');
    const extraH=h>=350?94:59;
    scoreRows(m,rightX,bodyY,rightW,bodyH-extraH-gap);
    detailPanel(m,rightX,bodyY+bodyH-extraH,rightW,extraH,scene);
    scrollTicker(m,6,h-27,w-12,'FANTASY + PLAYERS',false);
    scrollTicker(m,6,h-14,w-12,'NFL',true);
  }
  function compactScene(m,w,h,scene){fullScene(m,w,h,scene);}

  function draw() {
    const w=chosen.cols*128,h=chosen.rows*64;
    if(canvas.width!==w)canvas.width=w;
    if(canvas.height!==h)canvas.height=h;
    ctx.imageSmoothingEnabled=false;
    box(0,0,w,h,ink.bg);
    stroke(0,0,w,h,ink.line);
    const m=getModel();trackScores(m);
    const league=m?.league||{},view=upper(m?.ui?.view||'OVERVIEW');
    const currentLeague=upper(m?.ui?.league||'SLEEPER');
    label(currentLeague,6,4,ink.orange,1,Math.round(w*.22));
    label('WEEK '+(league.week??'--')+' / '+view,Math.floor(w*.29),4,ink.blue,1,w*.59);
    box(4,13,w-8,1,ink.line);
    if(m?.loading || !league.ready)label('CONNECTING FEED - CHECK PAIRING',8,Math.floor(h/2),ink.gold,1,w-16);
    else{
      if(now()<demoUntil)label('DEMO +6.4',Math.max(6,w-87),15,ink.green,1,82);
      const demo=now()<demoUntil;
      hero({...m,ownActual:demo?(Number(m.ownActual)||0)+6.4:m.ownActual,
        ownFinish:demo?(Number(m.ownFinish)||0)+6.4:m.ownFinish},w,h);
      const scene=auto?Math.floor((now()-lastSceneAt)/10000)%3:manualScene;
      fullScene(m,w,h,scene);
    }
    const mmW=chosen.cols*320,mmH=chosen.rows*160;
    const remote=window.FantasyRemote?.getStatus?.();
    const textStatus=document.getElementById('remoteStatus')?.textContent?.trim()||'Controller status unavailable';
    const dataState=m?.loading?'FEED LOADING':!league.ready?(m?.error||'FEED UNAVAILABLE'):m?.stale?'STALE FANTASY DATA':'FANTASY DATA READY';
    const conn=remote?(remote.paired?(remote.connected?'PAIRED':'RECONNECTING'):'NOT PAIRED'):'WAITING FOR PAIRING';
    const meta=chosen.label+' · '+mmW+' × '+mmH+' MM · P2.5 · '+dataState+' · '+conn;
    if(lastMeta!==meta){$('nativeReadout').textContent=meta;lastMeta=meta}
    const stage=$('nativeStatus');
    const message=textStatus+' · '+dataState;
    if(stage && stage.textContent!==message)stage.textContent=message;
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
  window.setInterval(draw,120);
  const initial=new URL(location.href).searchParams.get('modules');
  pick(sizes[initial]?initial:'sixteen');
  window.FantasyLEDNative={draw,pick,getSize:()=>({...chosen}),sizes};
})();
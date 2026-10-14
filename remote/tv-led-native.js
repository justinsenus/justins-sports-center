(() => {
  'use strict';
  const canvas = document.getElementById('nativeCanvas');
  if (!canvas || !window.FantasyCenter) return;
  const ctx = canvas.getContext('2d', {alpha:false});
  if (!ctx) return;
  const glowCanvas=document.getElementById('nativeGlow');
  let ledRenderer=null;
  try { ledRenderer=window.createLEDBulbRenderer?.(glowCanvas); } catch(error) { console.warn('Using standard scoreboard display',error); }
  const glowCtx=ledRenderer?null:glowCanvas?.getContext('2d',{alpha:false});
  const app = window.FantasyCenter;
  const sizes = {
    twentyfour: {cols:6,rows:4,width:768,height:256,label:'6 ACROSS × 4 DOWN · P2.5 · 768 × 256'},
    tv: {cols:6,rows:4,width:768,height:432,label:'65-INCH TV · 16:9 · LIVE LED SCOREBOARD'}
  };
  const $ = id => document.getElementById(id);
  let chosen = sizes.twentyfour;
  let pairingRequested=false;
  let auto = true, manualScene = 0, lastSceneAt = Date.now();
  let shakeUntil = 0, lastMeta = '';
  let celebrationValue = 0, celebrationStarted = 0, celebrationScope = '', celebrationSide = 'own';
  let trackedScope = '';
  const celebrationDuration = 4800;
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
    '0':['01110','10001','10001','10001','10001','10001','01110'],
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
  const lowercase={
    a:'00000/00000/01110/00001/01111/10001/01111',b:'10000/10000/10110/11001/10001/10001/11110',
    c:'00000/00000/01110/10000/10000/10001/01110',d:'00001/00001/01101/10011/10001/10001/01111',
    e:'00000/00000/01110/10001/11111/10000/01110',f:'00110/01001/01000/11100/01000/01000/01000',
    g:'00000/01111/10001/10001/01111/00001/01110',h:'10000/10000/10110/11001/10001/10001/10001',
    i:'00100/00000/01100/00100/00100/00100/01110',j:'00010/00000/00110/00010/00010/10010/01100',
    k:'10000/10000/10010/10100/11000/10100/10010',l:'01100/00100/00100/00100/00100/00100/01110',
    m:'00000/00000/11010/10101/10101/10101/10101',n:'00000/00000/10110/11001/10001/10001/10001',
    o:'00000/00000/01110/10001/10001/10001/01110',p:'00000/11110/10001/10001/11110/10000/10000',
    q:'00000/01111/10001/10001/01111/00001/00001',r:'00000/00000/10110/11001/10000/10000/10000',
    s:'00000/00000/01111/10000/01110/00001/11110',t:'01000/01000/11100/01000/01000/01001/00110',
    u:'00000/00000/10001/10001/10001/10011/01101',v:'00000/00000/10001/10001/10001/01010/00100',
    w:'00000/00000/10001/10001/10101/10101/01010',x:'00000/00000/10001/01010/00100/01010/10001',
    y:'00000/10001/10001/10001/01111/00001/01110',z:'00000/00000/11111/00010/00100/01000/11111'
  };
  for(const [letter,rows] of Object.entries(lowercase))glyphs[letter]=rows.split('/');
  const ink={bg:'#010308',panel:'#01040a',line:'#1764ff',white:'#effcff',
    orange:'#ff861c',blue:'#65ccff',green:'#65ffb4',muted:'#aecce6',red:'#ff5d6e',gold:'#ffe27a'};
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
    const text=String(raw??'').replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ').trim();
    const length=Math.max(0,Math.floor(maxWidth/(s*6)));
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
  const ledPalette=['#FF881F','#32D9FF','#68FF96','#FF73EB','#FFE76B','#BEA1FF',
    '#FF849E','#75F1D3','#91BFFF','#FFBC71','#CCF889','#F4A5FF','#83ECFF','#FFAED6'];
  const isMineTeam=t=>Boolean(t?.isOwnFantasyTeam)||/^(THE BIG SENUS|GUMBYS? BIG D)$/.test(upper(t?.name).replace(/'/g,''));
  function brightenModel(raw){
    if(!raw?.league)return raw;
    const all=raw.league.teams||[],byId=new Map(),byName=new Map();
    const ordered=all.slice().sort((a,b)=>String(a.id??a.name).localeCompare(String(b.id??b.name),undefined,{numeric:true}));
    let index=1;
    const teams=ordered.map(t=>{
      const teamColor=isMineTeam(t)?ledPalette[0]:ledPalette[1+(index++-1)%(ledPalette.length-1)];
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
  // The main character is the actual reference photo, displayed independently
  // from the small hardware canvas so the television preserves its LED detail.
  const referenceLayer=document.createElement('div');
  referenceLayer.id='nativeReferenceFaces';referenceLayer.setAttribute('aria-label','Scoreboard player controls');
  $('nativeStage')?.appendChild(referenceLayer);
  const referenceFaces=new Map();
  const referenceFacesUsed=new Set();
  const hitTargets=new Map(),hitTargetsUsed=new Set();
  function hitTarget(key,x,y,w,h,name,patch){
    hitTargetsUsed.add(key);
    let button=hitTargets.get(key);
    if(!button){button=document.createElement('button');button.type='button';button.className='native-hit-target';referenceLayer.appendChild(button);hitTargets.set(key,button);}
    button.setAttribute('aria-label',name);button.onclick=()=>{app.dispatch(patch);draw()};
    button.style.display='block';button.style.left=x/chosen.width*100+'%';button.style.top=y/chosen.height*100+'%';
    button.style.width=w/chosen.width*100+'%';button.style.height=h/chosen.height*100+'%';
  }

  let pixelPortrait=null;
  function makePixelPortrait(){
    const art=window.JustinLEDCharacter;if(!art)return;
    const off=document.createElement('canvas');off.width=off.height=art.size;
    const g=off.getContext('2d');if(!g)return;
    art.still.forEach((row,y)=>[...row].forEach((v,x)=>{
      if(v==='0')return;g.fillStyle=art.palette[Number(v)];g.fillRect(x,y,1,1);
    }));pixelPortrait=off;
  }
  makePixelPortrait();
  const laughAsset=new Image();laughAsset.decoding='async';
  window.setTimeout(()=>{laughAsset.src='../patriots-fantasy-touch/assets/justin-led-reference-laugh.png'},2500);
  const referenceSilhouettes={"still":"41.02 0.98,40.82 2.15,39.06 3.32,37.70 4.49,37.30 5.66,28.71 6.84,25.20 8.01,25.20 9.18,21.29 10.35,19.34 11.52,19.34 12.70,17.19 13.87,15.82 15.04,15.23 16.21,13.28 17.38,11.13 18.55,9.38 19.73,9.38 20.90,8.79 22.07,7.23 23.24,6.64 24.41,5.08 25.59,4.88 26.76,3.12 27.93,3.12 29.10,3.12 30.27,3.12 31.45,3.12 32.62,3.12 33.79,3.12 34.96,3.12 36.13,3.12 37.30,3.32 38.48,3.32 39.65,3.12 40.82,3.32 41.99,3.12 43.16,3.12 44.34,3.12 45.51,3.12 46.68,3.12 47.85,3.12 49.02,3.12 50.20,3.12 51.37,3.12 52.54,2.93 53.71,0.78 54.88,0.59 56.05,0.78 57.23,0.59 58.40,0.59 59.57,0.59 60.74,0.59 61.91,0.59 63.09,0.39 64.26,0.59 65.43,0.39 66.60,0.98 67.77,2.15 68.95,3.91 70.12,3.91 71.29,4.69 72.46,4.69 73.63,4.49 74.80,6.45 75.98,6.64 77.15,8.59 78.32,8.98 79.49,16.41 80.66,17.38 81.84,17.38 83.01,19.34 84.18,19.53 85.35,21.29 86.52,23.24 87.70,23.24 88.87,25.20 90.04,25.78 91.21,28.52 92.38,32.62 93.55,32.81 94.73,36.52 95.90,42.77 97.07,42.77 98.24,42.77 98.63,57.62 98.63,57.81 98.24,57.81 97.07,65.43 95.90,69.14 94.73,69.34 93.55,73.05 92.38,73.24 91.21,75.20 90.04,75.20 88.87,76.95 87.70,78.52 86.52,78.91 85.35,80.47 84.18,80.66 83.01,82.42 81.84,82.23 80.66,82.03 79.49,83.79 78.32,84.96 77.15,85.35 75.98,86.72 74.80,86.91 73.63,86.72 72.46,86.91 71.29,86.72 70.12,86.72 68.95,86.72 67.77,86.72 66.60,85.16 65.43,84.96 64.26,83.59 63.09,83.40 61.91,83.59 60.74,81.84 59.57,83.01 58.40,83.40 57.23,88.28 56.05,88.48 54.88,92.19 53.71,92.19 52.54,95.90 51.37,97.07 50.20,97.66 49.02,99.22 47.85,99.41 46.68,99.22 45.51,99.22 44.34,99.22 43.16,98.83 41.99,97.46 40.82,95.70 39.65,95.51 38.48,92.19 37.30,90.04 36.13,87.11 34.96,79.69 33.79,78.52 32.62,78.32 31.45,78.52 30.27,78.32 29.10,78.32 27.93,78.52 26.76,78.32 25.59,76.56 24.41,76.56 23.24,76.56 22.07,76.56 20.90,76.56 19.73,76.17 18.55,74.61 17.38,72.85 16.21,72.85 15.04,71.09 13.87,69.14 12.70,69.14 11.52,67.19 10.35,67.19 9.18,63.48 8.01,63.28 6.84,54.10 5.66,54.10 4.49,53.71 3.32,51.95 2.15,49.22 0.98","laugh":"36 0,56 2,69 8,77 26,83 27,100 33,100 41,83 50,85 68,79 85,58 100,39 98,20 87,17 78,3 78,0 56,4 52,1 33,15 18,23 9,33 6"};
  function referenceSVG(tag,attributes={}){
    const element=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [name,value] of Object.entries(attributes))element.setAttribute(name,String(value));
    return element;
  }
  function referenceFace(key,x,y,size,frame='still',angle=0){
    referenceFacesUsed.add(key);
    let node=referenceFaces.get(key);
    if(!node){
      node=document.createElement('div');node.className='native-reference-face';node.setAttribute('aria-hidden','true');
      const clipId='native-character-clip-'+key;
      const art=referenceSVG('svg',{viewBox:'0 0 100 100',preserveAspectRatio:'none','aria-hidden':'true',focusable:'false'});
      const defs=referenceSVG('defs'),clip=referenceSVG('clipPath',{id:clipId,clipPathUnits:'userSpaceOnUse'});
      const outline=referenceSVG('polygon');clip.appendChild(outline);defs.appendChild(clip);art.appendChild(defs);
      const cutout=referenceSVG('g',{'clip-path':'url(#'+clipId+')'});
      cutout.appendChild(referenceSVG('rect',{x:0,y:0,width:100,height:100,fill:'#010308'}));
      const picture=referenceSVG('image',{preserveAspectRatio:'none'});cutout.appendChild(picture);art.appendChild(cutout);
      node._referenceArt={outline,picture};
      node.appendChild(art);referenceLayer.appendChild(node);referenceFaces.set(key,node);
    }
    const {outline,picture}=node._referenceArt;
    const file=frame==='laugh'?'justin-led-reference-laugh.png':'justin-led-reference-photo.jpg';
    if(node.dataset.frame!==frame){
      outline.setAttribute('points',referenceSilhouettes[frame]);
      const crop=frame==='laugh'?[-79.49,-22.06,255.62,146.71]:[-11.67,-7.86,121.33,116.63];
      ['x','y','width','height'].forEach((name,i)=>picture.setAttribute(name,crop[i]));
      const src='../patriots-fantasy-touch/assets/'+file;
      picture.setAttribute('href',src);picture.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href',src);
      node.dataset.frame=frame;
    }
    if(node.style.display!=='block')node.style.display='block';node.style.left=x/chosen.width*100+'%';node.style.top=y/chosen.height*100+'%';
    node.style.width=size/chosen.width*100+'%';node.style.height=size/chosen.height*100+'%';
    node.style.transform='rotate('+angle+'deg)'+(frame==='laugh'?' scale(1,'+(1+Math.max(0,Math.sin(now()/83))*.035)+')':'');
    canvas.dataset.characterReference=frame==='laugh'?'supplied-video':'supplied-photo';
  }
  function drawMascot(x,y,w,h){
    const size=Math.min(w,h),jiggle=now()<shakeUntil?Math.round(Math.sin(now()/39)*3):0;
    if(size>=44){referenceFace('main',x+(w-size)/2+jiggle,y+(h-size)/2,size,now()<shakeUntil?'laugh':'still');return;}
    if(pixelPortrait){ctx.imageSmoothingEnabled=false;ctx.drawImage(pixelPortrait,x+(w-size)/2,y+(h-size)/2,size,size);}
    else label('JS',x,y,ink.orange,1,20);
  }
  function getModel(){try{return brightenModel(app.model())}catch(_){return null}}

  function triggerCelebration(delta,m,side='own'){
    celebrationValue=delta;celebrationStarted=now();celebrationScope=scopeFor(m);celebrationSide=side;
    shakeUntil=now()+celebrationDuration;
  }
  function trackScores(m) {
    if(!m || m.loading || m.stale || !m.league?.ready)return;
    const teams=m.league.teams||[];
    const mine=teams.find(isMineTeam);
    const ownIsMine=isMineTeam({name:m.league.ownName})||Boolean(mine&&upper(mine.name)===upper(m.league.ownName));
    const oppIsMine=isMineTeam({name:m.league.opponentName})||Boolean(mine&&upper(mine.name)===upper(m.league.opponentName));
    const raw=ownIsMine?m.ownActual:oppIsMine?m.opponentActual:mine?.total;
    const n=Number(raw);
    if(raw==null||raw===''||!Number.isFinite(n))return;
    const teamName=ownIsMine?m.league.ownName:oppIsMine?m.league.opponentName:mine.name;
    const key=scopeFor(m)+'|'+upper(teamName);
    const prev=baseline.get(key);
    baseline.set(key,n);
    const sameScope=trackedScope===key;trackedScope=key;
    // Seed actual totals before kickoff, so the first scoring play celebrates.
    // Loading, league/week changes, opponents and projection changes never do.
    if(sameScope&&prev!==undefined&&n>prev+.001&&(m.started||m.leagueStarted))
      triggerCelebration(n-prev,m,oppIsMine?'opponent':'own');
  }
  function celebration(w) {
    if(now()>=shakeUntil)return;
    const time=now(),strength=clamp((shakeUntil-time)/celebrationDuration,0,1),hh=chosen.height===256?70:108;
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
      box(celebrationSide==='opponent'?cx+4:5,hh-3,cx-9,2,ink.green);
    }
  }

  function pixelLine(x0,y0,x1,y1,color,size=1){
    const steps=Math.max(Math.abs(x1-x0),Math.abs(y1-y0),1);
    for(let i=0;i<=steps;i++)box(x0+(x1-x0)*i/steps,y0+(y1-y0)*i/steps,size,size,color);
  }
  function burst(x,y,r,color,phase){
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6+phase;
      pixelLine(x+Math.cos(a)*r*.52,y+Math.sin(a)*r*.52,x+Math.cos(a)*r,y+Math.sin(a)*r,color);
      box(x+Math.cos(a)*(r+3),y+Math.sin(a)*(r+3),2,2,ink.white);
    }
    box(x-2,y,5,1,color);box(x,y-2,1,5,color);
  }
  function laughingPortrait(x,y,size,time){
    referenceFace('laugh',x,y+Math.sin(time/140)*2,size,'laugh',Math.sin(time/170)*2.6);
  }
  function flyingFootball(x,y,size,angle){
    ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.rotate(angle);
    const unit=size/24;
    const rows=[8,14,18,22,24,24,22,18,14,8];
    rows.forEach((width,i)=>box(-width*unit/2,(i-5)*unit,width*unit,unit,i===0||i===9?'#ffcb83':'#be622b'));
    box(-9*unit,-3*unit,unit,6*unit,ink.white);box(8*unit,-3*unit,unit,6*unit,ink.white);
    box(-4*unit,-unit,8*unit,unit,ink.white);
    for(let i=-3;i<=3;i+=2)box(i*unit,-2*unit,unit,3*unit,ink.white);
    ctx.restore();
  }
  function scoreCelebration(m,w,h){
    const time=now()-celebrationStarted;
    const active=celebrationStarted>0&&time>=0&&time<celebrationDuration&&scopeFor(m)===celebrationScope;
    canvas.dataset.celebration=active?'laughing':'idle';
    if(!active)return;
    const compact=h===256,x=compact?210:222,y=compact?74:112,cw=w-2*x,ch=compact?80:190,cx=w/2;
    const colors=['#ff9638','#ffe76b','#68f58c','#40d9ff','#b9a0ff','#fc76e8'];
    box(x,y,cw,ch,'#020713');
    ctx.save();ctx.beginPath();ctx.rect(x,y,cw,ch);ctx.clip();
    // A moving rainbow marquee and staggered star bursts echo the reference.
    for(let i=0;i<cw;i+=8){
      const c=colors[(Math.floor(i/24)+Math.floor(time/240))%colors.length];
      box(x+i,y,Math.min(8,cw-i),2,c);box(x+i,y+ch-2,Math.min(8,cw-i),2,c);
    }
    for(let i=2;i<ch-2;i+=8){
      const c=colors[(Math.floor(i/16)+Math.floor(time/240))%colors.length];
      box(x,y+i,2,Math.min(8,ch-i-2),c);box(x+cw-2,y+i,2,Math.min(8,ch-i-2),c);
    }
    const locations=compact?[[46,32],[cw-48,66],[cw-53,29],[56,69]]:
      [[51,49],[cw-51,140],[cw-53,46],[53,146],[97,91],[cw-92,93]];
    locations.forEach(([bx,by],i)=>{
      const life=((time+i*213)%1150)/1150;
      burst(x+bx,y+by,5+life*(compact?15:25),colors[i%colors.length],i*.24);
    });
    for(let i=0;i<26;i++){
      const px=x+6+((i*97+Math.floor(time/24))%(cw-12));
      const py=y+9+((i*43+Math.floor(time/35))%(ch-18));
      if(Math.floor(time/180+i)%3!==0)box(px,py,1,1,colors[i%colors.length]);
    }
    centered('FANTASY POINTS',cx,y+(compact?7:12),ink.gold,compact?1:2);
    const size=compact?44:112,headY=y+(compact?18:43);
    laughingPortrait(cx-size/2,headY,size,time);
    const flight=clamp((time-1250)/1500,0,1);
    if(time>1250&&time<2750){
      const fx=x-25+flight*(cw+50),fy=y+ch*.64-Math.sin(flight*Math.PI)*(compact?13:34);
      flyingFootball(fx,fy,compact?22:34,-.6+flight*3.7);
    }
    const delta='+'+number(celebrationValue);
    const caption=time<2900?delta:compact?delta+' POINTS':delta+' FANTASY POINTS';
    const font=compact?1:time<2900?3:2;
    centered(caption,cx,y+ch-(compact?12:25),ledPalette[0],font);
    ctx.restore();
  }

  const teamTint=(team,fallback)=>/^#[\da-f]{6}$/i.test(String(team||''))?team:fallback;
  function hero(m,w,h){
    const league=m?.league||{},compact=h===256,cx=w/2,hh=compact?70:108;
    const ownColor=sideInk(m,'own'),opponentColor=sideInk(m,'opponent');
    const a=animatedPoints(scopeFor(m)+'|hero-own',m?.ownActual);
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
      if(ownOwner)label('OWNER '+ownOwner,23,61,ink.muted,1,156);
      if(oppOwner)rightLabel('OWNER '+oppOwner,w-23,61,ink.muted,1,156);
    }
    // Fixed, mirrored score slots reserve room for three-digit totals.
    const scoreSize=compact?4:5,scoreY=compact?30:42;
    centered(number(a.value),cx-(compact?120:130),scoreY,a.changed?(a.delta>0?ink.green:ink.red):ink.white,scoreSize);
    centered(number(b.value),cx+(compact?120:130),scoreY,b.changed?(b.delta>0?ink.green:ink.red):ink.white,scoreSize);
    label('PROJ '+number(m?.ownFinish),23,hh-17,ownColor,1,204);
    rightLabel('PROJ '+number(m?.opponentFinish),w-23,hh-17,opponentColor,1,204);
    drawMascot(cx-(compact?36:48),compact?12:-2,compact?72:96,compact?48:96);
    centered('VS',cx,compact?59:98,ink.white,1);
    box(5,hh-3,cx-9,2,ownColor);box(cx+4,hh-3,cx-9,2,opponentColor);
    if(a.changed)centered((a.delta>0?'+':'')+number(a.delta),cx-120,hh-13,a.delta>0?ink.green:ink.red,1);
    celebration(w);
  }

  function scoreRows(m,x,y,w,h){
    panel(x,y,w,h,'LIVE LEAGUE SCORING',ink.green);
    const events=(m?.events||[]).filter(Boolean);
    const prominent=h>=38,rowH=prominent?24:18,count=Math.max(1,Math.floor((h-15)/rowH));
    const offset=Math.floor(now()/8000)*count;
    if(!events.length){
      label(m?.started?'WAITING FOR NEW SCORING PLAYS':'AWAITING KICKOFF',x+5,y+16,ink.muted,1,w-10);
      return;
    }
    for(let i=0;i<Math.min(count,events.length);i++){
      const e=events[(offset+i)%events.length],yy=y+16+i*rowH,change=Number(e.delta);
      const color=change<0?ink.red:change>0?ink.green:ink.muted;
      box(x+3,yy,3,Math.min(prominent?22:15,h-17),teamTint(e.teamColor,ink.blue));
      const owner=(e.fantasyTeamOwner?' / '+e.fantasyTeamOwner:'');
      label(prominent?(e.name||'PLAYER'):(e.name||'PLAYER')+' / '+(e.fantasyTeamName||'LEAGUE TEAM')+owner,x+10,yy,ink.white,prominent?2:1,w-(prominent?108:77));
      rightLabel((change>0?'+':'')+number(e.delta),x+w-6,yy,color,prominent?2:1,prominent?90:66);
      if(prominent){
        label((e.fantasyTeamName||'LEAGUE TEAM')+owner,x+10,yy+15,teamTint(e.teamColor,ink.blue),1,w-105);
        rightLabel('TOT '+number(e.total),x+w-6,yy+15,ink.muted,1,90);
      }
    }
  }

  function rosterGame(p){
    const full=String(app.markup?.gameLabel?.(p)||p.status||'').replace(/<[^>]*>/g,'');
    if(/BYE/i.test(full))return 'BYE WEEK';
    if(/PEND|UNKNOWN|NEXT GAME|NO GAME/i.test(full))return (p.team||'NFL')+' TIME TBD';
    return full.replace(/(\d(?::\d{2})?)\s*(AM|PM)/gi,(_,t,a)=>t.replace(':00','')+(a.toUpperCase()==='AM'?'a':'p')).replace(/\s+(vs|@)\s+/gi,' ').replace(/\s+/g,' ').trim();
  }
  function drawRoster(m,x,y,w,h,key){
    const mine=key==='own',color=sideInk(m,key),compact=h<150;
    const rows=(m?.league?.[key]||[]).filter(p=>p.starter!==false);
    panel(x,y,w,h,(mine?'MY':'OPPONENT')+' STARTERS',ink.blue);
    rightLabel(compact?'PTS':'ACTUAL',x+w-5,y+4,ink.blue,1,compact?24:40);
    const top=y+17,rowH=compact?8:Math.max(17,Math.min(21,Math.floor((h-18)/Math.max(1,rows.length)))),capacity=Math.max(1,Math.floor((h-18)/rowH));
    const page=Math.floor(now()/15000)%Math.max(1,Math.ceil(rows.length/capacity));
    const visible=rows.slice(page*capacity,(page+1)*capacity);
    if(!rows.length){label('WAITING FOR ROSTER',x+5,top,ink.muted,1,w-10);return;}
    for(let i=0;i<visible.length;i++){
      const p=visible[i],yy=top+i*rowH,keyId=scopeFor(m)+'|p|'+String(p.player_id??p.id??p.name);
      const points=animatedPoints(keyId,numeric(p)),pointColor=points.changed?(points.delta>0?ink.green:ink.red):ink.white;
      box(x+4,yy+1,2,compact?6:13,color);
      label(p.position||'FLX',x+9,yy,ink.blue,1,25);
      label(playerName(p),x+34,yy,ink.white,1,w-(compact?73:104));
      rightLabel(number(points.value),x+w-5,yy+(compact?0:1),pointColor,compact?1:2,compact?38:62);
      if(!compact){
        label(rosterGame(p),x+9,yy+9,p.status==='LIVE'?ink.green:ink.muted,1,w-116);
        rightLabel('P'+number(p.projected),x+w-68,yy+9,color,1,37);
        hitTarget('roster-'+key+'-'+i,x+3,yy-1,w-6,rowH,'View '+(p.full_name||p.name||'player')+' projections',{playerId:p.player_id??p.id,playerTab:'projections',view:'overview'});
      }
    }
  }

  function plot(data,x,y,w,h) {
    const series=data.series||[],raw=(data.raw||[]).filter(r=>r&&Array.isArray(r.values));
    const values=raw.length?raw:[{values:series.map(s=>s.value)}];
    const all=values.flatMap(r=>r.values).filter(v=>Number.isFinite(Number(v))).map(Number);
    const max=Math.max(25,...all,...series.map(s=>Number(s.value)||0)),min=Math.min(0,...all);
    const gx=x+21,gy=y+1,gw=w-24,gh=Math.max(3,h-12);
    const ticks=gh<10?1:gh<22?2:3;
    for(let k=0;k<ticks;k++){
      const v=ticks===1?min:min+(max-min)*k/(ticks-1),yy=gy+gh-1-(v-min)/(max-min)*(gh-1);
      box(gx,yy,gw,1,'#102442');rightLabel(number(v,0),gx-4,yy-3,ink.muted,1,20);
    }
    const px=i=>gx+(values.length===1?gw-1:i*(gw-1)/(values.length-1));
    const py=v=>gy+gh-1-(Number(v)-min)/(max-min)*(gh-1);
    for(let k=0;k<series.length;k++){
      const color=teamTint(series[k].color,k?ink.blue:ink.orange);
      // Historical provider samples only; first load has a single point.
      for(let i=1;i<values.length;i++){
        const xa=px(i-1),xb=px(i),ya=py(values[i-1].values[k]??series[k].value),yb=py(values[i].values[k]??series[k].value);
        pixelLine(xa,ya,xb,yb,color);
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
    const rowH=h>28&&h<60?9:11,count=Math.max(1,Math.floor((h-17)/rowH)),page=Math.floor(now()/12000)%Math.max(1,Math.ceil(list.length/count));
    list.slice(page*count,(page+1)*count).forEach((p,i)=>{
      const status=upper(p.injury_status),flag=status.includes('QUESTION')?'Q':status.includes('DOUBT')?'D':status;
      label(playerName(p),x+5,y+(h<28?13:17)+i*rowH,ink.white,1,w-42);
      rightLabel(flag,x+w-5,y+(h<28?13:17)+i*rowH,ink.gold,1,32);
    });
    if(!list.length)label('NO INJURY FLAGS',x+5,y+(h<28?13:17),ink.muted,1,w-10);
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
  let fantasyCycleScope='',fantasyCycleStart=0;
  function fantasyTotals(m,x,y,w,h){
    const scope=scopeFor(m);
    if(scope!==fantasyCycleScope){fantasyCycleScope=scope;fantasyCycleStart=now();}
    const teams=m.league?.teams||[],key=t=>String(t?.id??t?.teamId??upper(t?.name));
    const games=(m.matchups||[]).filter(g=>g.home?.name&&g.away?.name).slice()
      .sort((a,b)=>Number(Boolean(b.ownGame))-Number(Boolean(a.ownGame))||String(a.id??key(a.home)).localeCompare(String(b.id??key(b.home)),undefined,{numeric:true}));
    const covered=new Set(games.flatMap(g=>[key(g.home),key(g.away)]));
    const others=teams.filter(t=>!covered.has(key(t)));
    for(let i=0;i<others.length;i+=2)games.push({id:'teams-'+key(others[i]),home:others[i],away:others[i+1]});
    if(!games.length)games.push({home:{name:m.league?.ownName,avatar:m.league?.ownAvatar,ownerLabel:m.league?.ownOwner,teamColor:sideInk(m,'own')},away:{name:m.league?.opponentName,avatar:m.league?.opponentAvatar,ownerLabel:m.league?.opponentOwner,teamColor:sideInk(m,'opponent')}});
    const page=Math.floor((now()-fantasyCycleStart)/9000)%games.length,game=games[page];
    const actual=(t,score)=>!t?null:upper(t.name)===upper(m.league?.ownName)?m.ownActual:upper(t.name)===upper(m.league?.opponentName)?m.opponentActual:t.total??(m.leagueStarted?score:null);
    const model={...m,league:{...m.league,
      ownName:game.home?.name,opponentName:game.away?.name,
      ownAvatar:game.home?.avatar||game.home?.logo,opponentAvatar:game.away?.avatar||game.away?.logo,
      ownOwner:game.home?.ownerLabel,opponentOwner:game.away?.ownerLabel,
      ownColor:game.home?.teamColor||ink.orange,opponentColor:game.away?.teamColor||ink.blue}};
    const compact=h<25,labelW=74,gap=3;
    panel(x,y,w,h,'');
    label('FANTASY',x+5,y+(compact?3:5),ink.blue,1,63);
    label('W'+(m.league?.week||'--')+' '+(page+1)+'/'+games.length,x+5,y+(compact?12:18),ink.muted,1,63);
    box(x+labelW-3,y+2,1,h-4,ink.line);
    const slotW=Math.floor((w-labelW-gap*3)/2);
    for(let i=0;i<2;i++){
      const team=i?game.away:game.home,side=i?'opponent':'own',left=x+labelW+i*(slotW+gap),c=sideInk(model,side);
      if(!team){label('BYE',left+12,y+Math.floor(h/2)-3,ink.muted,1,slotW-20);continue;}
      const size=compact?14:22;
      const points=animatedPoints(scope+'|team-card|'+key(team),actual(team,i?game.awayScore:game.homeScore)),scoreScale=compact?1:2;
      const scoreRoom=compact?41:78;
      fantasyLogo(model,side,left+4,y+Math.floor((h-size)/2),size);
      label(team.name||'TEAM',left+size+10,y+(compact?7:5),ink.white,1,slotW-size-scoreRoom-18);
      if(!compact)label(team.ownerLabel||'WEEKLY MATCHUP',left+size+10,y+17,c,1,slotW-size-scoreRoom-18);
      rightLabel(number(points.value),left+slotW-5,y+(compact?7:8),points.changed?(points.delta>0?ink.green:ink.red):c,scoreScale,scoreRoom);
      box(left+2,y+h-2,slotW-4,1,c);
      if(i)box(left-2,y+3,1,h-6,ink.line);
    }
    canvas.dataset.fantasyPage=String(page+1);canvas.dataset.fantasyPages=String(games.length);
    canvas.dataset.fantasyTeams=[game.home?.name,game.away?.name].filter(Boolean).join(' / ');
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
    const compact=h===256,nflH=compact?31:32,fantasyH=compact?20:26;
    const nflY=h-nflH-3,fantasyY=nflY-fantasyH-3;
    fantasyTotals(m,4,fantasyY,w-8,fantasyH);nflCards(m,4,nflY,w-8,nflH);
  }
  // Equal starter columns flank both charts; score cards keep stable positions.
  function fullScene(m,w,h){
    const compact=h===256,gap=4,top=compact?74:112,bottom=compact?172:306;
    const rosterW=compact?200:214,rightX=w-gap-rosterW,cx=gap*2+rosterW,cw=rightX-cx-gap;
    const bodyH=bottom-top,upperH=compact?42:Math.floor((bodyH-gap)*.54);
    drawRoster(m,gap,top,rosterW,bodyH,'own');
    drawRoster(m,rightX,top,rosterW,bodyH,'opponent');
    trend(m,cx,top,cw,upperH);
    stock(m,cx,top+upperH+gap,cw,compact?34:bodyH-upperH-gap);
    if(compact){
      scoreRows(m,cx,158,cw,40);
      injuryPanel({...m,league:{...m.league,opponent:[]}},gap,176,rosterW,22);
      injuryPanel({...m,league:{...m.league,own:[]}},rightX,176,rosterW,22);
    }else{
      injuryPanel(m,gap,310,rosterW,54);
      scoreRows(m,cx,310,w-cx-gap,54);
    }
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
  function compactPlayerScene(m,p,w,h) {
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
  function wrapped(raw,x,y,width,color=ink.muted,scale=1,lineHeight=11,maxLines=3){
    const limit=Math.max(1,Math.floor(width/(6*scale))),words=String(raw||'').split(/\s+/),lines=[];let row='';
    for(const word of words){if(row&&row.length+word.length+1>limit){lines.push(row);row=word;}else row+=(row?' ':'')+word;}
    if(row)lines.push(row);
    lines.slice(0,maxLines).forEach((line,i)=>label(line,x,y+i*lineHeight,color,scale,width));
  }
  function playerScene(m,p,w,h){
    if(h<380){compactPlayerScene(m,p,w,h);return;}
    const tab=['stats','news','projections'].includes(m.ui?.playerTab)?m.ui.playerTab:'projections';
    const team=(m.league?.teams||[]).find(t=>(t.players||[]).some(q=>String(q.player_id)===String(p.player_id)));
    const color=p.fantasyTeamColor||team?.teamColor||sideInk(m,p.side==='opponent'?'opponent':'own');
    const details=window.FantasyPlayerDetails;
    let report={},average={sources:[]},intel=null;
    try{report=details?.injurySummary(p)||{};average=details?.average(p,m.league?.week)||average;intel=details?.playerData(p);}catch(_){}
    const status=String(report.status||p.injury_status||p.injuryStatus||'').replace(/_/g,' ');
    const flag=status.toUpperCase(),hurt=/OUT|IR|INJURY|DOUBT|QUESTION|PUP|^Q$|^D$/.test(flag);
    const statusText=!status?'NO INJURY DESIGNATION':flag==='Q'?'QUESTIONABLE':flag==='D'?'DOUBTFUL':flag==='IR'?'INJURED RESERVE':status;
    panel(4,16,w-8,110,'',color);box(5,17,w-10,2,color);
    if(!drawPhoto(p.headshot||p.photo||p.image||p.avatar||'',14,28,80,84)){
      centered(p.position||'NFL',54,48,color,3);centered(p.team||'PLAYER',54,78,ink.white,1);
    }
    label(p.full_name||p.name||'SELECTED PLAYER',106,29,ink.white,3,w-278);
    label((p.position||'FLEX')+' / '+(p.team||'NFL')+' / '+(team?.name||p.fantasyTeamName||m.league?.ownName||''),106,57,color,1,w-280);
    label(String(app.markup?.gameLabel?.(p)||p.status||'GAME TIME PENDING').replace(/<[^>]*>/g,''),106,76,ink.white,1,w-274);
    label(hurt?statusText:(p.status||'SCHEDULED'),106,99,hurt?ink.gold:ink.green,1,w-274);
    rightLabel('ACTUAL POINTS',w-16,31,ink.muted,1,108);
    rightLabel(number(numeric(p)),w-16,52,ink.white,4,122);
    rightLabel('WEEK '+(m.league?.week||'--'),w-16,91,ink.muted,1,108);
    panel(4,132,94,22,'',ink.blue);centered('BACK',51,139,ink.blue,1);
    hitTarget('player-back',4,132,94,22,'Back to scoreboard',{playerId:null,view:'overview'});
    const tabs=[['projections','PROJECTIONS'],['news','INJURIES'],['stats','LIVE STATS']];
    tabs.forEach(([id,name],i)=>{
      const x=104+i*220;panel(x,132,214,22,'',id===tab?color:ink.line);
      if(id===tab)box(x+1,133,212,20,'#0b1b2e');
      centered(name,x+107,136,id===tab?ink.white:ink.muted,2);
      hitTarget('player-tab-'+id,x,132,214,22,'Show player '+(id==='news'?'injuries':id),{playerId:p.player_id,playerTab:id});
    });
    const nativeProjection=p.consensus?.cloud?(p.providerProjected??p.projected):p.projected;
    panel(4,162,238,82,'LEAGUE PROJECTION',color);
    centered(number(nativeProjection),123,183,color,5);
    centered(upper(m.ui?.league||'LEAGUE')+' / WEEK '+(m.league?.week||'--'),123,229,ink.muted,1);
    panel(4,250,238,66,'SOURCE AVERAGE / PPR',ink.blue);
    centered(number(average.value),123,270,ink.white,3);
    centered(average.sourceCount?average.sourceCount+' VERIFIED '+(average.sourceCount===1?'SOURCE':'SOURCES'):'AVERAGE NOT REPORTED',123,301,ink.muted,1);
    panel(4,322,238,68,'AVAILABILITY',hurt?ink.gold:ink.green);
    wrapped(statusText,14,339,216,hurt?ink.gold:ink.green,2,17,2);
    if(!hurt)label('CHECK THE INJURIES TAB FOR REPORTS',14,375,ink.muted,1,216);
    const x=250,width=w-254;
    if(tab==='news'){
      panel(x,162,width,228,'INJURY REPORT / PRACTICE',ink.gold);
      label('CURRENT DESIGNATION',x+10,181,ink.muted,1,width-20);
      label(statusText,x+10,195,hurt?ink.gold:ink.green,2,width-20);
      label('LATEST PRACTICE',x+10,228,ink.muted,1,width-20);
      wrapped(report.practice||p.practice_participation||'NOT REPORTED',x+10,241,width-20,ink.white,2,17,2);
      label('REPORTED INJURY',x+10,283,ink.muted,1,width-20);
      label(report.injury||'NO ISSUE REPORTED IN AVAILABLE FEEDS',x+10,297,ink.white,1,width-20);
      label((report.source||'League roster')+(report.week?' / W'+report.week:'')+(report.date?' / '+report.date:''),x+10,322,ink.blue,1,width-20);
      const stories=intel?.news||intel?.headlines||[];
      const injuryStory=stories.find(s=>/injur|practice|questionable|doubtful|ruled out|inactive|concussion|hamstring|ankle|knee|shoulder|illness/i.test(s.title||s.headline||''));
      const headline=injuryStory?.title||injuryStory?.headline;
      const chance=(intel?.reports||[]).find(q=>q.play_probability!=null&&Number.isFinite(Number(q.play_probability)));
      const probability=chance?clamp(Number(chance.play_probability),0,100):null;
      label(probability==null?'CHANCE TO PLAY / NOT PUBLISHED':'CHANCE TO PLAY / '+Math.round(probability)+'%',x+10,345,probability==null?ink.muted:ink.green,1,width-20);
      if(headline)wrapped(headline,x+10,366,width-20,ink.muted,1,10,2);
    }else{
      const preferred=['PASSING YARDS','PASSING TOUCHDOWNS','RUSHING YARDS','RECEIVING YARDS','RECEPTIONS','RECEIVING TOUCHDOWNS','RUSHING TOUCHDOWNS','TARGETS'];
      const rows=statEntries(p,tab).slice().sort((a,b)=>{
        const rank=s=>{const i=preferred.findIndex(t=>upper(s.label).includes(t));return i<0?99:i;};return rank(a)-rank(b);
      }).slice(0,6);
      panel(x,162,width,228,tab==='projections'?(rows.length?'PROJECTED GAME STATS':'POINT PROJECTIONS'):'ACTUAL GAME STATS',ink.blue);
      if(!rows.length){
        if(tab==='projections'){
          const top=Math.max(10,Number(nativeProjection)||0,Number(average.value)||0),barWidth=width-36;
          [[upper(m.ui?.league||'LEAGUE')+' LEAGUE POINTS',nativeProjection,color],['SOURCE AVERAGE / PPR',average.value,ink.blue]].forEach(([name,value,tint],i)=>{
            const yy=183+i*60;
            label(name,x+18,yy,ink.muted,1,barWidth-100);
            rightLabel(number(value),x+width-18,yy+7,tint,3,108);
            box(x+18,yy+38,barWidth,6,'#102442');
            if(value!=null&&Number.isFinite(Number(value)))box(x+18,yy+38,Math.round(barWidth*clamp(Number(value)/top,0,1)),6,tint);
          });
          const sources=(average.sources||[]).slice(0,3);
          label('PROJECTION CONTRIBUTORS',x+18,308,ink.muted,1,barWidth);
          if(sources.length)sources.forEach((s,i)=>{
            label(s.source||'SOURCE',x+18,322+i*10,ink.blue,1,barWidth-52);
            rightLabel(number(s.value),x+width-18,322+i*10,ink.white,1,48);
          });
          else label(average.sourceCount?average.sourceCount+' VERIFIED SOURCES':'NO SAME-WEEK SOURCE REPORTS',x+18,324,ink.muted,1,barWidth);
        }else{
          wrapped('NO GAME STATS YET',x+18,217,width-36,ink.white,2,20,2);
          wrapped('Live statistics appear when the provider reports game activity.',x+18,269,width-36,ink.muted,1,13,3);
        }
      }
      rows.forEach((stat,i)=>{
        const cw=Math.floor((width-28)/2),sx=x+9+(i%2)*(cw+10),sy=183+Math.floor(i/2)*55;
        box(sx,sy,2,45,color);
        label(String(stat.label||'STAT').replace(/^PROJ /i,''),sx+8,sy+2,ink.muted,1,cw-12);
        label(number(stat.value,Number.isInteger(Number(stat.value))?0:1),sx+8,sy+17,ink.white,3,cw-12);
      });
      if(tab==='projections'){
        label('POINTS FOLLOW YOUR LEAGUE SCORING',x+12,357,color,1,width-24);
        if(average.min!=null&&average.max!=null)label('SOURCE RANGE '+number(average.min)+' - '+number(average.max),x+12,373,ink.muted,1,width-24);
      }
    }
    scrollTicker(m,6,h-27,w-12,'FANTASY + PLAYERS',false);
    scrollTicker(m,6,h-14,w-12,'NFL',true);
    canvas.dataset.playerView=tab;canvas.dataset.playerName=p.full_name||p.name||'';
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
    if(!pairingRequested)$('pairPanel')?.classList.add('hidden');
    referenceFacesUsed.clear();hitTargetsUsed.clear();
    const w=chosen.width,h=chosen.height;
    if(canvas.width!==w)canvas.width=w;
    if(canvas.height!==h)canvas.height=h;
    ctx.imageSmoothingEnabled=false;
    box(0,0,w,h,ink.bg);stroke(0,0,w,h,ink.line);
    const m=getModel();trackScores(m);
    const league=m?.league||{},ui=m?.ui||{},view=upper(ui.view||'OVERVIEW');
    // Tiny ID label, so nearly the entire native LED budget shows game data.
    label(upper(ui.league||'SLEEPER')+' WEEK '+(league.week??'--'),
      8,5,ink.blue,1,220);
    if(chosen===sizes.twentyfour)rightLabel('6X4 P2.5 / 768X256',w-8,5,ink.muted,1,220);
    if(view!=='OVERVIEW')centered(view,w/2,5,ink.muted,1);
    if(m?.loading || !league.ready){
      label(m?.loading?'CONNECTING FANTASY FEEDS':'FEED UNAVAILABLE - REFRESH TO RETRY',12,Math.floor(h/2),ink.gold,1,w-24);
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
        hero(m,w,h);
        fullScene(m,w,h);
      }
    }
    if(!m?.loading&&league.ready)scoreCelebration(m,w,h);
    else canvas.dataset.celebration='idle';
    for(const [key,face] of referenceFaces)if(!referenceFacesUsed.has(key))face.style.display='none';
    for(const [key,button] of hitTargets)if(!hitTargetsUsed.has(key))button.style.display='none';
    if(ledRenderer){
      try { ledRenderer.render(canvas); }
      catch(error){
        ledRenderer=null;
        document.body.classList.remove('led-bulbs-ready');
        document.body.classList.add('led-bulbs-failed');
        console.warn('LED effect disabled; keeping live scoreboard visible',error);
      }
    }
    else if(glowCtx){
      if(glowCanvas.width!==w)glowCanvas.width=w;
      if(glowCanvas.height!==h)glowCanvas.height=h;
      glowCtx.drawImage(canvas,0,0);
    }
    const mmW=chosen.cols*320,mmH=chosen.rows*160;
    const remote=window.FantasyRemote?.getStatus?.();
    const textStatus=document.getElementById('remoteStatus')?.textContent?.trim()||'Controller status unavailable';
    const dataState=m?.loading?'FEED LOADING':!league.ready?(m?.error||'FEED UNAVAILABLE'):m?.stale?'STALE FANTASY DATA':'FANTASY DATA READY';
    const conn=remote?(remote.paired?(remote.connected?'PAIRED':'RECONNECTING'):'NOT PAIRED'):'WAITING FOR PAIRING';
    const meta=chosen.label+(chosen===sizes.twentyfour?' · '+mmW+' × '+mmH+' MM':'')+' · '+dataState+' · '+conn;
    if(lastMeta!==meta){$('nativeReadout').textContent=meta;lastMeta=meta}
    const stage=$('nativeStatus'),message=textStatus+' · '+dataState;
    if(stage&&stage.textContent!==message)stage.textContent=message;
    canvas.setAttribute('aria-label',(chosen===sizes.twentyfour?'Live 6 by 4 P2.5 LED scoreboard':'Live TV LED scoreboard')+', '+w+' by '+h+' pixels. '+(league.ownName||'My team')+' '+number(m?.ownActual)+' vs '+(league.opponentName||'opponent')+' '+number(m?.opponentActual));
    for(const key of ['sleeper','espn'])$('nativeLeague'+(key==='sleeper'?'Sleeper':'Espn'))?.setAttribute('aria-pressed',String(ui.league===key));
  }

  function pick(key) {
    chosen=document.body.dataset.tvLedCanvas==='1'?sizes.tv:sizes.twentyfour;
    const {cols,rows}=chosen;
    const i=$('nativeSize');if(i)i.value=key;
    const url=new URL(location.href);if(chosen===sizes.tv)url.searchParams.delete('modules');else url.searchParams.set('modules','twentyfour');url.searchParams.set('display',chosen===sizes.tv?'tv':'build');
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
    const padding=document.body.classList.contains('native-kiosk')?0:8;
    const roomW=stage.clientWidth-padding,roomH=stage.clientHeight-padding;
    let scale=Math.min(roomW/chosen.width,roomH/chosen.height);
    // Preserve the canvas proportions, including the wider physical 6x4 build.
    scale=Math.max(.1,scale);
    const width=Math.floor(chosen.width*scale),height=Math.floor(chosen.height*scale);
    for(const layer of [canvas,glowCanvas,referenceLayer].filter(Boolean)){
      layer.style.width=width+'px';layer.style.height=height+'px';
    }
    canvas.style.setProperty('--led-pitch-x',width/chosen.width+'px');
    canvas.style.setProperty('--led-pitch-y',height/chosen.height+'px');
  }
  let pointerTimer=0;
  window.addEventListener('pointermove',()=>{
    document.body.classList.add('native-input-active');
    window.clearTimeout(pointerTimer);
    pointerTimer=window.setTimeout(()=>document.body.classList.remove('native-input-active'),2200);
  });
  window.addEventListener('resize',fitCanvas);
  document.addEventListener('fullscreenchange',fitCanvas);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(fitCanvas).observe($('nativeStage'));
  $('nativeTV')?.addEventListener('click',()=>pick('tv'));
  $('nativeBuild')?.addEventListener('click',()=>pick('twentyfour'));
  for(const key of ['sleeper','espn'])$('nativeLeague'+(key==='sleeper'?'Sleeper':'Espn'))?.addEventListener('click',()=>{app.dispatch({league:key,matchupId:null,playerId:null,gameId:null,view:'overview'});draw()});
  $('nativeRefresh')?.addEventListener('click',()=>{app.dispatch({refresh:true});draw()});
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
    if(e.key==='Escape'){
      if(app.getUI?.().playerId)app.dispatch({playerId:null,view:'overview'});
      else if(document.body.classList.contains('native-kiosk'))setKiosk(false);
    }
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
  $('nativePair')?.addEventListener('click',()=>{pairingRequested=true;document.getElementById('remoteToggle')?.click()});
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
  function tick(){
    draw();
    const t=now();
    const animating=t<shakeUntil || celebrationStarted>0 && t-celebrationStarted<celebrationDuration ||
      [...transitions.values()].some(entry=>entry.start>0&&t-entry.start<1050);
    window.setTimeout(tick,animating?120:1000);
  }
  window.setTimeout(tick,1000);
  const initial=new URL(location.href).searchParams.get('modules');
  const display=new URL(location.href).searchParams.get('display');
  pick(document.body.dataset.tvLedCanvas==='1'?'tv':'twentyfour');
  if(document.body.dataset.tvLedCanvas==='1')setKiosk(true);
  window.FantasyLEDNative={draw,pick,getSize:()=>({...chosen}),sizes};
})();

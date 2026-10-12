(() => {
  'use strict';
  if (document.body.dataset.screen !== 'tv' || document.body.dataset.tvStyle !== 'led') return;

  const app = window.FantasyCenter;
  if (!app) return;
  let modules = 4;
  let previousFocus = null;
  const overlay = document.createElement('section');
  overlay.id = 'p25Overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'P2.5 physical LED panel preview');
  overlay.innerHTML = `<div class="p25-card">
    <div class="p25-head"><h2>P2.5 Physical LED Preview</h2><button class="p25-close" type="button" aria-label="Close P2.5 preview">✕</button></div>
    <div class="p25-tabs" aria-label="LED module configuration">
      <button type="button" data-p25-modules="1" aria-pressed="false">1 module · 128 × 64</button>
      <button type="button" data-p25-modules="4" aria-pressed="true">4 modules · 256 × 128</button>
    </div>
    <div class="p25-frame"><canvas id="p25Canvas" width="256" height="128" role="img" aria-label="Simulated low-resolution fantasy scoreboard with current league scores"></canvas></div>
    <p class="p25-meta" id="p25Meta">4 modules · 640 × 320 mm · 256 × 128 real pixels · P2.5 pitch</p>
    <p class="p25-note">Rendered at the physical pixel count, then enlarged with nearest-neighbor scaling. Brightness, LED diodes and viewing distance vary by panel. A real P2.5 board cannot fit the entire HD TV layout at once; the preview prioritizes scores and rotates players.</p>
  </div>`;
  document.body.appendChild(overlay);
  const canvas = overlay.querySelector('#p25Canvas');
  const meta = overlay.querySelector('#p25Meta');
  const context = canvas.getContext('2d', {alpha:false});
  const one = overlay.querySelector('[data-p25-modules="1"]');
  const four = overlay.querySelector('[data-p25-modules="4"]');
  const url = new URL(window.location.href);

  const number = x => {
    const n = Number(x);
    return x == null || x === '' || !Number.isFinite(n) ? '—' : n.toFixed(1);
  };
  const label = x => String(x ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  const drawFit = (text,x,y,maxWidth,size,color,minSize=6) => {
    context.fillStyle=color;
    context.textAlign='left';
    let current=size;
    do {
      context.font='bold '+current+'px monospace';
      if (context.measureText(text).width <= maxWidth || current <= minSize) break;
      current--;
    } while(current > 0);
    while(text.length && context.measureText(text).width > maxWidth) text=text.slice(0,-1);
    context.fillText(text,x,y);
  };
  const base = (w,h) => {
    if(canvas.width!==w) canvas.width=w;
    if(canvas.height!==h) canvas.height=h;
    context.imageSmoothingEnabled=false;
    context.fillStyle='#01050c';
    context.fillRect(0,0,w,h);
    context.strokeStyle='#174076';
    context.lineWidth=1;
    context.strokeRect(.5,.5,w-1,h-1);
  };
  const line = (x,y,w) => { context.fillStyle='#173459'; context.fillRect(x,y,w,1); };
  const score = (value,x,y,font=16,color='#e0f6ff') => {
    context.fillStyle=color;
    context.font='bold '+font+'px monospace';
    context.textAlign='right';
    context.fillText(number(value),x,y);
    context.textAlign='left';
  };
  const current = () => {
    try { return app.model?.(); }
    catch (_) { return null; }
  };
  const playersFor = (league,key) => (league?.[key] || []).filter(p => p.starter !== false);
  const point = p => { try { return app.data?.actual?.(p) ?? p.actual ?? null; } catch (_) { return p.actual ?? null; } };

  function paintOne(model) {
    base(128,64);
    const league=model?.league || {};
    const live=model?.started;
    drawFit('WEEK '+(league.week ?? '—')+'  '+(live?'LIVE':'PROJ'),4,9,120,8,'#65dcf5');
    line(4,13,120);
    drawFit(label(league.ownName || 'MY TEAM'),4,26,76,9,'#ffaa65');
    score(live?model?.ownActual:model?.ownFinish,123,29,17,'#fff2d5');
    drawFit(label(league.opponentName || 'OPPONENT'),4,46,76,9,'#8edcff');
    score(live?model?.opponentActual:model?.opponentFinish,123,49,17,'#e5faff');
    line(4,52,120);
    drawFit('P2.5  128x64  1 PANEL',4,61,120,7,'#6bb5db');
  }
  function rosterLine(p,x,y,width,color) {
    const name=label(p.full_name || p.name || p.position || 'PLAYER');
    drawFit(name,x,y,width-32,8,color,6);
    score(point(p),x+width-3,y,8,'#e9f4ff');
  }
  function paintFour(model) {
    base(256,128);
    const league=model?.league || {};
    const live=model?.started;
    drawFit('WEEK '+(league.week ?? '—')+' · '+(live?'LIVE SCORING':'PROJECTIONS'),7,13,237,12,'#77d7fa');
    line(6,18,244);
    drawFit(label(league.ownName || 'MY TEAM'),7,39,162,14,'#ffb177');
    score(live?model?.ownActual:model?.ownFinish,247,42,22,'#fff5db');
    drawFit(label(league.opponentName || 'OPPONENT'),7,65,162,14,'#9fddff');
    score(live?model?.opponentActual:model?.opponentFinish,247,68,22,'#e6faff');
    line(6,74,244);
    drawFit('MY STARTERS',7,84,111,8,'#ffb177');
    drawFit('OPP STARTERS',134,84,111,8,'#9fddff');
    const left=playersFor(league,'own'), right=playersFor(league,'opponent');
    const index=Math.floor(Date.now()/7000);
    for(let i=0;i<3;i++){
      if(left.length) rosterLine(left[(index*3+i)%left.length],7,98+i*10,112,'#f0c9a8');
      if(right.length) rosterLine(right[(index*3+i)%right.length],134,98+i*10,112,'#bfdbef');
    }
  }
  function draw() {
    if(overlay.hidden || !context) return;
    const model=current();
    if(modules===1) paintOne(model);
    else paintFour(model);
  }
  function choose(value) {
    modules=value;
    one.setAttribute('aria-pressed',String(value===1));
    four.setAttribute('aria-pressed',String(value===4));
    meta.textContent=value===1
      ? '1 module · 320 × 160 mm (12.6 × 6.3 in) · 128 × 64 real pixels · P2.5 pitch'
      : '4 modules (2 × 2) · 640 × 320 mm (25.2 × 12.6 in) · 256 × 128 real pixels · P2.5 pitch';
    draw();
  }
  function open() {
    previousFocus=document.activeElement;
    overlay.hidden=false;
    draw();
    overlay.querySelector('.p25-close').focus();
    url.searchParams.set('p25','1');
    history.replaceState(null,'',url.pathname+url.search+url.hash);
  }
  function close() {
    overlay.hidden=true;
    url.searchParams.delete('p25');
    history.replaceState(null,'',url.pathname+url.search+url.hash);
    previousFocus?.focus?.();
  }

  document.getElementById('ledPreview')?.addEventListener('click',open);
  overlay.querySelector('.p25-close').addEventListener('click',close);
  one.addEventListener('click',()=>choose(1));
  four.addEventListener('click',()=>choose(4));
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && !overlay.hidden)close();});
  window.setInterval(draw,2000);
  if(url.searchParams.get('p25')==='1') open();
  window.FantasyP25={draw,choose,open,close};
})();
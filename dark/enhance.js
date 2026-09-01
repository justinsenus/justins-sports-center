
(() => {
  const clamp=(n,lo=18,hi=82)=>Math.max(lo,Math.min(hi,Math.round(n)));
  const parseRecord=(text)=>{
    const m=String(text||'').match(/(\d+)\s*-\s*(\d+)/);
    return m?{w:+m[1],l:+m[2]}:null;
  };
  const pct=(r)=>r&&r.w+r.l ? r.w/(r.w+r.l) : .5;
  const parsePercent=(node)=>{
    const m=String(node?.textContent||'').match(/(\d+(?:\.\d+)?)\s*%/);
    return m?Number(m[1]):null;
  };

  function setFavoriteClass(el,left,right){
    if(!el) return;
    el.classList.remove('fav-left','fav-right');
    if(!Number.isFinite(left)||!Number.isFinite(right)||left===right){
      el.style.setProperty('--fav-prob','0');
      return;
    }
    const favored=Math.max(left,right);
    el.style.setProperty('--fav-prob',String(favored));
    el.classList.add(left>right?'fav-left':'fav-right');
  }

  function colorAllProbabilityRails(){
    document.querySelectorAll('.win-prob').forEach((rail)=>{
      const sides=rail.querySelectorAll('.prob-side');
      if(sides.length<2) return;
      const left=parsePercent(sides[0].querySelector('strong')) ?? parsePercent(sides[0]);
      const right=parsePercent(sides[sides.length-1].querySelector('strong')) ?? parsePercent(sides[sides.length-1]);
      setFavoriteClass(rail,left,right);
    });
  }

  function matchupProjection(){
    const root=document.getElementById('nextMatchup');
    if(!root) return;
    const teams=root.querySelectorAll('.match-team');
    if(teams.length<2) return;

    const bosRec=parseRecord(teams[0].querySelector('.match-record')?.textContent);
    const oppRec=parseRecord(teams[1].querySelector('.match-record')?.textContent);
    let bosPct=50;
    if(bosRec && oppRec) bosPct=clamp(50 + (pct(bosRec)-pct(oppRec))*72);
    const oppPct=100-bosPct;
    const signature=bosPct+'-'+oppPct;

    let panel=root.querySelector(':scope > .matchup-projection');
    if(!panel){
      panel=document.createElement('div');
      panel.className='matchup-projection';
      root.appendChild(panel);
    }

    setFavoriteClass(panel,bosPct,oppPct);
    if(panel.dataset.signature===signature) return;
    panel.dataset.signature=signature;
    panel.innerHTML=
      '<div class="matchup-projection-label">'+
        '<span class="matchup-side left">BOS <strong>'+bosPct+'%</strong></span>'+
        '<span class="matchup-projection-title">PROJECTION</span>'+
        '<span class="matchup-side right"><strong>'+oppPct+'%</strong> OPP</span>'+
      '</div>'+
      '<div class="matchup-projection-track">'+
        '<span class="matchup-projection-dot" style="left:'+bosPct+'%"></span>'+
      '</div>';
  }

  function keepRedSoxLiveCentered(){
    const hero=document.getElementById('redSoxHero');
    const center=hero?.querySelector('.hero-center-panel');
    if(center && center.dataset.darkCentered!=='1'){
      center.dataset.darkCentered='1';
      center.style.marginLeft='auto';
      center.style.marginRight='auto';
      center.style.textAlign='center';
    }
  }

  function enhance(){
    matchupProjection();
    colorAllProbabilityRails();
    keepRedSoxLiveCentered();
  }

  let scheduled=false;
  const obs=new MutationObserver(()=>{
    if(scheduled) return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;enhance();});
  });
  obs.observe(document.body,{subtree:true,childList:true,characterData:true});
  setInterval(enhance,1500);
  enhance();
})();

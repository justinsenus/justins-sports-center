
(() => {
  const clamp=(n,lo=18,hi=82)=>Math.max(lo,Math.min(hi,Math.round(n)));
  const parseRecord=(text)=>{
    const m=String(text||'').match(/(\d+)\s*-\s*(\d+)/);
    return m?{w:+m[1],l:+m[2]}:null;
  };
  const pct=(r)=>r&&r.w+r.l? r.w/(r.w+r.l):.5;

  function matchupProjection(){
    const root=document.getElementById('nextMatchup');
    if(!root) return;
    const center=root.querySelector('.match-center-stack');
    const teams=root.querySelectorAll('.match-team');
    if(!center || teams.length<2) return;

    const bosRec=parseRecord(teams[0].querySelector('.match-record')?.textContent);
    const oppRec=parseRecord(teams[1].querySelector('.match-record')?.textContent);
    let bosPct=50;
    if(bosRec && oppRec){
      bosPct=clamp(50 + (pct(bosRec)-pct(oppRec))*72);
    }
    const oppPct=100-bosPct;

    let panel=center.querySelector('.matchup-projection');
    if(!panel){
      panel=document.createElement('div');
      panel.className='matchup-projection';
      center.appendChild(panel);
    }
    panel.innerHTML=
      '<div class="matchup-projection-label"><span>BOS <strong>'+bosPct+'%</strong></span><span>PROJECTION</span><span><strong>'+oppPct+'%</strong> OPP</span></div>'+
      '<div class="matchup-projection-track"><span class="matchup-projection-fill" style="width:'+bosPct+'%"></span><span class="matchup-projection-dot" style="left:'+bosPct+'%"></span></div>';
  }

  function keepRedSoxLiveCentered(){
    const hero=document.getElementById('redSoxHero');
    if(!hero) return;
    const center=hero.querySelector('.hero-center-panel');
    if(center){
      center.style.marginLeft='auto';
      center.style.marginRight='auto';
      center.style.textAlign='center';
    }
  }

  function enhance(){
    matchupProjection();
    keepRedSoxLiveCentered();
  }

  const obs=new MutationObserver(()=>requestAnimationFrame(enhance));
  obs.observe(document.body,{subtree:true,childList:true});
  setInterval(enhance,2000);
  enhance();
})();

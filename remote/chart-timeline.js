(() => {
  'use strict';
  const storage=typeof localStorage==='undefined'?null:localStorage;
  const scopes=new Map();
  const stamp=v=>Number.isFinite(Date.parse(v))?Date.parse(v):null;
  function activeGame(g) {
    const s=g.competitions?.[0]?.status?.type || g.status?.type || {};
    return s.state==='in' && s.completed!==true;
  }
  // Only observed game execution counts toward a live hour. Closed-browser
  // gaps are never assumed to be football, and missing kickoff history is not
  // fabricated. Full week always retains every recorded correction.
  function observe(scope,games,now=Date.now()) {
    let state=scopes.get(scope);
    if(!state) {
      try {state=JSON.parse(storage?.getItem('fcc-active-time-v1:'+scope)||'null');}catch(_){}
      if(!state || !Array.isArray(state.windows))state={windows:[]};
      state.last=null;state.live=false;scopes.set(scope,state);
    }
    const live=(games || []).some(activeGame),gap=state.last===null?0:now-state.last;
    if(state.live && gap>0 && gap<=90000) {
      const last=state.windows[state.windows.length-1];
      if(last && Math.abs(last[1]-state.last)<1000)last[1]=now;
      else state.windows.push([state.last,now]);
    }
    state.last=now;state.live=live;
    if(!state.saved || now-state.saved>15000) {
      try {storage?.setItem('fcc-active-time-v1:'+scope,JSON.stringify({windows:state.windows.slice(-2048)}));}catch(_){}
      state.saved=now;
    }
    return state.windows;
  }
  function activeTime(at,windows) {
    return windows.reduce((total,[start,end])=>total+Math.max(0,Math.min(at,end)-start),0);
  }
  function rolling(history,windows,now=Date.now(),duration=3600000) {
    if(!history.length)return [];
    const current=activeTime(now,windows),cutoff=Math.max(0,current-duration);
    const firstStart=windows[0]?.[0];
    if(firstStart===undefined)return [{...history[history.length-1],windowAnchor:true}];
    let cutoffAt=firstStart,elapsed=0;
    for(const [start,end] of windows) {
      if(cutoff>=elapsed+end-start) {elapsed+=end-start;cutoffAt=end;continue;}
      cutoffAt=start+Math.max(0,cutoff-elapsed);break;
    }
    const selected=[];let anchor=null;
    for(const point of history) {
      const at=stamp(point.at);
      if(at!==null && at>=cutoffAt)selected.push(point);
      else anchor=point;
    }
    if(anchor)selected.unshift({...anchor,windowAnchor:true});
    return selected.length?selected:[{...history[history.length-1],windowAnchor:true}];
  }
  function mapIndex(history) {
    // Calendar timestamps are labels only; equal active-order steps bridge
    // Thursday to Sunday and Sunday to Monday without empty-day plateaus.
    return history.map((point,index)=>({...point,index}));
  }
  function select(history,{range='week',windows=[],now=Date.now()}={}) {
    return mapIndex(range==='hour'?rolling(history,windows,now):history);
  }
  window.FantasyTimeline={observe,activeTime,rolling,mapIndex,select,activeGame};
})();

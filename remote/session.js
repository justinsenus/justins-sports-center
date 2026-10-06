(() => {
  'use strict';
  const cfg = window.FANTASY_REMOTE_CONFIG;
  const app = window.FantasyCenter;
  const role = document.body.dataset.screen === 'tv' ? 'tv' : 'touch';
  const $ = id => document.getElementById(id);
  const storageKey = 'fcc-pairing-v1:' + role;
  let room = null, socket = null, subscribed = false, revision = -1, ref = 0, joinRef = '', retries = 0;
  let reconnectTimer, heartbeats, joinTimer, peerSeen = 0, peerRevision = -1, stopped = false, queue = Promise.resolve();
  let currentError = '', lastCommand = 0;
  const device = role + '-' + Array.from(crypto.getRandomValues(new Uint8Array(8)), n => n.toString(16).padStart(2,'0')).join('');
  const save = () => { try { if (room) localStorage.setItem(storageKey, JSON.stringify(room)); else localStorage.removeItem(storageKey); } catch (_) {} };
  const api = async (action, extra = {}) => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch(cfg.url + '/functions/v1/fantasy-remote', {method:'POST',cache:'no-store',signal:abort.signal,
        headers:{'Content-Type':'application/json','apikey':cfg.key},
        body:JSON.stringify({action,...(room ? {id:room.id,token:room.token} : {}),...extra})});
      const data = await response.json();
      if (!response.ok || data.error) { const e = new Error(data.error || 'Session unavailable.'); e.status = response.status; throw e; }
      return data;
    } finally { clearTimeout(timer); }
  };
  function status() {
    const online = subscribed && Date.now() - peerSeen < 16000;
    const label = currentError || (!room ? 'Local controls · pair your TV' : !subscribed ? 'Reconnecting to session…' : online ? (role === 'tv' ? 'TOUCH CONTROLLER CONNECTED' : peerRevision < revision ? 'Sending to TV…' : 'TV connected · controlling live') : role === 'tv' ? 'WAITING FOR TOUCH CONTROLLER' : 'Paired · waiting for TV');
    if ($('remoteStatus')) { $('remoteStatus').textContent = label; $('remoteStatus').dataset.connected = online ? 'true' : 'false'; }
    if ($('remoteCode')) $('remoteCode').textContent = room ? room.code : '--------';
    if ($('pairDisplay')) $('pairDisplay').textContent = room ? room.code.slice(0,4)+' '+room.code.slice(4) : 'STARTING…';
    if ($('pairError')) $('pairError').textContent = currentError;
    if ($('remoteToggle')) $('remoteToggle').textContent = room ? 'PAIR ' + room.code : 'PAIR TV';
  }
  function apply(data) {
    if (!data || !data.state || !Number.isFinite(Number(data.revision)) || Number(data.revision) < revision) return;
    revision = Number(data.revision);
    if (room) { room.state = data.state; room.revision = revision; save(); }
    app.applyUI(data.state);
    presence(); status();
    document.dispatchEvent(new CustomEvent('fantasy:session', {detail:{paired:!!room,connected:subscribed,revision,role}}));
  }
  function frame(event, payload, topic) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({topic:topic || 'realtime:'+room.topic,event,payload,ref:String(++ref),join_ref:event==='heartbeat'?null:joinRef}));
  }
  function presence() {
    if (subscribed && room) frame('broadcast',{type:'broadcast',event:'device',payload:{role,device,revision,at:Date.now()}});
  }
  function disconnect() {
    clearTimeout(reconnectTimer); clearTimeout(joinTimer); clearInterval(heartbeats);
    subscribed = false;
    if (socket) { socket.onclose = null; socket.close(); socket = null; }
  }
  function connect() {
    if (!room || stopped) return;
    disconnect(); currentError = ''; status();
    try { socket = new WebSocket(cfg.url.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(cfg.key)+'&vsn=1.0.0'); }
    catch (_) { schedule(); return; }
    const connection = socket;
    joinRef = String(++ref);
    socket.onopen = () => {
      socket.send(JSON.stringify({topic:'realtime:'+room.topic,event:'phx_join',payload:{config:{broadcast:{ack:false,self:false},presence:{enabled:false},private:false}},ref:joinRef,join_ref:joinRef}));
      joinTimer = setTimeout(() => { if (!subscribed) connection.close(); },10000);
    };
    socket.onmessage = event => {
      let message; try { message = JSON.parse(event.data); } catch (_) { return; }
      if (message.event === 'phx_reply' && message.ref === joinRef) {
        if (message.payload.status !== 'ok') { connection.close(); return; }
        clearTimeout(joinTimer); subscribed = true; retries = 0; currentError = '';
        // Read the canonical state after joining, closing the connection gap.
        api('resume').then(data => apply(data)).catch(e => { currentError=e.message; status(); });
        presence(); heartbeats=setInterval(() => { frame('heartbeat',{},'phoenix'); presence(); status(); },5000); status();
      }
      if (message.event === 'phx_error' || message.event === 'phx_close') { connection.close(); return; }
      if (message.event !== 'broadcast') return;
      const eventName = message.payload && message.payload.event;
      const payload = message.payload && message.payload.payload;
      if (eventName === 'state') apply(payload);
      if (eventName === 'device' && payload && payload.role !== role) {
        const wasOffline = Date.now()-peerSeen > 16000;
        peerSeen = Date.now(); peerRevision = Number(payload.revision);
        if (role === 'tv') $('pairPanel')?.classList.add('hidden');
        if (wasOffline) presence(); status();
      }
    };
    socket.onclose = () => { if (connection !== socket) return; clearInterval(heartbeats); subscribed=false; status(); schedule(); };
    socket.onerror = () => { currentError='Connection interrupted · reconnecting'; status(); };
  }
  function schedule() {
    clearTimeout(reconnectTimer);
    if (!stopped && room) reconnectTimer=setTimeout(connect,Math.min(30000,1000*Math.pow(2,retries++)));
  }
  async function useRoom(data) {
    disconnect(); room=data; revision=-1; peerSeen=0; peerRevision=-1; stopped=false;
    save(); apply(data); connect();
    if (role === 'touch') $('pairPanel').classList.add('hidden');
  }
  async function createRoom() {
    if ($('newRoom')) $('newRoom').disabled=true;
    try { await useRoom(await api('create')); currentError=''; $('pairPanel').classList.remove('hidden'); }
    catch (e) { currentError=e.message; }
    finally { if ($('newRoom')) $('newRoom').disabled=false; status(); }
  }
  document.addEventListener('fantasy:command', event => {
    if (!room) { status(); return; }
    const patch = event.detail;
    lastCommand=Date.now(); currentError='';
    // Serialize local commands; server revisions order commands across remotes.
    queue=queue.catch(()=>{}).then(()=>api('command',{patch})).then(data=>{apply(data);status();}).catch(e=>{currentError=e.message+' Tap the control again.';status();});
  });
  if ($('pairForm')) $('pairForm').addEventListener('submit',async event => {
    event.preventDefault(); const button=$('pairSubmit'); button.disabled=true; currentError='';
    try { await useRoom(await api('join',{code:$('pairInput').value})); }
    catch(e) { currentError=e.message; }
    finally { button.disabled=false; status(); }
  });
  $('remoteToggle')?.addEventListener('click',()=>{ $('pairPanel').classList.remove('hidden'); $('pairInput')?.focus(); });
  $('pairCancel')?.addEventListener('click',()=>$('pairPanel').classList.add('hidden'));
  $('newRoom')?.addEventListener('click',createRoom);
  $('watchLocal')?.addEventListener('click',()=>$('pairPanel').classList.add('hidden'));
  $('unpair')?.addEventListener('click',()=>{stopped=true;disconnect();room=null;revision=-1;peerSeen=0;save();currentError='';status();$('pairPanel').classList.remove('hidden');});
  const visibleAgain=()=>{ if (document.visibilityState==='visible' && room && !stopped) { if(!socket || socket.readyState!==WebSocket.OPEN)connect();else api('resume').then(apply).catch(e=>{currentError=e.message;status();}); } };
  document.addEventListener('visibilitychange',visibleAgain);
  window.addEventListener('online',()=>{if(room)connect();});
  const controllerURL = new URL('../touch/',location.href).href;
  if ($('pairAddress')) $('pairAddress').textContent=controllerURL;
  try { room=JSON.parse(localStorage.getItem(storageKey)||'null'); } catch(_) {}
  (async()=>{
    if(room){try{await useRoom(await api('resume'));}catch(e){disconnect();room=null;save();currentError=e.message;status();if(role==='tv')await createRoom();else $('pairPanel').classList.remove('hidden');}}
    else if(role==='tv')await createRoom();else status();
  })();
  window.FantasyRemote = {getStatus:()=>({paired:!!room,connected:subscribed,peerOnline:Date.now()-peerSeen<16000,revision,role}),reconnect:connect};
})();

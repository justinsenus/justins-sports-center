import {strict as assert} from 'node:assert';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const listeners=new Map(),elements=new Map(),calls=[],sockets=[],applied=[];
const ui={league:'sleeper',view:'overview',playerId:null,playerTab:'stats'};
const initial={id:'fixture-room',code:'ABCD2345',token:'fixture-only',topic:'fixture-topic',revision:10,state:{...ui}};
const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',dataset:{},disabled:false,value:'',classList:{add(){},remove(){}},addEventListener(){},focus(){}});return elements.get(id);};
const document={body:{dataset:{screen:'touch'}},visibilityState:'visible',getElementById:element,
  addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:e=>listeners.get(e.type)?.(e)};
class CustomEvent {constructor(type,options={}){this.type=type;this.detail=options.detail;}}
class Socket {static OPEN=1;constructor(){this.readyState=1;sockets.push(this);}send(){}close(){this.readyState=3;}}
const app={applyUI:patch=>{Object.assign(ui,patch);applied.push({...ui});}};
const context={document,window:{FantasyCenter:app,FANTASY_REMOTE_CONFIG:{url:'https://fixture.supabase.co',key:'fixture-public'},addEventListener(){}},
  localStorage:{getItem:()=>JSON.stringify(initial),setItem(){},removeItem(){}},crypto:{getRandomValues:array=>array.fill(1)},
  WebSocket:Socket,AbortController,CustomEvent,URL,location:{href:'https://justinsenus.github.io/justins-sports-center/touch/'},
  fetch:(url,options)=>new Promise(resolve=>calls.push({body:JSON.parse(options.body),resolve})),
  setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},console,Date};
vm.runInNewContext(await readFile(new URL('../session.js',import.meta.url),'utf8'),context);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const respond=(call,data)=>call.resolve({ok:true,json:async()=>data});
respond(calls[0],initial);await settle();
assert.equal(ui.playerId,null);
const broadcast=(revision,state)=>sockets.at(-1).onmessage({data:JSON.stringify({event:'broadcast',payload:{event:'state',payload:{revision,state}}})});
const select=patch=>{app.applyUI(patch);document.dispatchEvent(new CustomEvent('fantasy:command',{detail:patch}));};
select({playerId:'123',playerTab:'stats'});
select({playerId:'123',playerTab:'news'});
select({playerId:'123',playerTab:'projections'});
await settle();
const afterSelection=applied.length;
broadcast(10,{...initial.state});
assert.equal(ui.playerId,'123','An equal-revision snapshot cannot close an optimistic player selection');
assert.equal(ui.playerTab,'projections');
broadcast(11,{...initial.state,playerId:'123',playerTab:'stats'});
assert.equal(ui.playerTab,'projections','An earlier broadcast preserves later local tab selections');
respond(calls.find(call=>call.body.action==='command'),{revision:11,state:{...initial.state,playerId:'123',playerTab:'stats'}});
await settle();
const commands=()=>calls.filter(call=>call.body.action==='command');
assert.equal(commands().length,2,'Commands remain serialized');
respond(commands()[1],{revision:12,state:{...initial.state,playerId:'123',playerTab:'news'}});
await settle();
assert.equal(ui.playerTab,'projections','An older HTTP acknowledgement cannot bounce back to News');
respond(commands()[2],{revision:13,state:{...initial.state,playerId:'123',playerTab:'projections'}});
await settle();
broadcast(12,{...initial.state,playerId:null});
assert.equal(ui.playerId,'123','An out-of-order reply cannot return the user to home');
assert.ok(applied.slice(afterSelection).every(state=>state.playerId==='123' && state.playerTab==='projections'),'No intermediate home or earlier tab is rendered after the newest selection');
broadcast(14,{...initial.state,playerId:null});
assert.equal(ui.playerId,null,'A genuinely newer close command remains authoritative');
console.log('Passed: stable optimistic player/tab navigation, duplicate snapshots, delayed acknowledgements, ordered commands, and authoritative remote closes.');

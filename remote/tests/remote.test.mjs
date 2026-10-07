import {strict as assert} from 'node:assert';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {validatePatch,makeHandler} from '../backend/index.js';

assert.deepEqual(validatePatch({view:'stock',playerId:null}),{view:'stock',playerId:null});
for(const invalid of [{view:'admin'},{league:'anything'},{playerId:'<script>'},{token:'overwrite'},{refresh:2},[]])assert.throws(()=>validatePatch(invalid));
const stored={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',control_token:'a'.repeat(64),pair_code:'ABCD2345',topic:'fcc-test',revision:0,state:{league:'sleeper',view:'overview',playerId:null}};
let calls=[];
const fakeDB=async(url,options)=>{
  assert.equal(options.headers.apikey,'server-only-key');
  const path=new URL(url).pathname;
  calls.push(path);
  if(path.endsWith('/fcc_remote_limit'))return new Response('true');
  if(path.endsWith('/fcc_remote_command')){
    const params=JSON.parse(options.body);assert.equal(params.p_token,stored.control_token);
    stored.state={...stored.state,...params.p_patch};stored.revision++;
    return Response.json({state:stored.state,revision:stored.revision});
  }
  if(path.endsWith('/fcc_remote_rooms')){
    if(url.includes('control_token=eq.')&&!url.includes('control_token=eq.'+stored.control_token))return Response.json([]);
    if(url.includes('pair_code=eq.')&&!url.includes('pair_code=eq.'+stored.pair_code))return Response.json([]);
    return Response.json([stored]);
  }
  throw new Error('unexpected '+path);
};
const handler=makeHandler(k=>k==='SUPABASE_URL'?'https://example.supabase.co':'server-only-key',fakeDB);
const send=body=>handler(new Request('https://example.supabase.co/functions/v1/fantasy-remote',{method:'POST',headers:{'Origin':'https://justinsenus.github.io','Content-Type':'application/json'},body:JSON.stringify(body)}));
assert.equal((await send({action:'join',code:'WRONG234'})).status,404);
const joined=await (await send({action:'join',code:'abcd 2345'})).json();assert.equal(joined.id,stored.id);
assert.equal((await send({action:'resume',id:stored.id,token:'b'.repeat(64)})).status,401);
assert.equal((await send({action:'command',id:stored.id,token:stored.control_token,patch:{view:'stock'}})).status,200);
assert.equal(stored.revision,1);assert.equal(stored.state.view,'stock');
assert.equal((await send({action:'command',id:stored.id,token:stored.control_token,patch:{view:'bad'}})).status,400);
assert.equal(stored.revision,1);
const badOrigin=await handler(new Request('https://example.supabase.co/',{method:'POST',headers:{Origin:'https://untrusted.example'},body:'{}'}));assert.equal(badOrigin.status,403);
assert.ok(!JSON.stringify(joined).includes('server-only-key'));

const listeners=new Map();
let commands=0;
const document={body:{dataset:{screen:'tv',root:'../patriots-fantasy-touch/'}},querySelector:()=>null,querySelectorAll:()=>[],
  addEventListener:(name,fn)=>{listeners.set(name,[...(listeners.get(name)||[]),fn]);},
  dispatchEvent:event=>{if(event.type==='fantasy:command')commands++;(listeners.get(event.type)||[]).forEach(fn=>fn(event));}};
class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}}
const sandbox={document,CustomEvent,window:{addEventListener:()=>{}},localStorage:{getItem:()=>null,setItem:()=>{}},setTimeout,clearTimeout,setInterval:()=>0,console,URL,Date};
let source=await readFile(new URL('../../patriots-fantasy-touch/remote-app.js',import.meta.url),'utf8');
source=source.replace('  const uiState =','  window.testState=state; window.testFns={normalizeESPNEntry,normalizeStoredESPNData,findPlayerEvent,consensusFor};\n  const uiState =');
source=source.replace(/\n  refresh\(\);\n  setInterval\(refresh, CONFIG.refreshMs\);[\s\S]*?\}\)\(\);$/,'\n})();');
vm.runInNewContext(source,sandbox);
const app=sandbox.window.FantasyCenter, state=sandbox.window.testState;
const team=(id,name,points,player)=>({id,teamId:id,name,total:points,players:{[player]:{player_id:player,full_name:player==='p1'?'Drake Maye':'Opponent Player',position:'QB',team:'NE',projected:20,actual:points,status:'FINAL'}},pointsMap:{[player]:points},roster:{players:[player],starters:[player]},record:{wins:2,losses:1}});
const own=team('1',"Gumby's Big D",29.4,'p1'),opp=team('2','Opponent',22.2,'p2');
state.espn={ready:true,myTeam:own,opponent:opp,leagueTeams:[own,opp],matchups:[{id:'game-1',homeTeamId:'1',awayTeamId:'2'}],matchupPeriodId:4};state.loading=false;
app.applyUI({league:'espn'});assert.equal(commands,0);assert.equal(app.model().ownActual,29.4);
app.dispatch({playerId:'p1'});assert.equal(commands,1);assert.equal(app.model().player.full_name,'Drake Maye');
app.applyUI({playerId:null,view:'stock'});assert.equal(commands,1);assert.equal(app.getUI().view,'stock');assert.equal(app.model().player,null);
app.applyUI({matchupId:'game-1',view:'overview'});assert.equal(app.model().league.remoteMatchupId,'game-1');assert.equal(app.model().opponentActual,22.2);
app.applyUI({playerId:'p1'});state.espn.myTeam.pointsMap.p1=31.1;app.render();assert.equal(app.model().player.actual,31.1);
app.applyUI({playerId:null,matchupId:'game-1'});
state.espn.matchups[0].homeTotal=35.7;
state.espn.matchups[0].awayTotal=21.8;
assert.equal(app.model().ownActual,35.7);
assert.equal(app.model().ownFinish,35.7);
assert.equal(app.model().opponentFinish,21.8);
state.espn.myTeam.players.p1.status='LIVE';
state.espn.myTeam.pointsMap.p1=10;
assert.equal(app.model().ownFinish,45.7);
state.espn.myTeam.players.p1.status='FINAL';
state.espn.myTeam.pointsMap.p1=-2;
assert.equal(app.model().ownFinish,35.7);
const reported=app.data.stats({gameStats:[{label:'RECEPTIONS',value:0},{label:'RECEIVING YARDS',value:24}],rec_td:0,targets:5});
assert.ok(reported.some(s=>s.label==='RECEPTIONS'&&s.value===0));
assert.ok(reported.some(s=>s.label==='RECEIVING TOUCHDOWNS'&&s.value===0));
assert.ok(reported.some(s=>s.label==='TARGETS'&&s.value===5));
assert.ok(!reported.some(s=>s.label==='RUSHING YARDS'),'Missing stats are not invented');
const unscoped={playerId:'test',lineupSlotId:0,appliedStatTotal:26.2,playerPoolEntry:{player:{id:'test',fullName:'Test QB',defaultPositionId:1,proTeamId:17,stats:[{scoringPeriodId:4,statSourceId:0,appliedTotal:26.2,stats:{3:269}}]}}};
assert.equal(sandbox.window.testFns.normalizeESPNEntry(unscoped,null,5,'own').actual,0,'A previous week roster score is not carried into the current week');
const scoped={...unscoped,appliedStatTotal:18.3};
assert.equal(sandbox.window.testFns.normalizeESPNEntry(unscoped,scoped,5,'own').actual,18.3,'An entry explicitly scoped to the current matchup remains authoritative');
state.week=4;state.scoreboard=[{competitions:[{competitors:[{team:{abbreviation:'NE'}}],status:{type:{state:'post'}}}]}];
assert.equal(sandbox.window.testFns.findPlayerEvent({team:'NE',scoringPeriodId:5}),null,'An ESPN week 5 player does not attach to a Sleeper week 4 game');
state.consensus={week:4,players:{test:{consensus:99}}};
assert.equal(sandbox.window.testFns.consensusFor({player_id:'test',scoringPeriodId:5,projected:20.5}).value,20.5,'ESPN keeps its weekly league-scored projection');
assert.equal(sandbox.window.testFns.consensusFor({player_id:'missing',scoringPeriodId:5}).value,null,'Missing projections are not invented');
state.scoreEvents.espn=[{playerId:'p1',snapshot:true,total:99},{playerId:'p1',snapshot:true,total:-2},{playerId:'p1',total:-3,delta:1}];
assert.equal(app.model().events.length,2,'Stale cached snapshots are removed while true historical scoring plays stay');
state.espn.matchups[0].homeTotal=0;state.espn.matchups[0].awayTotal=0;
state.espn.myTeam.pointsMap.p1=0;state.espn.opponent.pointsMap.p2=0;
state.espn.myTeam.players.p1.status='UPCOMING';state.espn.opponent.players.p2.status='UPCOMING';
state.scoreboard=[];state.scoreboards={};
assert.equal(app.model().events.length,0,'An upcoming scoring week does not display old cached scoring events');
console.log('Passed: command validation, origin restriction, pairing failures, room token checks, server revision order, no secret exposure, silent remote state application, matchup switching, player open/close, live player refresh, corrected team totals, remaining projections, and negative final scores.');

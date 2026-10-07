import {strict as assert} from 'node:assert';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const elements=new Map();
const element=id=>{
  if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',dataset:{},hidden:false,offsetWidth:120,
    classList:{values:new Set(),add(v){this.values.add(v)},remove(v){this.values.delete(v)},toggle(v,on){on?this.add(v):this.remove(v)}},
    addEventListener(){},querySelector(){return null}});
  return elements.get(id);
};
const player=(id,starter=true)=>({player_id:id,full_name:id,position:'WR',team:'NE',starter,status:'FINAL',actual:2,projected:3});
const own=Array.from({length:18},(_,i)=>player('own-'+i,i<9));
const opponent=Array.from({length:20},(_,i)=>player('opp-'+i,i<10));
const model={loading:false,started:true,leagueStarted:true,ui:{league:'sleeper',view:'overview',playerId:null},
  ownActual:18,opponentActual:20,ownFinish:18,opponentFinish:20,history:[],teamHistory:[],events:[],matchups:[],
  league:{ready:true,week:5,ownName:'The Big Senus',opponentName:'Other team',own,opponent,
    teams:[{id:'1',name:'The Big Senus',teamColor:'#f47b35',total:18,players:own},{id:'2',name:'Other team',teamColor:'#aca0e5',total:20,players:opponent}]}};
const app={model:()=>model,getUI:()=>model.ui,render(){thisCalls++;if(context.window.FantasyGlass)context.window.FantasyGlass.render()},
  format:(v,d=1,empty='—')=>v==null?empty:Number(v).toFixed(d),escape:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
  data:{actual:p=>p.actual,record:()=> '2–1'},markup:{face:()=>'<span class="player-face"></span>',stats:()=>'',gameLabel:()=>''},dispatch(){}};
let thisCalls=0;
const document={body:{dataset:{screen:'touch'}},getElementById:element,querySelectorAll:()=>[],querySelector:()=>null,
  addEventListener(){},activeElement:null};
const context={window:{FantasyCenter:app},document,CSS:{escape:v=>v},Date,Map,Set};
vm.runInNewContext(await readFile(new URL('../soft-glass.js',import.meta.url),'utf8'),context);
const charts=context.window.FantasyGlassCharts;
const series=[{name:'Own',color:'#f47b35',value:15},{name:'Other',color:'#aca0e5',value:-2}];
const records=[{at:1000,values:[10,2]},{at:2000,values:[20,3]},{at:3000,values:[15,-2]}];
const history=charts.normalizeHistory(records,series);
assert.equal(history.length,4);
assert.ok(history[0].values.every(v=>v===0),'Both lines share the zero baseline');
assert.equal(history[2].values[0],20);
assert.equal(history[3].values[0],15,'The negative score correction remains in the history');
assert.equal(history[3].values[1],-2);
assert.ok(charts.geometry(history).min<0,'Negative totals stay on the visible chart scale');
assert.ok(charts.chart(series,records).includes('glass-series'));
const workspace=element('workspace').innerHTML;
assert.equal((workspace.match(/class="roster-row /g)||[]).length,38,'Every player from both full rosters is on home');
assert.equal((workspace.match(/Bench \/ reserve/g)||[]).length,2);
assert.ok(workspace.includes('Matchup scoring')&&workspace.includes('League scoring'));
assert.equal(element('headerMascot').classList.values.has('score-wiggle'),false,'Initial data does not animate as a score change');
model.ownActual=19;model.league.teams[0].total=19;app.render();
assert.equal(element('headerMascot').classList.values.has('score-wiggle'),true,'An actual score update wiggles the mascot');
element('headerMascot').classList.remove('score-wiggle');model.ownFinish=25;app.render();
assert.equal(element('headerMascot').classList.values.has('score-wiggle'),false,'Projection changes do not trigger the score wiggle');
model.ui.matchupId='another';model.ownActual=12;app.render();
assert.equal(element('headerMascot').classList.values.has('score-wiggle'),false,'Switching matchups does not trigger a score wiggle');
console.log('Passed: full home rosters and bench, shared zero baseline, retained corrections, negative chart scale, and real score change animation.');

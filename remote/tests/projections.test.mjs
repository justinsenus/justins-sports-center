import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

let clock = Date.now();
const stamp = new Date(clock).toISOString();
const feed = { id:'latest', season:2026, week:5, scoring:'PPR',
  updated_at:stamp, players_count:2, sources:['sleeper','fantasypros'] };
const rows = [
  {id:'chuba_hubbard',display_name:'Chuba Hubbard',calculated_average:15.25,
   injury_fallback:'ACTIVE',sources_counted:2,updated_at:stamp},
  {id:'amonra_st_brown',display_name:'Amon-Ra St. Brown',calculated_average:19,
   injury_fallback:'QUESTIONABLE',sources_counted:1,updated_at:stamp}
];
let reads = 0, torn = false;
const client = {from(table){
  const query = {select(){return this;},eq(){return this;},order(){return this;},range(){return this;},
    single(){return this;},maybeSingle(){return this;},abortSignal(){return this;},
    then(resolve){reads++;return Promise.resolve({error:null,data:table==='player_stats'?rows:
      torn && reads%3===0?{...feed,updated_at:new Date(clock+1).toISOString()}:feed}).then(resolve);}};
  return query;
}};
class Clock extends Date {static now(){return clock;}}
const window = {FANTASY_REMOTE_CONFIG:{url:'https://public.supabase.co',key:'sb_publishable_fixture'},
  supabase:{createClient(){return client;}}};
vm.runInNewContext(await readFile(new URL('../projections.js',import.meta.url),'utf8'),
  {window,Date:Clock,setTimeout,clearTimeout,AbortController,Map,Set,console});
const api = window.FantasyProjectionCloud;
await Promise.all([api.refresh(),api.refresh()]);
assert.equal(reads,3,'Concurrent refreshes share one three-query batch');
assert.equal(api.get({full_name:'Chuba Hubbard Jr.'},{season:2026,week:5}).calculated_average,15.25);
assert.equal(api.get({full_name:'Amon-Ra St. Brown'},{season:2026,week:5}).sources_counted,1);
assert.equal(api.get({full_name:'Chuba Hubbard'},{season:2026,week:6}),null,'Another week cannot use this batch');
assert.equal(api.get({full_name:'Chuba Hubbard'},{season:2025,week:5}),null,'Another season cannot use this batch');
await api.refresh();assert.equal(reads,3,'Cloud checks are limited to one per minute');
torn=true;await api.refresh(true);
assert.ok(api.snapshot().error,'A batch changed during pagination is rejected');
assert.equal(api.get({full_name:'Chuba Hubbard'},{season:2026,week:5}).calculated_average,15.25,'Last successful data is retained');
clock += 6*3600000+1;
assert.equal(api.get({full_name:'Chuba Hubbard'},{season:2026,week:5}),null,'Expired projections fall back to direct feeds');
const delayedWindow = {FANTASY_REMOTE_CONFIG:window.FANTASY_REMOTE_CONFIG};
vm.runInNewContext(await readFile(new URL('../projections.js',import.meta.url),'utf8'),
  {window:delayedWindow,Date:Clock,setTimeout,clearTimeout,AbortController,Map,Set,console});
assert.equal((await delayedWindow.FantasyProjectionCloud.refresh()).rows,0,'A missing optional SDK does not throw during startup');
delayedWindow.supabase = window.supabase;
torn=false;
assert.equal((await delayedWindow.FantasyProjectionCloud.refresh()).rows,2,'An SDK that arrives after startup is used immediately');
console.log('Passed: atomic cloud snapshots, same-week isolation, source counts, name normalization, concurrency, polling, stale fallback, and delayed SDK recovery.');

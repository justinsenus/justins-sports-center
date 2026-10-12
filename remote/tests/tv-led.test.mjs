import {strict as assert} from 'node:assert';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const elements = new Map(), listeners = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {innerHTML: '', textContent: '', dataset: {}, hidden: false, offsetWidth: 80, style: {setProperty() {}}, classList: {add() {}, remove() {}, toggle() {}}, addEventListener() {}, setAttribute() {}, querySelector() {return null;}});
  return elements.get(id);
};
const player = (id, starter, color) => ({player_id: id, full_name: 'Player ' + id, position: 'WR', team: 'NE', starter, status: 'FINAL', actual: id === 'own-0' ? 0 : 2, projected: 10, fantasyTeamColor: color});
const own = Array.from({length: 18}, (_, i) => player('own-' + i, i < 9, '#ff8b31'));
const opponent = Array.from({length: 20}, (_, i) => player('away-' + i, i < 10, '#3089ff'));
const teams = Array.from({length: 12}, (_, i) => ({id: String(i), name: 'Team ' + i, teamColor: '#' + (0x336699 + i * 800).toString(16), total: i === 11 ? -2 : i * 3, players: i % 2 ? opponent : own}));
const matchups = Array.from({length: 6}, (_, i) => ({id: String(i), home: teams[i * 2], away: teams[i * 2 + 1], homeScore: i, awayScore: i ? 20 : 0}));
const events = Array.from({length: 12}, (_, i) => ({playerId: 'own-' + i, name: 'Player ' + i, fantasyTeamName: teams[i].name, teamColor: teams[i].teamColor, total: i, delta: i === 11 ? -2 : 1}));
const model = {loading: false, started: true, leagueStarted: true, ui: {league: 'espn', view: 'overview', playerId: null}, ownActual: 0, opponentActual: 28, ownFinish: 125.8, opponentFinish: 131.1, history: [], teamHistory: [], events, matchups, league: {ready: true, week: 5, ownName: 'Team 0', opponentName: 'Team 1', own, opponent, teams, allPlayers: own.concat(opponent)}};
const document = {body: {dataset: {screen: 'tv', tvStyle: 'led'}}, documentElement: {style: {setProperty() {}}}, getElementById: element, querySelectorAll: () => [], querySelector: () => null, addEventListener: (name, fn) => listeners.set(name, fn), activeElement: null};
const app = {model: () => model, getUI: () => model.ui, render() {context.window.FantasyGlass?.render();}, format: (v, d = 1, empty = '—') => v == null ? empty : Number(v).toFixed(d), escape: v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'), data: {actual: p => p.actual, record: () => '2–2'}, markup: {face: () => '<span class="player-face"></span>', stats: () => '<div>269 passing yards</div>', gameLabel: () => ''}, dispatch() {}};
const context = {window: {FantasyCenter: app, innerHeight: 1080, innerWidth: 1920, addEventListener() {}}, document, CSS: {escape: v => v}, Date, Map, Set, URL};
for (const script of ['soft-glass.js', 'tv-presentation.js', 'tv-led.js']) vm.runInNewContext(await readFile(new URL('../' + script, import.meta.url), 'utf8'), context);

const led = context.window.FantasyLED;
const overview = element('workspace').innerHTML;
assert.ok(overview.includes('led-overview') && overview.includes('led-support'), 'The additional TV composes the reference panel arrangement');
assert.equal((overview.match(/data-tv-player=/g) || []).length, 38, 'Both complete rosters, including every reserve, remain available');
assert.ok(overview.includes('<b>0.0</b>'), 'A reported zero remains an actual score');
const stock = led.stock(model);
for (const team of teams) assert.ok(stock.includes(team.name) && stock.includes(team.teamColor), 'Every league team keeps its own stock color');
assert.ok(stock.includes('-2.0') && stock.includes('12 teams'), 'Negative points remain on the all-team chart');
assert.equal((overview.match(/class="tv-feed-row"/g) || []).length, 2, 'Supporting scoring rows fit the TV instead of overflowing');
assert.ok(element('scoreStrips').innerHTML.includes('led-nfl-only'), 'The overview keeps the NFL ribbon below the report row');
assert.equal((led.fantasyStrip(model).match(/class="tv-strip-matchup"/g) || []).length, 2, 'Wide displays show two complete fantasy matchups');
context.window.innerWidth = 1366;
assert.equal((led.fantasyStrip(model).match(/class="tv-strip-matchup"/g) || []).length, 1, 'Smaller displays keep fantasy matchup names readable');

model.ui.playerId = 'away-0';
model.player = opponent[0];
app.render();
assert.ok(element('workspace').innerHTML.includes('tv-player-detail'), 'A controller player selection preserves the full player scene');
assert.ok(!element('workspace').innerHTML.includes('led-overview'), 'A player selection is not overwritten by the LED home scene');
assert.ok(element('scoreStrips').innerHTML.includes('tv-fantasy-strip'), 'Other scenes still show every fantasy matchup through the rotating ribbon');
model.ui.playerId = null;
model.ui.view = 'league';
app.render();
assert.ok(element('workspace').innerHTML.includes('tv-league-full'), 'League navigation remains the complete shared TV scene');
model.started = model.leagueStarted = false;
assert.ok(led.momentum(model).includes('Matchup projections') && led.stock(model).includes('projections'), 'Pregame panels use the same projection mode as the existing TV');

console.log('Passed: LED panel composition, full rosters, all 12 stock colors and signed scores, readable rotating summaries, player/league navigation, and projection mode.');

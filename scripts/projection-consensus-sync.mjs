import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * Provider-backed consensus sync. Credentials are read only from GitHub
 * Actions secrets and never written to the public JSON artifact.
 */
const season = Number(process.env.SEASON || 2026);
const leagueId = String(process.env.SLEEPER_LEAGUE_ID || "1387635903379300352");
const ownerId = String(process.env.SLEEPER_OWNER_ID || "1137609122398482432");
const fpKey = String(process.env.FANTASYPROS_API_KEY || "").trim();
const sgoKey = String(process.env.SPORTSGAMEODDS_API_KEY || "").trim();
const oddsKey = String(process.env.THE_ODDS_API_KEY || "").trim();
const outputPath = resolve(process.cwd(), "patriots-fantasy-touch", "consensus-data.json");
const generatedAt = new Date().toISOString();

const CATALOG = [
  ["fantasypros", "FantasyPros", "projection"], ["rotowire", "RotoWire", "projection"],
  ["rotoballer", "RotoBaller", "projection"], ["nfl-fantasy", "NFL Fantasy", "projection"],
  ["espn", "ESPN Fantasy", "projection"], ["sleeper", "Sleeper", "projection"],
  ["yahoo", "Yahoo Fantasy", "projection"], ["cbs", "CBS Sports", "projection"],
  ["nbc-edge", "NBC Sports Edge", "projection"], ["fantasy-points", "Fantasy Points", "projection"],
  ["pff", "PFF Fantasy", "projection"], ["4for4", "4for4", "projection"],
  ["footballguys", "Footballguys", "projection"], ["numberfire", "NumberFire", "projection"],
  ["fantasy-life", "Fantasy Life", "projection"], ["playerprofiler", "PlayerProfiler", "projection"],
  ["fantasy-alarm", "Fantasy Alarm", "projection"], ["draftsharks", "Draft Sharks", "projection"],
  ["razzball", "Razzball", "projection"], ["fftoday", "FFToday", "projection"],
  ["fantasy-six-pack", "Fantasy Six Pack", "projection"], ["pfn", "Pro Football Network", "projection"],
  ["action-network", "Action Network", "projection"], ["establish-the-run", "Establish The Run", "projection"],
  ["sportsline", "SportsLine", "projection"], ["fantasy-guru", "Fantasy Guru", "projection"],
  ["draftkings", "DraftKings Fantasy", "projection"], ["underdog", "Underdog Fantasy", "projection"],
  ["sports-game-odds", "SportsGameOdds", "odds"], ["the-odds-api", "The Odds API", "odds"]
];

const clean = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
const nameKey = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
const num = (value) => {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const parsed = Number(String(value).replace(/[$,%]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const firstNum = (...values) => {
  for (const value of values) {
    const parsed = num(value);
    if (parsed != null) return parsed;
  }
  return null;
};
const rounded = (value) => num(value) == null ? null : Number(Number(value).toFixed(1));
const median = (values) => {
  const sorted = values.filter((value) => num(value) != null).map(Number).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

async function json(url, options) {
  const response = await fetch(url, {
    ...(options || {}),
    headers: { Accept: "application/json", "User-Agent": "justins-sports-center consensus sync", ...((options && options.headers) || {}) },
    signal: (options && options.signal) || AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) {}
  if (!response.ok) throw new Error("HTTP " + response.status + (body && body.message ? ": " + body.message : ""));
  return body;
}
async function safeJSON(url, options) {
  try { return { ok: true, data: await json(url, options) }; }
  catch (error) { return { ok: false, error: error && error.message || "provider request failed" }; }
}
async function text(url, options) {
  const response = await fetch(url, {
    ...(options || {}),
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 justins-sports-center consensus sync", ...((options && options.headers) || {}) },
    signal: (options && options.signal) || AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.text();
}
async function safeText(url, options) {
  try { return { ok: true, data: await text(url, options) }; }
  catch (error) { return { ok: false, error: error && error.message || "provider request failed" }; }
}

const sourceRows = () => CATALOG.map(([id, name, type]) => ({ id, name, type, status: "waiting", updated_at: null, count: 0 }));
function mark(sources, id, patch) {
  const row = sources.find((source) => source.id === id);
  if (row) Object.assign(row, { status: "live", updated_at: generatedAt }, patch || {});
}
function markError(sources, id, error) {
  const row = sources.find((source) => source.id === id);
  if (row) Object.assign(row, { status: "error", updated_at: generatedAt, error: clean(error) });
}
function rowName(raw) {
  if (!raw) return "";
  if (typeof raw === "string") return clean(raw);
  return clean(raw.full_name || raw.fullName || raw.display_name || raw.displayName || raw.name ||
    [raw.first_name, raw.last_name].filter(Boolean).join(" ") ||
    [raw.firstName, raw.lastName].filter(Boolean).join(" "));
}
function rowTeam(raw) {
  if (!raw || typeof raw === "string") return "";
  const value = raw.team || raw.team_abbr || raw.teamAbbr || raw.proTeam || raw.pro_team || raw.abbreviation || raw.team_name;
  return clean(value && typeof value === "object" ? value.abbreviation || value.abbrev || value.name || value.displayName : value);
}
function rowPosition(raw) {
  return clean(raw && (raw.position || raw.pos || raw.position_name || raw.positionName));
}
function findPlayer(players, name, team) {
  const wanted = nameKey(name);
  if (!wanted) return null;
  const wantedTeam = nameKey(team);
  const exact = players.find((player) => nameKey(player.name) === wanted && (!wantedTeam || !player.team || nameKey(player.team) === wantedTeam));
  if (exact) return exact;
  const suffixes = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
  const parts = (value) => clean(value).toLowerCase().split(/\s+/).map((part) => part.replace(/[^a-z0-9]/g, "")).filter((part) => part && !suffixes.has(part));
  const wantedParts = parts(name);
  const fuzzy = players.find((player) => {
    const candidateParts = parts(player.name);
    const sameName = wantedParts.length > 1 && candidateParts.length > 1 && wantedParts[0] === candidateParts[0] && wantedParts[wantedParts.length - 1] === candidateParts[candidateParts.length - 1];
    return sameName && (!wantedTeam || !player.team || nameKey(player.team) === wantedTeam);
  });
  if (fuzzy) return fuzzy;
  return players.find((player) => nameKey(player.name) === wanted) || null;
}
function addProjection(player, source, value, label) {
  const parsed = num(value);
  if (!player || parsed == null) return;
  const existing = player.projectionSources.find((item) => item.source === source);
  if (existing) existing.value = rounded(parsed);
  else player.projectionSources.push({ source, label: label || source, value: rounded(parsed) });
}
function addOdd(player, row) {
  if (!player || !row || num(row.line) == null || !row.book) return;
  const odd = { book: clean(row.book), market: clean(row.market) || "PLAYER PROP", line: rounded(row.line), price: row.price == null ? null : String(row.price) };
  if (!player.odds.some((item) => item.book === odd.book && item.market === odd.market && item.line === odd.line && item.price === odd.price)) player.odds.push(odd);
}

function payloadRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["projections", "players", "data", "results", "items"]) if (Array.isArray(payload && payload[key])) return payload[key];
  return payload && typeof payload === "object" ? Object.values(payload).filter((value) => value && typeof value === "object") : [];
}
function projectionValue(row) {
  return firstNum(row && row.fantasy_points, row && row.fantasyPoints, row && row.projected_points, row && row.projectedPoints,
    row && row.points, row && row.fpts, row && row.ppr, row && row.ppr_points, row && row.projection, row && row.value,
    row && row.stats && row.stats.fantasy_points);
}
function addFantasyPros(players, payload) {
  let count = 0;
  for (const row of payloadRows(payload)) {
    const raw = row && (row.player || row);
    const target = findPlayer(players, rowName(raw), rowTeam(raw));
    const value = projectionValue(row);
    if (target && value != null) { addProjection(target, "fantasypros", value, "FantasyPros"); count += 1; }
  }
  return count;
}
function decodeHTML(value) {
  return clean(String(value || "").replace(/&#39;|&#x27;/gi, "'").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&nbsp;/gi, " "));
}
function addFantasyProsHTML(players, html) {
  let count = 0;
  const rows = String(html || "").match(/<tr[^>]*class=["'][^"']*mpb-player-[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const nameMatch = row.match(/fp-player-name="([^"]+)"/i) || row.match(/fp-player-name='([^']+)'/i);
    if (!nameMatch) continue;
    const teamMatch = row.match(/class=["'][^"']*player-label[^"']*["'][^>]*>[\s\S]*?<\/a>\s*([A-Z]{2,3})\s*<\/td>/i);
    const sortValues = [...row.matchAll(/data-sort-value=["']([-+0-9.]+)["']/gi)].map((match) => num(match[1])).filter((value) => value != null);
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => clean(match[1].replace(/<[^>]+>/g, " "))).filter(Boolean);
    const value = sortValues.length ? sortValues[sortValues.length - 1] : num(cells[cells.length - 1]);
    const target = findPlayer(players, decodeHTML(nameMatch[1]), teamMatch && teamMatch[1]);
    if (target && value != null) { addProjection(target, "fantasypros", value, "FantasyPros public"); count += 1; }
  }
  return count;
}
async function addFantasyProsPublic(players, week) {
  let count = 0;
  const pages = ["qb", "rb", "wr", "te", "k", "dst"];
  for (const page of pages) {
    const result = await safeText("https://www.fantasypros.com/nfl/projections/" + page + ".php?week=" + encodeURIComponent(week));
    if (result.ok) count += addFantasyProsHTML(players, result.data);
  }
  return count;
}

function walkOdds(node, context, visitor, depth) {
  if (depth > 8 || node == null) return;
  if (Array.isArray(node)) { node.forEach((item) => walkOdds(item, context, visitor, (depth || 0) + 1)); return; }
  if (typeof node !== "object") return;
  const next = { ...(context || {}) };
  const book = node.bookmaker || node.book || node.bookmakerName || node.book_name || node.sportsbook || node.provider;
  const market = node.market || node.marketName || node.market_name || node.key || node.statType || node.stat_type || node.betType || node.bet_type;
  const name = node.playerName || node.player_name || node.statEntityName || node.stat_entity_name || node.participantName || node.participant_name || node.description;
  if (book) next.book = clean(typeof book === "object" ? book.title || book.name || book.displayName || book.id : book);
  if (market) next.market = clean(typeof market === "object" ? market.name || market.key || market.title : market);
  if (name && typeof name !== "object") next.name = clean(name);
  const line = firstNum(node.line, node.points, node.point, node.handicap, node.total, node.threshold, node.odd && node.odd.line, node.odds && node.odds.line);
  const price = node.price ?? node.americanOdds ?? node.american_odds ?? (node.odd && (node.odd.price ?? node.odd.odds)) ?? node.odds;
  if (next.name && line != null) visitor({ name: next.name, team: rowTeam(node), book: next.book, market: next.market, line, price });
  for (const [childKey, child] of Object.entries(node)) {
    if (child && typeof child === "object") walkOdds(child, next, visitor, (depth || 0) + 1);
  }
}
function addOdds(players, payload, fallbackMarket) {
  let count = 0;
  walkOdds(payload, {}, (row) => {
    const target = findPlayer(players, row.name, row.team);
    if (!target || !row.book) return;
    addOdd(target, { ...row, market: row.market || fallbackMarket });
    count += 1;
  }, 0);
  return count;
}

function readESPN() {
  const path = resolve(process.cwd(), "patriots-fantasy", "espn-data.json");
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch (_) { return null; }
}
function canonical(value, keyName = "") {
  if (Array.isArray(value)) return value.map(canonical);
  if (keyName === "generated_at" || keyName === "updated_at") return null;
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((out, key) => { out[key] = canonical(value[key], key); return out; }, {});
  return value;
}
function writeStable(output) {
  try {
    if (existsSync(outputPath)) {
      const previous = JSON.parse(readFileSync(outputPath, "utf8"));
      const previousComparable = { ...previous, generated_at: null };
      const nextComparable = { ...output, generated_at: null };
      if (JSON.stringify(canonical(previousComparable)) === JSON.stringify(canonical(nextComparable))) output.generated_at = previous.generated_at || generatedAt;
    }
  } catch (_) { /* A malformed prior artifact should be replaced. */ }
  writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n", "utf8");
}
function addESPN(players, data) {
  let count = 0;
  for (const team of [data && data.myTeam, data && data.opponent]) {
    for (const row of [...(team && team.starters || []), ...(team && team.bench || []), ...(team && team.players || [])]) {
      const target = findPlayer(players, row.name || row.full_name, row.team);
      const value = firstNum(row.projected, row.projectedPoints, row.projectedTotal);
      if (target && value != null) { addProjection(target, "espn", value, "ESPN Fantasy"); count += 1; }
    }
  }
  return count;
}

async function loadSleeper() {
  const base = "https://api.sleeper.app/v1";
  const results = await Promise.all([
    safeJSON(base + "/league/" + leagueId),
    safeJSON(base + "/league/" + leagueId + "/users"),
    safeJSON(base + "/league/" + leagueId + "/rosters"),
    safeJSON(base + "/state/nfl"),
    safeJSON(base + "/players/nfl")
  ]);
  const league = results[0], users = results[1], rosters = results[2], nflState = results[3], playersResult = results[4];
  if (!league.ok || !rosters.ok || !nflState.ok || !playersResult.ok) throw new Error([league, rosters, nflState, playersResult].find((item) => !item.ok).error);
  const week = Number(nflState.data.display_week || nflState.data.week || 1);
  const matchupsResult = await safeJSON(base + "/league/" + leagueId + "/matchups/" + week);
  const projectionsResult = await safeJSON(base + "/projections/nfl/" + season + "/" + week + "?season_type=regular");
  const usersList = Array.isArray(users.data) ? users.data : [];
  const rostersList = Array.isArray(rosters.data) ? rosters.data : [];
  const named = usersList.find((user) => clean(user && user.metadata && user.metadata.team_name).toLowerCase() === "the big senus");
  const wantedOwner = String(named && named.user_id || ownerId);
  const roster = rostersList.find((item) => String(item.owner_id) === wantedOwner) || rostersList[0];
  const matchups = Array.isArray(matchupsResult.data) ? matchupsResult.data : [];
  const matchup = matchups.find((item) => Number(item.roster_id) === Number(roster && roster.roster_id)) || {};
  const opponentMatchup = matchup.matchup_id ? matchups.find((item) => Number(item.matchup_id) === Number(matchup.matchup_id) && Number(item.roster_id) !== Number(matchup.roster_id)) : null;
  const opponentRoster = opponentMatchup && rostersList.find((item) => Number(item.roster_id) === Number(opponentMatchup.roster_id));
  const projectionRows = payloadRows(projectionsResult.ok ? projectionsResult.data : null);
  const projected = new Map();
  for (const row of projectionRows) {
    const id = String(row && (row.player_id || row.playerId || row.id) || "");
    const value = firstNum(row && row.pts_ppr, row && row.pts_half_ppr, row && row.pts_std, row && row.fantasy_points, row && row.projected_points);
    if (id && value != null) projected.set(id, value);
  }
  const nflPlayers = playersResult.data || {};
  const rowMap = new Map();
  for (const sourceRoster of [roster, opponentRoster]) {
    for (const id of (sourceRoster && sourceRoster.players || []).map(String)) {
      const raw = nflPlayers[id] || { player_id: id, full_name: id, team: "FA", position: "—" };
      const row = rowMap.get(id) || { id, name: rowName(raw) || id, team: rowTeam(raw), position: rowPosition(raw), projectionSources: [], odds: [] };
      rowMap.set(id, row);
      addProjection(row, "sleeper", projected.get(id) ?? firstNum(raw.projected, raw.projection), "Sleeper");
    }
  }
  return { week, rows: [...rowMap.values()] };
}

function finalRow(player) {
  const values = player.projectionSources.map((item) => num(item.value)).filter((value) => value != null);
  const value = median(values);
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;
  const range = min == null || max == null ? null : max - min;
  let outlier = null;
  if (value != null && values.length > 1) {
    const furthest = player.projectionSources.reduce((best, item) => {
      const delta = Math.abs(Number(item.value) - value);
      return !best || delta > best.delta ? { source: item.label || item.source, value: item.value, delta } : best;
    }, null);
    if (furthest && furthest.delta > 0) outlier = { source: furthest.source, value: rounded(furthest.value), delta: rounded(furthest.delta) };
  }
  const lines = player.odds.map((item) => num(item.line)).filter((value) => value != null);
  const oddsMin = lines.length ? Math.min(...lines) : null;
  const oddsMax = lines.length ? Math.max(...lines) : null;
  const books = [...new Set(player.odds.map((item) => item.book).filter(Boolean))];
  return {
    player_id: player.id, name: player.name, team: player.team, position: player.position,
    consensus: rounded(value), min: rounded(min), max: rounded(max), range: rounded(range),
    sourceCount: player.projectionSources.length, sources: player.projectionSources, outlier,
    odds: player.odds, market: oddsMin == null ? null : { min: rounded(oddsMin), max: rounded(oddsMax), range: rounded(oddsMax - oddsMin), books }
  };
}

async function main() {
  const sources = sourceRows();
  let sleeper;
  try { sleeper = await loadSleeper(); mark(sources, "sleeper", { count: sleeper.rows.length }); }
  catch (error) {
    console.error("Sleeper load failed: " + error.message);
    writeStable({ schema_version: 1, status: "unavailable", generated_at: generatedAt, season, week: null, source_catalog_count: CATALOG.length, odds_books: 0, sources, players: {}, insights: [], notes: ["Sleeper was unavailable; the browser will retry the direct feed.", "Provider credentials are never written to this file."] });
    return;
  }
  const players = sleeper.rows;
  const espnCount = addESPN(players, readESPN());
  if (espnCount) mark(sources, "espn", { count: espnCount });

  if (fpKey) {
    let count = 0;
    for (const position of ["QB", "RB", "WR", "TE", "K", "DST"]) {
      const result = await safeJSON("https://api.fantasypros.com/public/v2/json/nfl/" + season + "/projections?position=" + position + "&week=" + sleeper.week, { headers: { "x-api-key": fpKey, Authorization: "Bearer " + fpKey } });
      if (result.ok) count += addFantasyPros(players, result.data);
      else markError(sources, "fantasypros", result.error);
    }
    if (count) mark(sources, "fantasypros", { count });
    else if (!sources.find((source) => source.id === "fantasypros").error) markError(sources, "fantasypros", "No roster matches returned");
    if (!count) {
      const publicCount = await addFantasyProsPublic(players, sleeper.week);
      if (publicCount) mark(sources, "fantasypros", { count: publicCount, access: "public fallback" });
    }
  } else {
    const publicCount = await addFantasyProsPublic(players, sleeper.week);
    if (publicCount) mark(sources, "fantasypros", { count: publicCount, access: "public fallback" });
    else markError(sources, "fantasypros", "Public projection table unavailable; add FANTASYPROS_API_KEY for JSON access");
  }
  if (sgoKey) {
    const result = await safeJSON("https://api.sportsgameodds.com/v2/events?apiKey=" + encodeURIComponent(sgoKey) + "&leagueID=NFL&oddsAvailable=true&includeAltLines=true&limit=100", { headers: { "x-api-key": sgoKey } });
    if (result.ok) {
      const count = addOdds(players, result.data, "SportsGameOdds");
      if (count) mark(sources, "sports-game-odds", { count }); else markError(sources, "sports-game-odds", "No matched player props returned");
    } else markError(sources, "sports-game-odds", result.error);
  }
  if (oddsKey) {
    const markets = encodeURIComponent("player_pass_yds,player_pass_tds,player_rush_yds,player_reception_yds,player_receptions,player_anytime_td");
    const result = await safeJSON("https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=" + encodeURIComponent(oddsKey) + "&regions=us&markets=" + markets + "&oddsFormat=american", { headers: { "x-api-key": oddsKey } });
    if (result.ok) {
      const count = addOdds(players, result.data, "The Odds API");
      if (count) mark(sources, "the-odds-api", { count }); else markError(sources, "the-odds-api", "No matched player props returned");
    } else markError(sources, "the-odds-api", result.error);
  }

  const rows = players.map(finalRow);
  const insights = [];
  rows.filter((row) => row.outlier && row.outlier.delta > 0).sort((a, b) => b.outlier.delta - a.outlier.delta).slice(0, 12).forEach((row) => insights.push({ name: row.name, market: "PROJECTION OUTLIER", source: row.outlier.source, delta: row.outlier.delta, range: row.range }));
  rows.filter((row) => row.market && row.market.range > 0).sort((a, b) => b.market.range - a.market.range).slice(0, 12).forEach((row) => insights.push({ name: row.name, market: "ODDS LINE RANGE", source: row.market.books.join(" / "), delta: row.market.range, range: row.market.range }));
  insights.sort((a, b) => Number(b.delta || 0) - Number(a.delta || 0)).forEach((row, index) => { row.rank = String(index + 1).padStart(2, "0"); });
  const liveSources = sources.filter((source) => source.status === "live").length;
  const oddsBooks = new Set(rows.flatMap((row) => row.odds.map((odd) => odd.book))).size;
  const output = {
    schema_version: 1, status: fpKey || sgoKey || oddsKey ? "ready" : "partial", generated_at: generatedAt, season, week: sleeper.week,
    source_catalog_count: CATALOG.length, odds_books: oddsBooks, sources, players: Object.fromEntries(rows.map((row) => [row.player_id, row])), insights: insights.slice(0, 12),
    notes: ["Projection consensus is the median of enabled source values.", "Projection and odds ranges are max minus min; missing sources are excluded, not treated as zero.", fpKey || sgoKey || oddsKey ? "Provider keys were available; inspect source status and count for coverage." : "Add provider keys to GitHub Actions secrets to expand beyond the direct Sleeper/ESPN fallback.", "This file contains no provider credentials."]
  };
  writeStable(output);
  console.log("Consensus sync saved " + rows.length + " players, " + liveSources + "/" + CATALOG.length + " live sources, and " + oddsBooks + " odds books.");
}

main().catch((error) => { console.error("Consensus sync failed: " + (error && error.stack || error)); process.exitCode = 1; });

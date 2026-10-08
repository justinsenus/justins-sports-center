#!/usr/bin/env python3
"""Weekly NFL projection consensus. Python 3.10+.

Default: fetch real Sleeper PPR projections and upsert once.
--demo: exercise Sleeper, ESPN and 32 external fixtures; NEVER writes.
--dry-run: fetch real sources and print the aggregate without writing.

Optional environment:
  NFL_SEASON / NFL_WEEK: otherwise use Sleeper's current regular-season state.
  ESPN_LEAGUE_ID, ESPN_S2, ESPN_SWID: optional private ESPN league.
  EXTERNAL_SOURCES_JSON: array of HTTPS JSON/CSV/HTML feed configurations.
Each configuration requires name, url, season, week, scoring="PPR".
season and week accept "current" for automatic scheduling.
Optional keys: format, rows_path, fields, headers_env.
fields maps name/metric/status/notes to dotted source field paths.
URLs may contain {season} and {week}. headers_env names a JSON headers secret.
Only use feeds you are authorized to retrieve.
"""
import argparse
import base64
import html
import io
import json
import logging
import math
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit
from urllib.parse import urlencode

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from supabase import create_client

LOG = logging.getLogger("projections")
MAX_BYTES = 16 * 1024 * 1024
MAX_WEEKLY_POINTS = 100
ALIASES = {
    "name": ("display_name", "full_name", "player_name", "player", "name"),
    "metric": ("projected_fantasy_points", "projected_points", "fantasy_points",
               "projection", "projected", "fpts", "pts_ppr"),
    "status": ("injury_status", "injury_fallback", "injury", "status"),
    "notes": ("report_notes", "injury_notes", "notes", "report", "news"),
}
PRIORITY = {"UNKNOWN": 0, "ACTIVE": 1, "QUESTIONABLE": 2, "DOUBTFUL": 3,
            "SUSPENDED": 4, "PUP": 5, "IR": 6, "OUT": 7}


def text(value):
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return " ".join(text(item) for item in value)
    if isinstance(value, dict):
        return " ".join(text(item) for item in value.values())
    return re.sub(r"\s+", " ", html.unescape(
        re.sub(r"<[^>]*>", " ", str(value)))).strip()


def normalize_player_name(value):
    name = unicodedata.normalize("NFKD", text(value)).encode(
        "ascii", "ignore").decode()
    name = re.sub(r"(?:,?\s+(?:jr|sr|ii|iii|iv|v)\.?)+$",
                  "", name, flags=re.I)
    name = re.sub(r"[^a-zA-Z0-9\s]", "", name).lower()
    return re.sub(r"\s+", "_", name).strip("_")


def parse_injury(status, notes=""):
    tag = text(status).lower()
    known = {"active": "ACTIVE", "normal": "ACTIVE", "healthy": "ACTIVE",
             "q": "QUESTIONABLE", "questionable": "QUESTIONABLE",
             "d": "DOUBTFUL", "doubtful": "DOUBTFUL", "o": "OUT", "out": "OUT",
             "ir": "IR", "injured reserve": "IR", "pup": "PUP",
             "suspended": "SUSPENDED"}
    if tag in known:
        return known[tag]
    # Unrecognized tags also use notes; an absent tag never means ACTIVE.
    report = text(notes).lower().replace("’", "'")
    if re.search(r"\b(injured reserve|placed on ir)\b", report):
        return "IR"
    if re.search(r"\b(ruled out|will not play|won't play|inactive|"
                 r"not expected to play|unlikely to play)\b", report):
        return "OUT"
    report = re.sub(r"\bnot expected to start\b", "", report)
    if re.search(r"\b(expected to start|will play|cleared to play|"
                 r"expected to play|full participant)\b", report):
        return "ACTIVE"
    if re.search(r"\bdoubtful\b", report):
        return "DOUBTFUL"
    if re.search(r"\b(questionable|game[- ]time decision|limited participant)\b",
                 report):
        return "QUESTIONABLE"
    return "UNKNOWN"


def valid_metric(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(re.sub(r"\s*(?:pts?|points)\s*$", "",
                             str(value).strip(), flags=re.I).replace(",", ""))
    except (TypeError, ValueError):
        return None
    # Negative fantasy totals are valid; null, zero, NaN and infinity are not.
    return number if math.isfinite(number) and 0 < abs(number) <= MAX_WEEKLY_POINTS else None


def field_key(value):
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def path_get(value, path):
    if isinstance(value, dict) and path in value:
        return value[path]
    for part in str(path).split("."):
        if isinstance(value, dict):
            value = value.get(part)
        elif isinstance(value, list) and part.isdigit():
            value = value[int(part)] if int(part) < len(value) else None
        else:
            return None
    return value


def pick(row, kind, fields):
    if kind in fields:
        return path_get(row, fields[kind])
    indexed = {field_key(key): value for key, value in row.items()}
    for alias in ALIASES[kind]:
        if field_key(alias) in indexed:
            return indexed[field_key(alias)]
    return None


def observation(name, metric, status, notes, source):
    name = text(name)
    player_id, score = normalize_player_name(name), valid_metric(metric)
    if not player_id or score is None:
        return None
    return {"id": player_id, "display_name": name, "metric": score,
            "injury_fallback": parse_injury(status, notes), "source": source}


def walk_records(payload, fields=None):
    if isinstance(payload, list):
        for item in payload:
            yield from walk_records(item, fields)
    elif isinstance(payload, dict):
        fields = fields or {}
        if pick(payload, "name", fields) is not None and valid_metric(pick(payload, "metric", fields)) is not None:
            yield payload
        else:
            for item in payload.values():
                yield from walk_records(item, fields)


class StructuralHTML(HTMLParser):
    """Read semantic table cells and embedded JSON, independent of CSS classes."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self.documents = [], []
        self.table = self.row = self.cell = self.script = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "table":
            self.table = []
        elif tag == "tr" and self.table is not None:
            self.row = []
        elif tag in {"td", "th"} and self.row is not None:
            self.cell = []
        elif tag == "script" and (attrs.get("type") in
                {"application/json", "application/ld+json"} or
                attrs.get("id") == "__NEXT_DATA__"):
            self.script = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)
        if self.script is not None:
            self.script.append(data)

    def handle_endtag(self, tag):
        if tag in {"td", "th"} and self.cell is not None:
            self.row.append(text(" ".join(self.cell)))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == "table" and self.table is not None:
            self.tables.append(self.table)
            self.table = None
        elif tag == "script" and self.script is not None:
            try:
                self.documents.append(json.loads("".join(self.script)))
            except ValueError:
                pass
            self.script = None

    def records(self, fields):
        for table in self.tables:
            headers, last = None, None
            for cells in table:
                proposed = {cell: "" for cell in cells}
                if (pick(proposed, "name", fields) is not None and
                        pick(proposed, "metric", fields) is not None):
                    headers = cells
                    continue
                if headers and len(cells) == len(headers):
                    row = dict(zip(headers, cells))
                    if text(pick(row, "name", fields)):
                        if last is not None:
                            yield last
                        last = row
                elif headers and cells and last is not None:
                    last["report_notes"] = text(
                        [last.get("report_notes"), " ".join(cells)])
            if last is not None:
                yield last
        for document in self.documents:
            yield from walk_records(document, fields)


def session():
    client = requests.Session()
    retries = Retry(total=3, backoff_factor=1,
                    status_forcelist=(429, 500, 502, 503, 504),
                    allowed_methods={"GET"}, respect_retry_after_header=False)
    client.mount("https://", HTTPAdapter(max_retries=retries))
    client.headers["User-Agent"] = "FantasyProjectionConsensus/1.0"
    return client


def download(client, url, **kwargs):
    if urlsplit(url).scheme != "https":
        raise ValueError("Feeds must use HTTPS")
    with client.get(url, timeout=(5, 25), stream=True, **kwargs) as response:
        response.raise_for_status()
        chunks, size = [], 0
        for chunk in response.iter_content(65536):
            size += len(chunk)
            if size > MAX_BYTES:
                raise ValueError("Feed exceeds size limit")
            chunks.append(chunk)
        return b"".join(chunks).decode("utf-8-sig")


def sleeper_players(client):
    cache = Path(".cache/sleeper-players.json")
    if cache.exists() and time.time() - cache.stat().st_mtime < 86400:
        try:
            return json.loads(cache.read_text())
        except (OSError, ValueError):
            pass
    payload = json.loads(download(client, "https://api.sleeper.app/v1/players/nfl"))
    if not isinstance(payload, dict):
        raise ValueError("Sleeper player format changed")
    cache.parent.mkdir(parents=True, exist_ok=True)
    temporary = cache.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload), encoding="utf-8")
    temporary.replace(cache)
    return payload


def ingest_sleeper(payload, players, source="Sleeper"):
    rows = payload if isinstance(payload, list) else list(payload.values())
    for row in rows:
        if not isinstance(row, dict):
            continue
        player = players.get(str(row.get("player_id", "")), {})
        stats = row.get("stats") or row
        name = player.get("full_name") or text(
            [player.get("first_name"), player.get("last_name")])
        item = observation(name, stats.get("pts_ppr"),
                           player.get("injury_status"),
                           [player.get("injury_notes"), player.get("news")], source)
        if item:
            yield item


def ingest_espn(payload, season, week, source="ESPN"):
    for team in payload.get("teams", []):
        for entry in team.get("roster", {}).get("entries", []):
            player = entry.get("playerPoolEntry", {}).get("player", {})
            for stats in player.get("stats", []):
                if (int(stats.get("statSourceId", -1)) == 1 and
                        int(stats.get("scoringPeriodId", -1)) == week and
                        int(stats.get("seasonId", season)) == season):
                    item = observation(player.get("fullName"), stats.get("appliedTotal"),
                                       entry.get("injuryStatus") or player.get("injuryStatus"),
                                       [entry.get("injuryNotes"), player.get("injuryNotes"), player.get("news")],
                                       source)
                    if item:
                        yield item


def external_feed(client, spec, season, week):
    source_season = season if spec["season"] == "current" else int(spec["season"])
    source_week = week if spec["week"] == "current" else int(spec["week"])
    if (source_season != season or source_week != week or
            str(spec["scoring"]).upper() != "PPR"):
        raise ValueError("Feed week, season or scoring does not match")
    name = text(spec["name"])
    if not name or name.casefold() in {"sleeper", "espn"}:
        raise ValueError("External feed requires a distinct source name")
    fields = spec.get("fields", {})
    headers = json.loads(os.environ[spec["headers_env"]]) if spec.get("headers_env") else {}
    raw = download(client, str(spec["url"]).format(season=season, week=week),
                   headers=headers)
    kind = spec.get("format", "json").lower()
    if kind == "csv":
        rows = pd.read_csv(io.StringIO(raw), dtype=str,
                           keep_default_na=False).to_dict("records")
    elif kind == "html":
        parser = StructuralHTML()
        parser.feed(raw)
        rows = parser.records(fields)
    elif kind == "json":
        payload = json.loads(raw)
        rows = walk_records(path_get(payload, spec["rows_path"])
                            if spec.get("rows_path") else payload, fields)
    else:
        raise ValueError("Supported feed formats: json, csv, html")
    output = []
    for row in rows:
        if row.get("week") is not None and int(row["week"]) != week:
            continue
        if row.get("season") is not None and int(row["season"]) != season:
            continue
        if row.get("scoring") and str(row["scoring"]).upper() != "PPR":
            continue
        item = observation(pick(row, "name", fields), pick(row, "metric", fields),
                           pick(row, "status", fields),
                           [pick(row, "notes", fields), row.get("report_notes")], name)
        if item:
            output.append(item)
    if not output:
        raise ValueError("No valid projection records; feed structure may have changed")
    return output


def ingest_consensus_artifact(path, season, week, existing_sources):
    """Reuse distinct, current provider observations from the site's feed job."""
    if not path:
        return []
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    checked = datetime.fromisoformat(payload["generated_at"].replace("Z", "+00:00"))
    if (int(payload["season"]) != season or int(payload["week"]) != week or
            payload.get("scoring") != "PPR" or
            not -60 <= (datetime.now(timezone.utc) - checked).total_seconds() <= 1800):
        raise ValueError("Consensus artifact is stale or represents another period")
    output = []
    for row in payload.get("players", {}).values():
        for provider in row.get("sources", []):
            source = text(provider.get("source")).casefold()
            if (not source or source.startswith("simulated") or source in existing_sources or
                    int(provider.get("season", 0)) != season or
                    int(provider.get("week", 0)) != week or
                    provider.get("scoring") != "PPR"):
                continue
            item = observation(row.get("name"), provider.get("value"),
                               row.get("injury_status"), row.get("report_notes"), source)
            if item:
                output.append(item)
    return output


def collect_live(client, context=None):
    state = json.loads(download(client, "https://api.sleeper.app/v1/state/nfl"))
    season = int(os.getenv("NFL_SEASON") or state["season"])
    week = int(os.getenv("NFL_WEEK") or state.get("display_week") or state["week"])
    if not 1 <= week <= 18:
        raise ValueError("NFL_WEEK must be a regular-season week from 1 to 18")
    if not os.getenv("NFL_WEEK") and state.get("season_type") != "regular":
        raise ValueError("Set NFL_SEASON and NFL_WEEK outside the regular season")
    if context is not None:
        context.update(season=season, week=week, scoring="PPR")
    rows = []
    try:
        players = sleeper_players(client)
        payload = json.loads(download(client,
            f"https://api.sleeper.com/projections/nfl/{season}/{week}?season_type=regular"))
        rows.extend(ingest_sleeper(payload, players))
    except Exception as error:
        LOG.warning("Sleeper unavailable (%s); continuing other feeds", type(error).__name__)

    league = os.getenv("ESPN_LEAGUE_ID", "").strip()
    if league:
        try:
            # Private-league cookies stay in the runner, never in index.html.
            cookies = {cookie: os.environ[variable]
                       for cookie, variable in (("espn_s2", "ESPN_S2"),
                                                ("SWID", "ESPN_SWID"))
                       if os.getenv(variable)}
            url = (f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/"
                   f"seasons/{season}/segments/0/leagues/{league}"
                   f"?view=mRoster&view=mSettings&scoringPeriodId={week}")
            payload = json.loads(download(client, url, cookies=cookies))
            # appliedTotal follows league rules. Accept only standard offensive PPR.
            scoring = {int(item["statId"]): float(item["points"])
                       for item in payload["settings"]["scoringSettings"]["scoringItems"]}
            required = {3: .04, 4: 4, 19: -2, 24: .1, 25: 6,
                        42: .1, 43: 6, 53: 1, 72: -2}
            if any(not math.isclose(scoring.get(key, 0), value)
                   for key, value in required.items()):
                raise ValueError("ESPN league scoring differs from standard PPR")
            # ESPN kicker/defense league rules can differ, so exclude them.
            for team in payload.get("teams", []):
                team["roster"]["entries"] = [
                    entry for entry in team.get("roster", {}).get("entries", [])
                    if entry.get("playerPoolEntry", {}).get("player", {}).get(
                        "defaultPositionId") in {1, 2, 3, 4}]
            rows.extend(ingest_espn(payload, season, week))
        except Exception as error:
            LOG.warning("ESPN unavailable (%s); continuing other feeds", type(error).__name__)

    specs = json.loads(os.getenv("EXTERNAL_SOURCES_JSON", "[]") or "[]")
    if not isinstance(specs, list):
        raise ValueError("EXTERNAL_SOURCES_JSON must be an array")
    seen, pending = set(), []
    for index, spec in enumerate(specs, 1):
        try:
            identity = text(spec["name"]).casefold()
            if identity in seen:
                raise ValueError("Duplicate source configuration")
            seen.add(identity)
            pending.append((index, spec))
        except Exception as error:
            LOG.warning("External feed %d unavailable (%s)", index, type(error).__name__)
    def fetch_one(spec):
        with session() as feed_client:
            return external_feed(feed_client, spec, season, week)

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [(index, pool.submit(fetch_one, spec)) for index, spec in pending]
        for index, future in futures:
            try:
                rows.extend(future.result())
            except Exception as error:
                LOG.warning("External feed %d unavailable (%s)", index, type(error).__name__)
    try:
        rows.extend(ingest_consensus_artifact(
            os.getenv("CONSENSUS_ARTIFACT"), season, week,
            {row["source"].casefold() for row in rows}))
    except Exception as error:
        LOG.warning("Consensus artifact unavailable (%s); using direct feeds", type(error).__name__)
    return rows


def demo_observations():
    # All 34 sources below are deterministic fixtures, not live websites.
    players = {
        "1": {"full_name": "Chuba Hubbard Jr.", "injury_status": "Not published",
              "injury_notes": "Expected to start"},
        "2": {"full_name": "Amon-Ra St. Brown", "injury_status": "",
              "news": "Will play"},
    }
    sleeper = [
        {"player_id": "1", "stats": {"pts_ppr": 14.2}},
        {"player_id": "2", "stats": {"pts_ppr": 18.1}},
        {"player_id": "1", "stats": {"pts_ppr": 0}},
    ]
    result = list(ingest_sleeper(sleeper, players, "SIMULATED Sleeper"))
    espn = {"teams": [{"roster": {"entries": [
        {"playerPoolEntry": {"player": {
            "fullName": "Chuba Hubbard", "injuryStatus": "Not published",
            "injuryNotes": "Will play", "stats": [
                {"statSourceId": 1, "scoringPeriodId": 1,
                 "seasonId": 2026, "appliedTotal": 15.0}]}}},
        {"playerPoolEntry": {"player": {
            "fullName": "Amon-Ra St. Brown", "injuryStatus": "QUESTIONABLE",
            "stats": [{"statSourceId": 1, "scoringPeriodId": 1,
                       "seasonId": 2026, "appliedTotal": ""}]}}},
    ]}}]}
    result.extend(ingest_espn(espn, 2026, 1, "SIMULATED ESPN"))
    external_sites = [
        {"name": f"SIMULATED external {index:02d}", "records": [
            {"player": "Chuba Hubbard", "projection": 13.5 + index / 10,
             "status": "", "notes": "Expected to start"},
            {"player": "Amon-Ra St. Brown", "projection": 17 + index / 10,
             "status": "Not published", "notes": "Will play"},
            {"player": "Invalid Metric", "projection": [None, "", 0, "NaN"][index % 4]},
        ]} for index in range(1, 33)
    ]
    for site in external_sites:
        for row in site["records"]:
            item = observation(row["player"], row["projection"],
                               row.get("status"), row.get("notes"), site["name"])
            if item:
                result.append(item)
    return result


def aggregate(rows):
    if not rows:
        raise ValueError("No valid live projections; existing database rows remain dated")
    frame = pd.DataFrame(rows)
    frame["metric"] = pd.to_numeric(frame["metric"], errors="coerce")
    frame = frame[frame["metric"].map(
        lambda value: pd.notna(value) and math.isfinite(value) and value != 0)].copy()
    # A provider contributes once per player, regardless of duplicate records.
    frame["source"] = frame["source"].str.casefold()
    frame = frame.drop_duplicates(["id", "source"], keep="last")
    stamp = datetime.now(timezone.utc).isoformat()
    output = []
    for player_id, group in frame.groupby("id", sort=True):
        output.append({
            "id": player_id,
            "display_name": group.iloc[0]["display_name"],
            "calculated_average": round(float(group["metric"].mean()), 4),
            "injury_fallback": max(group["injury_fallback"], key=PRIORITY.get),
            "sources_counted": int(group["source"].nunique()),
            "updated_at": stamp,
        })
    if not output:
        raise ValueError("All projection records were invalid")
    return output


def write_via_github_oidc(client, endpoint, rows, context, observations):
    """Authenticate this exact main-branch workflow without exporting an admin key."""
    expected = "https://nphrdqabpyaabsrahkja.supabase.co/functions/v1/projection-ingest"
    if endpoint != expected:
        raise ValueError("Unexpected projection ingestion endpoint")
    token_url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    request_token = os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]
    separator = "&" if "?" in token_url else "?"
    response = client.get(token_url + separator + urlencode({"audience": endpoint}),
                          headers={"Authorization": "Bearer " + request_token},
                          timeout=(5, 20))
    response.raise_for_status()
    token = response.json()["value"]
    # The token stays in memory. It is never printed, committed, or persisted.
    response = client.post(endpoint, headers={"Authorization": "Bearer " + token},
                           json={"rows": rows, "context": context,
                                 "sources": sorted({r["source"].casefold() for r in observations})},
                           timeout=(5, 60))
    response.raise_for_status()
    if response.json().get("players_count") != len(rows):
        raise ValueError("Cloud did not confirm the entire projection batch")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logging.getLogger("urllib3.connectionpool").setLevel(logging.ERROR)
    try:
        url, key = os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_KEY", "")
        endpoint = os.getenv("PROJECTION_INGEST_URL", "")
        if not (args.demo or args.dry_run or endpoint):
            if urlsplit(url).scheme != "https" or not key:
                raise ValueError("Set SUPABASE_URL and a server SUPABASE_KEY")
            if key.startswith("sb_publishable_"):
                raise ValueError("SUPABASE_KEY must be a secret/service-role key")
            if key.count(".") == 2:
                claim = json.loads(base64.urlsafe_b64decode(
                    key.split(".")[1] + "==="))
                if claim.get("role") != "service_role":
                    raise ValueError("Use a service-role key for the runner")
        context = {}
        with session() as client:
            observations = demo_observations() if args.demo else collect_live(client, context)
            rows = aggregate(observations)
        if args.demo or args.dry_run:
            print(json.dumps({"mode": "SIMULATED" if args.demo else "LIVE DRY RUN",
                              "players": rows}, indent=2, allow_nan=False))
            return 0
        if endpoint:
            with session() as client:
                write_via_github_oidc(client, endpoint, rows, context, observations)
        else:
            # One bulk write; primary-key conflict updates existing rows atomically.
            create_client(url, key).table("player_stats").upsert(
                rows, on_conflict="id", returning="minimal").execute()
        LOG.info("Upserted %d players from %d real sources", len(rows),
                 len({row["source"].casefold() for row in observations}))
        return 0
    except Exception as error:
        # Provider exceptions may contain cookie/API-key URLs; never log them.
        LOG.error("Run failed (%s). Check configuration and source health.",
                  type(error).__name__)
        return 1


if __name__ == "__main__":
    sys.exit(main())

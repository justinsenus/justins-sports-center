# Fantasy Matchup Center

This is the touch-first fantasy-only version for the monitor and phone layouts.

## Live data model

The browser reads the direct Sleeper feed and the sanitized consensus-data.json
artifact. GitHub Actions refreshes that artifact every five minutes. The page
refreshes direct roster, score, and matchup data about every 20 seconds while it
is open.

For each roster player the artifact keeps:

- the median projection across enabled sources;
- the minimum, maximum, and max-minus-min projection range;
- the source value furthest from the median;
- matched player-prop lines, sportsbook names, and their max-minus-min line range.

The source catalog has 30 named sources, but the dashboard only counts a source
as live after that source actually responds. It does not pretend to scrape
subscription pages or fill missing values with zeroes.

## Optional private Actions secrets

Add these in the repository's GitHub Actions settings. Never put them in this
repository or in the page URL.

~~~text
FANTASYPROS_API_KEY
SPORTSGAMEODDS_API_KEY
THE_ODDS_API_KEY
~~~

Existing private ESPN sync continues to use ESPN_S2 and ESPN_SWID.
Without provider keys, the page remains usable and labels itself as a direct
feed fallback with odds range pending. With provider keys, the source count,
consensus median, biggest differences, and sportsbook ranges populate in the
artifact.

The provider workflow intentionally commits only normalized player data, not
credentials or raw private responses.

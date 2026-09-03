# Patriots + Fantasy Live

Jeep/Chrome-friendly dark dashboard route for the 2026 season.

- Patriots live score and game center: public ESPN NFL scoreboard/summary feeds.
- Sleeper team: **The Big Senus** in league `1387635903379300352`.
- ESPN team label: **Gumby's Big D** in league `919590140`.
- Sleeper matchup rosters now render side by side, with Sleeper CDN player photos and ESPN headshot fallbacks.
- ESPN tries the public league feed first. Before kickoff it shows player and team projections; once games are live/final it switches to fantasy points.
- Injury strips show status, practice notes, source chips, and a green median play-probability estimate from available Sleeper practice plus ESPN/NFL injury-news signals.
- No passwords, cookies, or private credentials are stored in the repository.
- Sleeper player metadata is cached locally so the large player map is not downloaded every refresh.

## ESPN private sync

The repository includes a GitHub Actions workflow named **ESPN private fantasy sync**. It runs on demand and every five minutes, reads the authenticated ESPN response on GitHub's server, and commits only the roster/matchup snapshot to `espn-data.json`. The public page never receives the ESPN cookie.

To turn it on:

1. Open this repository's **Settings → Secrets and variables → Actions**.
2. Add repository secrets named `ESPN_S2` and `ESPN_SWID` from your own signed-in ESPN session. These are session values, not your ESPN password; never paste either value into chat or into a file.
3. Open **Actions → ESPN private fantasy sync → Run workflow** once. Later runs are scheduled automatically every five minutes.

If either secret expires, replace it with a fresh value from ESPN and run the workflow again. The dashboard shows a secure-sync placeholder until the first successful run publishes data. If the league is made public by its owner, the public ESPN fallback can populate the panel without these secrets.

Open the route at `/patriots-fantasy/` after the GitHub Pages deployment is updated.

The separate full-screen monitor layout is at `/patriots-fantasy-monitor/`.

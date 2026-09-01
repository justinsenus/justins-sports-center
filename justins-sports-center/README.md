# Justin's Sports Center

A custom dark sports dashboard built for a 1920×1080 ViewSonic VX2458 monitor.

## What it does
- Prioritizes the Boston Red Sox and New England Patriots
- Shows MLB games from yesterday, today, and tomorrow
- Shows live games, completed games, and upcoming games
- Shows the current NFL scoreboard window
- Highlights favorite teams
- Attempts to show the next Red Sox pitching matchup when probable-pitcher data is available
- Pulls MLB, NFL, Red Sox, and Patriots news
- Updates automatically every 30 seconds
- Includes Justin's uploaded logo in white

## Important
This is a static dashboard that fetches data in the browser. It needs an internet connection.

The data endpoints used are ESPN's public-facing web API endpoints. They are not a formal commercial API contract, so endpoint structures can occasionally change.

## Best Chromebook setup

### Option A: Host it for free on GitHub Pages
1. Create a GitHub account if needed.
2. Create a new repository called `justins-sports-center`.
3. Upload all files from this folder.
4. In the repository, go to Settings → Pages.
5. Choose `Deploy from a branch`, select `main`, and select `/ (root)`.
6. Open the GitHub Pages URL on the Chromebook.
7. Press F11 / use Chrome fullscreen.

### Option B: Open index.html directly
You can try opening `index.html` directly in Chrome. If the browser blocks data requests from a local file, use GitHub Pages instead.

## Dashboard controls
Use the YESTERDAY / TODAY / NEXT buttons in the MLB panel to switch the MLB schedule window.

## Recommended Chromebook settings
- Keep the Chromebook plugged in.
- Set display sleep as long as you are comfortable with.
- Use the external ViewSonic monitor as the main display.
- Open the dashboard in fullscreen.
- Bookmark the dashboard so it is always one click away.


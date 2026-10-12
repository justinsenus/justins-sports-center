# Paired fantasy command center

`/tv/` is the presentation display for Samsung. `/touch/` is the HP or iPad controller. The existing fantasy routes use the layout from before the professional.css redesign.

1. Open `/tv/` on the television.
2. Open `/touch/` on the HP or iPad.
3. Enter the TV's eight-character code. Keep both screens open.
4. Touch a player, league, matchup, Stock Board, or Patriots control. Use Close Player to dismiss detail on both screens. Swipe the workspace horizontally to switch panels.

The TV keeps its own provider refresh running when a controller disconnects. The session remembers the current league, player, game, matchup, and panel. Reconnecting or refreshing restores that selection. TV and controller connection status is separate from provider feed status.

## Additional LED TV

`/tv-led/` is the second display design: self-hosted dot-matrix lettering,
blue LED panel borders, the existing mascot, full rosters, matchup and league
plots, injury reports, scoring events, fantasy totals, and current NFL scores.
The controller footer links to both designs.

To add a second television to the same controller, open `/tv-led/`, choose
**Pair**, and enter the code shown on the existing TV or controller under
**Add to an existing TV**. All TVs in that room receive the same league,
player, tab, matchup, and chart-range selections. The original and LED routes
also reuse the same pairing when opened in the same browser. Provider data
continues to refresh independently on each display.

The LED font needs no third-party font service. Its original glyph source is
`scripts/build-led-font.py`; regenerate with `python3 scripts/build-led-font.py`
after installing `fonttools`. The generated font and glyph designs use CC0.

## Realtime service

The `fantasy-remote` Supabase Edge Function handles creating, joining, resuming, and commanding rooms. It authenticates existing rooms with a random 256-bit capability. The pairing code permits joining; create/join operations are rate limited. Room state is committed with a monotonically increasing revision and then sent over Supabase Realtime Broadcast. Browsers use a small native WebSocket implementation of the documented 1.0.0 protocol. They send selections, acknowledgements, and heartbeats, not video.

Only the public publishable key is included in `config.js`. Database tables and RPCs are restricted to `service_role`; that credential stays in the Edge Function runtime. Channel names are random, and room secrets are saved only in the paired browser's local storage. Rooms expire after seven days without a command. New pairing code rotates the room. The controller's Forget Pairing removes the saved capability from that device.

Scores are fetched from the existing provider engine. Realtime navigation does not repair an unavailable ESPN/Sleeper feed or change scoring rules. The TV shows a feed warning and avoids displaying zero totals as available scores when the selected provider is disconnected.

Run `node remote/tests/remote.test.mjs` to check room authentication, validation, command ordering, silent remote updates, matchup selection, player open/close, and player data refresh. Live verification also requires two browser tabs to confirm WebSocket delivery and reconnection.

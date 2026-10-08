(() => {
  "use strict";
  const config = window.FANTASY_REMOTE_CONFIG;
  const normalize = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/(?:,?\s+(?:jr|sr|ii|iii|iv|v)\.?)+$/gi, "")
    .replace(/[^a-zA-Z0-9\s]/g, "").trim().toLowerCase().replace(/\s+/g, "_");
  const valid = row => row && typeof row.id === "string" && typeof row.display_name === "string" &&
    typeof row.calculated_average === "number" && Number.isFinite(row.calculated_average) &&
    Number.isInteger(row.sources_counted) && row.sources_counted > 0;
  const state = { rows: new Map(), feed: null, checkedAt: 0, requestedAt: 0, error: "", pending: null };
  const client = config && window.supabase ? window.supabase.createClient(config.url, config.key,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;

  function isFresh(feed = state.feed) {
    const age = Date.now() - Date.parse(feed?.updated_at);
    return feed?.scoring === "PPR" && Number.isFinite(age) && age >= -60000 && age < 6 * 3600000;
  }
  function snapshot() {
    return { feed: state.feed, rows: state.rows.size, checkedAt: state.checkedAt,
             fresh: isFresh(), error: state.error };
  }
  async function refresh(force = false) {
    if (state.pending) return state.pending;
    if (!force && Date.now() - state.requestedAt < 60000) return snapshot();
    state.requestedAt = Date.now();
    if (!client) { state.error = "Cloud SDK unavailable"; return snapshot(); }
    state.pending = (async () => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
      try {
        const before = await client.from("projection_feed_state").select("*").eq("id", "latest").maybeSingle().abortSignal(controller.signal);
        if (before.error) throw before.error;
        if (!before.data) throw new Error("No cloud projection batch yet");
        const rows = [];
        for (let offset = 0; offset < 5000; offset += 1000) {
          const result = await client.from("player_stats")
            .select("id,display_name,calculated_average,injury_fallback,sources_counted,updated_at")
            .order("calculated_average", { ascending: false }).order("id", { ascending: true })
            .range(offset, offset + 999).abortSignal(controller.signal);
          if (result.error) throw result.error;
          rows.push(...result.data); if (result.data.length < 1000) break;
        }
        const after = await client.from("projection_feed_state").select("updated_at").eq("id", "latest").single().abortSignal(controller.signal);
        if (after.error || after.data.updated_at !== before.data.updated_at) throw new Error("Projection batch changed; retry next check");
        const stamp = Date.parse(before.data.updated_at);
        const batch = rows.filter(row => valid(row) && Date.parse(row.updated_at) === stamp);
        if (batch.length !== before.data.players_count) throw new Error("Incomplete cloud projection batch");
        state.rows = new Map(batch.map(row => [row.id, row]));
        state.feed = before.data; state.checkedAt = Date.now(); state.error = "";
      } catch {
        state.error = "Cloud projections unavailable; direct provider feed retained";
      } finally { clearTimeout(timer); }
      return snapshot();
    })();
    try { return await state.pending; } finally { state.pending = null; }
  }
  function get(player, context) {
    if (!isFresh() || Number(context?.season) !== state.feed.season || Number(context?.week) !== state.feed.week) return null;
    return state.rows.get(normalize(player?.full_name || player?.name)) || null;
  }
  window.FantasyProjectionCloud = { refresh, get, snapshot, normalize };
})();

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

// This endpoint accepts only GitHub-issued tokens for this repository's
// main-branch projection workflow. Its database write key stays in Supabase.
const REPOSITORY = "justinsenus/justins-sports-center";
const WORKFLOW = `${REPOSITORY}/.github/workflows/run_scraper.yml@refs/heads/main`;
const AUDIENCE = "https://nphrdqabpyaabsrahkja.supabase.co/functions/v1/projection-ingest";
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const STATUSES = new Set(["ACTIVE", "QUESTIONABLE", "DOUBTFUL", "OUT", "IR", "PUP", "SUSPENDED", "UNKNOWN"]);

function reply(status: number, body: object) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handler(request: Request): Promise<Response> {
  if (request.method === "GET") {
    return reply(200, { service: "projection-ingest", authorization: "GitHub OIDC", repository: REPOSITORY });
  }
  if (request.method !== "POST") return reply(405, { error: "POST required" });
  const token = request.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token) return reply(401, { error: "GitHub workflow authentication required" });
  let claims;
  try {
    const verified = await jwtVerify(token, JWKS, {
      issuer: "https://token.actions.githubusercontent.com", audience: AUDIENCE,
      algorithms: ["RS256"], maxTokenAge: "10m", clockTolerance: 10,
      requiredClaims: ["exp", "iat", "nbf", "sub", "repository_id", "repository_owner_id", "workflow_ref", "ref", "event_name"]
    });
    claims = verified.payload;
    if (claims.repository !== REPOSITORY || claims.repository_id !== "1353084249" ||
        claims.repository_owner_id !== "323418857" || claims.ref !== "refs/heads/main" ||
        claims.workflow_ref !== WORKFLOW ||
        !["push", "schedule", "workflow_dispatch"].includes(String(claims.event_name))) {
      return reply(403, { error: "Workflow is not authorized for this database" });
    }
  } catch {
    return reply(401, { error: "Invalid or expired workflow identity" });
  }
  try {
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
      return reply(415, { error: "JSON required" });
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 2 * 1024 * 1024) {
      return reply(413, { error: "Projection batch exceeds limit" });
    }
    const body = JSON.parse(raw);
    const { season, week, scoring } = body.context || {};
    if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 18 || scoring !== "PPR" ||
        !Array.isArray(body.rows) || !body.rows.length || body.rows.length > 4000 ||
        !Array.isArray(body.sources) || !body.sources.length || body.sources.length > 1000 ||
        body.sources.some((source: unknown) => typeof source !== "string" || !source || source.length > 120 || /^simulated/i.test(source))) {
      return reply(422, { error: "Invalid projection context or sources" });
    }
    const stateResponse = await fetch("https://api.sleeper.app/v1/state/nfl", { signal: AbortSignal.timeout(10000) });
    if (!stateResponse.ok) return reply(503, { error: "Cannot verify NFL scoring period" });
    const state = await stateResponse.json();
    if (Number(state.season) !== season || Number(state.display_week || state.week) !== week || state.season_type !== "regular") {
      return reply(409, { error: "Projection batch does not match the current NFL week" });
    }
    const ids = new Set<string>();
    const rows = body.rows.map((row: Record<string, unknown>) => {
      if (typeof row?.id !== "string" || !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(row.id) || row.id.length > 160 || ids.has(row.id) ||
          typeof row.display_name !== "string" || !row.display_name.trim() || row.display_name.length > 200 ||
          typeof row.calculated_average !== "number" || !Number.isFinite(row.calculated_average) ||
          Math.abs(row.calculated_average) > 100 ||
          typeof row.sources_counted !== "number" || !Number.isInteger(row.sources_counted) ||
          row.sources_counted < 1 || row.sources_counted > body.sources.length ||
          !STATUSES.has(String(row.injury_fallback))) throw new Error("Invalid row");
      ids.add(row.id);
      return { id: row.id, display_name: row.display_name, calculated_average: row.calculated_average,
               injury_fallback: row.injury_fallback, sources_counted: row.sources_counted };
    });
    const url = Deno.env.get("SUPABASE_URL");
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const key = keys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return reply(503, { error: "Cloud writer is not configured" });
    const database = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await database.rpc("apply_projection_batch", {
      p_rows: rows, p_season: season, p_week: week,
      p_sources: [...new Set(body.sources)], p_run: `${claims.run_id}:${claims.run_attempt}`
    });
    if (error || data !== rows.length) return reply(503, { error: "Projection batch could not be committed" });
    return reply(200, { players_count: data, season, week, scoring });
  } catch {
    return reply(422, { error: "Invalid projection batch" });
  }
}

Deno.serve(handler);

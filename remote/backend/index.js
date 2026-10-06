// The room capability is custom authentication; service credentials stay here.
const ALLOWED = new Set(['https://justinsenus.github.io', 'https://justinscoreboard.com', 'https://www.justinscoreboard.com']);
const VIEWS = new Set(['overview', 'matchups', 'players', 'injuries', 'live', 'stock', 'league', 'patriots', 'games']);
export function validatePatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose a scoreboard control.');
  const patch = {};
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (key === 'league' && ['sleeper', 'espn'].includes(v)) patch[key] = v;
    else if (key === 'view' && VIEWS.has(v)) patch[key] = v;
    else if (['playerId', 'matchupId', 'gameId'].includes(key) && (v === null || typeof v === 'string' && /^[\w:.-]{1,80}$/.test(v))) patch[key] = v;
    else if (key === 'playerFilter' && ['all', 'starters', 'bench', 'own', 'opponent', 'live'].includes(v)) patch[key] = v;
    else if (key === 'refresh' && v === true) patch[key] = true;
    else throw new Error('Unsupported scoreboard control.');
  }
  if (!Object.keys(patch).length) throw new Error('Choose a scoreboard control.');
  return patch;
}
const random = (length) => Array.from(crypto.getRandomValues(new Uint8Array(length)), n => n.toString(16).padStart(2, '0')).join('');
const pairCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), n => alphabet[n % alphabet.length]).join('');
};
const publicRoom = (r) => ({id:r.id, code:r.pair_code, token:r.control_token, topic:r.topic, state:r.state, revision:Number(r.revision)});
export function makeHandler(env, request = fetch) {
  const url = env('SUPABASE_URL');
  const secret = env('SUPABASE_SERVICE_ROLE_KEY');
  const db = async (path, body, method = 'POST') => {
    const response = await request(url + '/rest/v1/' + path, {method,
      headers:{'Authorization':'Bearer ' + secret, 'apikey':secret, 'Content-Type':'application/json', 'Prefer':'return=representation'},
      ...(body === undefined ? {} : {body:JSON.stringify(body)})});
    if (!response.ok) throw new Error('The session service is temporarily unavailable.');
    return response.status === 204 ? null : response.json();
  };
  return async (req) => {
    const origin = req.headers.get('origin');
    const headers = {'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
      'Access-Control-Allow-Origin':origin && ALLOWED.has(origin) ? origin : 'https://justinsenus.github.io',
      'Access-Control-Allow-Headers':'content-type, apikey', 'Access-Control-Allow-Methods':'POST, OPTIONS'};
    const reply = (body, status = 200) => new Response(JSON.stringify(body), {status,headers});
    if (origin && !ALLOWED.has(origin)) return reply({error:'Open this controller from Justin’s scoreboard site.'},403);
    if (req.method === 'OPTIONS') return new Response(null, {status:204,headers});
    if (req.method !== 'POST') return reply({error:'Use a scoreboard control.'},405);
    try {
      const text = await req.text();
      if (text.length > 2400) return reply({error:'Command is too large.'},413);
      const body = JSON.parse(text);
      if (!body || typeof body !== 'object') return reply({error:'Invalid command.'},400);
      const action = body.action;
      if (action === 'create' || action === 'join') {
        const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + ':fcc-remote'));
        const hash = Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2,'0')).join('');
        const limited = await db('rpc/fcc_remote_limit', {p_key:action+':'+hash,p_bucket:Math.floor(Date.now()/(action==='create'?3600000:300000)),p_limit:action==='create'?20:30});
        if (!limited) return reply({error:'Too many pairing attempts. Wait a few minutes and try again.'},429);
      }
      if (action === 'create') {
        // Remove only expired, temporary room records.
        await db('fcc_remote_rooms?expires_at=lt.'+encodeURIComponent(new Date().toISOString()), undefined, 'DELETE');
        const rows = await db('fcc_remote_rooms', {pair_code:pairCode(),control_token:random(32),topic:'fcc-'+random(32)});
        return reply(publicRoom(rows[0]));
      }
      if (action === 'join') {
        const code = String(body.code || '').replace(/[^a-z0-9]/gi,'').toUpperCase();
        if (!/^[A-Z2-9]{8}$/.test(code)) return reply({error:'Enter the 8-character code shown on your TV.'},400);
        const rows = await db('fcc_remote_rooms?pair_code=eq.'+code+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString()),undefined,'GET');
        if (!rows.length) return reply({error:'Code not found or expired. Check the TV code and try again.'},404);
        return reply(publicRoom(rows[0]));
      }
      if (!/^[a-f0-9-]{36}$/.test(body.id || '') || !/^[a-f0-9]{64}$/.test(body.token || '')) return reply({error:'Pair this screen with your TV first.'},401);
      if (action === 'resume') {
        const rows = await db('fcc_remote_rooms?id=eq.'+body.id+'&control_token=eq.'+body.token+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString()),undefined,'GET');
        if (!rows.length) return reply({error:'This pairing has expired. Pair again with the TV code.'},401);
        return reply(publicRoom(rows[0]));
      }
      if (action === 'command') {
        const patch = validatePatch(body.patch);
        return reply(await db('rpc/fcc_remote_command',{p_id:body.id,p_token:body.token,p_patch:patch}));
      }
      return reply({error:'Unsupported session action.'},400);
    } catch (error) {
      return reply({error:error instanceof SyntaxError ? 'Invalid command.' : error.message || 'Session unavailable.'},400);
    }
  };
}
if (typeof Deno !== 'undefined') Deno.serve(makeHandler(key => Deno.env.get(key) || ''));

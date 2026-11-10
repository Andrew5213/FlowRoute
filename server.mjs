import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const port = Number(process.env.PORT || 3000);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined }) : null;
const sessions = new Map();
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const osrmRouteUrl = 'https://router.project-osrm.org/route/v1/driving';
const nominatimSearchUrl = 'https://nominatim.openstreetmap.org/search';
const geocodeCache = new Map();

const knownLocations = [
  ['Luanda', -8.8383, 13.2344], ['Benguela', -12.5763, 13.4055], ['Malanje', -9.5402, 16.3408],
  ['Huambo', -12.7761, 15.7392], ['Lubango', -14.9172, 13.4925], ['Huíla — Lubango', -14.9172, 13.4925],
  ['Saurimo', -9.6608, 20.3916], ['Lunda Sul — Saurimo', -9.6608, 20.3916], ['Cabinda', -5.55, 12.2],
  ['Ondjiva', -17.0667, 15.7333], ['Moçâmedes', -15.1961, 12.1522], ['Namibe', -15.1961, 12.1522],
  ['Dundo', -7.38, 20.83], ['Lunda Norte — Dundo', -7.38, 20.83], ['Uíge', -7.6087, 15.0613],
  ['Sumbe', -11.2061, 13.8437], ['Mbanza Kongo', -6.267, 14.24], ['Luena', -11.783, 19.9167],
  ['Kuito', -12.3833, 16.9333]
].map(([name, lat, lon]) => ({ name, lat, lon }));

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

const allowedOrigins = new Set(['https://flowroute-finance.andrew5213.chatgpt.site', 'https://flowroute-finance-production.up.railway.app', 'http://localhost:3000', 'http://127.0.0.1:3000']);
function setCors(request, response) { const origin = request.headers.origin; if (origin && allowedOrigins.has(origin)) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS'); response.setHeader('Vary', 'Origin'); } }
function hashPassword(password, salt = randomBytes(16).toString('hex')) { return `${salt}:${scryptSync(String(password), salt, 64).toString('hex')}`; }
function verifyPassword(password, stored) { try { const [salt, expectedHex] = String(stored || '').split(':'); const expected = Buffer.from(expectedHex || '', 'hex'); const actual = scryptSync(String(password), salt, 64); return expected.length === actual.length && timingSafeEqual(expected, actual); } catch { return false; } }
function publicUser(user) { return { id: user.id, name: user.name, username: user.username, email: user.email || '', password: '', profileId: user.profile_id, active: user.active }; }
function defaultProfiles() { return [
  { id: 'administrador', name: 'Administrador', description: 'Acesso total e gestão de usuários e permissões.', permissions: ['summary', 'instructions', 'parameters', 'distances', 'employees', 'teams', 'composition', 'routes', 'changes', 'flights', 'maintenance', 'mileage', 'fleet', 'purchases', 'bank', 'paymentRegister', 'payments', 'accounting', 'reports', 'cashflow', 'access'] },
  { id: 'lider', name: 'Líder', description: 'Acompanha equipes, composição, rotas e prestação da missão.', permissions: ['summary', 'instructions', 'distances', 'employees', 'teams', 'composition', 'routes', 'changes', 'mileage', 'fleet', 'accounting', 'reports'] },
  { id: 'tecnico', name: 'Técnico', description: 'Registra rotas, manutenção, quilometragem e frota.', permissions: ['summary', 'instructions', 'distances', 'teams', 'composition', 'routes', 'mileage', 'fleet', 'maintenance'] },
  { id: 'financeiro', name: 'Financeiro', description: 'Controla parâmetros, compras, pagamentos, contas e relatórios.', permissions: ['summary', 'instructions', 'parameters', 'distances', 'flights', 'maintenance', 'purchases', 'bank', 'paymentRegister', 'payments', 'accounting', 'reports', 'cashflow'] }
]; }
const defaultUsers = [
  { id: 'USR-001', name: 'Andrew Administrador', username: 'admin', password: 'admin123', profileId: 'administrador', active: true },
  { id: 'USR-002', name: 'Líder de Operações', username: 'lider', password: 'lider123', profileId: 'lider', active: true },
  { id: 'USR-003', name: 'Técnico de Campo', username: 'tecnico', password: 'tecnico123', profileId: 'tecnico', active: true },
  { id: 'USR-004', name: 'Analista Financeiro', username: 'financeiro', password: 'financeiro123', profileId: 'financeiro', active: true }
];
let databaseInitPromise = null;
async function ensureDatabase(bootstrapState = null) { if (!pool) throw new Error('DATABASE_URL não configurada.'); if (!databaseInitPromise) databaseInitPromise = (async () => { await pool.query('CREATE TABLE IF NOT EXISTS app_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, email TEXT NOT NULL DEFAULT \'\', password_hash TEXT NOT NULL, profile_id TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'); await pool.query("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''"); await pool.query('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'); await pool.query('CREATE TABLE IF NOT EXISTS app_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL)'); const count = await pool.query('SELECT COUNT(*)::int AS count FROM app_users'); if (!count.rows[0].count) { const users = Array.isArray(bootstrapState?.users) && bootstrapState.users.length ? bootstrapState.users : defaultUsers; for (const user of users) await pool.query('INSERT INTO app_users (id, name, username, email, password_hash, profile_id, active) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (username) DO NOTHING', [String(user.id || randomUUID()), String(user.name || user.username), String(user.username).trim().toLowerCase(), String(user.email || ''), hashPassword(user.password || 'changeme'), String(user.profileId || 'tecnico'), user.active !== false]); } const saved = await pool.query('SELECT id FROM app_state WHERE id = 1'); if (!saved.rowCount) { const data = bootstrapState && typeof bootstrapState === 'object' ? structuredClone(bootstrapState) : { profiles: defaultProfiles() }; data.profiles = Array.isArray(data.profiles) && data.profiles.length ? data.profiles : defaultProfiles(); data.users = (await getUsers()).map(publicUser); await pool.query('INSERT INTO app_state (id, data) VALUES (1, $1)', [JSON.stringify(data)]); } })().catch(error => { databaseInitPromise = null; throw error; }); return databaseInitPromise; }
async function getUsers() { const result = await pool.query('SELECT id, name, username, email, password_hash, profile_id, active FROM app_users ORDER BY created_at, id'); return result.rows; }
async function getState() { const result = await pool.query('SELECT data FROM app_state WHERE id = 1'); return result.rows[0]?.data || { profiles: defaultProfiles() }; }
async function withCurrentUsers(data) { return { ...data, users: (await getUsers()).map(publicUser) }; }
async function saveState(incoming, actor) { const data = incoming && typeof incoming === 'object' ? structuredClone(incoming) : {}; const incomingUsers = Array.isArray(data.users) ? data.users : []; for (const user of incomingUsers) { if (!user.username) continue; const existing = await pool.query('SELECT password_hash FROM app_users WHERE id = $1 OR username = $2 LIMIT 1', [String(user.id || ''), String(user.username).trim().toLowerCase()]); const passwordHash = user.password ? hashPassword(user.password) : existing.rows[0]?.password_hash || hashPassword('changeme'); await pool.query('INSERT INTO app_users (id, name, username, email, password_hash, profile_id, active) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, username = EXCLUDED.username, email = EXCLUDED.email, profile_id = EXCLUDED.profile_id, active = EXCLUDED.active, password_hash = CASE WHEN $8 = TRUE THEN EXCLUDED.password_hash ELSE app_users.password_hash END', [String(user.id || randomUUID()), String(user.name || user.username), String(user.username).trim().toLowerCase(), String(user.email || '').trim(), passwordHash, String(user.profileId || 'tecnico'), user.active !== false, Boolean(user.password)]); } const keepIds = incomingUsers.map(user => String(user.id || '')).filter(Boolean); if (keepIds.length) await pool.query('DELETE FROM app_users WHERE id <> $1 AND NOT (id = ANY($2::text[]))', [actor.id, keepIds]); data.users = (await getUsers()).map(publicUser); await pool.query('INSERT INTO app_state (id, data, updated_at) VALUES (1, $1, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()', [JSON.stringify(data)]); return data; }
function tokenFrom(request) { const value = request.headers.authorization || ''; return value.startsWith('Bearer ') ? value.slice(7) : ''; }
async function authenticatedUser(request) { const token = tokenFrom(request); if (!pool || !token) return null; const memorySession = sessions.get(token); if (memorySession && memorySession.expiresAt > Date.now()) return memorySession.user; if (memorySession) sessions.delete(token); const result = await pool.query('SELECT u.id, u.name, u.username, u.email, u.profile_id, u.active, s.expires_at FROM app_sessions s JOIN app_users u ON u.id = s.user_id WHERE s.token = $1 AND s.expires_at > NOW()', [token]); if (!result.rows[0]) return null; const user = result.rows[0]; sessions.set(token, { user, expiresAt: new Date(user.expires_at).getTime() }); return user; }
async function readRequestBody(request) { let body = ''; for await (const chunk of request) body += chunk; if (!body) return {}; try { return JSON.parse(body); } catch { return {}; } }
async function handleApi(request, response, requestUrl) { setCors(request, response); if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return true; } if (!requestUrl.pathname.startsWith('/api/')) return false; if (request.method === 'GET' && requestUrl.pathname === '/api/health') { sendJson(response, 200, { ok: true, database: Boolean(pool), service: 'flowroute-finance' }); return true; } if (!pool) { sendJson(response, 503, { error: 'Banco de dados não configurado neste ambiente.' }); return true; } try { if (request.method === 'POST' && requestUrl.pathname === '/api/auth/login') { const body = await readRequestBody(request); await ensureDatabase(body.bootstrapState); const login = String(body.username || '').trim(); if (!login) { sendJson(response, 401, { error: 'Informe seu usuário ou e-mail.' }); return true; } const result = await pool.query('SELECT id, name, username, email, password_hash, profile_id, active FROM app_users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1) ORDER BY (LOWER(username) = LOWER($1)) DESC, created_at ASC LIMIT 1', [login]); const user = result.rows[0]; if (!user || !user.active || !verifyPassword(body.password || '', user.password_hash)) { sendJson(response, 401, { error: 'Usuário ou senha inválidos.' }); return true; } const token = randomBytes(32).toString('hex'); const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7; await pool.query('INSERT INTO app_sessions (token, user_id, expires_at) VALUES ($1, $2, TO_TIMESTAMP($3 / 1000.0))', [token, user.id, expiresAt]); sessions.set(token, { user, expiresAt }); const data = await withCurrentUsers(await getState()); sendJson(response, 200, { token, user: publicUser(user), state: data }); return true; } if (request.method === 'GET' && requestUrl.pathname === '/api/auth/me') { const user = await authenticatedUser(request); if (!user) { sendJson(response, 401, { error: 'Sessão expirada.' }); return true; } sendJson(response, 200, { user: publicUser(user), state: await withCurrentUsers(await getState()) }); return true; } if (request.method === 'GET' && requestUrl.pathname === '/api/state') { const user = await authenticatedUser(request); if (!user) { sendJson(response, 401, { error: 'Sessão expirada.' }); return true; } sendJson(response, 200, { state: await withCurrentUsers(await getState()), user: publicUser(user) }); return true; } if (request.method === 'PUT' && requestUrl.pathname === '/api/state') { const user = await authenticatedUser(request); if (!user) { sendJson(response, 401, { error: 'Sessão expirada.' }); return true; } const body = await readRequestBody(request); const state = await saveState(body.state, user); sendJson(response, 200, { state: await withCurrentUsers(state), user: publicUser(user) }); return true; } sendJson(response, 404, { error: 'Endpoint não encontrado.' }); return true; } catch (error) { console.error('API error:', error); sendJson(response, 500, { error: error.message || 'Erro interno do servidor.' }); return true; } }

function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(Number(seconds || 0) / 60));
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours ? `${hours} h ${remaining} min` : `${remaining} min`;
}

async function calculateOpenStreetMapDistance(url, response) {
  const origin = url.searchParams.get('origin')?.trim();
  const destination = url.searchParams.get('destination')?.trim();
  const stops = url.searchParams.getAll('stop').map(value => value.trim()).filter(Boolean);
  if (!origin || !destination) {
    sendJson(response, 400, { error: 'Informe a origem e o destino.' });
    return true;
  }
  try {
    const labels = [origin, ...stops, destination];
    const points = [];
    for (const label of labels) points.push(await geocodeLocation(label));
    if (url.searchParams.get('mode') === 'air') {
      const toRadians = value => Number(value) * Math.PI / 180;
      const distanceKm = points.slice(1).reduce((total, point, index) => {
        const previous = points[index];
        const lat1 = toRadians(previous.lat);
        const lat2 = toRadians(point.lat);
        const latDelta = lat2 - lat1;
        const lonDelta = toRadians(point.lon - previous.lon);
        const arc = Math.sin(latDelta / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2;
        return total + 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
      }, 0);
      sendJson(response, 200, {
        origin,
        destination,
        stops,
        distanceKm: Math.round(distanceKm * 100) / 100,
        durationSeconds: 0,
        durationText: '—',
        provider: 'OpenStreetMap · trajeto aéreo aproximado',
        points,
        geometry: { type: 'LineString', coordinates: points.map(point => [point.lon, point.lat]) }
      });
      return true;
    }
    const coordinatePath = points.map(point => `${point.lon},${point.lat}`).join(';');
    const osrmUrl = new URL(`${osrmRouteUrl}/${coordinatePath}`);
    osrmUrl.searchParams.set('overview', 'full');
    osrmUrl.searchParams.set('geometries', 'geojson');
    osrmUrl.searchParams.set('steps', 'false');
    const routeResponse = await fetch(osrmUrl, { headers: { 'User-Agent': 'FlowRoute Finance route calculator' } });
    const data = await routeResponse.json();
    if (!routeResponse.ok || data.code !== 'Ok' || !data.routes?.[0]) {
      sendJson(response, 502, { error: data.message || 'OpenStreetMap não encontrou uma rota para os locais informados.' });
      return true;
    }
    const route = data.routes[0];
    const meters = Number(route.distance || 0);
    const seconds = Number(route.duration || 0);
    sendJson(response, 200, {
      origin,
      destination,
      stops,
      distanceKm: Math.round((meters / 1000) * 100) / 100,
      durationSeconds: seconds,
      durationText: formatDuration(seconds),
      provider: 'OpenStreetMap + OSRM',
      points,
      geometry: route.geometry
    });
  } catch (error) {
    sendJson(response, 502, { error: error.message || 'Não foi possível calcular a rota gratuita agora.' });
  }
  return true;
}

function normalizeLocation(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function geocodeLocation(label) {
  const normalized = normalizeLocation(label);
  const known = knownLocations.find(location => normalizeLocation(location.name) === normalized);
  if (known) return { ...known, query: label };
  if (geocodeCache.has(normalized)) return { ...geocodeCache.get(normalized), query: label };
  await new Promise(resolve => setTimeout(resolve, 1100));
  const searchUrl = new URL(nominatimSearchUrl);
  searchUrl.searchParams.set('q', `${label}, Angola`);
  searchUrl.searchParams.set('format', 'jsonv2');
  searchUrl.searchParams.set('limit', '1');
  searchUrl.searchParams.set('countrycodes', 'ao');
  searchUrl.searchParams.set('accept-language', 'pt');
  const searchResponse = await fetch(searchUrl, { headers: { 'User-Agent': 'FlowRoute Finance route calculator' } });
  const results = await searchResponse.json();
  const match = results?.[0];
  if (!searchResponse.ok || !match) throw new Error(`Não foi possível localizar “${label}” no mapa.`);
  const location = { name: match.display_name?.split(',')[0] || label, lat: Number(match.lat), lon: Number(match.lon), query: label };
  geocodeCache.set(normalized, location);
  return location;
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (requestUrl.pathname !== '/api/distance' && await handleApi(request, response, requestUrl)) return;
  if (request.method === 'GET' && requestUrl.pathname === '/api/distance') {
    setCors(request, response);
    await calculateOpenStreetMapDistance(requestUrl, response);
    return;
  }
  const requested = decodeURIComponent(requestUrl.pathname);
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  const filePath = normalize(join(root, relative));
  if (!filePath.startsWith(root)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(content);
  } catch {
    const fallback = await readFile(join(root, 'index.html'));
    response.writeHead(200, { 'Content-Type': mime['.html'], 'Cache-Control': 'no-cache' });
    response.end(fallback);
  }
});

server.listen(port, '0.0.0.0', () => console.log(`FlowRoute Finance listening on port ${port}`));

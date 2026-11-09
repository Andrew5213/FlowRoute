import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const port = Number(process.env.PORT || 3000);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
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
  if (request.method === 'GET' && requestUrl.pathname === '/api/distance') {
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

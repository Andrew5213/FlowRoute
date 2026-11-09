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

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';

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

async function calculateGoogleDistance(url, response) {
  const origin = url.searchParams.get('origin')?.trim();
  const destination = url.searchParams.get('destination')?.trim();
  const stops = url.searchParams.getAll('stop').map(value => value.trim()).filter(Boolean);
  if (!origin || !destination) {
    sendJson(response, 400, { error: 'Informe a origem e o destino.' });
    return true;
  }
  if (!googleMapsApiKey) {
    sendJson(response, 503, { error: 'A API Google ainda não foi configurada no Railway. Defina GOOGLE_MAPS_API_KEY.' });
    return true;
  }
  try {
    const googleResponse = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleMapsApiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration'
      },
      body: JSON.stringify({
        origin: { address: origin },
        destination: { address: destination },
        intermediates: stops.map(address => ({ address })),
        travelMode: 'DRIVE',
        units: 'METRIC'
      })
    });
    const data = await googleResponse.json();
    if (!googleResponse.ok || !data.routes?.[0]) {
      sendJson(response, 502, { error: data.error?.message || 'Google Maps não encontrou uma rota para os locais informados.' });
      return true;
    }
    const route = data.routes[0];
    const meters = Number(route.distanceMeters || 0);
    const seconds = Number.parseFloat(String(route.duration || '').replace(/s$/, '')) || 0;
    sendJson(response, 200, {
      origin,
      destination,
      stops,
      distanceKm: Math.round((meters / 1000) * 100) / 100,
      durationSeconds: seconds,
      durationText: formatDuration(seconds),
      provider: 'Google Maps Routes API'
    });
  } catch {
    sendJson(response, 502, { error: 'Não foi possível consultar o Google Maps agora.' });
  }
  return true;
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && requestUrl.pathname === '/api/distance') {
    await calculateGoogleDistance(requestUrl, response);
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

function routeMapIdentity(route) {
  return JSON.stringify([route.team, route.stage, route.origin, route.stop || '', route.destination, route.mode || '']);
}

function routeMapRequestKey(route) {
  const stops = String(route.stop || '').split(/[;\n]/).map(value => value.trim()).filter(Boolean);
  const mode = /a[eé]reo|avi[aã]o/i.test(String(route.mode || '')) ? 'air' : 'road';
  return JSON.stringify([route.origin, ...stops, route.destination, mode].map(value => String(value).trim().toLowerCase()));
}

function setupRouteMap() {
  const element = byId('routeMap');
  if (!element || !window.L) return null;
  if (routeMap && routeMapElement === element) {
    window.setTimeout(() => routeMap.invalidateSize(), 0);
    return routeMap;
  }
  if (routeMap) routeMap.remove();
  routeMapElement = element;
  routeMap = window.L.map(element, { zoomControl: true, scrollWheelZoom: false }).setView([-12.5, 17.5], 5);
  window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(routeMap);
  routeMarkersLayer = window.L.layerGroup().addTo(routeMap);
  window.setTimeout(() => routeMap.invalidateSize(), 0);
  return routeMap;
}

function renderSelectedRoute(result, route) {
  const map = setupRouteMap();
  if (!map || !result?.geometry?.coordinates?.length) return;
  routeMapLayer?.remove();
  routeMarkersLayer.clearLayers();
  const isAir = /a[eé]reo|avi[aã]o/i.test(String(route.mode || ''));
  const path = result.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  routeMapLayer = window.L.polyline(path, {
    color: isAir ? '#d58a22' : '#1d76d2',
    weight: 5,
    opacity: 0.92,
    dashArray: isAir ? '8 8' : null
  }).addTo(map);
  (result.points || []).forEach((point, index) => {
    const label = index === 0 ? 'Origem' : index === result.points.length - 1 ? 'Destino' : `Parada ${index}`;
    window.L.marker([point.lat, point.lon])
      .bindPopup(`<strong>${label}</strong><br>${esc(point.query || point.name)}`)
      .addTo(routeMarkersLayer);
  });
  map.fitBounds(routeMapLayer.getBounds(), { padding: [26, 26], maxZoom: 9 });
  const distance = byId('routeMapDistance');
  const duration = byId('routeMapDuration');
  const provider = byId('routeMapProvider');
  if (distance) distance.textContent = `${fmt.format(Number(result.distanceKm || 0))} km`;
  if (duration) duration.textContent = result.durationText || '—';
  if (provider) provider.textContent = result.provider || 'OpenStreetMap · OSRM';
}

async function selectRouteOnMap(index) {
  const route = state.routes[index];
  if (!route?.origin || !route?.destination) return;
  selectedRouteKey = routeMapIdentity(route);
  const requestId = ++routeSelectionRequest;
  byId('moduleHost').querySelectorAll('.route-select-row').forEach(row => {
    const selected = Number(row.dataset.routeIndex) === index;
    row.classList.toggle('selected-route-row', selected);
    row.setAttribute('aria-selected', String(selected));
  });

  const map = setupRouteMap();
  if (!map) return;
  routeMapLayer?.remove();
  routeMapLayer = null;
  routeMarkersLayer?.clearLayers();
  const heading = byId('routeMapTitle');
  const provider = byId('routeMapProvider');
  const distance = byId('routeMapDistance');
  const duration = byId('routeMapDuration');
  const summary = byId('routeMapSummary');
  const stops = String(route.stop || '').split(/[;\n]/).map(value => value.trim()).filter(Boolean);
  if (heading) heading.textContent = `${route.team || 'Equipe'} · Etapa ${route.stage || '—'}`;
  if (summary) summary.textContent = `${route.origin} → ${stops.length ? `${stops.join(' → ')} → ` : ''}${route.destination}`;
  if (provider) provider.textContent = 'A calcular percurso real…';
  if (distance) distance.textContent = '—';
  if (duration) duration.textContent = '—';

  try {
    const cacheKey = routeMapRequestKey(route);
    let result = routeMapCache.get(cacheKey);
    if (!result) {
      const params = new URLSearchParams({ origin: route.origin, destination: route.destination });
      stops.forEach(stop => params.append('stop', stop));
      if (/a[eé]reo|avi[aã]o/i.test(String(route.mode || ''))) params.set('mode', 'air');
      const response = await fetch(`${distanceApiBase}/api/distance?${params.toString()}`, { credentials: 'include' });
      result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível localizar esse percurso no mapa.');
      routeMapCache.set(cacheKey, result);
    }
    if (requestId !== routeSelectionRequest || byId('genericForm')?.dataset.module !== 'routes') return;
    renderSelectedRoute(result, route);
    if (window.matchMedia('(max-width: 900px)').matches) byId('routeMap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    if (requestId !== routeSelectionRequest) return;
    if (provider) provider.textContent = 'Percurso indisponível';
    toast(error.message || 'Não foi possível mostrar o percurso.');
  }
}

const renderGenericWithRouteMap = renderGeneric;
renderGeneric = function(id) {
  renderGenericWithRouteMap(id);
  if (id !== 'routes') return;
  const formPanel = byId('moduleFormPanel');
  const panelHeading = formPanel?.querySelector('.panel-heading');
  if (!formPanel || !panelHeading) return;
  panelHeading.insertAdjacentHTML('afterend', `<div class="distance-map-shell route-map-shell">
    <div class="map-panel-heading"><strong id="routeMapTitle">Rota selecionada</strong><span id="routeMapProvider">OpenStreetMap · OSRM</span></div>
    <div class="route-map-summary" id="routeMapSummary">Selecione uma etapa para ver o trajeto real.</div>
    <div class="distance-map route-map" id="routeMap" role="img" aria-label="Mapa do percurso real da etapa selecionada"></div>
    <div class="route-map-metrics"><div><span>Distância rodoviária</span><strong id="routeMapDistance">—</strong></div><div><span>Duração estimada</span><strong id="routeMapDuration">—</strong></div></div>
    <p class="map-attribution">© OpenStreetMap contributors · traçado rodoviário OSRM</p>
  </div>`);

  const rows = byId('moduleHost').querySelectorAll('.module-data-table tbody tr');
  rows.forEach((row, index) => {
    const route = state.routes[index];
    if (!route) return;
    row.classList.add('route-select-row');
    row.dataset.routeIndex = String(index);
    row.tabIndex = 0;
    row.setAttribute('aria-label', `Mostrar no mapa ${route.team}, etapa ${route.stage}: ${route.origin} para ${route.destination}`);
    const selected = routeMapIdentity(route) === selectedRouteKey;
    row.classList.toggle('selected-route-row', selected);
    row.setAttribute('aria-selected', String(selected));
  });
  const hint = byId('moduleHost').querySelector('.module-table .panel-heading');
  hint?.insertAdjacentHTML('afterend', '<p class="inline-edit-hint">Clique numa etapa para ver o caminho real no mapa. Adicione paradas separadas por ponto e vírgula ao cadastrar ou editar.</p>');

  const selectedIndex = state.routes.findIndex(route => routeMapIdentity(route) === selectedRouteKey);
  if (state.routes.length) window.setTimeout(() => selectRouteOnMap(selectedIndex >= 0 ? selectedIndex : 0), 0);
  else setupRouteMap();
};

document.addEventListener('click', event => {
  const row = event.target.closest('#moduleHost .route-select-row');
  if (!row || event.target.closest('button') || byId('genericForm')?.dataset.module !== 'routes') return;
  selectRouteOnMap(Number(row.dataset.routeIndex));
});

document.addEventListener('keydown', event => {
  const row = event.target.closest('#moduleHost .route-select-row');
  if (!row || event.target.closest('button') || byId('genericForm')?.dataset.module !== 'routes' || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  selectRouteOnMap(Number(row.dataset.routeIndex));
});

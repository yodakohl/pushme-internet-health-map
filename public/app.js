const map = L.map('map', {
  zoomControl: true,
  worldCopyJump: true
}).setView([20, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const markers = new Map();

function severityClass(severity) {
  if (severity === 'down') return 'status-down';
  if (severity === 'degraded') return 'status-degraded';
  if (severity === 'recovered') return 'status-recovered';
  return 'status-ok';
}

function severityColor(severity) {
  if (severity === 'down') return '#c54343';
  if (severity === 'degraded') return '#d18b2f';
  if (severity === 'recovered') return '#4f83cc';
  return '#1f9d6a';
}

function formatTime(value) {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function renderStats(counts, lastPollAt, syncError) {
  const stats = document.getElementById('stats');
  const lastPoll = document.getElementById('last-poll');
  lastPoll.textContent = syncError ? `Sync error: ${syncError}` : `Last sync: ${formatTime(lastPollAt)}`;
  stats.innerHTML = `
    <div class="stat-card"><span>Total nodes</span><strong>${counts.total}</strong></div>
    <div class="stat-card"><span>Down</span><strong>${counts.down}</strong></div>
    <div class="stat-card"><span>Degraded</span><strong>${counts.degraded}</strong></div>
    <div class="stat-card"><span>Recovered / OK</span><strong>${counts.recovered + counts.ok}</strong></div>
  `;
}

function renderNodes(nodes) {
  const container = document.getElementById('node-list');
  if (!nodes.length) {
    container.innerHTML = '<div class="empty">No node events yet. Start one or more publishers such as pushme-netnode.</div>';
    return;
  }
  container.innerHTML = nodes
    .map((node) => {
      const metadata = node.metadata ?? {};
      return `
        <article class="node-card">
          <div class="node-top">
            <div>
              <strong>${node.label}</strong>
              <div>${node.title}</div>
            </div>
            <span class="status-pill ${severityClass(node.severity)}">${node.severity}</span>
          </div>
          <p>${node.summary}</p>
          <div class="meta">
            <span>Updated ${formatTime(node.updatedAt)}</span>
            ${metadata.dnsLatencyMs != null ? `<span>DNS ${metadata.dnsLatencyMs} ms</span>` : ''}
            ${metadata.httpLatencyMs != null ? `<span>HTTP ${metadata.httpLatencyMs} ms</span>` : ''}
            ${metadata.packetLossPct != null ? `<span>Loss ${metadata.packetLossPct}%</span>` : ''}
          </div>
        </article>
      `;
    })
    .join('');
}

function renderEvents(events) {
  const container = document.getElementById('event-feed');
  if (!events.length) {
    container.innerHTML = '<div class="empty">No recent events yet.</div>';
    return;
  }
  container.innerHTML = events
    .slice(0, 20)
    .map(
      (event) => `
        <article class="event-card">
          <div class="event-top">
            <div>
              <strong>${event.label}</strong>
              <div>${event.title}</div>
            </div>
            <span class="status-pill ${severityClass(event.severity)}">${event.severity}</span>
          </div>
          <p>${event.summary}</p>
          <div class="event-meta">
            <span>${formatTime(event.createdAt)}</span>
            <span>${event.eventType}</span>
            ${event.qualityScore != null ? `<span>Quality ${event.qualityScore}</span>` : ''}
          </div>
        </article>
      `
    )
    .join('');
}

function renderMarkers(nodes) {
  const visible = [];
  for (const node of nodes) {
    if (typeof node.lat !== 'number' || typeof node.lon !== 'number') continue;
    visible.push(node);
    let marker = markers.get(node.location);
    if (!marker) {
      marker = L.circleMarker([node.lat, node.lon], {
        radius: 10,
        color: severityColor(node.severity),
        fillColor: severityColor(node.severity),
        fillOpacity: 0.85,
        weight: 2
      }).addTo(map);
      markers.set(node.location, marker);
    } else {
      marker.setLatLng([node.lat, node.lon]);
      marker.setStyle({
        color: severityColor(node.severity),
        fillColor: severityColor(node.severity)
      });
    }
    marker.bindPopup(`
      <strong>${node.label}</strong><br />
      ${node.title}<br />
      ${node.summary}<br />
      Updated ${formatTime(node.updatedAt)}
    `);
  }
  for (const [location, marker] of markers.entries()) {
    if (!visible.some((node) => node.location === location)) {
      map.removeLayer(marker);
      markers.delete(location);
    }
  }
}

async function refresh() {
  const response = await fetch('/api/state');
  const state = await response.json();
  renderStats(state.counts, state.lastPollAt, state.syncError);
  renderNodes(state.nodes);
  renderEvents(state.recentEvents);
  renderMarkers(state.nodes);
}

refresh().catch((error) => {
  console.error(error);
});

setInterval(() => {
  refresh().catch((error) => {
    console.error(error);
  });
}, 10000);


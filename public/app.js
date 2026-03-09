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

function parseJsonField(value, fallback = []) {
  if (!value) return fallback;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function renderTrend(node) {
  const metadata = node.metadata || {};
  const recent = parseJsonField(metadata.recentDiagnosisHistoryJson, []);
  const diagnosisCounts = String(metadata.recentDiagnosisCountsCsv || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.lastIndexOf(':');
      return idx === -1 ? null : { label: part.slice(0, idx), count: Number(part.slice(idx + 1)) || 0 };
    })
    .filter(Boolean);
  if (!recent.length) return '';
  const lead = metadata.persistentDiagnosisLabel
    ? `Persistent pattern: ${metadata.persistentDiagnosisLabel}`
    : diagnosisCounts.length
      ? `Recent pattern: ${diagnosisCounts[0].label} ${diagnosisCounts[0].count}/${recent.length}`
      : 'Recent diagnosis history';
  const chips = recent
    .map((item) => {
      const impactedGroups = item.impactedGroupsCsv ? ` · ${item.impactedGroupsCsv}` : '';
      return `<span class="trend-chip ${severityClass(item.severity)}" title="${formatTime(item.createdAt)}">${item.diagnosisLabel}${impactedGroups}</span>`;
    })
    .join('');
  return `
    <div class="trend-block">
      <div class="trend-label">${lead}</div>
      <div class="trend-chips">${chips}</div>
    </div>
  `;
}

function renderGroupDetails(metadata) {
  const groups = parseJsonField(metadata.groupStatsJson, []);
  if (!groups.length) return '';
  return `
    <div class="detail-block">
      <div class="detail-label">Probe groups</div>
      <div class="group-grid">
        ${groups
          .map(
            (group) => `
              <div class="group-card">
                <strong>${group.group}</strong>
                <span>${group.impactedCount}/${group.profileCount} impacted</span>
                ${group.providerReportedCount ? `<span>provider ${group.providerReportedCount}</span>` : ''}
                ${group.avgDnsLatencyMs != null ? `<span>DNS ${group.avgDnsLatencyMs} ms</span>` : ''}
                ${group.avgHttpLatencyMs != null ? `<span>HTTP ${group.avgHttpLatencyMs} ms</span>` : ''}
                ${group.avgJitterMs != null ? `<span>jitter ${group.avgJitterMs} ms</span>` : ''}
                ${group.maxPacketLossPct != null ? `<span>loss ${group.maxPacketLossPct}%</span>` : ''}
              </div>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderProfileHighlights(metadata) {
  const profiles = parseJsonField(metadata.profilesJson, []);
  const notable = profiles.filter(
    (profile) => profile.severity !== 'ok' || profile.providerStatusSeverity || profile.httpError || profile.dnsError || profile.packetError
  );
  if (!notable.length) return '';
  return `
    <div class="detail-block">
      <div class="detail-label">Notable targets</div>
      <div class="profile-list">
        ${notable
          .slice(0, 5)
          .map(
            (profile) => `
              <div class="profile-row">
                <strong>${profile.label}</strong>
                <span>${profile.group} · ${profile.severity}</span>
                ${profile.providerStatusSeverity ? `<span>provider ${profile.providerStatusSeverity}${profile.providerStatusDescription ? `: ${profile.providerStatusDescription}` : ''}</span>` : ''}
                ${profile.httpStatusCode != null ? `<span>HTTP ${profile.httpStatusCode}</span>` : ''}
                ${profile.httpLatencyMs != null ? `<span>${profile.httpLatencyMs} ms</span>` : ''}
                ${profile.packetJitterMs != null ? `<span>jitter ${profile.packetJitterMs} ms</span>` : ''}
                ${profile.packetLossPct != null ? `<span>loss ${profile.packetLossPct}%</span>` : ''}
              </div>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderIdentity(metadata) {
  const identityBits = [
    metadata.nodeCountry || metadata.nodeCountryCode || null,
    metadata.nodeRegion || null,
    metadata.nodeProvider || null,
    metadata.nodeAsn ? `AS${metadata.nodeAsn}` : null,
    metadata.nodeNetworkType || null
  ].filter(Boolean);
  if (!identityBits.length) return '';
  return `
    <div class="detail-block">
      <div class="detail-label">Node identity</div>
      <div class="identity-chips">
        ${identityBits.map((item) => `<span class="identity-chip">${item}</span>`).join('')}
      </div>
    </div>
  `;
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
          ${renderTrend(node)}
          ${renderIdentity(metadata)}
          ${renderGroupDetails(metadata)}
          ${renderProfileHighlights(metadata)}
          <div class="meta">
            <span>Updated ${formatTime(node.updatedAt)}</span>
            ${metadata.diagnosisLabel ? `<span>Diagnosis ${metadata.diagnosisLabel}</span>` : ''}
            ${metadata.groupCount != null ? `<span>Groups ${metadata.groupCount}</span>` : ''}
            ${metadata.profileCount != null ? `<span>Profiles ${metadata.profileCount}</span>` : ''}
            ${metadata.totalHttpResponseBytes != null ? `<span>HTTP ${metadata.totalHttpResponseBytes} B</span>` : ''}
            ${metadata.totalPingPacketsSent != null ? `<span>ICMP ${metadata.totalPingPacketsSent} pkts</span>` : ''}
            ${metadata.providerReportedProfileCount ? `<span>Provider reports ${metadata.providerReportedProfileCount}</span>` : ''}
            ${metadata.nodeProvider ? `<span>${metadata.nodeProvider}</span>` : ''}
            ${metadata.nodeCountryCode ? `<span>${metadata.nodeCountryCode}</span>` : ''}
            ${metadata.nodeAsn ? `<span>AS${metadata.nodeAsn}</span>` : ''}
            ${metadata.nodeNetworkType ? `<span>${metadata.nodeNetworkType}</span>` : ''}
            ${node.qualityScore != null ? `<span>Quality ${node.qualityScore}</span>` : ''}
          </div>
        </article>
      `;
    })
    .join('');
}

function renderSignals(signals) {
  const container = document.getElementById('signal-list');
  if (!container) return;
  if (!Array.isArray(signals) || !signals.length) {
    container.innerHTML = '<div class="empty">No multi-node signals yet.</div>';
    return;
  }
  container.innerHTML = signals
    .map(
      (signal) => `
        <article class="signal-card">
          <div class="signal-top">
            <div>
              <strong>${signal.title}</strong>
              <div>${signal.summary}</div>
            </div>
            <span class="status-pill ${severityClass(signal.severity)}">${signal.severity}</span>
          </div>
          <div class="meta">
            <span>${signal.nodeCount} nodes</span>
            ${Array.isArray(signal.countries) ? `<span>${signal.countries.join(', ')}</span>` : ''}
            ${Array.isArray(signal.providers) ? `<span>${signal.providers.join(', ')}</span>` : ''}
            ${Array.isArray(signal.impactedGroups) && signal.impactedGroups.length ? `<span>${signal.impactedGroups.join(', ')}</span>` : ''}
          </div>
        </article>
      `
    )
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
    .map((event) => {
      const metadata = event.metadata ?? {};
      return `
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
            ${metadata.diagnosisLabel ? `<span>${metadata.diagnosisLabel}</span>` : ''}
            ${metadata.impactedGroupsCsv ? `<span>${metadata.impactedGroupsCsv}</span>` : ''}
            ${event.qualityScore != null ? `<span>Quality ${event.qualityScore}</span>` : ''}
          </div>
        </article>
      `;
    })
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
      Diagnosis: ${node.metadata?.diagnosisLabel || 'unknown'}<br />
      Identity: ${[
        node.metadata?.nodeCountry || node.metadata?.nodeCountryCode || null,
        node.metadata?.nodeProvider || null,
        node.metadata?.nodeAsn ? `AS${node.metadata.nodeAsn}` : null,
        node.metadata?.nodeNetworkType || null
      ].filter(Boolean).join(' · ') || 'unknown'}<br />
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
  renderSignals(state.networkSignals || []);
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

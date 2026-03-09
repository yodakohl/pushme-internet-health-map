export function severityRank(severity) {
  switch (String(severity ?? '').toLowerCase()) {
    case 'down':
      return 3;
    case 'degraded':
      return 2;
    case 'recovered':
      return 1;
    default:
      return 0;
  }
}

export function normalizeSeverity(eventType, metadataSeverity) {
  const eventTypeText = String(eventType ?? '').toLowerCase();
  const metadataText = String(metadataSeverity ?? '').toLowerCase();
  if (eventTypeText.endsWith('.down')) return 'down';
  if (eventTypeText.endsWith('.degraded')) return 'degraded';
  if (eventTypeText.endsWith('.recovered')) return 'recovered';
  if (metadataText === 'down' || metadataText === 'degraded' || metadataText === 'ok') return metadataText === 'ok' ? 'recovered' : metadataText;
  return 'ok';
}

export function reduceEvents(state, events, nodeConfig) {
  const next = {
    sinceId: state.sinceId ?? 0,
    lastPollAt: new Date().toISOString(),
    nodes: { ...(state.nodes ?? {}) },
    recentEvents: Array.isArray(state.recentEvents) ? [...state.recentEvents] : []
  };

  for (const event of events) {
    const metadata = event.metadata ?? {};
    const location = String(metadata.location ?? event.topic ?? 'unknown').trim() || 'unknown';
    const severity = normalizeSeverity(event.eventType, metadata.severity);
    const configured = nodeConfig[location] ?? {};
    next.nodes[location] = {
      location,
      label: configured.label ?? location,
      lat: configured.lat ?? null,
      lon: configured.lon ?? null,
      severity,
      title: event.title,
      summary: event.summary,
      eventType: event.eventType,
      sourceUrl: event.sourceUrl ?? null,
      qualityScore: event.qualityScore ?? null,
      trustScore: event.trustScore ?? null,
      updatedAt: event.createdAt,
      metadata
    };
    next.sinceId = Math.max(next.sinceId, Number(event.id ?? 0) || 0);
    next.recentEvents.unshift({
      id: event.id,
      location,
      label: configured.label ?? location,
      severity,
      title: event.title,
      summary: event.summary,
      eventType: event.eventType,
      createdAt: event.createdAt,
      qualityScore: event.qualityScore ?? null,
      metadata
    });
  }

  next.recentEvents = next.recentEvents
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 80);

  return next;
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeIdentity(metadata) {
  const source = metadata && typeof metadata === 'object' ? metadata : {};
  const asn = Number(source.nodeAsn ?? source.asn ?? null);
  return {
    countryCode: cleanText(source.nodeCountryCode ?? source.countryCode),
    country: cleanText(source.nodeCountry ?? source.country),
    region: cleanText(source.nodeRegion ?? source.region),
    provider: cleanText(source.nodeProvider ?? source.provider),
    asn: Number.isFinite(asn) && asn > 0 ? Math.trunc(asn) : null,
    networkType: cleanText(source.nodeNetworkType ?? source.networkType)
  };
}

function uniqueList(values) {
  return Array.from(new Set(values.filter((value) => value != null && value !== '')));
}

function buildNetworkSignals(nodes) {
  const affected = nodes
    .filter((node) => node.severity === 'down' || node.severity === 'degraded')
    .map((node) => {
      const metadata = node.metadata ?? {};
      return {
        ...node,
        identity: normalizeIdentity(metadata),
        diagnosisLabel: String(metadata.diagnosisLabel ?? 'connectivity issue').trim() || 'connectivity issue',
        impactedGroups: String(metadata.impactedGroupsCsv ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      };
    });

  const grouped = new Map();
  for (const node of affected) {
    const key = `${node.severity}:${node.diagnosisLabel.toLowerCase()}`;
    const list = grouped.get(key) ?? [];
    list.push(node);
    grouped.set(key, list);
  }

  return Array.from(grouped.entries())
    .map(([key, members]) => {
      if (members.length < 2) return null;
      const countries = uniqueList(members.map((item) => item.identity.country || item.identity.countryCode || 'Unknown region'));
      const providers = uniqueList(members.map((item) => item.identity.provider || 'Unknown provider'));
      const asns = uniqueList(members.map((item) => item.identity.asn));
      const networkTypes = uniqueList(members.map((item) => item.identity.networkType || 'unknown'));
      const impactedGroups = uniqueList(members.flatMap((item) => item.impactedGroups));
      const scopeType = providers.length === 1 ? 'provider' : countries.length === 1 ? 'regional' : 'cross-network';
      const diagnosisLabel = members[0]?.diagnosisLabel ?? 'connectivity issue';
      const title =
        scopeType === 'provider' && countries.length === 1
          ? `${diagnosisLabel} across ${members.length} ${countries[0]} nodes on ${providers[0]}`
          : scopeType === 'provider'
            ? `${diagnosisLabel} across ${members.length} nodes on ${providers[0]}`
            : scopeType === 'regional' && countries.length === 1
              ? `${diagnosisLabel} across ${members.length} nodes in ${countries[0]}`
              : `${diagnosisLabel} across ${members.length} nodes in ${countries.length} countries`;
      return {
        id: key,
        scopeType,
        severity: members.some((item) => item.severity === 'down') ? 'down' : 'degraded',
        title,
        summary: `${countries.length} country · ${providers.length} provider · ${asns.length} ASN · ${networkTypes.join(', ')}${impactedGroups.length ? ` · ${impactedGroups.join(', ')}` : ''}`,
        nodeCount: members.length,
        countries,
        providers,
        asns,
        networkTypes,
        impactedGroups
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const severityDelta = severityRank(b.severity) - severityRank(a.severity);
      if (severityDelta !== 0) return severityDelta;
      return b.nodeCount - a.nodeCount;
    });
}

export function summarizeNodes(state) {
  const nodesMap = state?.nodes ?? {};
  const recentEvents = Array.isArray(state?.recentEvents) ? state.recentEvents : [];
  const recentByLocation = new Map();

  for (const event of recentEvents) {
    const metadata = event.metadata ?? {};
    const location = String(event.location ?? metadata.location ?? 'unknown').trim() || 'unknown';
    const entries = recentByLocation.get(location) ?? [];
    entries.push({
      id: event.id,
      createdAt: event.createdAt,
      severity: event.severity,
      diagnosisLabel: String(metadata.diagnosisLabel ?? 'connectivity change').trim() || 'connectivity change',
      impactedGroupsCsv: String(metadata.impactedGroupsCsv ?? '').trim(),
      profileCount: Number.isFinite(Number(metadata.profileCount)) ? Number(metadata.profileCount) : null,
      impactedProfileCount: Number.isFinite(Number(metadata.impactedProfileCount)) ? Number(metadata.impactedProfileCount) : null
    });
    recentByLocation.set(location, entries);
  }

  const nodes = Object.values(nodesMap)
    .map((node) => {
      const metadata = node.metadata ?? {};
      const trendItems = (recentByLocation.get(node.location) ?? []).slice(0, 6);
      const diagnosisCounts = Array.from(
        trendItems.reduce((acc, item) => {
          acc.set(item.diagnosisLabel, (acc.get(item.diagnosisLabel) ?? 0) + 1);
          return acc;
        }, new Map()).entries()
      )
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({ label, count }));
      const recentNonOk = trendItems.filter((item) => item.severity !== 'ok' && item.severity !== 'recovered');
      const persistentDiagnosisLabel =
        recentNonOk.length >= 3 && recentNonOk.slice(0, 3).every((item) => item.diagnosisLabel === recentNonOk[0].diagnosisLabel)
          ? recentNonOk[0].diagnosisLabel
          : null;
      return {
        ...node,
        metadata: {
          ...metadata,
          recentDiagnosisHistoryJson: JSON.stringify(trendItems),
          recentDiagnosisCountsCsv: diagnosisCounts.map((item) => `${item.label}:${item.count}`).join('|'),
          persistentDiagnosisLabel
        }
      };
    })
    .sort((a, b) => {
      const severityDelta = severityRank(b.severity) - severityRank(a.severity);
      if (severityDelta !== 0) return severityDelta;
      return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
    });

  const counts = { down: 0, degraded: 0, recovered: 0, ok: 0, total: nodes.length };
  for (const node of nodes) {
    const severity = String(node.severity ?? 'ok');
    if (severity === 'down') counts.down += 1;
    else if (severity === 'degraded') counts.degraded += 1;
    else if (severity === 'recovered') counts.recovered += 1;
    else counts.ok += 1;
  }
  return { nodes, counts, networkSignals: buildNetworkSignals(nodes).slice(0, 6) };
}

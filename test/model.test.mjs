import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSeverity, reduceEvents, summarizeNodes } from '../src/model.mjs';

test('normalizeSeverity handles recovered and degraded events', () => {
  assert.equal(normalizeSeverity('net.connectivity.recovered', 'ok'), 'recovered');
  assert.equal(normalizeSeverity('net.connectivity.degraded', 'degraded'), 'degraded');
  assert.equal(normalizeSeverity('net.connectivity.down', 'down'), 'down');
});

test('reduceEvents stores latest event per location', () => {
  const next = reduceEvents(
    { sinceId: 0, nodes: {}, recentEvents: [] },
    [
      {
        id: 7,
        eventType: 'net.connectivity.degraded',
        topic: 'home-office connectivity',
        title: 'Connectivity degraded at home-office',
        summary: 'DNS slow',
        createdAt: '2026-03-07T12:00:00.000Z',
        metadata: { location: 'home-office', severity: 'degraded', dnsLatencyMs: 300 }
      }
    ],
    {
      'home-office': { label: 'Home Office', lat: 52.52, lon: 13.405 }
    }
  );
  assert.equal(next.sinceId, 7);
  assert.equal(next.nodes['home-office'].label, 'Home Office');
  assert.equal(next.nodes['home-office'].severity, 'degraded');
});

test('summarizeNodes counts severities', () => {
  const summary = summarizeNodes({
    nodes: {
      a: { location: 'a', severity: 'down', updatedAt: '2026-03-07T12:01:00.000Z', metadata: { diagnosisLabel: 'broad connectivity issue' } },
      b: { location: 'b', severity: 'degraded', updatedAt: '2026-03-07T12:00:00.000Z', metadata: { diagnosisLabel: 'resolver reachability issue' } },
      c: { location: 'c', severity: 'recovered', updatedAt: '2026-03-07T11:59:00.000Z', metadata: { diagnosisLabel: 'healthy connectivity' } }
    },
    recentEvents: [
      { id: 3, location: 'a', severity: 'down', createdAt: '2026-03-07T12:01:00.000Z', metadata: { diagnosisLabel: 'broad connectivity issue' } },
      { id: 2, location: 'b', severity: 'degraded', createdAt: '2026-03-07T12:00:00.000Z', metadata: { diagnosisLabel: 'resolver reachability issue' } },
      { id: 1, location: 'c', severity: 'recovered', createdAt: '2026-03-07T11:59:00.000Z', metadata: { diagnosisLabel: 'healthy connectivity' } }
    ]
  });
  assert.equal(summary.counts.down, 1);
  assert.equal(summary.counts.degraded, 1);
  assert.equal(summary.counts.recovered, 1);
  assert.equal(summary.counts.total, 3);
  assert.match(summary.nodes[0].metadata.recentDiagnosisHistoryJson, /broad connectivity issue/);
});

test('summarizeNodes builds multi-node signals from shared diagnoses', () => {
  const summary = summarizeNodes({
    nodes: {
      a: {
        location: 'fra-a',
        label: 'Frankfurt A',
        severity: 'degraded',
        updatedAt: '2026-03-07T12:01:00.000Z',
        metadata: {
          diagnosisLabel: 'resolver reachability issue',
          impactedGroupsCsv: 'resolver',
          nodeCountry: 'Germany',
          nodeProvider: 'DigitalOcean',
          nodeAsn: 14061,
          nodeNetworkType: 'cloud'
        }
      },
      b: {
        location: 'fra-b',
        label: 'Frankfurt B',
        severity: 'degraded',
        updatedAt: '2026-03-07T12:00:00.000Z',
        metadata: {
          diagnosisLabel: 'resolver reachability issue',
          impactedGroupsCsv: 'resolver',
          nodeCountry: 'Germany',
          nodeProvider: 'Hetzner',
          nodeAsn: 24940,
          nodeNetworkType: 'cloud'
        }
      }
    },
    recentEvents: []
  });
  assert.equal(summary.networkSignals.length, 1);
  assert.match(summary.networkSignals[0].title, /resolver reachability issue/);
  assert.equal(summary.networkSignals[0].nodeCount, 2);
});

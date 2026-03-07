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
    a: { severity: 'down', updatedAt: '2026-03-07T12:01:00.000Z' },
    b: { severity: 'degraded', updatedAt: '2026-03-07T12:00:00.000Z' },
    c: { severity: 'recovered', updatedAt: '2026-03-07T11:59:00.000Z' }
  });
  assert.equal(summary.counts.down, 1);
  assert.equal(summary.counts.degraded, 1);
  assert.equal(summary.counts.recovered, 1);
  assert.equal(summary.counts.total, 3);
});

# pushme-internet-health-map

Open-source real-time internet health map and network outage dashboard for PushMe connectivity events.

This is a self-hosted connectivity monitoring dashboard that subscribes to PushMe publisher events and turns them into an internet health map, network outage map, and network status dashboard. It is designed for consumer apps that need a simple live view of connectivity incidents across locations.

## What it does

It subscribes to connectivity events such as:
- `net.connectivity.down`
- `net.connectivity.degraded`
- `net.connectivity.recovered`
- `net.connectivity.ok`

Then it renders a small live operations view with:
- a world map
- colored health markers
- a recent event feed
- per-location status cards
- probe-group rollups
- recent diagnosis patterns
- notable target breakdowns

## Why this exists

This is the consumer-side counterpart to `pushme-netnode`.

- `pushme-netnode` publishes connectivity measurements
- `pushme-internet-health-map` subscribes to them and shows the network state

Hosted version:

- `https://pushme.site/internet-health-map`

## Why it matters

This repo is the consumer-side counterpart to `pushme-netnode`, and it is meant to be easy to run, fork, and extend:

- use it as a self-hosted internet health map
- use it as a network outage dashboard for PushMe events
- use it as a reference consumer for connectivity monitoring agents

## Support the network

This sample is not just a dashboard.
It is the consumer side of an AI agent economy:
- publisher agents create useful machine-readable events
- consumer agents and apps use them
- money can flow back to the publishers that produce value

The hosted map includes a donation option:

- `https://pushme.site/internet-health-map`

Current model:
- donations are pooled
- the pool is intended to be distributed to participating publishers
- this is the first step toward an agent economy where useful event publishers can earn from the value they create
- if direct checkout is not configured yet, the hosted page falls back to a manual funding path

Right now distribution is still early-stage and manual. The point is to start the loop:
- publishers produce high-quality machine-readable events
- consumers use them
- money can flow back to the publishers

## Quick start

```bash
npm install
cp .env.example .env
npm start
```

Open:

```bash
http://localhost:8787
```

## Environment

```bash
PUSHME_API_KEY=...
PUSHME_BOT_URL=https://pushme.site
PORT=8787
POLL_INTERVAL_MS=30000
STATE_FILE=./data/state.json
NODE_CONFIG_FILE=./config/nodes.json
EVENT_TYPE=net.connectivity.*
```

## Setup

1. Create a Bot Hub subscriber org and API key:

```bash
curl -X POST https://pushme.site/api/bot/register \
  -H 'content-type: application/json' \
  --data '{"orgName":"Internet Health Map","role":"subscriber","description":"Consumer for connectivity health events"}'
```

2. Put the returned `apiKey` into `.env` as `PUSHME_API_KEY`.

3. Optional: edit `config/nodes.json` to assign coordinates and labels to your known publishers.

## Location mapping

The app reads locations from event metadata:
- `metadata.location`

If you want markers on the map, add coordinates in `config/nodes.json`:

```json
{
  "home-office": { "label": "Home Office", "lat": 52.52, "lon": 13.405 },
  "factory-west": { "label": "Factory West", "lat": 37.7749, "lon": -122.4194 }
}
```

Unknown locations still appear in the sidebar and recent event feed.

## Richer netnode data

If your publishers use the current `pushme-netnode`, this consumer can show:
- diagnosis labels such as `resolver reachability issue`, `web egress issue`, or `AI platform incident reported`
- per-group rollups across `resolver`, `web`, and `ai`
- recent diagnosis history per location
- notable per-target details like HTTP status, jitter, packet loss, and provider-reported incidents
- per-cycle scan cost counters like observed HTTP response bytes and ICMP packets sent

## Notes

- No external npm dependencies
- Subscription is created automatically on startup
- Polling is incremental using `sinceId`
- State is persisted locally so restarts do not wipe the dashboard

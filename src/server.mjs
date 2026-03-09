import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { ensureSubscription, fetchSubscribedEvents } from './pushmeClient.mjs';
import { loadJsonFile, saveJsonFile } from './state.mjs';
import { reduceEvents, summarizeNodes } from './model.mjs';

const config = loadConfig();
const nodeConfig = loadJsonFile(config.nodeConfigFile, {}).data;
const persisted = loadJsonFile(config.stateFile, { sinceId: 0, lastPollAt: null, nodes: {}, recentEvents: [] });
let dashboardState = persisted.data;
let syncError = null;

function renderStaticFile(filePath, contentType, res) {
  const resolved = path.resolve(process.cwd(), filePath);
  const body = fs.readFileSync(resolved);
  res.writeHead(200, { 'content-type': contentType });
  res.end(body);
}

function writeJson(res, payload, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function syncOnce() {
  if (!config.pushmeApiKey) {
    throw new Error('Missing PUSHME_API_KEY');
  }
  await ensureSubscription(config.pushmeBotUrl, config.pushmeApiKey, config.eventType);
  const response = await fetchSubscribedEvents(config.pushmeBotUrl, config.pushmeApiKey, dashboardState.sinceId ?? 0);
  const events = Array.isArray(response.events) ? response.events : [];
  if (!events.length) {
    dashboardState = {
      ...dashboardState,
      lastPollAt: new Date().toISOString()
    };
    saveJsonFile(config.stateFile, dashboardState);
    return;
  }
  dashboardState = reduceEvents(dashboardState, events, nodeConfig);
  saveJsonFile(config.stateFile, dashboardState);
}

async function pollLoop() {
  try {
    await syncOnce();
    syncError = null;
  } catch (error) {
    syncError = error instanceof Error ? error.message : String(error);
    console.error(syncError);
  } finally {
    setTimeout(pollLoop, config.pollIntervalMs);
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/') {
    return renderStaticFile('./public/index.html', 'text/html; charset=utf-8', res);
  }
  if (req.method === 'GET' && url.pathname === '/app.css') {
    return renderStaticFile('./public/app.css', 'text/css; charset=utf-8', res);
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    return renderStaticFile('./public/app.js', 'application/javascript; charset=utf-8', res);
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    const { nodes, counts } = summarizeNodes(dashboardState);
    return writeJson(res, {
      counts,
      nodes,
      recentEvents: dashboardState.recentEvents ?? [],
      lastPollAt: dashboardState.lastPollAt ?? null,
      syncError
    });
  }
  return writeJson(res, { error: 'Not found' }, 404);
});

server.listen(config.port, () => {
  console.log(`pushme-internet-health-map listening on http://localhost:${config.port}`);
});

pollLoop().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
});

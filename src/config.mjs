import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key || process.env[key] != null) continue;
    process.env[key] = value;
  }
}

loadDotEnv();

function readText(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function readNumber(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

export function loadConfig() {
  return {
    pushmeApiKey: readText('PUSHME_API_KEY'),
    pushmeBotUrl: readText('PUSHME_BOT_URL', 'https://pushme.site'),
    port: Math.max(1, Math.trunc(readNumber('PORT', 8787))),
    pollIntervalMs: Math.max(5000, Math.trunc(readNumber('POLL_INTERVAL_MS', 30000))),
    stateFile: readText('STATE_FILE', './data/state.json'),
    nodeConfigFile: readText('NODE_CONFIG_FILE', './config/nodes.json'),
    eventType: readText('EVENT_TYPE', 'net.connectivity.*')
  };
}


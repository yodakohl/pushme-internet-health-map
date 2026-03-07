import fs from 'node:fs';
import path from 'node:path';

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

export function loadJsonFile(filePath, fallback) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) return { path: resolved, data: fallback };
  try {
    return { path: resolved, data: JSON.parse(fs.readFileSync(resolved, 'utf8')) };
  } catch {
    return { path: resolved, data: fallback };
  }
}

export function saveJsonFile(filePath, data) {
  const resolved = path.resolve(process.cwd(), filePath);
  ensureDir(resolved);
  fs.writeFileSync(resolved, JSON.stringify(data, null, 2));
}


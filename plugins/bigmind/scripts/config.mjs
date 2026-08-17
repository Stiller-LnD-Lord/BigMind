#!/usr/bin/env node
/**
 * Read or update BigMind config.
 *
 * Usage:
 *   node config.mjs --show
 *   node config.mjs --set mindName="Brain"
 *   node config.mjs --set autoCapture=false --set minUserTurns=4
 */

import { loadConfig, saveConfig, CONFIG_PATH, DEFAULT_CONFIG } from './lib.mjs';

const argv = process.argv.slice(2);
const cfg = loadConfig();

const pairs = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--set' && argv[i + 1]) {
    pairs.push(argv[i + 1]);
    i++;
  }
}

function coerce(key, raw) {
  const value = raw.replace(/^["']|["']$/g, '');
  const proto = DEFAULT_CONFIG[key];

  // protectExisting is tri-state: 'auto' | true | false. Its default is a
  // string, so the generic string branch below would store "false" — a
  // truthy value that silently disables the protection it looks like it sets.
  if (key === 'protectExisting') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return 'auto';
  }

  if (typeof proto === 'boolean') return value === 'true' || value === '1';
  if (typeof proto === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : proto;
  }
  if (Array.isArray(proto)) return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return value;
}

if (pairs.length) {
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq < 1) {
      console.error(`config: malformed --set "${pair}" (expected key=value)`);
      process.exit(1);
    }
    const key = pair.slice(0, eq).trim();
    if (!(key in DEFAULT_CONFIG)) {
      console.error(`config: unknown key "${key}". Valid: ${Object.keys(DEFAULT_CONFIG).join(', ')}`);
      process.exit(1);
    }
    cfg[key] = coerce(key, pair.slice(eq + 1));
  }
  saveConfig(cfg);
  console.log(`Saved ${CONFIG_PATH}`);
}

console.log(JSON.stringify(cfg, null, 2));

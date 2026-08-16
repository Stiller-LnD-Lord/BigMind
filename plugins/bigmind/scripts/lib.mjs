/**
 * BigMind shared helpers.
 *
 * Everything here is dependency-free and cross-platform (Windows/macOS/Linux).
 * Hook scripts must never throw — a crashing hook is worse than a missed memory.
 */

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';

export const CLAUDE_DIR = join(homedir(), '.claude');
export const BIGMIND_DIR = join(CLAUDE_DIR, 'bigmind');
export const CONFIG_PATH = join(BIGMIND_DIR, 'config.json');
export const QUEUE_PATH = join(BIGMIND_DIR, 'pending.jsonl');
export const LOG_PATH = join(BIGMIND_DIR, 'bigmind.log');

/** Defaults used until the user runs /bigmind:mind-setup. */
export const DEFAULT_CONFIG = {
  // What the user calls their memory. Purely cosmetic — it changes how Claude
  // refers to it in conversation, not where anything is stored on disk.
  mindName: 'Mind',
  // Master switch for automatic end-of-session capture.
  autoCapture: true,
  // Sessions with fewer real user turns than this are considered chit-chat
  // and are dropped rather than distilled.
  minUserTurns: 3,
  // Safety valve: never let the backlog grow without bound.
  maxQueue: 25,
  // Projects (by absolute cwd) to never capture from.
  excludeProjects: [],
};

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function loadConfig() {
  try {
    if (!existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg) {
  ensureDir(BIGMIND_DIR);
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

/**
 * Claude Code stores per-project state under ~/.claude/projects/<encoded-cwd>/.
 * The encoding replaces every non-alphanumeric character with a hyphen, so
 * "C:\Users\Tom" becomes "C--Users-Tom".
 */
export function encodeProjectDir(cwd) {
  return String(cwd || '').replace(/[^a-zA-Z0-9]/g, '-');
}

/** The native auto-memory directory for a given project. */
export function memoryDir(cwd) {
  return join(CLAUDE_DIR, 'projects', encodeProjectDir(cwd), 'memory');
}

export function memoryIndexPath(cwd) {
  return join(memoryDir(cwd), 'MEMORY.md');
}

/** Read the JSON payload Claude Code sends on stdin. Returns {} on anything odd. */
export async function readHookInput() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function readQueue() {
  try {
    if (!existsSync(QUEUE_PATH)) return [];
    return readFileSync(QUEUE_PATH, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function writeQueue(entries) {
  ensureDir(BIGMIND_DIR);
  const body = entries.map((e) => JSON.stringify(e)).join('\n');
  writeFileSync(QUEUE_PATH, body ? body + '\n' : '', 'utf8');
}

export function appendQueue(entry) {
  ensureDir(BIGMIND_DIR);
  appendFileSync(QUEUE_PATH, JSON.stringify(entry) + '\n', 'utf8');
}

/** Best-effort debug log; never throws. */
export function log(message) {
  try {
    ensureDir(BIGMIND_DIR);
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch {
    /* ignore */
  }
}

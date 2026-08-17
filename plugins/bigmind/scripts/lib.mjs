/**
 * BigMind shared helpers.
 *
 * Everything here is dependency-free and cross-platform (Windows/macOS/Linux).
 * Hook scripts must never throw — a crashing hook is worse than a missed memory.
 */

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';

export const CLAUDE_DIR = join(homedir(), '.claude');
export const BIGMIND_DIR = join(CLAUDE_DIR, 'bigmind');
export const CONFIG_PATH = join(BIGMIND_DIR, 'config.json');
export const QUEUE_PATH = join(BIGMIND_DIR, 'pending.jsonl');
export const SEEN_PATH = join(BIGMIND_DIR, 'seen.json');
export const BACKUP_DIR = join(BIGMIND_DIR, 'backups');
export const LOG_PATH = join(BIGMIND_DIR, 'bigmind.log');

/** Defaults used until the user runs /bigmind:mind-setup. */
export const DEFAULT_CONFIG = {
  // What the user calls their memory. Purely cosmetic — it changes how Claude
  // refers to it in conversation, not where anything is stored on disk.
  mindName: 'Mind',
  // Master switch for automatic end-of-session capture.
  autoCapture: true,
  // Protection for memories that predate BigMind.
  //   'auto'  — protect any file that already existed when BigMind first saw
  //             the project. BigMind may still edit files it created itself.
  //   true    — never modify or delete ANY existing memory file.
  //   false   — no protection; BigMind may merge into any file.
  protectExisting: 'auto',
  // Copy the memory directory into ~/.claude/bigmind/backups before the first
  // distillation touches a project.
  backupBeforeFirstWrite: true,
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

/** Markdown files currently in a project's memory directory. */
export function listMemoryFiles(cwd) {
  try {
    const dir = memoryDir(cwd);
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md')).sort();
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * Baseline tracking
 *
 * The first time BigMind sees a project we record which memory files were
 * already there. Those files predate BigMind and — under 'auto' protection —
 * are never modified or deleted by it. Files BigMind creates afterwards are
 * fair game for merging, which is what keeps the knowledge base from filling
 * with near-duplicates.
 * ------------------------------------------------------------------ */

export function readSeen() {
  try {
    if (!existsSync(SEEN_PATH)) return {};
    return JSON.parse(readFileSync(SEEN_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function writeSeen(obj) {
  ensureDir(BIGMIND_DIR);
  writeFileSync(SEEN_PATH, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

/**
 * Record the pre-BigMind baseline for a project if we haven't already.
 * Returns { baseline, firstEncounter }.
 */
export function recordBaseline(cwd) {
  const key = encodeProjectDir(cwd);
  const seen = readSeen();
  if (seen[key]) return { baseline: seen[key].baseline || [], firstEncounter: false };

  const baseline = listMemoryFiles(cwd).filter((f) => f !== 'MEMORY.md');
  seen[key] = {
    cwd,
    firstSeen: new Date().toISOString(),
    baseline,
  };
  writeSeen(seen);
  return { baseline, firstEncounter: true };
}

/** Files BigMind must not modify or delete, given the config. */
export function protectedFiles(cfg, cwd) {
  if (cfg.protectExisting === false) return [];
  if (cfg.protectExisting === true) {
    return listMemoryFiles(cwd).filter((f) => f !== 'MEMORY.md');
  }
  // 'auto'
  const key = encodeProjectDir(cwd);
  const seen = readSeen();
  return (seen[key] && seen[key].baseline) || [];
}

/**
 * Copy a project's memory directory into the BigMind backup area.
 * Returns the backup path, or null if there was nothing to copy.
 */
export function backupMemories(cwd, label = 'auto') {
  try {
    const files = listMemoryFiles(cwd);
    if (!files.length) return null;

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = join(BACKUP_DIR, `${encodeProjectDir(cwd)}__${label}__${stamp}`);
    ensureDir(dest);
    const src = memoryDir(cwd);
    for (const f of files) copyFileSync(join(src, f), join(dest, f));
    return dest;
  } catch (err) {
    log(`backup failed for ${cwd}: ${err && err.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ */

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

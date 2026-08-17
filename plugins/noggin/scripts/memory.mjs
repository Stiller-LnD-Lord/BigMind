#!/usr/bin/env node
/**
 * Inspect and protect a project's memory directory.
 *
 * Usage:
 *   node memory.mjs --status [--cwd <path>]     what's there, what's protected
 *   node memory.mjs --backup [--cwd <path>]     snapshot the memory directory
 *   node memory.mjs --adopt  [--cwd <path>]     record the pre-Noggin baseline now
 *   node memory.mjs --release <file.md>         stop protecting one file
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadConfig,
  memoryDir,
  listMemoryFiles,
  recordBaseline,
  protectedFiles,
  backupMemories,
  readSeen,
  writeSeen,
  encodeProjectDir,
  BACKUP_DIR,
} from './lib.mjs';

const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : null;
}

const cwd = flag('--cwd') || process.cwd();
const cfg = loadConfig();
const dir = memoryDir(cwd);

/** Old-style frontmatter put `type:` at the top level; current nests it under `metadata:`. */
function frontmatterStyle(file) {
  try {
    const text = readFileSync(join(dir, file), 'utf8');
    if (!text.startsWith('---')) return 'none';
    const fm = text.split('---')[1] || '';
    if (/^\s*metadata:/m.test(fm)) return 'current';
    if (/^\s*type:/m.test(fm)) return 'legacy';
    return 'partial';
  } catch {
    return 'unreadable';
  }
}

if (argv.includes('--backup')) {
  const path = backupMemories(cwd, 'manual');
  console.log(path ? `Backed up to ${path}` : 'Nothing to back up — no memory files found.');
  process.exit(0);
}

if (argv.includes('--adopt')) {
  const { baseline, firstEncounter } = recordBaseline(cwd);
  console.log(
    firstEncounter
      ? `Baseline recorded: ${baseline.length} pre-existing memories are now protected.`
      : `Baseline already recorded (${baseline.length} protected). Use --release to unprotect a file.`,
  );
  process.exit(0);
}

if (argv.includes('--release')) {
  const file = flag('--release');
  if (!file) {
    console.error('memory: --release needs a filename');
    process.exit(1);
  }
  const key = encodeProjectDir(cwd);
  const seen = readSeen();
  if (!seen[key]) {
    console.error('memory: no baseline recorded for this project');
    process.exit(1);
  }
  const before = seen[key].baseline.length;
  seen[key].baseline = seen[key].baseline.filter((f) => f !== file);
  writeSeen(seen);
  console.log(
    before === seen[key].baseline.length
      ? `"${file}" was not protected.`
      : `Released "${file}". Noggin may now merge into it. ${seen[key].baseline.length} still protected.`,
  );
  process.exit(0);
}

// Default: --status
const files = listMemoryFiles(cwd);
const memories = files.filter((f) => f !== 'MEMORY.md');
const prot = protectedFiles(cfg, cwd);
const seen = readSeen()[encodeProjectDir(cwd)];

console.log(`Project        : ${cwd}`);
console.log(`Memory dir     : ${dir}`);
console.log(`Exists         : ${existsSync(dir)}`);
console.log(`Memories       : ${memories.length}${files.includes('MEMORY.md') ? ' (+ MEMORY.md index)' : ' (no index!)'}`);
console.log(`Mind name      : ${cfg.mindName}`);
console.log(`protectExisting: ${cfg.protectExisting}`);
console.log(`Protected      : ${prot.length}`);
console.log(`Baseline taken : ${seen ? seen.firstSeen : 'not yet — run --adopt before first capture'}`);
console.log(`Backups        : ${BACKUP_DIR}`);

if (memories.length) {
  const styles = { current: [], legacy: [], partial: [], none: [], unreadable: [] };
  for (const f of memories) styles[frontmatterStyle(f)].push(f);

  console.log('\nFiles:');
  for (const f of memories) {
    const mark = prot.includes(f) ? '[protected]' : '[writable] ';
    console.log(`  ${mark} ${f}  (${frontmatterStyle(f)} frontmatter)`);
  }

  if (styles.legacy.length || styles.partial.length || styles.none.length) {
    console.log(
      `\nNote: ${styles.legacy.length + styles.partial.length + styles.none.length} file(s) ` +
        'use an older or missing frontmatter style. They still work — Claude reads the body ' +
        'either way — but /noggin:mind-upgrade can normalise them.',
    );
  }
}

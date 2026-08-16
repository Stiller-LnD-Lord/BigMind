#!/usr/bin/env node
/**
 * Queue management for BigMind.
 *
 * Usage:
 *   node queue.mjs --list                     show pending sessions
 *   node queue.mjs --done <sessionId> [...]   remove sessions once distilled
 *   node queue.mjs --clear                    drop everything pending
 */

import { readQueue, writeQueue, loadConfig, QUEUE_PATH } from './lib.mjs';

const argv = process.argv.slice(2);
const cfg = loadConfig();
const queue = readQueue();

if (argv.includes('--clear')) {
  writeQueue([]);
  console.log(`Cleared ${queue.length} pending session(s).`);
  process.exit(0);
}

if (argv.includes('--done')) {
  const ids = argv.slice(argv.indexOf('--done') + 1).filter((a) => !a.startsWith('--'));
  if (!ids.length) {
    console.error('queue: --done needs at least one sessionId');
    process.exit(1);
  }
  const remaining = queue.filter((e) => !ids.includes(e.sessionId));
  const removed = queue.length - remaining.length;
  writeQueue(remaining);
  console.log(`Marked ${removed} session(s) distilled. ${remaining.length} still pending.`);
  process.exit(0);
}

// Default: --list
console.log(`Mind name : ${cfg.mindName}`);
console.log(`Auto-capture: ${cfg.autoCapture ? 'on' : 'off'}`);
console.log(`Queue file: ${QUEUE_PATH}`);
console.log(`Pending   : ${queue.length}`);
for (const e of queue) {
  console.log(`  - ${e.sessionId}  ended=${e.endedAt}`);
  console.log(`    project=${e.cwd}`);
  console.log(`    transcript=${e.transcriptPath}`);
}

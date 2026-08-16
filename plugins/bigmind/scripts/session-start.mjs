#!/usr/bin/env node
/**
 * SessionStart hook — runs when a session begins or resumes.
 *
 * If previous sessions are sitting unprocessed in the queue, print an
 * instruction to stdout. SessionStart is one of the few events where plain
 * stdout is injected into the conversation as context Claude can act on, so
 * this is what actually triggers the distillation.
 *
 * Prints nothing when the queue is empty, which is the common case.
 */

import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { readHookInput, loadConfig, readQueue, writeQueue, memoryDir, log } from './lib.mjs';

async function main() {
  const input = await readHookInput();
  const cfg = loadConfig();

  if (!cfg.autoCapture) return;

  const queue = readQueue();
  if (!queue.length) return;

  // Transcripts can be deleted between sessions; drop dead pointers quietly.
  const alive = queue.filter((e) => e.transcriptPath && existsSync(e.transcriptPath));
  if (alive.length !== queue.length) writeQueue(alive);
  if (!alive.length) return;

  // Never distil the session we're currently inside.
  const currentId = input.session_id;
  const pending = alive.filter((e) => e.sessionId !== currentId);
  if (!pending.length) return;

  const mind = cfg.mindName || 'Mind';
  const target = memoryDir(input.cwd || process.cwd());

  const lines = [];
  lines.push(`<bigmind-pending>`);
  lines.push(
    `BigMind: ${pending.length} finished session${pending.length === 1 ? '' : 's'} ` +
      `${pending.length === 1 ? 'is' : 'are'} waiting to be distilled into the user's ${mind}.`,
  );
  lines.push('');
  lines.push('Pending sessions:');
  for (const e of pending) {
    lines.push(`- sessionId=${e.sessionId} ended=${e.endedAt} project=${e.cwd}`);
    lines.push(`  transcript=${e.transcriptPath}`);
  }
  lines.push('');
  lines.push(`Memory directory for this project: ${target}`);
  lines.push('');
  lines.push(
    'ACTION: Invoke the `bigmind` skill and follow its distillation procedure. ' +
      'Do this in the BACKGROUND via a subagent so it does not delay the user — ' +
      'spawn one general-purpose agent with run_in_background, then immediately ' +
      'carry on with whatever the user actually asked for. Do not narrate the ' +
      'distillation beyond a single short line. If the user gave no instruction ' +
      'yet, just do it and report a one-line summary of what was learned.',
  );
  lines.push(`</bigmind-pending>`);

  process.stdout.write(lines.join('\n') + '\n');
  log(`injected ${pending.length} pending session(s) at start of ${currentId}`);
}

main().catch((err) => log(`session-start error: ${err && err.message}`));

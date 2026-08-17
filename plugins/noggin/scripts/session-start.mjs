#!/usr/bin/env node
/**
 * SessionStart hook — runs when a session begins or resumes.
 *
 * Two jobs:
 *   1. Record the pre-Noggin baseline for this project, so memories that
 *      predate the plugin can be protected from it.
 *   2. If previous sessions are sitting unprocessed in the queue, print an
 *      instruction to stdout. SessionStart is one of the few events where
 *      plain stdout is injected into the conversation as context Claude can
 *      act on, so this is what actually triggers the distillation.
 *
 * Prints nothing when the queue is empty, which is the common case.
 */

import { existsSync } from 'node:fs';
import {
  readHookInput,
  loadConfig,
  readQueue,
  writeQueue,
  memoryDir,
  recordBaseline,
  protectedFiles,
  backupMemories,
  log,
} from './lib.mjs';

async function main() {
  const input = await readHookInput();
  const cfg = loadConfig();
  const cwd = input.cwd || process.cwd();

  // Always run, even with auto-capture off — the baseline must reflect the
  // state of the folder BEFORE Noggin ever writes to it. Recording it late
  // would quietly leave newer memories unprotected.
  const { baseline, firstEncounter } = recordBaseline(cwd);
  if (firstEncounter && baseline.length) {
    log(`baseline recorded for ${cwd}: ${baseline.length} pre-existing memories protected`);
  }

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
  const target = memoryDir(cwd);
  const protectedList = protectedFiles(cfg, cwd);

  // One-time safety net before Noggin first writes into an established folder.
  if (cfg.backupBeforeFirstWrite && firstEncounter && baseline.length) {
    const path = backupMemories(cwd, 'pre-noggin');
    if (path) log(`pre-write backup: ${path}`);
  }

  const lines = [];
  lines.push('<noggin-pending>');
  lines.push(
    `Noggin: ${pending.length} finished session${pending.length === 1 ? '' : 's'} ` +
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

  if (protectedList.length) {
    lines.push(
      `PROTECTED FILES (${protectedList.length}) — these predate Noggin and are ` +
        'READ-ONLY. You may read them for context and you MUST read them to avoid ' +
        'writing duplicates, but you may NOT edit, rewrite, reword, merge into, or ' +
        'delete any of them. If a new fact belongs with one of these, create a NEW ' +
        'file that links to it with [[name]] rather than modifying it:',
    );
    for (const f of protectedList) lines.push(`  - ${f}`);
    lines.push('');
    lines.push(
      'MEMORY.md: you may APPEND new index lines for files you create. Do not ' +
        'reword, reorder, or remove existing lines.',
    );
    lines.push('');
  }

  lines.push(
    'ACTION: Invoke the `noggin` skill and follow its distillation procedure. ' +
      'Do this in the BACKGROUND via a subagent so it does not delay the user — ' +
      'spawn one general-purpose agent with run_in_background, then immediately ' +
      'carry on with whatever the user actually asked for. Do not narrate the ' +
      'distillation beyond a single short line. If the user gave no instruction ' +
      'yet, just do it and report a one-line summary of what was learned.',
  );
  lines.push('</noggin-pending>');

  process.stdout.write(lines.join('\n') + '\n');
  log(
    `injected ${pending.length} pending session(s) at start of ${currentId}; ` +
      `${protectedList.length} protected file(s)`,
  );
}

main().catch((err) => log(`session-start error: ${err && err.message}`));

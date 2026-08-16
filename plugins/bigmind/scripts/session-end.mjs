#!/usr/bin/env node
/**
 * SessionEnd hook — runs when a Claude Code session terminates.
 *
 * This does NOT distil anything. SessionEnd hooks share a ~1.5s budget (raised
 * to match the configured timeout, capped at 60s), which is nowhere near enough
 * to read a transcript and think about it. So all we do here is append a
 * pointer to the queue — a few milliseconds — and let the next session do the
 * actual work with a real model and no clock pressure.
 */

import { existsSync } from 'node:fs';
import { readHookInput, loadConfig, readQueue, writeQueue, log } from './lib.mjs';

async function main() {
  const input = await readHookInput();
  const cfg = loadConfig();

  if (!cfg.autoCapture) return;

  const { session_id: sessionId, transcript_path: transcriptPath, cwd } = input;
  if (!sessionId || !transcriptPath) return;

  // The transcript may already be gone on a "clear" or crash — nothing to queue.
  if (!existsSync(transcriptPath)) return;

  const excluded = (cfg.excludeProjects || []).some(
    (p) => cwd && String(cwd).toLowerCase().startsWith(String(p).toLowerCase()),
  );
  if (excluded) return;

  const queue = readQueue();

  // Re-queuing the same session would produce duplicate memories.
  if (queue.some((e) => e.sessionId === sessionId)) return;

  queue.push({
    sessionId,
    transcriptPath,
    cwd: cwd || process.cwd(),
    endedAt: new Date().toISOString(),
  });

  // Drop the oldest entries if the backlog gets silly (e.g. auto-capture was
  // left on through a week of unattended runs).
  const trimmed = queue.slice(-Math.max(1, cfg.maxQueue));
  writeQueue(trimmed);

  log(`queued ${sessionId} (${trimmed.length} pending)`);
}

main().catch((err) => log(`session-end error: ${err && err.message}`));

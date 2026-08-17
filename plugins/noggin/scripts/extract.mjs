#!/usr/bin/env node
/**
 * Condense a Claude Code transcript into a bounded, readable digest.
 *
 * Transcripts routinely run to tens of megabytes — mostly tool results and
 * thinking blocks that are worthless a week later. Feeding one to a model
 * directly is impossible. This strips the transcript down to the parts that
 * actually carry intent: what the user asked for, what Claude concluded, which
 * files were touched, and which commands were run.
 *
 * Usage: node extract.mjs <transcript-path> [--max-chars 60000]
 */

import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const MAX_USER_CHARS = 1500;
const MAX_ASSISTANT_CHARS = 600;
const MAX_COMMAND_CHARS = 200;
const HEAD_TURNS = 20;
const TAIL_TURNS = 45;

function parseArgs(argv) {
  const transcriptPath = argv[2];
  const maxIdx = argv.indexOf('--max-chars');
  const maxChars = maxIdx > -1 ? parseInt(argv[maxIdx + 1], 10) || 60000 : 60000;
  return { transcriptPath, maxChars };
}

/** Remove injected wrappers that are noise in a summary. */
function stripInjected(text) {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, '')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    .trim();
}

function truncate(text, limit) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > limit ? clean.slice(0, limit) + ' […]' : clean;
}

/** Pull the most identifying argument out of a tool call. */
function describeToolUse(name, input) {
  if (!input || typeof input !== 'object') return null;
  if (input.file_path) return { kind: 'file', tool: name, value: input.file_path };
  if (input.command && (name === 'Bash' || name === 'PowerShell')) {
    return { kind: 'command', tool: name, value: truncate(String(input.command), MAX_COMMAND_CHARS) };
  }
  if (input.url) return { kind: 'url', tool: name, value: String(input.url) };
  return null;
}

async function main() {
  const { transcriptPath, maxChars } = parseArgs(process.argv);

  if (!transcriptPath || !existsSync(transcriptPath)) {
    console.error(`extract: transcript not found: ${transcriptPath || '(none)'}`);
    process.exit(1);
  }

  const meta = { cwd: null, gitBranch: null, version: null, firstTs: null, lastTs: null };
  const turns = [];
  const toolCounts = new Map();
  const filesTouched = new Set();
  const filesRead = new Set();
  const commands = [];
  const urls = new Set();
  let userTurnCount = 0;

  const rl = createInterface({
    input: createReadStream(transcriptPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    // Subagent chatter is an implementation detail of a single session.
    if (event.isSidechain) continue;

    if (event.cwd && !meta.cwd) meta.cwd = event.cwd;
    if (event.gitBranch) meta.gitBranch = event.gitBranch;
    if (event.version) meta.version = event.version;
    if (event.timestamp) {
      if (!meta.firstTs) meta.firstTs = event.timestamp;
      meta.lastTs = event.timestamp;
    }

    const content = event.message && event.message.content;
    if (!content) continue;

    const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content) }];

    for (const block of blocks) {
      if (block.type === 'text' && typeof block.text === 'string') {
        const text = stripInjected(block.text);
        if (!text) continue;

        if (event.type === 'user') {
          userTurnCount += 1;
          turns.push({ role: 'user', text: truncate(text, MAX_USER_CHARS) });
        } else if (event.type === 'assistant') {
          turns.push({ role: 'assistant', text: truncate(text, MAX_ASSISTANT_CHARS) });
        }
      } else if (block.type === 'tool_use' && block.name) {
        toolCounts.set(block.name, (toolCounts.get(block.name) || 0) + 1);
        const detail = describeToolUse(block.name, block.input);
        if (!detail) continue;

        if (detail.kind === 'file') {
          if (['Write', 'Edit', 'NotebookEdit'].includes(block.name)) filesTouched.add(detail.value);
          else filesRead.add(detail.value);
        } else if (detail.kind === 'command') {
          commands.push(detail.value);
        } else if (detail.kind === 'url') {
          urls.add(detail.value);
        }
      }
      // thinking + tool_result blocks are deliberately dropped.
    }
  }

  // Keep the opening (which states the goal) and the ending (which states the
  // outcome); the middle of a long session is mostly iteration.
  let kept = turns;
  let elided = 0;
  if (turns.length > HEAD_TURNS + TAIL_TURNS) {
    elided = turns.length - HEAD_TURNS - TAIL_TURNS;
    kept = [...turns.slice(0, HEAD_TURNS), ...turns.slice(-TAIL_TURNS)];
  }

  const out = [];
  out.push('# Session digest');
  out.push('');
  out.push(`- Project: ${meta.cwd || 'unknown'}`);
  if (meta.gitBranch) out.push(`- Git branch: ${meta.gitBranch}`);
  out.push(`- Started: ${meta.firstTs || 'unknown'}`);
  out.push(`- Ended: ${meta.lastTs || 'unknown'}`);
  out.push(`- User turns: ${userTurnCount}`);
  out.push('');

  if (filesTouched.size) {
    out.push('## Files created or edited');
    for (const f of [...filesTouched].slice(0, 60)) out.push(`- ${f}`);
    if (filesTouched.size > 60) out.push(`- …and ${filesTouched.size - 60} more`);
    out.push('');
  }

  if (filesRead.size) {
    out.push('## Files read (context only)');
    for (const f of [...filesRead].slice(0, 30)) out.push(`- ${f}`);
    if (filesRead.size > 30) out.push(`- …and ${filesRead.size - 30} more`);
    out.push('');
  }

  if (commands.length) {
    out.push('## Commands run');
    const unique = [...new Set(commands)];
    for (const c of unique.slice(0, 40)) out.push(`- \`${c}\``);
    if (unique.length > 40) out.push(`- …and ${unique.length - 40} more`);
    out.push('');
  }

  if (urls.size) {
    out.push('## URLs fetched');
    for (const u of [...urls].slice(0, 20)) out.push(`- ${u}`);
    out.push('');
  }

  if (toolCounts.size) {
    const summary = [...toolCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([n, c]) => `${n}×${c}`)
      .join(', ');
    out.push(`## Tool usage`);
    out.push(summary);
    out.push('');
  }

  out.push('## Conversation');
  out.push('');
  for (let i = 0; i < kept.length; i++) {
    if (elided && i === HEAD_TURNS) {
      out.push(`_[… ${elided} turns elided from the middle of the session …]_`);
      out.push('');
    }
    const t = kept[i];
    out.push(`**${t.role === 'user' ? 'User' : 'Claude'}:** ${t.text}`);
    out.push('');
  }

  let text = out.join('\n');
  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + '\n\n_[digest truncated at max-chars]_\n';
  }
  process.stdout.write(text);
}

main().catch((err) => {
  console.error(`extract: ${err && err.message}`);
  process.exit(1);
});

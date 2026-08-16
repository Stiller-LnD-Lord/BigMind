---
description: Inspect, capture into, or tidy your BigMind long-term memory
argument-hint: "[status | capture | review | search <term>]"
---

Use the `bigmind` skill to handle this request.

The plugin's scripts are at `${CLAUDE_PLUGIN_ROOT}/scripts/`.
User config is at `~/.claude/bigmind/config.json` — read `mindName` and use
that word when talking to the user about their memory.

Subcommand requested: **$ARGUMENTS** (default to `status` if empty)

- **status** — Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/queue.mjs" --list`.
  Then list the memory files for the current project and show the contents of
  `MEMORY.md`. Report: how many memories exist, how many sessions are pending
  distillation, and whether auto-capture is on.

- **capture** — Distil the pending queue now rather than waiting for the next
  session start. Follow the distillation procedure in the skill for each queued
  session, then mark each done with `queue.mjs --done <sessionId>`. If the queue
  is empty, instead distil *this* conversation so far, applying the same
  standard for what earns a memory.

- **review** — Run the maintenance audit from the skill: find stale, duplicate,
  vague, and orphaned entries. Verify claims against the current repo before
  calling anything stale. Present findings as a numbered list with a
  recommendation for each, and wait for confirmation before deleting anything.

- **search `<term>`** — Grep the project's memory directory for the term and
  show matching memories with enough surrounding context to be useful.

If `$ARGUMENTS` is something else, interpret it as a fact the user wants
remembered: apply the "what earns a memory" bar from the skill, and either
write it, fold it into an existing memory, or explain why it doesn't warrant one.

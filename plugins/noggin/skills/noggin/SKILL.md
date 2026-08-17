---
name: noggin
description: Distil finished Claude Code sessions into durable long-term memory, and maintain that memory over time. Use when the injected <noggin-pending> context reports sessions waiting to be distilled, when the user asks to save/remember something for future sessions, or when they ask to review, prune, or search their memory (which they may call their Mind, Brain, or whatever name they configured).
---

# Noggin

Noggin turns finished sessions into a small, high-signal knowledge base that
loads automatically in every future session. The goal is that six months from
now, Claude already knows the project's conventions, constraints, and gotchas
without the user re-explaining them.

## Where memories live

Noggin writes into Claude Code's **native auto-memory directory**:

```
~/.claude/projects/<encoded-cwd>/memory/
├── MEMORY.md          <- index, auto-loaded into context every session
├── user_*.md
├── feedback_*.md
├── project_*.md
└── reference_*.md
```

`<encoded-cwd>` is the absolute working directory with every non-alphanumeric
character replaced by a hyphen (`C:\Users\Tom` → `C--Users-Tom`).

This matters: Noggin deliberately does **not** invent its own storage. By
using the native location, memories are picked up by Claude Code's built-in
loader with no extra configuration. Noggin supplies the automation and the
editorial standard, not a parallel filesystem.

Only `MEMORY.md` is loaded up front. Individual memory files are read on demand
when their index line looks relevant — so the index must be genuinely
descriptive, and the whole thing must stay small.

## What the user calls it

Read `~/.claude/noggin/config.json` for `mindName` and use that word when
talking to the user ("saved to your Brain", "already in your Vault"). It is a
label only — it never changes paths or filenames. Default is "Mind".

## Distillation procedure

Run this when `<noggin-pending>` context appears, or on `/noggin:mind capture`.

**1. Build a digest.** Never read a raw transcript — they reach tens of
megabytes. Run:

```
node "<plugin-root>/scripts/extract.mjs" "<transcriptPath>"
```

This yields a bounded markdown digest (typically 5–60KB) with the user's turns,
Claude's conclusions, files touched, and commands run.

**2. Read the existing index.** Open `MEMORY.md` in the project's memory
directory plus any existing files that look related. You are editing a
knowledge base, not appending to a log.

**3. Extract candidate facts.** For each candidate ask: *would a competent
colleague, given the repo and its git history, already know this?* If yes,
discard it. Keep only what the code cannot tell you.

Good candidates:
- A correction the user made, and the reasoning behind it
- A convention that is enforced but not documented anywhere
- A constraint from the environment (proxies, licences, approvals, tooling quirks)
- Project state that isn't in the repo (what's paused, what's awaiting sign-off, versions in flight)
- A pointer to an external resource (dashboard, ticket, deployed URL, site ID)

Discard:
- Anything re-derivable by reading the code or `git log`
- Narration of what happened this session ("we fixed the header")
- One-off debugging steps with no lasting rule
- Restatements of `CLAUDE.md`

**4. Decide update vs. create.** Search existing memories first. If a file
already covers the topic, **update it** — do not create a near-duplicate. A
growing wiki dies from duplication faster than from omission.

> **Unless the file is protected.** See "Protected memories" below. If the
> injected context lists protected files, or `memory.mjs --status` marks a file
> `[protected]`, that file is **read-only**: read it for context, but express
> any new fact as a NEW file that links back with `[[name]]`.

**5. Write the files.** Follow `reference/memory-format.md` exactly. One fact
per file. `feedback` and `project` types must carry **Why** and **How to
apply** sections — a memory that states a rule without the reasoning gets
misapplied later.

**6. Update `MEMORY.md`.** One line per memory:
`- [Title](file.md) — short hook`. Never put memory content in the index.

**7. Clear the queue.** Once written:

```
node "<plugin-root>/scripts/queue.mjs" --done <sessionId>
```

Do this even when a session yielded nothing worth keeping — otherwise it is
reconsidered on every subsequent startup.

**8. Report in one line.** For example: *"Added 2 memories from yesterday's
session (Netlify site IDs, transcript button rule)."* Do not narrate the
process. If nothing was worth keeping, say so in one short clause.

## Protected memories

Many people arrive at Noggin with a memory folder they have curated by hand
for months. Those files are the most valuable thing in the system and the
easiest thing to quietly ruin — not by deleting them, but by "merging" a new
observation in and smoothing away the specific detail that made the rule
useful. The owner would not notice for weeks.

So Noggin records a **baseline**: the list of memory files that existed the
first time it saw a project. Under the default `protectExisting: 'auto'`, those
files are read-only to Noggin forever. Files Noggin creates itself stay
writable, which is what keeps duplicates under control going forward.

Check the state at any time:

```
node "<plugin-root>/scripts/memory.mjs" --status
```

**Rules when a file is protected:**

- **Read it.** You must, or you will write duplicates.
- **Never** edit, reword, reorder, merge into, rename, or delete it.
- If a new fact belongs with a protected memory, write a **new** file that
  references it: `Extends [[existing-memory-name]].`
- In `MEMORY.md`, **append** index lines for files you create. Do not reword,
  reorder, or remove existing lines.
- If a protected memory is genuinely **wrong**, do not fix it silently. Say so
  to the user and let them decide — that is what `/noggin:mind review` is for.

The user can hand a specific file over with
`memory.mjs --release <file.md>`, or drop protection entirely with
`config.mjs --set protectExisting=false`. Both are their call, never yours.

## Restraint is the whole game

Most sessions produce **zero or one** memory. A session that produces five is
unusual and probably means the bar slipped. Aim for a knowledge base of roughly
10–40 files per project; past that, the index stops being scannable and starts
being a cost paid at the start of every session.

When genuinely unsure whether something earns a file, leave it out. A missing
memory costs one re-explanation. A wrong or vague memory quietly corrupts every
future session that reads it.

## Maintenance

On `/noggin:mind review`, audit the memory directory and report:
- **Stale** — claims about files, versions, or state that no longer hold. Verify against the current repo before flagging; memories are point-in-time snapshots.
- **Duplicates** — two files covering one fact; merge them.
- **Vague** — no actionable rule, or missing the Why. Rewrite or delete.
- **Orphaned index lines** — entries in `MEMORY.md` with no matching file, and vice versa.

Propose changes and let the user confirm before deleting anything. Deleting a
memory is cheap to redo; deleting the wrong one silently loses context.

## Privacy

Never write secrets, credentials, tokens, API keys, or personal data about
third parties into a memory file. If a fact can only be expressed by including
one, record the shape instead ("the deploy token lives in 1Password under X"),
not the value.

# BigMind

**Automatic long-term memory for Claude Code.**

Every Claude Code session starts from zero. You re-explain the same conventions,
the same constraints, the same "no, we don't do it that way here" — every time.

BigMind fixes that. When a session ends, it gets queued. At the start of your
next session, Claude quietly distils the previous one into a small, permanent
knowledge base — then loads it automatically forever after. After a few weeks,
Claude already knows how your team works.

You don't have to do anything. That's the point.

---

## Install

Two commands inside Claude Code:

```
/plugin marketplace add Stiller-LnD-Lord/BigMind
/plugin install bigmind@bigmind
```

Then, once:

```
/bigmind:mind-setup
```

It asks what you'd like to call your memory — **Brain**, **Vault**, whatever —
and that's it. Nothing else to configure.

**Requirements:** Claude Code with plugin support, and Node.js (already required
by Claude Code). Works on Windows, macOS, and Linux.

---

## How it works

```
Session ends  ──►  SessionEnd hook appends a pointer to a queue   (~5ms)
                                    │
Next session  ──►  SessionStart hook sees the queue, injects an instruction
starts                              │
                                    ▼
                   Background subagent condenses the transcript,
                   extracts what's worth keeping, writes memory files
                                    │
                                    ▼
              ~/.claude/projects/<project>/memory/*.md
                   loaded automatically in every future session
```

**Why not distil at session end?** `SessionEnd` hooks share a ~1.5 second
budget (raised to at most 60s). That is nowhere near enough to read a transcript
and think about it, and anything slow there delays your shell prompt. So BigMind
does the near-free part at exit — appending one line to a queue — and the
thinking at the start of the next session, where there's no clock and a full
model with tool access. If a distillation is ever missed, the entry stays queued
until it succeeds.

**Transcripts are huge.** Real ones run to tens of megabytes, mostly tool output
that is worthless a week later. `scripts/extract.mjs` streams a transcript into a
bounded digest — user turns, Claude's conclusions, files touched, commands run —
dropping thinking blocks and tool results. A 33MB transcript becomes an 8KB
digest in about half a second, so distillation costs very little.

**It uses Claude Code's own memory directory.** BigMind does not invent a
parallel store. It writes to `~/.claude/projects/<encoded-cwd>/memory/`, which
Claude Code already loads on its own. BigMind supplies the automation and the
editorial standard; the loading is native.

---

## What actually gets saved

The hard part isn't capturing things — it's *not* capturing things. A memory
folder that grows without restraint becomes noise you pay for at the start of
every session.

The bar is: **would a competent colleague, given the repo and its git history,
already know this?** If yes, it isn't saved.

| Type | What it holds |
|------|---------------|
| `user` | Who you are — role, expertise, preferences |
| `feedback` | Corrections you've given, **and the reasoning behind them** |
| `project` | State not derivable from the repo — what's paused, awaiting sign-off, in flight |
| `reference` | Pointers to dashboards, tickets, deploy targets, site IDs |

Each memory is one fact in one markdown file, and `feedback`/`project` entries
must carry a **Why** and a **How to apply** — a rule without its reasoning gets
misapplied later. See
[memory-format.md](plugins/bigmind/skills/bigmind/reference/memory-format.md)
for the full standard and worked good/bad examples.

Most sessions produce **zero or one** memory. That's correct, not a failure.

---

## Commands

| Command | Does |
|---------|------|
| `/bigmind:mind-setup` | First-run setup; choose your memory's name |
| `/bigmind:mind status` | What's stored, what's queued, is capture on |
| `/bigmind:mind capture` | Distil now instead of waiting for the next session |
| `/bigmind:mind review` | Audit for stale, duplicate, or vague memories |
| `/bigmind:mind search <term>` | Search your memories |
| `/bigmind:mind <a fact>` | Remember something specific, right now |

---

## Configuration

`~/.claude/bigmind/config.json`:

| Key | Default | Meaning |
|-----|---------|---------|
| `mindName` | `"Mind"` | What Claude calls it in conversation. Cosmetic only — no paths change. |
| `autoCapture` | `true` | Master switch for automatic capture |
| `minUserTurns` | `3` | Sessions shorter than this are treated as chit-chat |
| `maxQueue` | `25` | Backlog cap; oldest entries drop past this |
| `excludeProjects` | `[]` | Absolute paths to never capture from |

```bash
node <plugin-root>/scripts/config.mjs --show
node <plugin-root>/scripts/config.mjs --set mindName="Brain"
node <plugin-root>/scripts/config.mjs --set autoCapture=false
```

Or just ask Claude — "turn off BigMind for this project" works.

---

## Your data

Everything is plain markdown on your own machine. Nothing is uploaded anywhere,
and there is no server, database, or telemetry. Read it, edit it in any editor,
grep it, delete it, or commit it to a private repo to share across machines.

BigMind is instructed never to write secrets, tokens, credentials, or personal
data about third parties into a memory file. Memory files are ordinary text —
if you work under a policy about where project information may be stored, apply
the same judgement here as you would to notes in a local file.

**Uninstall:** `/plugin uninstall bigmind@bigmind`. Your memories are not
deleted — they're in Claude Code's native memory directory and keep working.

---

## Repo layout

```
BigMind/
├── .claude-plugin/marketplace.json     the marketplace catalogue
└── plugins/bigmind/
    ├── .claude-plugin/plugin.json      plugin manifest
    ├── hooks/hooks.json                SessionEnd + SessionStart wiring
    ├── commands/                       /mind, /mind-setup
    ├── skills/bigmind/                 the distillation procedure + format standard
    └── scripts/                        lib, session-end, session-start, extract, queue, config
```

Scripts are dependency-free Node ESM. Hooks are written to fail silently — a
broken hook must never block a session.

---

## Troubleshooting

**Nothing is being saved.** Give it a few sessions; short ones are skipped by
design (`minUserTurns`). Check `/bigmind:mind status` and the log at
`~/.claude/bigmind/bigmind.log`.

**Hooks aren't firing.** Confirm the plugin is enabled with `/plugin`, and check
`node --version` resolves in your shell. Run `claude --debug` to see hook
execution.

**Too much is being saved.** Run `/bigmind:mind review` and prune. If it keeps
over-collecting, the bar in `SKILL.md` is the thing to tighten.

---

MIT licensed.

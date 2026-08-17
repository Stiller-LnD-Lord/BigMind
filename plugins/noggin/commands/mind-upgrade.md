---
description: Adopt an existing hand-built memory folder into Noggin, without changing it
---

The user already has memories — built by hand, or accumulated through Claude
Code's built-in auto-memory — and wants Noggin to take over the automation
**without touching what's already there**. That guarantee is the whole point of
this command. Be conservative; nothing here should surprise them.

Scripts are at `${CLAUDE_PLUGIN_ROOT}/scripts/`.

## Step 1 — Survey what they have

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/memory.mjs" --status
```

Report plainly: how many memories, whether an index exists, and whether any use
the older frontmatter style. If the folder is empty, tell them there is nothing
to upgrade — plain `/noggin:mind-setup` is all they need — and stop.

## Step 2 — Back up

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/memory.mjs" --backup
```

Tell them the path. Do this even though Noggin also backs up automatically
before its first write — a backup they were told about is worth more than one
they weren't.

## Step 3 — Freeze the baseline

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/memory.mjs" --adopt
```

This records every current memory as **protected**: Noggin may read them but
never edit or delete them. Only files it creates later are writable.

Run this **before** the first capture. Running it afterwards would leave
anything written in between unprotected.

## Step 4 — Check the index is honest

Read `MEMORY.md` and compare it against the files on disk. Report — do not fix
without asking — any index line pointing at a missing file, and any memory file
with no index line. An index entry is how a memory gets found later, so a
missing line means that memory is effectively invisible.

If they want it fixed, **only add lines for orphaned files**. Do not reword or
reorder existing lines.

## Step 5 — Offer format normalisation (optional, opt-in)

Older memories put `type:` at the top level of the frontmatter; the current
convention nests it under `metadata:`. **Both work** — Claude reads the body
either way — so this is cosmetic. Say that plainly, and only proceed if they
ask. If they do, rewrite the frontmatter and **leave every word of the body
untouched**.

## Step 6 — Name it and confirm

Ask what they want to call their memory (see `/noggin:mind-setup`), set it
with `config.mjs --set mindName="..."`, then confirm in three lines:

1. N existing memories are protected and will not be modified.
2. New memories will be added alongside them automatically, from the next
   session onward.
3. `/noggin:mind status` shows the state; `/noggin:mind review` audits it.

Mention that if they ever want Noggin to be able to merge into a particular
old memory, `memory.mjs --release <file.md>` hands over that one file.

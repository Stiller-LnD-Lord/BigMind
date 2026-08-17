---
description: Set up Noggin and choose what you want to call your memory
---

Set up Noggin for this user. Keep it to two exchanges at most — this should
feel like a thirty-second job.

**Step 1 — Ask what they want to call it.**

Use the AskUserQuestion tool. Explain in one line that this is just the word
you'll use in conversation ("saved to your Brain"), not a folder name — nothing
on disk changes. Offer: **Brain**, **Mind**, **Vault**, **Notebook**, and let
them type their own.

**Step 2 — Write the config.**

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" --set mindName="<their choice>"
```

**Step 3 — Confirm it's live and show them the three things they need to know.**

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/queue.mjs" --list` to confirm the
config took effect, then tell them:

1. **It runs itself.** When a session ends it's queued; the distillation happens
   in the background at the start of their next session. Nothing to remember.
2. **Their memory lives in** `~/.claude/projects/<encoded-cwd>/memory/` as plain
   markdown — greppable, editable in any editor, deletable. Most people never
   touch it.
3. **`/noggin:mind status`** shows what's stored, **`/noggin:mind review`**
   tidies it up.

Finally, mention that it will feel like nothing is happening for the first few
sessions — the memory only becomes useful once it has a handful of entries. Set
that expectation now so they don't conclude it's broken.

**If they ask to turn it off later:**
`node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" --set autoCapture=false`

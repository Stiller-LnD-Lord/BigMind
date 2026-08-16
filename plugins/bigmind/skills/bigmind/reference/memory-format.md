# Memory file format

One fact per file. Filename is `<type>_<kebab-slug>.md` — the type prefix means
`ls` on the directory groups itself.

## Template

```markdown
---
name: <kebab-case-slug, matching the filename minus the type prefix>
description: <one line — this is what future-Claude reads to decide whether to open the file>
metadata:
  type: user | feedback | project | reference
---

<The fact, stated as a rule in one or two sentences.>

**Why:** <the reasoning, and who decided it — include an absolute date>

**How to apply:** <concrete, checkable steps>
```

`**Why:**` and `**How to apply:**` are **required** for `feedback` and
`project`. They are optional for `reference` and `user`, which are usually a
single statement.

## The four types

| Type | Holds | Example |
|------|-------|---------|
| `user` | Who the user is — role, expertise, preferences, vocabulary | "Learning designer; builds eLearning in vanilla HTML/CSS/JS; prefers no frameworks" |
| `feedback` | Guidance on how to work — corrections and confirmed approaches | "Use `git commit -F <file>` for multi-line messages, not a here-string" |
| `project` | Ongoing work, goals, constraints not derivable from the repo | "Module rollout paused pending sign-off; versions currently in flight" |
| `reference` | Pointers to external resources | "Three deploy sites and which content each serves; use site ID not name" |

## Rules

1. **One fact per file.** If the description needs an "and", split it.
2. **Absolute dates, never relative.** "7 Jul 2026", not "last week" — the file
   outlives the conversation that created it.
3. **State rules, not history.** "All bullet lists use the small arrow" beats
   "we changed the arrow size". The reader wants the rule, not the changelog.
4. **Link related memories** with `[[other-memory-name]]`. A link to a file that
   doesn't exist yet is fine — it marks something worth writing later.
5. **No secrets.** Never a token, key, password, or third-party personal data.
6. **Nothing the repo already says.** If `git log` or the code answers it, drop it.

## Worked example — good

```markdown
---
name: git-commit-multiline
description: Use `git commit -F <file>` for multi-line commit messages, not a PowerShell here-string
metadata:
  type: feedback
---

Write multi-line commit messages to a temp file and use `git commit -F <file>`.
Do not pass them via a PowerShell here-string with `-m`.

**Why:** Flagged 10 Aug 2026 after a commit failed. PowerShell here-strings
break when the message contains apostrophes or double quotes, which commit
messages routinely do. The failure is a confusing parser error, not an obvious
quoting problem, so it costs several minutes each time.

**How to apply:**
- Write the message to a scratch file, then `git commit -F <path>`.
- Delete the scratch file afterwards.
- Single-line messages can still use `-m "..."`.
```

Note what makes it work: a rule, a dated reason, and steps that can be checked.

## Worked example — bad

```markdown
---
name: git-stuff
description: Notes about git
metadata:
  type: feedback
---

Had some trouble with commits today. Be careful with quoting. Also we should
probably tidy up the branches at some point.
```

Three separate failures: the description doesn't say what's inside, so it will
never be opened at the right moment; "be careful" is not an applicable rule;
and the branch remark is a second, unrelated fact that belongs in its own file
or nowhere at all.

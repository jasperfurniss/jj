# JJ Open-Source Readiness — Design Spec

**Date:** 2026-04-08
**Status:** Approved
**Goal:** Get JJ into a state where it can live in a public GitHub repo, be useful to any Jira Cloud team, and be approachable for both developers and product managers.

## Branding & Packaging

- **Command name:** `jj` (unchanged)
- **npm package name:** `jj-cli`
- **Tagline:** "JJ: your helpful jira buddy"
- **Publishing:** Not yet — clean up the repo first, publish to npm later

## 1. Security & Open-Source Hygiene

### Before `git init`

Create `.gitignore` as the very first file, before initializing git. This ensures `.env` (which contains live credentials) never enters version control.

### `.gitignore`

```
node_modules/
dist/
.env
jira-output/
.claude/
.cursor/
```

### `.env.example`

Ship an annotated `.env.example` with placeholder values and comments for each variable. Required vs optional clearly marked.

```env
# Required: Your Jira Cloud instance URL
JIRA_BASE_URL=https://yourcompany.atlassian.net

# Required: Email associated with your Jira account
JIRA_EMAIL=you@example.com

# Required: Jira API token (generate at https://id.atlassian.com/manage-profile/security/api-tokens)
JIRA_API_TOKEN=your-api-token-here

# Required: Your Jira project key (e.g., WEB, APP, ENG)
JIRA_PROJECT=WEB

# Required for `jj board`: Your Jira board ID (find in board URL)
JIRA_BOARD_ID=36

# Optional: Default JQL query for `jj list` and `jj` (interactive mode)
# JIRA_DEFAULT_JQL=assignee = currentUser() AND sprint in openSprints() ORDER BY rank ASC

# Optional: Directory for downloaded attachments (default: ./jira-output)
# JIRA_OUTPUT_DIR=./jira-output

# Optional: Transition name for `jj ready` (default: REVIEW)
# JJ_READY_TRANSITION=REVIEW

# Optional: Override column names (JSON array, default: ["To Do","In Progress","Review","Done"])
# JJ_COLUMNS=["To Do","In Progress","Review","Done"]

# Optional: Override status-to-column mapping (JSON object)
# JJ_STATUS_MAP={"to do":"To Do","in progress":"In Progress","review":"Review","done":"Done"}
```

### Remove from repo/directory before shipping

- `jira-output/` — contains downloaded Jira attachments (potentially sensitive)
- `dist/` — build artifacts
- `docs/plans/` — internal design docs with org-specific details
- `.claude/` and `.cursor/` — editor configs

### Fix command injection

`openMode`, `commentMode`, and `createMode` use string interpolation in `execSync` (e.g., `` execSync(`open ${url}`) ``). Replace with `execFileSync` or `spawn` with args arrays to prevent injection via crafted input.

## 2. Configuration & Generalization

### Already configurable (no changes needed)

- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` — core auth
- `JIRA_PROJECT` — project key
- `JIRA_BOARD_ID` — board for `jj board`
- `JIRA_DEFAULT_JQL` — default query

### New configurable values

| Setting | Env var | Default | Used by |
|---------|---------|---------|---------|
| Ready transition name | `JJ_READY_TRANSITION` | `"REVIEW"` | `jj ready` |
| Board columns | `JJ_COLUMNS` | `["To Do","In Progress","Review","Done"]` | `jj board` |
| Status-to-column map | `JJ_STATUS_MAP` | Current `STATUS_MAP` object | `jj board` |
| Column transition names | `JJ_COLUMN_TRANSITIONS` | Current `COLUMN_TRANSITION_NAMES` | `jj board` (drag-drop) |

All of these fall back to the current hardcoded defaults if not set.

### Package rename

In `package.json`: `"name": "jj-cli"`, keep `"bin": { "jj": "./dist/cli.js" }`.

## 3. Remove / Defer for v1

- **`webhook.ts`** — Remove entirely. Cut `jj serve` command, `validateWebhookConfig`, and related env vars (`GITHUB_WEBHOOK_SECRET`, `GITHUB_USERNAME`, `WEBHOOK_PORT`).
- **`node-fetch` dependency** — Remove. Node 18+ has native `fetch`, project targets Node 24.
- **`docs/plans/`** — Don't ship. Contains org-specific internal design docs.

### Keep

- **`terminal-image`** — Rich output with inline images is the default output mode, not opt-in.
- **`ink` + `react`** — Powers the board UI, a flagship feature.

## 4. PM Features

### `jj sprint`

Sprint overview command. Shows the current sprint's issues grouped by status with assignee and counts per column. A quick read-only snapshot.

- Interactive mode: formatted, colorized terminal output
- `--pipe`: plain text/markdown suitable for pasting

### `jj summary`

Sprint roundup generator for PMs. Pulls sprint data from Jira, opens `$EDITOR` with a pre-filled template.

**Template structure (detailed, default):**

```markdown
# {squad} Sprint Roundup — {sprint_name}
Sprint: {sprint_name} | Dates: {start_date} – {end_date}

## PTO Radar
<!-- Add PTO/OOO here -->

## Agenda Highlights
<!-- Add highlights, reminders, notes here -->

## Key Milestones
<!-- Add milestones with dates here -->

## Sprint Priorities
{issues grouped by assignee or status, pre-filled from Jira}
```

**Concise template (`--concise`):**

```markdown
# {squad} Sprint Priorities — {sprint_name}
Sprint Focus: {focus — fill in}

## OOO
<!-- Add OOO here -->

## Product & Content
{product issues from Jira}

## Development
{dev issues from Jira, grouped by assignee}

## QA
{qa issues from Jira}

## Design
{design issues from Jira}

## Notes
<!-- Add notes here -->
```

**Workflow:**
1. Fetch active sprint + issues from Jira
2. Open `$EDITOR` with pre-filled template (Jira data populated, human sections have comment prompts)
3. PM edits, saves, closes editor
4. Output: clipboard, stdout, or file
5. `--pipe` mode skips editor, outputs the auto-generated parts only

**Role-based grouping:** If issues have Jira components or labels matching "Product", "Dev"/"Development", "QA", "Design", use those for grouping in `--concise` mode. Otherwise fall back to assignee grouping.

### `jj whois <person>`

Shows what's assigned to a person in the current sprint. Searches by display name. Useful for standup prep.

- `jj whois adam` — finds issues assigned to anyone matching "adam"
- `--pipe` for scriptable output

### `jj search <text>`

Expose the existing `searchIssuesByText` as a top-level command. Interactive mode shows results in a select list (like `jj list`), pipe mode outputs tab-separated.

## 5. Agent Skills

JJ ships with ready-to-install skills for AI coding agents. These live in the repo under `skills/` and let agents automatically fetch Jira tickets, list sprint issues, and use JJ's full CLI non-interactively.

### `skills/cursor-rule.mdc`

A Cursor rule file (`.mdc`) that users copy into their `.cursor/rules/` directory. Genericized from the existing rule — no hardcoded paths.

```markdown
---
description: Jira CLI integration via JJ — fetches tickets and lists stories automatically
alwaysApply: false
---

# JJ — Jira integration

JJ is a CLI tool that fetches Jira tickets and converts them to Markdown.

## When the user mentions a Jira issue key (like WEB-1234, PROJ-56, etc.)

Automatically fetch the ticket by running:

\`\`\`bash
jj <KEY> --pipe
\`\`\`

Use the full markdown output as context for the conversation. Do not ask the user if they want you to fetch it — just do it.

## When the user asks to list their stories / assigned tickets / current sprint

Run:

\`\`\`bash
jj list --pipe
\`\`\`

This returns tab-separated lines: `KEY  STATUS  ASSIGNEE  SUMMARY`

If the user provides custom JQL, pass it:

\`\`\`bash
jj list --pipe --jql "your jql here"
\`\`\`

## Notes

- JJ reads credentials from `.env` in its install directory, or from env vars
- The `--pipe` flag makes it non-interactive (no spinners, no prompts, clean stdout)
- Without `--pipe`, the CLI is interactive — only use `--pipe` in agent context
```

**Install instructions (for README):**
```
cp skills/cursor-rule.mdc ~/.cursor/rules/jj.mdc
```

### `skills/claude-code.md`

A CLAUDE.md snippet that users append to their project or global CLAUDE.md. Same behavior as the Cursor rule — auto-fetch on issue key mention, list sprint issues on request.

```markdown
# JJ — Jira integration

When a Jira issue key is mentioned (e.g., WEB-1234, PROJ-56), automatically fetch it:

\`\`\`bash
jj <KEY> --pipe
\`\`\`

Use the markdown output as context. Do not ask — just fetch.

To list current sprint issues:

\`\`\`bash
jj list --pipe
\`\`\`

For custom JQL:

\`\`\`bash
jj list --pipe --jql "your jql here"
\`\`\`

Always use `--pipe` in agent context for non-interactive output.
```

**Install instructions (for README):**
```
# Append to your project's CLAUDE.md or ~/.claude/CLAUDE.md
cat skills/claude-code.md >> CLAUDE.md
```

### README section

The README includes an "Agent Integration" section:

> **JJ comes with agent skills that make working with Jira a breeze in AI coding assistants.**
>
> JJ's `--pipe` mode outputs clean markdown to stdout, making it a perfect tool for AI agents. Ship with ready-made skills for:
>
> - **Cursor** — Auto-fetches Jira tickets when you mention an issue key
> - **Claude Code** — Same behavior, as a CLAUDE.md snippet
>
> See [Agent Integration](#agent-integration) in the docs for install instructions.

## 6. Documentation

### `README.md`

- ASCII art banner (the JJ logo)
- One-line description: "JJ: your helpful jira buddy"
- Setup: clone, `npm install`, `npm run build`, copy `.env.example` to `.env`, fill in credentials (link to Atlassian API token docs)
- Command reference (reuse/expand the `jj help` table)
- Agent Integration section (Cursor rule + Claude Code snippet install instructions)
- Screenshots or GIFs of the board UI and sprint summary

### `LICENSE`

MIT

## 6. Code Cleanup

- Remove `webhook.ts` and all `jj serve` references
- Remove `node-fetch` from dependencies
- Fix command injection in `openMode`, `commentMode`, `createMode` — use `execFileSync`/`spawn` with args arrays
- Extract arg parsing — replace the long if/else chain in `main()` with a commands map
- Rename package to `jj-cli`
- Make rich output (with inline terminal images) the default output mode instead of a menu option
- `git init` after `.gitignore` is in place

## 7. Testing

Unit tests for pure functions only:

- **`converter.ts`**: `adfToMarkdown`, `issueToMarkdown` — various ADF node types, edge cases
- **`board.ts`**: `mapStatus` — known statuses, unknown statuses, case insensitivity
- **`config.ts`**: `validateConfig` — missing vars, partial vars

No integration tests or CLI interaction tests for v1.

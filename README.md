```
     ██╗      ██╗
     ██║      ██║   your helpful jira buddy
     ██║      ██║
██   ██║ ██   ██║
╚█████╔╝ ╚█████╔╝
 ╚════╝   ╚════╝
```

A fast, friendly CLI for Jira Cloud. Fetch tickets as markdown, manage your sprint board in the terminal, generate sprint summaries, and pipe everything into your AI coding agent.

## Install

```bash
npm install -g get-jj
```

## Setup

1. Create a `.env` file in JJ's install directory, or set environment variables directly:

```bash
# Find where JJ was installed, then create .env there:
jj help  # shows install location in the banner

# Or just set env vars in your shell profile:
export JIRA_BASE_URL=https://yourcompany.atlassian.net
export JIRA_EMAIL=you@example.com
export JIRA_API_TOKEN=your-token-here
export JIRA_PROJECT=WEB
export JIRA_BOARD_ID=36
```

2. You'll need these credentials:

- **`JIRA_BASE_URL`** — Your Jira Cloud URL (e.g., `https://yourcompany.atlassian.net`)
- **`JIRA_EMAIL`** — Your Jira account email
- **`JIRA_API_TOKEN`** — Generate one at [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- **`JIRA_PROJECT`** — Your project key (e.g., `WEB`, `APP`, `ENG`)
- **`JIRA_BOARD_ID`** — Find it in your board URL: `/jira/software/projects/WEB/boards/<ID>`

3. Verify it works:

```bash
jj list
```

### Install from source

```bash
git clone https://github.com/jasperfurniss/jj-cli.git
cd jj-cli
npm install
npm run build
npm link
cp .env.example .env  # fill in your credentials
```

## Commands

| Command | Description |
|---------|-------------|
| `jj` | Interactive: list issues, select, view as markdown |
| `jj <KEY>` | Fetch a specific issue (e.g., `jj WEB-1234`) |
| `jj list` | List your assigned sprint issues |
| `jj board` | Interactive kanban board — move cards between columns |
| `jj sprint` | Sprint overview (issues by status + assignee) |
| `jj summary` | Sprint roundup generator (opens $EDITOR with template) |
| `jj summary --concise` | Concise format grouped by role |
| `jj ready <number>` | Transition an issue to Review (e.g., `jj ready 1234`) |
| `jj open <KEY>` | Open issue in browser |
| `jj comment <KEY>` | Post a comment (`-m "msg"` or opens $EDITOR) |
| `jj create` | Create an issue (`-m`, $EDITOR, or pipe from stdin) |
| `jj clone <KEY>` | Clone an issue (keeps type, parent, labels) |
| `jj whois <name>` | What's assigned to this person? |
| `jj search <text>` | Search issues by summary |
| `jj help` | Show all commands |

Most commands support `--pipe` for non-interactive, machine-readable output.

## For Product Managers

JJ is built for developers *and* PMs. The sprint management commands are designed for the weekly rhythm of managing a Jira board:

- **`jj sprint`** — Quick snapshot of where things stand. Paste into Slack or bring to standup.
- **`jj summary`** — Generates a sprint roundup template pre-filled with Jira data. Add your PTO callouts, milestones, and commentary, then copy to Slack. Use `--concise` for a shorter role-based format.
- **`jj whois <name>`** — Check someone's plate before standup or 1:1s.
- **`jj board`** — Full kanban board in your terminal. Drag cards between columns with keyboard or mouse.

## Agent Integration

JJ comes with agent skills that make working with Jira a breeze in AI coding assistants.

JJ's `--pipe` mode outputs clean markdown to stdout, making it a perfect tool for AI agents. When your agent sees a Jira issue key like `WEB-1234`, it can automatically fetch the full ticket context.

### Cursor

Copy the rule into your Cursor config:

```bash
cp skills/cursor-rule.mdc ~/.cursor/rules/jj.mdc
```

Now when you mention a Jira key in Cursor, it'll fetch the ticket automatically.

### Claude Code

Append the skill to your project's CLAUDE.md (or global `~/.claude/CLAUDE.md`):

```bash
cat skills/claude-code.md >> CLAUDE.md
```

## Configuration

All configuration is via environment variables in `.env`. See `.env.example` for the full list.

### Optional settings

| Variable | Default | Description |
|----------|---------|-------------|
| `JIRA_DEFAULT_JQL` | Current user's open sprint | Default query for `jj list` |
| `JIRA_OUTPUT_DIR` | `./jira-output` | Where downloaded attachments go |
| `JJ_READY_TRANSITION` | `REVIEW` | Transition name for `jj ready` |
| `JJ_COLUMNS` | `["To Do","In Progress","Review","Done"]` | Board column names (JSON) |
| `JJ_STATUS_MAP` | See `.env.example` | Status-to-column mapping (JSON) |
| `JJ_COLUMN_TRANSITIONS` | See `.env.example` | Transition name candidates (JSON) |

## License

MIT

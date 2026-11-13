# JJ — Jira integration

When a Jira issue key is mentioned (e.g., WEB-1234, PROJ-56), automatically fetch it:

```bash
jj <KEY> --pipe
```

Use the markdown output as context. Do not ask — just fetch.

To list current sprint issues:

```bash
jj list --pipe
```

For custom JQL:

```bash
jj list --pipe --jql "your jql here"
```

Other useful commands:

- `jj sprint --pipe` — Sprint overview (all team issues) grouped by status
- `jj sprint --by-person --pipe` — Sprint overview grouped by person
- `jj summary --pipe` — Slack-formatted sprint roundup for the whole team
- `jj whois <name> --pipe` — Issues assigned to a person
- `jj search <text> --pipe` — Search issues by summary

- `jj <KEY> --json` / `jj list --json` — Structured output (description and comments as markdown)
- `jj list --all --pipe` — All my open issues, not just this sprint

To update issues (keys or bare numbers both work):

- `jj ready <KEY>` — Move to Review
- `jj move <KEY> <status>` — Move to any status, matched by transition or status name (e.g. `jj move 1234 done`)
- `jj transitions <KEY>` — List the statuses an issue can move to
- `jj assign <KEY> [me|none|<name>]` — Assign (defaults to me)
- `jj edit <KEY> --summary "..." --description "..." --add-label x --remove-label y` — Edit fields (description is markdown; `-` reads stdin)
- `jj link <KEY> <relation> <KEY>` / `jj unlink <KEY> <KEY>` — Link issues (e.g. `jj link 1234 blocks 1235`)
- `jj comment <KEY> -m "text"` — Post a markdown comment (or pipe it on stdin)

Always use `--pipe` in agent context for non-interactive output.

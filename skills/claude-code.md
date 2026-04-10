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

Always use `--pipe` in agent context for non-interactive output.

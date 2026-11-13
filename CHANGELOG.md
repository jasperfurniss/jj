# Changelog

All notable changes to JJ are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and JJ uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.0] - 2026-11-12

JJ can now change issues, not just read them: move, assign, edit, link, and comment in Markdown, all scriptable for agents.

### Added

- `jj move <KEY> <status>` moves an issue to any status. It matches the transition name or the status it leads to, ignoring case, spaces, and hyphens (`jj move 1234 in progress`), and lists the options when the target is unknown or ambiguous.
- `jj transitions <KEY>` lists the statuses an issue can move to (`--json` for scripts).
- `jj assign <KEY> [who]` assigns an issue to you (the default), a teammate by name or email, or `none` to unassign.
- `jj edit <KEY>` changes the summary (`--summary`), description (`--description`, Markdown, or `-` to read stdin), and labels (`--add-label`, `--remove-label`, repeatable).
- `jj link <KEY> <relation> <KEY>` links issues using any link type phrase, in either direction (`jj link 1 blocks 2`, `jj link 2 is blocked by 1`, `jj link 1 relates to 3`).
- `jj unlink <KEY> <KEY>` removes the links between two issues.
- `--json` on `jj <KEY>` and `jj list` returns structured issues (status, assignee, parent, labels, links, subtasks, and the description and comments as Markdown).
- `jj list --all` lists all your open issues, not just the current sprint.
- `jj --version`, plus `jj --help` and `-h` as aliases for `jj help`.
- Comments and new issue descriptions are written in Markdown and converted to Jira's rich text: headings, bold, italic, strike, inline code, links, bare URLs, bullet and numbered lists (nested), code blocks, quotes, rules, and tables.
- `jj comment` reads the comment from stdin when it is piped.
- Issue Markdown now includes **Links** and **Subtasks** sections.

### Changed

- `jj ready`, `jj comment`, and every new command accept a full key (`WEB-1234`) or just the number (`1234`).
- The banner only prints in a terminal, so piped output stays clean.
- Interactive commands run without a terminal (from a script or an agent) now exit with a hint, like `jj list --pipe`, instead of crashing.
- `jj help` builds its table from one list, so the columns always line up.

### Fixed

- Code blocks in issue Markdown put the closing fence on its own line. It used to run onto the last line of code.
- Quotes in issue Markdown no longer end with empty `> ` lines.

### Security

- Dependency updates from Dependabot: rollup, file-type, jimp, @xmldom/xmldom, follow-redirects, phin, terminal-image, and postcss.

## [1.1.0] - 2026-04-10

### Added

- `jj summary` prints a Slack-formatted sprint roundup and copies it to the clipboard (`--concise` for a shorter version).
- `jj sprint --by-person` groups the sprint overview by person.

### Changed

- `jj sprint` and `jj summary` cover the whole team's sprint, not just your issues.
- The package is published to npm as `get-jj`.

## [1.0.0] - 2026-04-09

### Added

- First release: fetch issues as Markdown (with attachments), list and select sprint issues, an interactive kanban board, open, comment, create, clone, ready, whois, and search.

[Unreleased]: https://github.com/jasperfurniss/jj/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/jasperfurniss/jj/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/jasperfurniss/jj/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/jasperfurniss/jj/releases/tag/v1.0.0

# PM Mode Design

**Date:** 2026-04-16
**Status:** Draft
**Command:** `jj pm`

## Summary

A terminal UI that gives product managers a unified dashboard over their Jira sprint. Launched via `jj pm`, it presents a left sidebar of views and a main panel showing the currently-selected dashboard. Read-only in v1 — focused on surfacing what's happening, not acting on it.

## Motivation

The existing `jj` CLI already exposes most PM-relevant data (`jj sprint`, `jj summary`, `jj whois`), but each command is a one-shot invocation that dumps text and exits. PMs doing their morning review flow want one persistent surface they can navigate between views on, without remembering flags or re-running commands. PM mode is that surface.

## Scope

### In scope (v1)

Six dashboards, each selectable from the sidebar:

1. **Sprint Overview** — status breakdown, progress, sprint dates
2. **By Person** — each teammate's load and status mix
3. **Blockers & Risk** — blocked, stale, and unassigned issues
4. **Summary Draft** — live render of the `jj summary` output
5. **Velocity** — committed vs completed over last 5 closed sprints
6. **Milestones** — issues grouped by `fixVersion`, ordered by release date

### Out of scope (v1)

- Write actions (transitions, comments, creation)
- Live polling / auto-refresh
- Mouse support
- PTO dashboard (no reliable data source today)
- Configurable panels, panel reordering, user-authored views
- Multi-board or multi-project views

## Non-goals

- Replacing `jj board`, `jj sprint`, `jj summary` — those remain as-is
- Becoming a full Jira client — this is a read-only dashboard, by design

## User Experience

### Launch

```bash
jj pm
```

Launches the dashboard. `jj` without args keeps its existing interactive-list behavior untouched.

### Layout

```
┌──────────┬────────────────────────────────────┐
│  JJ PM   │                                    │
│          │  Sprint Overview                   │
│ ▸ Sprint │  ─────────────────                 │
│   By Per │  (panel content)                   │
│   Block  │                                    │
│   Summ   │                                    │
│   Veloc  │                                    │
│   Miles  │                                    │
│          │                                    │
├──────────┴────────────────────────────────────┤
│ ↑/↓ nav · enter select · r refresh · q quit   │
└───────────────────────────────────────────────┘
```

- Sidebar: fixed width 22 columns, left-aligned
- Main panel: remaining width, with a header line (view label) and a divider
- Footer: single line showing active keybindings and last-fetched timestamp for the current view

### Focus model

Focus lives in one of two places at a time: the **sidebar** (picking a view) or the **panel** (browsing its rows).

- Sidebar starts focused at launch.
- `Enter` / `→` from sidebar activates the view AND moves focus into the panel (if the panel has focusable rows).
- `←` / `Esc` returns focus from panel to sidebar.
- Panels without focusable rows (e.g., Sprint Overview's progress bar) treat panel focus as a no-op — focus stays conceptually on the panel but no row highlight renders.

### Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `↑` / `k` | sidebar | Move view focus up |
| `↓` / `j` | sidebar | Move view focus down |
| `Enter` / `→` | sidebar | Activate view, move focus into panel |
| `1`–`6` | global | Jump directly to view by index (focus lands in panel) |
| `↑` / `k` | panel | Move row focus up |
| `↓` / `j` | panel | Move row focus down |
| `Enter` | panel | Open focused issue in browser (panels with issue rows only) |
| `←` / `Esc` | panel | Return focus to sidebar |
| `r` | global | Refetch current view |
| `q` / `Ctrl+C` | global | Quit |

Per-view additional bindings (e.g., `y` to copy on Summary Draft) are appended to the footer line when that view is active, so the footer always reflects what's usable right now.

### Data freshness

- Each view fetches on first activation and caches its result in the shell
- Switching views is instant after first fetch
- `r` force-refetches the current view and updates its "last fetched" timestamp
- No background polling

## Architecture

### File layout

```
src/
├── cli.ts                       # add `pm` subcommand, routes to pm/index.tsx
├── pm/
│   ├── index.tsx                # entry — renders <PmApp /> via Ink `render()`
│   ├── shell.tsx                # <PmApp>: sidebar, frame, router, keybindings
│   ├── registry.ts              # ordered PmView[] — single source of truth for nav
│   ├── types.ts                 # PmView, LoadState, ViewCache
│   ├── common/
│   │   ├── panel-frame.tsx      # title + divider wrapper
│   │   ├── loading.tsx
│   │   ├── error-box.tsx
│   │   └── empty-state.tsx
│   └── views/
│       ├── sprint-overview.tsx
│       ├── by-person.tsx
│       ├── blockers.tsx
│       ├── summary-draft.tsx
│       ├── velocity.tsx
│       └── milestones.tsx
```

### View contract

Each view module exports a `PmView<T>`:

```ts
export interface PmView<T> {
  id: string;
  label: string;
  fetch: (ctx: FetchCtx) => Promise<T>;
  Component: React.FC<{ data: T }>;
}

export interface FetchCtx {
  boardId: number;
  projectKey: string;
}
```

The shell does not know what a view renders — it only knows how to call `fetch`, hold the result, and render `<Component data={...} />`.

### Load state machine (per view)

```
idle → loading → ready
              ↘ error
```

- `idle`: not yet activated
- `loading`: fetch in flight
- `ready(data, fetchedAt)`: cached, displayable
- `error(message)`: fetch failed; panel shows `ErrorBox` with retry hint

`r` transitions `ready | error → loading`. Switching to a view in `idle` triggers fetch. Switching to a view in `ready` or `error` renders the cached state with no network call.

### Registry

```ts
// src/pm/registry.ts
import { sprintOverviewView } from "./views/sprint-overview.js";
// …
export const views: PmView<any>[] = [
  sprintOverviewView,
  byPersonView,
  blockersView,
  summaryDraftView,
  velocityView,
  milestonesView,
];
```

Sidebar is rendered directly from this array; order here is display order.

## Panel specifications

### 1. Sprint Overview

**Fetch:** active sprint issues via existing `getSprintIssues()` in `jira-client.ts`.

**Display:**
- Line 1: sprint name · start → end dates · "Day N of M"
- Line 2: column counts (`To Do: 4 · In Progress: 7 · Review: 3 · Done: 12`)
- Line 3: horizontal progress bar (block chars) representing % done

### 2. By Person

**Fetch:** same as Sprint Overview (reuse cached data where possible; for v1, independent fetch per view is acceptable).

**Display:** one row per assignee, sorted by total issue count desc:
```
Alice      6   3 In Progress · 2 Review · 1 Done
Bob        4   1 To Do · 2 In Progress · 1 Review
Unassigned 2   2 To Do
```

### 3. Blockers & Risk

**Fetch:** sprint issues; compute locally.

**Sections (render if non-empty):**
- **Blocked** — issues with an "is blocked by" link, or whose status literally equals "Blocked"
- **Stale** — issues whose status has not changed in 5+ days (uses `updated` field as proxy if changelog not fetched)
- **Unassigned** — issues in sprint with no assignee

Each row: `KEY  summary (truncated to panel width)`.

Empty state: "Nothing at risk. Ship it."

### 4. Summary Draft

**Fetch:** reuse the existing `buildSummary()` function from `src/summary.ts` — the same code path as `jj summary`.

**Display:** render the generated Slack-format text in a scrollable Ink `Box` with `overflowY="scroll"` equivalent (or paginated via `↑/↓` if Ink doesn't support native scroll in the panel frame — decide during implementation).

**Footer hint:** `y copy to clipboard` (piggybacks existing clipboard code from `summary.ts`).

### 5. Velocity

**Fetch (new):** last 5 closed sprints for the configured board via `GET /rest/agile/1.0/board/{boardId}/sprint?state=closed`. For each sprint, fetch issues and sum `customfield_10016` (story points) for committed vs completed.

**Display:** small table:
```
Sprint 41   28 committed   24 done   ████████░
Sprint 42   32 committed   30 done   █████████
Sprint 43   25 committed   26 done   ██████████
…
```

Implementation note: story point field ID varies by Jira instance. Read from `JIRA_STORY_POINT_FIELD` env var, defaulting to `customfield_10016`. Document in `.env.example`.

### 6. Milestones

**Fetch:** JQL `project = {projectKey} AND sprint in openSprints() AND fixVersion is not EMPTY`, include `fixVersions` in fields.

**Display:** grouped by `fixVersion`, sorted by release date ascending. Each group shows version name, release date, and percent complete:
```
v2.4 — 2026-04-22  (60%)
  WEB-101  ✓ Auth refactor
  WEB-118  ✓ Session expiry
  WEB-124    Login telemetry
  WEB-130    Password reset redesign

v2.5 — 2026-05-06  (10%)
  WEB-140    Magic-link onboarding
  …
```

## Shared components

- `PanelFrame` — renders header (view label) + divider; wraps panel content
- `LoadingPanel` — centered `Loading…` text (upgrade to spinner if `ink-spinner` acceptable as dep)
- `ErrorBox` — red-bordered box showing error message + `Press r to retry`
- `EmptyState` — centered dim text, one-line message

## Error handling

- Fetch failures are caught inside the shell's load-runner and set the view's state to `error(message)`
- The shell never crashes due to a panel fetch error — other views remain usable
- Env-var / config errors at startup (missing board, no API token) exit early with a clear message before the Ink app mounts

## Testing

**Framework:** Vitest (already in use) + `ink-testing-library`.

**Per-view unit tests (6 suites):**
- Stub `fetch` to return fixture data
- Render `<Component data={fixture} />`
- Assert key text appears
- For Blockers/Milestones: test empty-state rendering

**Registry test:**
- Import `views`, assert each has required fields (`id`, `label`, `fetch`, `Component`)
- Assert no duplicate `id`s

**Shell tests (with mocked 2-view registry):**
- Arrow-down moves sidebar focus
- `Enter` from sidebar activates: fetch called, `loading` then `ready` rendered, focus moves into panel
- `↑/↓` in panel moves row focus; `Enter` on an issue row calls the mocked `open` helper with the expected URL; `Esc` returns focus to sidebar
- Switching views after cache: fetch NOT called second time
- `r` on a ready view: fetch called again
- Fetch throwing: error state rendered, `r` retries

**No tests hit live Jira.** All fetches mocked at the view-module boundary.

## Rollout

Ship all 6 views in one release. The shell + registry are the framework; individual panels can be implemented in parallel once the shell lands. Suggested order during implementation for fastest value-visible progress:

1. Shell + registry + Sprint Overview (proves the framework end-to-end)
2. By Person, Blockers, Milestones (share the sprint-issues fetch)
3. Summary Draft (reuses existing code)
4. Velocity (requires new API — schedule last, could slip to a follow-up if Story-Point field config proves painful)

## Open questions (resolved before implementation)

All resolved in brainstorming:

- Sidebar role → view switcher (not filter, not ToC)
- Interaction → read-only v1: `Enter` on a focused issue row opens it in the browser; no write actions
- Refresh → snapshot per view with manual `r`
- Launch → `jj pm` (additive, no change to `jj` default)

## Risks

- **Velocity story-point field** — IDs vary by Jira instance. Mitigated by env var with sensible default, documented in `.env.example`.
- **Terminal width** — at <100 cols, the 22-col sidebar starts crowding panels. Acceptable floor: 80 cols; below that, render a warning message instead of the UI.
- **Ink scroll UX** — Ink lacks native scrollable containers. Summary Draft and long Milestones lists may need manual paging (`↑/↓` within panel) if they don't fit. Decide during implementation; acceptable fallback is truncation with a "…N more" footer.

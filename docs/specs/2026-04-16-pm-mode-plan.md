# PM Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `jj pm` terminal UI command that presents six read-only dashboards over Jira sprint data, switchable via a left sidebar.

**Architecture:** Ink/React TUI with a shell component (`PmApp`) that owns sidebar navigation, per-view load-state cache, and global keybindings. Each dashboard ("view") is a self-contained module in `src/pm/views/` that exports a `PmView` descriptor (`{ id, label, fetch, Component }`). A registry array drives sidebar order and view routing. Shell never touches Jira — views own their own fetches.

**Tech Stack:** TypeScript, Ink 6, React 19, Vitest, `ink-testing-library` (new dev dep), existing `jira-client.ts` helpers.

**Reference spec:** `docs/specs/2026-04-16-pm-mode-design.md`

---

## File Structure

### New files

```
src/pm/
├── index.tsx                  # entry; renders PmApp via Ink render()
├── shell.tsx                  # <PmApp>: sidebar, frame, router, keybindings, cache
├── registry.ts                # exports `views: PmView<any>[]`
├── types.ts                   # PmView, FetchCtx, LoadState, ViewCache
├── issue-fields.ts            # shared constant: extended field list for sprint fetches
├── open-url.ts                # helper: open a URL in the system browser
├── common/
│   ├── panel-frame.tsx        # title + divider wrapper
│   ├── loading.tsx            # LoadingPanel
│   ├── error-box.tsx          # ErrorBox
│   └── empty-state.tsx        # EmptyState
└── views/
    ├── sprint-overview.tsx
    ├── by-person.tsx
    ├── blockers.tsx
    ├── summary-draft.tsx
    ├── velocity.tsx
    └── milestones.tsx

test/pm/
├── shell.test.tsx
├── registry.test.ts
├── issue-fields.test.ts
├── views/
│   ├── sprint-overview.test.tsx
│   ├── by-person.test.tsx
│   ├── blockers.test.tsx
│   ├── summary-draft.test.tsx
│   ├── velocity.test.tsx
│   └── milestones.test.tsx
└── fixtures/
    ├── issues.ts              # sample JiraIssue[] used across view tests
    └── sprints.ts             # sample closed-sprint data for velocity
```

### Modified files

- `src/cli.ts` — add `pm` subcommand dispatch block
- `src/jira-client.ts` — add `getClosedSprints()` and ensure extra fields can be requested
- `src/config.ts` — add `storyPointFieldId` config + `JJ_STORY_POINT_FIELD_ID` env var
- `package.json` — add `ink-testing-library` to devDependencies
- `.env.example` — document `JJ_STORY_POINT_FIELD_ID`
- `README.md` — document `jj pm` in the commands table and PM section

---

## Task 1: Add `ink-testing-library` and wire up pm dispatch stub

**Files:**
- Modify: `package.json`
- Modify: `src/cli.ts` (new dispatch block before line ~733)
- Create: `src/pm/index.tsx`

- [ ] **Step 1: Install ink-testing-library**

Run: `cd ~/jira-tool && npm install --save-dev ink-testing-library`
Expected: package added to `devDependencies` in `package.json`; install succeeds.

- [ ] **Step 2: Create minimal pm entry that renders static text**

Create `src/pm/index.tsx`:

```tsx
import React from "react";
import { render, Box, Text } from "ink";

function PmApp() {
  return (
    <Box>
      <Text>PM mode (coming soon)</Text>
    </Box>
  );
}

export async function startPmMode(): Promise<void> {
  const app = render(<PmApp />);
  await app.waitUntilExit();
}
```

- [ ] **Step 3: Wire `jj pm` into cli.ts dispatch**

In `src/cli.ts`, add this block immediately before the default handler (near line 733, after the `ready` block):

```typescript
if (args[0] === "pm") {
  if (!pipeFlag) printBanner();
  validateConfig();
  const { startPmMode } = await import("./pm/index.js");
  await startPmMode();
  return;
}
```

Also add `| pm` row to the `jj help` command table wherever the help text lists subcommands (search `cli.ts` for the existing help table that mentions `board` and add `pm` after it, same format).

- [ ] **Step 4: Smoke test the dispatch**

Run: `cd ~/jira-tool && npm run dev -- pm`
Expected: banner prints, then "PM mode (coming soon)" renders, then the process waits. Press `Ctrl+C` to exit.

- [ ] **Step 5: Commit**

```bash
cd ~/jira-tool
git add package.json package-lock.json src/pm/index.tsx src/cli.ts
git commit -m "scaffold jj pm subcommand"
```

---

## Task 2: Define PmView types and registry

**Files:**
- Create: `src/pm/types.ts`
- Create: `src/pm/registry.ts`
- Create: `test/pm/registry.test.ts`

- [ ] **Step 1: Write the failing registry test**

Create `test/pm/registry.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { views } from "../../src/pm/registry.js";

describe("pm registry", () => {
  it("exports an array of views", () => {
    expect(Array.isArray(views)).toBe(true);
  });

  it("each view has required PmView fields", () => {
    for (const v of views) {
      expect(typeof v.id).toBe("string");
      expect(typeof v.label).toBe("string");
      expect(typeof v.fetch).toBe("function");
      expect(typeof v.Component).toBe("function");
    }
  });

  it("view ids are unique", () => {
    const ids = views.map(v => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/jira-tool && npx vitest run test/pm/registry.test.ts`
Expected: FAIL — `src/pm/registry.ts` does not exist.

- [ ] **Step 3: Create types.ts**

Create `src/pm/types.ts`:

```typescript
import type React from "react";

export interface FetchCtx {
  boardId: number;
  projectKey: string;
}

export interface PmView<T> {
  id: string;
  label: string;
  fetch: (ctx: FetchCtx) => Promise<T>;
  Component: React.FC<{ data: T }>;
}

export type LoadState<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: T; fetchedAt: Date }
  | { kind: "error"; message: string };
```

- [ ] **Step 4: Create empty registry**

Create `src/pm/registry.ts`:

```typescript
import type { PmView } from "./types.js";

export const views: PmView<any>[] = [];
```

- [ ] **Step 5: Run test to verify it passes (with empty array)**

Run: `cd ~/jira-tool && npx vitest run test/pm/registry.test.ts`
Expected: All three tests PASS (empty array trivially satisfies each check).

- [ ] **Step 6: Commit**

```bash
cd ~/jira-tool
git add src/pm/types.ts src/pm/registry.ts test/pm/registry.test.ts
git commit -m "add PmView types and empty registry"
```

---

## Task 3: Build the shared panel components

**Files:**
- Create: `src/pm/common/panel-frame.tsx`
- Create: `src/pm/common/loading.tsx`
- Create: `src/pm/common/error-box.tsx`
- Create: `src/pm/common/empty-state.tsx`

- [ ] **Step 1: Create PanelFrame**

Create `src/pm/common/panel-frame.tsx`:

```tsx
import React from "react";
import { Box, Text } from "ink";

export function PanelFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold color="cyan">{title}</Text>
      <Text dimColor>{"─".repeat(Math.max(title.length, 20))}</Text>
      <Box marginTop={1} flexDirection="column">{children}</Box>
    </Box>
  );
}
```

- [ ] **Step 2: Create LoadingPanel**

Create `src/pm/common/loading.tsx`:

```tsx
import React from "react";
import { Box, Text } from "ink";

export function LoadingPanel() {
  return (
    <Box><Text dimColor>Loading…</Text></Box>
  );
}
```

- [ ] **Step 3: Create ErrorBox**

Create `src/pm/common/error-box.tsx`:

```tsx
import React from "react";
import { Box, Text } from "ink";

export function ErrorBox({ message }: { message: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1}>
      <Text color="red" bold>Error</Text>
      <Text>{message}</Text>
      <Text dimColor>Press r to retry.</Text>
    </Box>
  );
}
```

- [ ] **Step 4: Create EmptyState**

Create `src/pm/common/empty-state.tsx`:

```tsx
import React from "react";
import { Box, Text } from "ink";

export function EmptyState({ message }: { message: string }) {
  return (
    <Box><Text dimColor>{message}</Text></Box>
  );
}
```

- [ ] **Step 5: Smoke-render via ink-testing-library**

Create `test/pm/common.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { PanelFrame } from "../../src/pm/common/panel-frame.js";
import { LoadingPanel } from "../../src/pm/common/loading.js";
import { ErrorBox } from "../../src/pm/common/error-box.js";
import { EmptyState } from "../../src/pm/common/empty-state.js";

describe("common panels", () => {
  it("PanelFrame renders title and children", () => {
    const { lastFrame } = render(
      <PanelFrame title="Hello"><></></PanelFrame>
    );
    expect(lastFrame()).toContain("Hello");
  });

  it("LoadingPanel says Loading", () => {
    const { lastFrame } = render(<LoadingPanel />);
    expect(lastFrame()).toContain("Loading");
  });

  it("ErrorBox renders message and retry hint", () => {
    const { lastFrame } = render(<ErrorBox message="boom" />);
    expect(lastFrame()).toContain("boom");
    expect(lastFrame()).toContain("retry");
  });

  it("EmptyState renders message", () => {
    const { lastFrame } = render(<EmptyState message="nothing here" />);
    expect(lastFrame()).toContain("nothing here");
  });
});
```

- [ ] **Step 6: Run tests**

Run: `cd ~/jira-tool && npx vitest run test/pm/common.test.tsx`
Expected: 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
cd ~/jira-tool
git add src/pm/common/ test/pm/common.test.tsx
git commit -m "add PM shared panel components"
```

---

## Task 4: Shell — sidebar rendering and sidebar focus nav

Build the sidebar first with no view activation wired up. Just renders the registry labels, arrow keys move a cursor, `q` quits.

**Files:**
- Modify: `src/pm/index.tsx` (replace stub with real app)
- Create: `src/pm/shell.tsx`
- Create: `test/pm/shell.test.tsx`
- Create: `test/pm/fixtures/views.tsx` (fake views for tests)

- [ ] **Step 1: Create a test fixture of fake views**

Create `test/pm/fixtures/views.tsx`:

```tsx
import React from "react";
import type { PmView } from "../../../src/pm/types.js";

export const alphaView: PmView<{ text: string }> = {
  id: "alpha",
  label: "Alpha",
  fetch: async () => ({ text: "alpha-data" }),
  Component: ({ data }) => <>{data.text}</>,
};

export const betaView: PmView<{ text: string }> = {
  id: "beta",
  label: "Beta",
  fetch: async () => ({ text: "beta-data" }),
  Component: ({ data }) => <>{data.text}</>,
};
```

- [ ] **Step 2: Write failing shell test — sidebar renders labels**

Create `test/pm/shell.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { PmApp } from "../../src/pm/shell.js";
import { alphaView, betaView } from "./fixtures/views.js";

describe("PmApp shell", () => {
  it("renders sidebar labels from registry", () => {
    const { lastFrame } = render(<PmApp views={[alphaView, betaView]} />);
    expect(lastFrame()).toContain("Alpha");
    expect(lastFrame()).toContain("Beta");
  });

  it("highlights first view on start", () => {
    const { lastFrame } = render(<PmApp views={[alphaView, betaView]} />);
    // we use "▸" as focus marker
    expect(lastFrame()).toMatch(/▸\s*Alpha/);
  });

  it("arrow-down moves focus to next view", async () => {
    const { lastFrame, stdin } = render(<PmApp views={[alphaView, betaView]} />);
    stdin.write("\u001B[B"); // down arrow
    await new Promise(r => setTimeout(r, 20));
    expect(lastFrame()).toMatch(/▸\s*Beta/);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd ~/jira-tool && npx vitest run test/pm/shell.test.tsx`
Expected: FAIL — `src/pm/shell.ts` does not exist.

- [ ] **Step 4: Implement the shell with sidebar + sidebar focus only**

Create `src/pm/shell.tsx`:

```tsx
import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { PmView } from "./types.js";

interface PmAppProps {
  views: PmView<any>[];
}

export function PmApp({ views }: PmAppProps) {
  const { exit } = useApp();
  const [sidebarIdx, setSidebarIdx] = useState(0);

  useInput((input, key) => {
    if (input === "q") { exit(); return; }
    if (key.upArrow || input === "k") {
      setSidebarIdx(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setSidebarIdx(i => Math.min(views.length - 1, i + 1));
      return;
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Sidebar views={views} focused={sidebarIdx} />
        <Box flexGrow={1} paddingX={1}>
          <Text dimColor>Select a view and press Enter.</Text>
        </Box>
      </Box>
      <Footer hint="↑/↓ nav · enter select · q quit" />
    </Box>
  );
}

function Sidebar({ views, focused }: { views: PmView<any>[]; focused: number }) {
  return (
    <Box flexDirection="column" width={22} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold>JJ PM</Text>
      <Box marginTop={1} flexDirection="column">
        {views.map((v, i) => (
          <Text key={v.id} color={i === focused ? "cyan" : undefined}>
            {i === focused ? "▸ " : "  "}{v.label}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

function Footer({ hint }: { hint: string }) {
  return <Text dimColor>{hint}</Text>;
}
```

- [ ] **Step 5: Wire the real shell into pm/index.tsx**

Replace `src/pm/index.tsx` content with:

```tsx
import React from "react";
import { render } from "ink";
import { PmApp } from "./shell.js";
import { views } from "./registry.js";

export async function startPmMode(): Promise<void> {
  const app = render(<PmApp views={views} />);
  await app.waitUntilExit();
}
```

- [ ] **Step 6: Run tests**

Run: `cd ~/jira-tool && npx vitest run test/pm/shell.test.tsx`
Expected: 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
cd ~/jira-tool
git add src/pm/shell.tsx src/pm/index.tsx test/pm/shell.test.tsx test/pm/fixtures/views.tsx
git commit -m "PM shell: sidebar rendering and focus nav"
```

---

## Task 5: Shell — view activation, load states, and caching

Hook Enter to activate the focused view: run `fetch`, track `loading/ready/error`, cache per view id, render via the view's `Component`.

**Files:**
- Modify: `src/pm/shell.tsx`
- Modify: `test/pm/shell.test.tsx`

- [ ] **Step 1: Add failing tests for activation, caching, and refresh**

Append to `test/pm/shell.test.tsx`:

```tsx
import { LoadingPanel } from "../../src/pm/common/loading.js";

describe("PmApp view activation", () => {
  it("Enter activates focused view: shows loading then data", async () => {
    let resolve: (v: { text: string }) => void = () => {};
    const deferred = new Promise<{ text: string }>(r => { resolve = r; });
    const view = {
      ...alphaView,
      fetch: async () => deferred,
    };
    const { lastFrame, stdin } = render(<PmApp views={[view]} />);
    stdin.write("\r"); // Enter
    await new Promise(r => setTimeout(r, 10));
    expect(lastFrame()).toContain("Loading");
    resolve({ text: "ready-alpha" });
    await new Promise(r => setTimeout(r, 20));
    expect(lastFrame()).toContain("ready-alpha");
  });

  it("re-activating a cached view does NOT call fetch again", async () => {
    const calls = { n: 0 };
    const view = {
      ...alphaView,
      fetch: async () => { calls.n++; return { text: "cached" }; },
    };
    const { stdin } = render(<PmApp views={[view, betaView]} />);
    stdin.write("\r"); // activate alpha
    await new Promise(r => setTimeout(r, 20));
    stdin.write("\u001B[B"); // down to beta
    stdin.write("\r"); // activate beta
    await new Promise(r => setTimeout(r, 20));
    stdin.write("\u001B[A"); // back up to alpha
    stdin.write("\r"); // re-activate alpha
    await new Promise(r => setTimeout(r, 20));
    expect(calls.n).toBe(1);
  });

  it("'r' on an active view re-runs fetch", async () => {
    const calls = { n: 0 };
    const view = {
      ...alphaView,
      fetch: async () => { calls.n++; return { text: `v${calls.n}` }; },
    };
    const { lastFrame, stdin } = render(<PmApp views={[view]} />);
    stdin.write("\r"); // activate
    await new Promise(r => setTimeout(r, 20));
    stdin.write("r"); // refresh
    await new Promise(r => setTimeout(r, 20));
    expect(calls.n).toBe(2);
    expect(lastFrame()).toContain("v2");
  });

  it("fetch throwing renders an error box", async () => {
    const view = {
      ...alphaView,
      fetch: async () => { throw new Error("kaboom"); },
    };
    const { lastFrame, stdin } = render(<PmApp views={[view]} />);
    stdin.write("\r");
    await new Promise(r => setTimeout(r, 20));
    expect(lastFrame()).toContain("kaboom");
    expect(lastFrame()).toContain("retry");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/jira-tool && npx vitest run test/pm/shell.test.tsx`
Expected: 4 new tests FAIL (Enter, caching, `r`, error).

- [ ] **Step 3: Implement activation + caching in shell**

Replace the body of `src/pm/shell.tsx` with:

```tsx
import React, { useState, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { PmView, LoadState } from "./types.js";
import { config } from "../config.js";
import { LoadingPanel } from "./common/loading.js";
import { ErrorBox } from "./common/error-box.js";
import { PanelFrame } from "./common/panel-frame.js";

interface PmAppProps {
  views: PmView<any>[];
}

export function PmApp({ views }: PmAppProps) {
  const { exit } = useApp();
  const [sidebarIdx, setSidebarIdx] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, LoadState<any>>>({});

  const runFetch = useCallback(async (view: PmView<any>) => {
    setCache(c => ({ ...c, [view.id]: { kind: "loading" } }));
    try {
      const data = await view.fetch({
        boardId: config.jira.boardId,
        projectKey: config.jira.project,
      });
      setCache(c => ({ ...c, [view.id]: { kind: "ready", data, fetchedAt: new Date() } }));
    } catch (e: any) {
      setCache(c => ({ ...c, [view.id]: { kind: "error", message: e?.message ?? String(e) } }));
    }
  }, []);

  const activate = useCallback((view: PmView<any>) => {
    setActiveId(view.id);
    const state = cache[view.id];
    if (!state || state.kind === "idle") {
      void runFetch(view);
    }
  }, [cache, runFetch]);

  useInput((input, key) => {
    if (input === "q") { exit(); return; }
    if (key.upArrow || input === "k") {
      setSidebarIdx(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setSidebarIdx(i => Math.min(views.length - 1, i + 1));
      return;
    }
    if (key.return || key.rightArrow) {
      activate(views[sidebarIdx]);
      return;
    }
    if (input === "r" && activeId) {
      const active = views.find(v => v.id === activeId);
      if (active) void runFetch(active);
      return;
    }
    // number keys 1-9 jump directly
    const n = parseInt(input, 10);
    if (!isNaN(n) && n >= 1 && n <= views.length) {
      setSidebarIdx(n - 1);
      activate(views[n - 1]);
      return;
    }
  });

  const activeView = activeId ? views.find(v => v.id === activeId) ?? null : null;
  const activeState = activeView ? cache[activeView.id] : null;

  return (
    <Box flexDirection="column">
      <Box>
        <Sidebar views={views} focused={sidebarIdx} activeId={activeId} />
        <Box flexGrow={1} paddingX={1}>
          {!activeView && <Text dimColor>Select a view and press Enter.</Text>}
          {activeView && activeState && (
            <PanelFrame title={activeView.label}>
              {activeState.kind === "loading" && <LoadingPanel />}
              {activeState.kind === "error" && <ErrorBox message={activeState.message} />}
              {activeState.kind === "ready" && <activeView.Component data={activeState.data} />}
            </PanelFrame>
          )}
        </Box>
      </Box>
      <Text dimColor>↑/↓ nav · enter select · r refresh · q quit</Text>
    </Box>
  );
}

function Sidebar({ views, focused, activeId }: { views: PmView<any>[]; focused: number; activeId: string | null }) {
  return (
    <Box flexDirection="column" width={22} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold>JJ PM</Text>
      <Box marginTop={1} flexDirection="column">
        {views.map((v, i) => {
          const isFocused = i === focused;
          const isActive = v.id === activeId;
          return (
            <Text key={v.id} color={isFocused ? "cyan" : isActive ? "green" : undefined}>
              {isFocused ? "▸ " : "  "}{v.label}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/jira-tool && npx vitest run test/pm/shell.test.tsx`
Expected: All 7 tests PASS (3 original + 4 new).

- [ ] **Step 5: Commit**

```bash
cd ~/jira-tool
git add src/pm/shell.tsx test/pm/shell.test.tsx
git commit -m "PM shell: view activation with per-view cache and refresh"
```

---

## Task 6: Extend `jira-client.ts` to fetch extra fields + add closed-sprint endpoint

Sprint Overview/By Person/Blockers/Milestones all need fields that `searchAllSprintIssues` doesn't fetch today (`updated`, `fixVersions`, `issuelinks`). Velocity needs closed sprints. We'll extend the existing helper to accept optional extra fields, and add `getClosedSprints()`.

**Files:**
- Modify: `src/jira-client.ts`
- Create: `src/pm/issue-fields.ts`
- Create: `test/pm/issue-fields.test.ts`

- [ ] **Step 1: Add the shared extended-field list**

Create `src/pm/issue-fields.ts`:

```typescript
// Fields required by PM mode panels beyond the default set.
export const PM_EXTRA_FIELDS = [
  "updated",
  "fixVersions",
  "issuelinks",
] as const;

export function pmFieldsString(storyPointFieldId: string): string {
  const base = [
    "summary",
    "status",
    "priority",
    "assignee",
    "reporter",
    "issuetype",
    "parent",
    "sprint",
    "labels",
    "components",
    ...PM_EXTRA_FIELDS,
    storyPointFieldId,
  ];
  return base.join(",");
}
```

- [ ] **Step 2: Write failing test for pmFieldsString**

Create `test/pm/issue-fields.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { pmFieldsString, PM_EXTRA_FIELDS } from "../../src/pm/issue-fields.js";

describe("pmFieldsString", () => {
  it("includes extra fields", () => {
    const s = pmFieldsString("customfield_10016");
    for (const f of PM_EXTRA_FIELDS) {
      expect(s).toContain(f);
    }
  });

  it("includes the story-point custom field id", () => {
    expect(pmFieldsString("customfield_99999")).toContain("customfield_99999");
  });
});
```

Run: `cd ~/jira-tool && npx vitest run test/pm/issue-fields.test.ts`
Expected: PASS (the module exists from Step 1).

- [ ] **Step 3: Extend jira-client.ts to accept a fields argument for sprint search**

Open `src/jira-client.ts`. Find `searchAllSprintIssues` (~line 112). Change the signature from:

```typescript
export async function searchAllSprintIssues(maxResults = 200): Promise<JiraSearchResult> {
```

to:

```typescript
export async function searchAllSprintIssues(maxResults = 200, fields?: string): Promise<JiraSearchResult> {
```

Then in the body, where the fields query string is built, use the supplied `fields` if given, falling back to the existing default. Example (adapt to the exact local variable names; the key change is `fields ?? DEFAULT_SPRINT_FIELDS`):

```typescript
const fieldsParam = fields ?? "summary,status,priority,assignee,reporter,issuetype,parent,sprint,description,attachment,comment,labels,components";
// ... use fieldsParam in the URL
```

Do NOT change the default behavior for existing callers (they call without `fields`).

- [ ] **Step 4: Add getClosedSprints function**

Append to `src/jira-client.ts`:

```typescript
export interface JiraClosedSprint {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  completeDate?: string;
  state: "closed";
}

export async function getClosedSprints(boardId: number, maxResults = 5): Promise<JiraClosedSprint[]> {
  // jiraAgileFetch returns the parsed JSON of agile API responses; the sprint list endpoint returns { values: Sprint[] }
  const url = `/board/${boardId}/sprint?state=closed&maxResults=${maxResults}`;
  const json = await jiraAgileFetch<{ values: JiraClosedSprint[] }>(url);
  // Jira returns sprints oldest-first; reverse so the most recent is [0].
  return [...json.values].reverse();
}

export async function getSprintIssues(sprintId: number, fields: string): Promise<JiraSearchResult> {
  const url = `/sprint/${sprintId}/issue?fields=${encodeURIComponent(fields)}&maxResults=200`;
  return jiraAgileFetch<JiraSearchResult>(url);
}
```

(`JiraSearchResult` is already defined/used in this file; reuse it.)

- [ ] **Step 5: Verify build still succeeds**

Run: `cd ~/jira-tool && npm run build`
Expected: clean build with no errors.

- [ ] **Step 6: Commit**

```bash
cd ~/jira-tool
git add src/pm/issue-fields.ts test/pm/issue-fields.test.ts src/jira-client.ts
git commit -m "extend jira-client with closed sprints and configurable fields"
```

---

## Task 7: Add `storyPointFieldId` to config

**Files:**
- Modify: `src/config.ts`
- Modify: `.env.example`
- Create/extend: `test/config.test.ts`

- [ ] **Step 1: Write failing test for storyPointFieldId**

Open `test/config.test.ts` and add:

```typescript
it("exposes storyPointFieldId with default customfield_10016", () => {
  delete process.env.JJ_STORY_POINT_FIELD_ID;
  // re-import config fresh via dynamic import if needed
  // or read the field via config.storyPointFieldId in the existing pattern
  expect(config.storyPointFieldId).toBe("customfield_10016");
});

it("storyPointFieldId respects JJ_STORY_POINT_FIELD_ID env var", async () => {
  process.env.JJ_STORY_POINT_FIELD_ID = "customfield_12345";
  vi.resetModules();
  const mod = await import("../src/config.js");
  expect(mod.config.storyPointFieldId).toBe("customfield_12345");
  delete process.env.JJ_STORY_POINT_FIELD_ID;
});
```

(Match the existing test file's import/mock style — `vi` from vitest, module reset patterns already present.)

Run: `cd ~/jira-tool && npx vitest run test/config.test.ts`
Expected: 2 new tests FAIL.

- [ ] **Step 2: Add storyPointFieldId to config**

In `src/config.ts`, add to the `config` object (same level as `outputDir`, `readyTransition`):

```typescript
storyPointFieldId: process.env.JJ_STORY_POINT_FIELD_ID || "customfield_10016",
```

- [ ] **Step 3: Document env var**

Append to `.env.example`:

```bash
# Story point field ID. Defaults to customfield_10016 which is standard.
# Check your Jira instance if velocity data looks wrong.
# JJ_STORY_POINT_FIELD_ID=customfield_10016
```

- [ ] **Step 4: Run tests**

Run: `cd ~/jira-tool && npx vitest run test/config.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/jira-tool
git add src/config.ts .env.example test/config.test.ts
git commit -m "config: add storyPointFieldId"
```

---

## Task 8: Sprint Overview view

**Files:**
- Create: `src/pm/views/sprint-overview.tsx`
- Create: `test/pm/fixtures/issues.ts`
- Create: `test/pm/views/sprint-overview.test.tsx`
- Modify: `src/pm/registry.ts`

- [ ] **Step 1: Create a fixture of sample sprint issues**

Create `test/pm/fixtures/issues.ts`:

```typescript
import type { JiraIssue } from "../../../src/jira-client.js";

export function makeIssue(overrides: Partial<JiraIssue["fields"]> & { key?: string } = {}): JiraIssue {
  const { key = "WEB-1", ...fields } = overrides;
  return {
    key,
    fields: {
      summary: "An issue",
      status: { name: "To Do" },
      priority: { name: "Medium" },
      assignee: null,
      reporter: { displayName: "Reporter", emailAddress: "r@x.com" },
      issuetype: { name: "Task" },
      parent: undefined as any,
      sprint: { name: "Sprint 44" } as any,
      labels: [],
      components: [],
      updated: "2026-04-10T12:00:00.000Z",
      fixVersions: [],
      issuelinks: [],
      ...fields,
    } as any,
  };
}

export const SAMPLE_SPRINT_ISSUES = [
  makeIssue({ key: "WEB-1", status: { name: "To Do" } as any, assignee: { displayName: "Alice", emailAddress: "a@x" } as any }),
  makeIssue({ key: "WEB-2", status: { name: "In Progress" } as any, assignee: { displayName: "Alice", emailAddress: "a@x" } as any }),
  makeIssue({ key: "WEB-3", status: { name: "In Progress" } as any, assignee: { displayName: "Bob", emailAddress: "b@x" } as any }),
  makeIssue({ key: "WEB-4", status: { name: "Review" } as any, assignee: null }),
  makeIssue({ key: "WEB-5", status: { name: "Done" } as any, assignee: { displayName: "Bob", emailAddress: "b@x" } as any }),
];
```

- [ ] **Step 2: Write failing test for Sprint Overview**

Create `test/pm/views/sprint-overview.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { sprintOverviewView } from "../../../src/pm/views/sprint-overview.js";
import { SAMPLE_SPRINT_ISSUES } from "../fixtures/issues.js";

describe("sprintOverviewView", () => {
  it("renders column counts derived from issues", () => {
    const data = { issues: SAMPLE_SPRINT_ISSUES, sprintName: "Sprint 44" };
    const { lastFrame } = render(<sprintOverviewView.Component data={data} />);
    expect(lastFrame()).toContain("Sprint 44");
    expect(lastFrame()).toContain("To Do: 1");
    expect(lastFrame()).toContain("In Progress: 2");
    expect(lastFrame()).toContain("Review: 1");
    expect(lastFrame()).toContain("Done: 1");
  });

  it("has id and label", () => {
    expect(sprintOverviewView.id).toBe("sprint-overview");
    expect(sprintOverviewView.label).toMatch(/Sprint/i);
  });
});
```

Run: `cd ~/jira-tool && npx vitest run test/pm/views/sprint-overview.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement Sprint Overview**

Create `src/pm/views/sprint-overview.tsx`:

```tsx
import React from "react";
import { Box, Text } from "ink";
import type { PmView } from "../types.js";
import type { JiraIssue } from "../../jira-client.js";
import { searchAllSprintIssues, getActiveSprint } from "../../jira-client.js";
import { pmFieldsString } from "../issue-fields.js";
import { config } from "../../config.js";

export interface SprintOverviewData {
  sprintName: string;
  issues: JiraIssue[];
}

const COLUMNS = ["To Do", "In Progress", "Review", "Done"] as const;

function SprintOverview({ data }: { data: SprintOverviewData }) {
  const counts: Record<string, number> = Object.fromEntries(COLUMNS.map(c => [c, 0]));
  for (const issue of data.issues) {
    const status = issue.fields.status?.name ?? "";
    if (status in counts) counts[status]++;
  }
  const total = data.issues.length;
  const done = counts["Done"];
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const barWidth = 20;
  const filled = Math.round((pct / 100) * barWidth);
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);

  return (
    <Box flexDirection="column">
      <Text bold>{data.sprintName}</Text>
      <Text>{COLUMNS.map(c => `${c}: ${counts[c]}`).join("  ·  ")}</Text>
      <Text>{bar}  {pct}% done</Text>
    </Box>
  );
}

export const sprintOverviewView: PmView<SprintOverviewData> = {
  id: "sprint-overview",
  label: "Sprint Overview",
  fetch: async () => {
    const fields = pmFieldsString(config.storyPointFieldId);
    const [result, sprint] = await Promise.all([
      searchAllSprintIssues(200, fields),
      getActiveSprint(config.jira.boardId),
    ]);
    return {
      sprintName: sprint?.name ?? "Active Sprint",
      issues: result.issues,
    };
  },
  Component: SprintOverview,
};
```

- [ ] **Step 4: Register the view**

Edit `src/pm/registry.ts`:

```typescript
import type { PmView } from "./types.js";
import { sprintOverviewView } from "./views/sprint-overview.js";

export const views: PmView<any>[] = [
  sprintOverviewView,
];
```

- [ ] **Step 5: Run tests**

Run: `cd ~/jira-tool && npx vitest run test/pm/views/sprint-overview.test.tsx test/pm/registry.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
cd ~/jira-tool
git add src/pm/views/sprint-overview.tsx test/pm/views/sprint-overview.test.tsx test/pm/fixtures/issues.ts src/pm/registry.ts
git commit -m "PM: add Sprint Overview view"
```

---

## Task 9: By Person view

**Files:**
- Create: `src/pm/views/by-person.tsx`
- Create: `test/pm/views/by-person.test.tsx`
- Modify: `src/pm/registry.ts`

- [ ] **Step 1: Write failing test**

Create `test/pm/views/by-person.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { byPersonView } from "../../../src/pm/views/by-person.js";
import { SAMPLE_SPRINT_ISSUES } from "../fixtures/issues.js";

describe("byPersonView", () => {
  it("groups issues by assignee displayName", () => {
    const { lastFrame } = render(<byPersonView.Component data={{ issues: SAMPLE_SPRINT_ISSUES }} />);
    expect(lastFrame()).toContain("Alice");
    expect(lastFrame()).toContain("Bob");
    expect(lastFrame()).toContain("Unassigned");
  });

  it("shows per-person status breakdown", () => {
    const { lastFrame } = render(<byPersonView.Component data={{ issues: SAMPLE_SPRINT_ISSUES }} />);
    // Alice has 1 To Do, 1 In Progress in the fixture
    expect(lastFrame()).toMatch(/Alice[\s\S]*In Progress/);
  });
});
```

Run: `cd ~/jira-tool && npx vitest run test/pm/views/by-person.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement**

Create `src/pm/views/by-person.tsx`:

```tsx
import React from "react";
import { Box, Text } from "ink";
import type { PmView } from "../types.js";
import type { JiraIssue } from "../../jira-client.js";
import { searchAllSprintIssues } from "../../jira-client.js";
import { pmFieldsString } from "../issue-fields.js";
import { config } from "../../config.js";

export interface ByPersonData {
  issues: JiraIssue[];
}

function ByPerson({ data }: { data: ByPersonData }) {
  const groups = new Map<string, Map<string, number>>();
  for (const issue of data.issues) {
    const name = issue.fields.assignee?.displayName ?? "Unassigned";
    const status = issue.fields.status?.name ?? "";
    if (!groups.has(name)) groups.set(name, new Map());
    const inner = groups.get(name)!;
    inner.set(status, (inner.get(status) ?? 0) + 1);
  }
  const sorted = [...groups.entries()].sort((a, b) => {
    const aCount = [...a[1].values()].reduce((s, n) => s + n, 0);
    const bCount = [...b[1].values()].reduce((s, n) => s + n, 0);
    return bCount - aCount;
  });
  return (
    <Box flexDirection="column">
      {sorted.map(([name, counts]) => {
        const total = [...counts.values()].reduce((s, n) => s + n, 0);
        const breakdown = [...counts.entries()]
          .map(([s, n]) => `${n} ${s}`)
          .join(" · ");
        return (
          <Box key={name}>
            <Box width={14}><Text bold>{name}</Text></Box>
            <Box width={4}><Text>{total}</Text></Box>
            <Text dimColor>{breakdown}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

export const byPersonView: PmView<ByPersonData> = {
  id: "by-person",
  label: "By Person",
  fetch: async () => {
    const fields = pmFieldsString(config.storyPointFieldId);
    const result = await searchAllSprintIssues(200, fields);
    return { issues: result.issues };
  },
  Component: ByPerson,
};
```

- [ ] **Step 3: Register the view**

Edit `src/pm/registry.ts` to add `byPersonView`:

```typescript
import { byPersonView } from "./views/by-person.js";

export const views: PmView<any>[] = [
  sprintOverviewView,
  byPersonView,
];
```

- [ ] **Step 4: Run tests**

Run: `cd ~/jira-tool && npx vitest run test/pm/views/by-person.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/jira-tool
git add src/pm/views/by-person.tsx test/pm/views/by-person.test.tsx src/pm/registry.ts
git commit -m "PM: add By Person view"
```

---

## Task 10: Blockers & Risk view

**Files:**
- Create: `src/pm/views/blockers.tsx`
- Create: `test/pm/views/blockers.test.tsx`
- Modify: `src/pm/registry.ts`

- [ ] **Step 1: Write failing test**

Create `test/pm/views/blockers.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { blockersView } from "../../../src/pm/views/blockers.js";
import { makeIssue } from "../fixtures/issues.js";

const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

describe("blockersView", () => {
  it("renders a 'Blocked' section for issues with is-blocked-by links", () => {
    const issues = [
      makeIssue({
        key: "WEB-10",
        summary: "Needs upstream fix",
        assignee: { displayName: "Alice" } as any,
        issuelinks: [{ type: { inward: "is blocked by" }, inwardIssue: { key: "WEB-99" } }] as any,
        updated: oneDayAgo,
      }),
    ];
    const { lastFrame } = render(<blockersView.Component data={{ issues }} />);
    expect(lastFrame()).toContain("Blocked");
    expect(lastFrame()).toContain("WEB-10");
  });

  it("renders a 'Stale' section for issues not updated in 5+ days", () => {
    const issues = [
      makeIssue({
        key: "WEB-11",
        summary: "Gathering dust",
        assignee: { displayName: "Alice" } as any,
        updated: fiveDaysAgo,
        issuelinks: [],
      }),
    ];
    const { lastFrame } = render(<blockersView.Component data={{ issues }} />);
    expect(lastFrame()).toContain("Stale");
    expect(lastFrame()).toContain("WEB-11");
  });

  it("renders an 'Unassigned' section", () => {
    const issues = [
      makeIssue({
        key: "WEB-12",
        summary: "Orphan",
        assignee: null,
        updated: oneDayAgo,
        issuelinks: [],
      }),
    ];
    const { lastFrame } = render(<blockersView.Component data={{ issues }} />);
    expect(lastFrame()).toContain("Unassigned");
    expect(lastFrame()).toContain("WEB-12");
  });

  it("renders empty state when all issues are healthy", () => {
    const issues = [
      makeIssue({
        key: "WEB-13",
        assignee: { displayName: "Alice" } as any,
        updated: oneDayAgo,
        issuelinks: [],
      }),
    ];
    const { lastFrame } = render(<blockersView.Component data={{ issues }} />);
    expect(lastFrame()).toMatch(/nothing at risk/i);
  });
});
```

Run: `cd ~/jira-tool && npx vitest run test/pm/views/blockers.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement**

Create `src/pm/views/blockers.tsx`:

```tsx
import React from "react";
import { Box, Text } from "ink";
import type { PmView } from "../types.js";
import type { JiraIssue } from "../../jira-client.js";
import { searchAllSprintIssues } from "../../jira-client.js";
import { pmFieldsString } from "../issue-fields.js";
import { config } from "../../config.js";
import { EmptyState } from "../common/empty-state.js";

export interface BlockersData {
  issues: JiraIssue[];
}

const STALE_DAYS = 5;

function isBlocked(issue: JiraIssue): boolean {
  if (issue.fields.status?.name?.toLowerCase() === "blocked") return true;
  const links = (issue.fields as any).issuelinks ?? [];
  return links.some((l: any) =>
    l?.type?.inward?.toLowerCase().includes("blocked by") ||
    l?.type?.outward?.toLowerCase().includes("blocks")
  );
}

function isStale(issue: JiraIssue): boolean {
  const updated = (issue.fields as any).updated;
  if (!updated) return false;
  const ageMs = Date.now() - new Date(updated).getTime();
  return ageMs >= STALE_DAYS * 24 * 60 * 60 * 1000;
}

function isUnassigned(issue: JiraIssue): boolean {
  return !issue.fields.assignee;
}

function Section({ title, issues }: { title: string; issues: JiraIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="yellow">{title}</Text>
      {issues.map(i => (
        <Box key={i.key}>
          <Box width={10}><Text color="cyan">{i.key}</Text></Box>
          <Text wrap="truncate-end">{i.fields.summary}</Text>
        </Box>
      ))}
    </Box>
  );
}

function Blockers({ data }: { data: BlockersData }) {
  const blocked = data.issues.filter(isBlocked);
  const stale = data.issues.filter(i => !isBlocked(i) && isStale(i));
  const unassigned = data.issues.filter(i => !isBlocked(i) && !isStale(i) && isUnassigned(i));

  if (blocked.length + stale.length + unassigned.length === 0) {
    return <EmptyState message="Nothing at risk. Ship it." />;
  }
  return (
    <Box flexDirection="column">
      <Section title="Blocked" issues={blocked} />
      <Section title={`Stale (${STALE_DAYS}+ days)`} issues={stale} />
      <Section title="Unassigned" issues={unassigned} />
    </Box>
  );
}

export const blockersView: PmView<BlockersData> = {
  id: "blockers",
  label: "Blockers & Risk",
  fetch: async () => {
    const fields = pmFieldsString(config.storyPointFieldId);
    const result = await searchAllSprintIssues(200, fields);
    return { issues: result.issues };
  },
  Component: Blockers,
};
```

- [ ] **Step 3: Register**

Append to `src/pm/registry.ts`:

```typescript
import { blockersView } from "./views/blockers.js";
// add to the views array:
//   sprintOverviewView, byPersonView, blockersView,
```

- [ ] **Step 4: Run tests**

Run: `cd ~/jira-tool && npx vitest run test/pm/views/blockers.test.tsx`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/jira-tool
git add src/pm/views/blockers.tsx test/pm/views/blockers.test.tsx src/pm/registry.ts
git commit -m "PM: add Blockers & Risk view"
```

---

## Task 11: Summary Draft view

This view reuses the `buildSlackSummary` / `buildSlackConcise` helpers from `src/summary.ts`. We will export them if they aren't already exported.

**Files:**
- Modify: `src/summary.ts` (export builders if not already)
- Create: `src/pm/views/summary-draft.tsx`
- Create: `test/pm/views/summary-draft.test.tsx`
- Modify: `src/pm/registry.ts`

- [ ] **Step 1: Ensure `buildSlackSummary` and `buildSlackConcise` are exported**

Open `src/summary.ts`. Find `buildSlackSummary` (~line 64) and `buildSlackConcise` (~line 120). If they are declared as `function buildSlack...`, prepend `export`. If already exported, leave as-is.

- [ ] **Step 2: Write failing test for summary-draft**

Create `test/pm/views/summary-draft.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { summaryDraftView } from "../../../src/pm/views/summary-draft.js";

describe("summaryDraftView", () => {
  it("renders the supplied slack text", () => {
    const { lastFrame } = render(
      <summaryDraftView.Component data={{ slackText: "*Sprint Focus*\nShip PM mode" }} />
    );
    expect(lastFrame()).toContain("Sprint Focus");
    expect(lastFrame()).toContain("Ship PM mode");
  });

  it("has id and label", () => {
    expect(summaryDraftView.id).toBe("summary-draft");
  });
});
```

Run and expect FAIL.

- [ ] **Step 3: Implement summary-draft**

Create `src/pm/views/summary-draft.tsx`:

```tsx
import React from "react";
import { Box, Text } from "ink";
import type { PmView } from "../types.js";
import { buildSlackSummary } from "../../summary.js";
import { searchAllSprintIssues } from "../../jira-client.js";
import { pmFieldsString } from "../issue-fields.js";
import { config } from "../../config.js";

export interface SummaryDraftData {
  slackText: string;
}

function SummaryDraft({ data }: { data: SummaryDraftData }) {
  return (
    <Box flexDirection="column">
      {data.slackText.split("\n").map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  );
}

export const summaryDraftView: PmView<SummaryDraftData> = {
  id: "summary-draft",
  label: "Summary Draft",
  fetch: async () => {
    const fields = pmFieldsString(config.storyPointFieldId);
    const result = await searchAllSprintIssues(200, fields);
    const slackText = buildSlackSummary(result.issues);
    return { slackText };
  },
  Component: SummaryDraft,
};
```

Note: `buildSlackSummary`'s real signature may differ — adapt the call site to match (check `src/summary.ts` for the exact parameter list).

- [ ] **Step 4: Register**

Append `summaryDraftView` to the array in `src/pm/registry.ts`.

- [ ] **Step 5: Run tests**

Run: `cd ~/jira-tool && npx vitest run test/pm/views/summary-draft.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd ~/jira-tool
git add src/summary.ts src/pm/views/summary-draft.tsx test/pm/views/summary-draft.test.tsx src/pm/registry.ts
git commit -m "PM: add Summary Draft view"
```

---

## Task 12: Velocity view

**Files:**
- Create: `src/pm/views/velocity.tsx`
- Create: `test/pm/fixtures/sprints.ts`
- Create: `test/pm/views/velocity.test.tsx`
- Modify: `src/pm/registry.ts`

- [ ] **Step 1: Create sprints fixture**

Create `test/pm/fixtures/sprints.ts`:

```typescript
export const SAMPLE_VELOCITY = [
  { sprintName: "Sprint 41", committed: 28, done: 24 },
  { sprintName: "Sprint 42", committed: 32, done: 30 },
  { sprintName: "Sprint 43", committed: 25, done: 26 },
];
```

- [ ] **Step 2: Write failing test**

Create `test/pm/views/velocity.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { velocityView } from "../../../src/pm/views/velocity.js";
import { SAMPLE_VELOCITY } from "../fixtures/sprints.js";

describe("velocityView", () => {
  it("renders one row per sprint with committed and done", () => {
    const { lastFrame } = render(<velocityView.Component data={{ rows: SAMPLE_VELOCITY }} />);
    expect(lastFrame()).toContain("Sprint 41");
    expect(lastFrame()).toContain("28");
    expect(lastFrame()).toContain("24");
    expect(lastFrame()).toContain("Sprint 43");
  });

  it("shows empty message when no data", () => {
    const { lastFrame } = render(<velocityView.Component data={{ rows: [] }} />);
    expect(lastFrame()).toMatch(/no closed sprints/i);
  });
});
```

- [ ] **Step 3: Implement velocity**

Create `src/pm/views/velocity.tsx`:

```tsx
import React from "react";
import { Box, Text } from "ink";
import type { PmView } from "../types.js";
import { getClosedSprints, getSprintIssues } from "../../jira-client.js";
import { config } from "../../config.js";
import { EmptyState } from "../common/empty-state.js";

export interface VelocityRow {
  sprintName: string;
  committed: number;
  done: number;
}

export interface VelocityData {
  rows: VelocityRow[];
}

function Velocity({ data }: { data: VelocityData }) {
  if (data.rows.length === 0) {
    return <EmptyState message="No closed sprints found." />;
  }
  const max = Math.max(...data.rows.map(r => Math.max(r.committed, r.done)));
  const barWidth = 10;
  return (
    <Box flexDirection="column">
      {data.rows.map(row => {
        const filled = max === 0 ? 0 : Math.round((row.done / max) * barWidth);
        const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
        return (
          <Box key={row.sprintName}>
            <Box width={12}><Text bold>{row.sprintName}</Text></Box>
            <Box width={16}><Text>{row.committed} committed</Text></Box>
            <Box width={10}><Text>{row.done} done</Text></Box>
            <Text>{bar}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

export const velocityView: PmView<VelocityData> = {
  id: "velocity",
  label: "Velocity",
  fetch: async () => {
    const spField = config.storyPointFieldId;
    const sprints = await getClosedSprints(config.jira.boardId, 5);
    const rows: VelocityRow[] = [];
    for (const sprint of sprints) {
      const fields = `summary,status,${spField}`;
      const result = await getSprintIssues(sprint.id, fields);
      let committed = 0;
      let done = 0;
      for (const issue of result.issues) {
        const pts = Number((issue.fields as any)[spField] ?? 0);
        if (!isNaN(pts)) {
          committed += pts;
          if (issue.fields.status?.name === "Done") done += pts;
        }
      }
      rows.push({ sprintName: sprint.name, committed, done });
    }
    // Oldest-first ordering for display
    rows.reverse();
    return { rows };
  },
  Component: Velocity,
};
```

- [ ] **Step 4: Register**

Append `velocityView` to `src/pm/registry.ts`.

- [ ] **Step 5: Run tests**

Run: `cd ~/jira-tool && npx vitest run test/pm/views/velocity.test.tsx`
Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd ~/jira-tool
git add src/pm/views/velocity.tsx test/pm/views/velocity.test.tsx test/pm/fixtures/sprints.ts src/pm/registry.ts
git commit -m "PM: add Velocity view"
```

---

## Task 13: Milestones view

**Files:**
- Create: `src/pm/views/milestones.tsx`
- Create: `test/pm/views/milestones.test.tsx`
- Modify: `src/pm/registry.ts`

- [ ] **Step 1: Write failing test**

Create `test/pm/views/milestones.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { milestonesView } from "../../../src/pm/views/milestones.js";
import { makeIssue } from "../fixtures/issues.js";

describe("milestonesView", () => {
  it("groups issues by fixVersion and orders by releaseDate ascending", () => {
    const issues = [
      makeIssue({
        key: "WEB-20",
        summary: "Login telemetry",
        status: { name: "To Do" } as any,
        fixVersions: [{ name: "v2.5", releaseDate: "2026-05-06" }] as any,
      }),
      makeIssue({
        key: "WEB-21",
        summary: "Auth refactor",
        status: { name: "Done" } as any,
        fixVersions: [{ name: "v2.4", releaseDate: "2026-04-22" }] as any,
      }),
    ];
    const { lastFrame } = render(<milestonesView.Component data={{ issues }} />);
    const frame = lastFrame() ?? "";
    const v24 = frame.indexOf("v2.4");
    const v25 = frame.indexOf("v2.5");
    expect(v24).toBeGreaterThanOrEqual(0);
    expect(v25).toBeGreaterThan(v24); // v2.4 (earlier) listed first
    expect(frame).toContain("WEB-20");
    expect(frame).toContain("WEB-21");
  });

  it("renders empty state when no fixVersions", () => {
    const issues = [makeIssue({ key: "WEB-30", fixVersions: [] as any })];
    const { lastFrame } = render(<milestonesView.Component data={{ issues }} />);
    expect(lastFrame()).toMatch(/no milestones/i);
  });
});
```

- [ ] **Step 2: Implement**

Create `src/pm/views/milestones.tsx`:

```tsx
import React from "react";
import { Box, Text } from "ink";
import type { PmView } from "../types.js";
import type { JiraIssue } from "../../jira-client.js";
import { searchAllSprintIssues } from "../../jira-client.js";
import { pmFieldsString } from "../issue-fields.js";
import { config } from "../../config.js";
import { EmptyState } from "../common/empty-state.js";

export interface MilestonesData {
  issues: JiraIssue[];
}

interface Group {
  name: string;
  releaseDate?: string;
  issues: JiraIssue[];
}

function groupByVersion(issues: JiraIssue[]): Group[] {
  const byName = new Map<string, Group>();
  for (const issue of issues) {
    const versions = (issue.fields as any).fixVersions ?? [];
    for (const v of versions) {
      if (!v?.name) continue;
      if (!byName.has(v.name)) {
        byName.set(v.name, { name: v.name, releaseDate: v.releaseDate, issues: [] });
      }
      byName.get(v.name)!.issues.push(issue);
    }
  }
  return [...byName.values()].sort((a, b) => {
    const ad = a.releaseDate ?? "9999-12-31";
    const bd = b.releaseDate ?? "9999-12-31";
    return ad.localeCompare(bd);
  });
}

function Milestones({ data }: { data: MilestonesData }) {
  const groups = groupByVersion(data.issues);
  if (groups.length === 0) {
    return <EmptyState message="No milestones in this sprint." />;
  }
  return (
    <Box flexDirection="column">
      {groups.map(g => {
        const total = g.issues.length;
        const done = g.issues.filter(i => i.fields.status?.name === "Done").length;
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);
        return (
          <Box key={g.name} flexDirection="column" marginBottom={1}>
            <Text bold>
              {g.name}{g.releaseDate ? ` — ${g.releaseDate}` : ""}  ({pct}%)
            </Text>
            {g.issues.map(i => (
              <Box key={i.key}>
                <Box width={3}>
                  <Text>{i.fields.status?.name === "Done" ? "✓" : " "}</Text>
                </Box>
                <Box width={10}><Text color="cyan">{i.key}</Text></Box>
                <Text wrap="truncate-end">{i.fields.summary}</Text>
              </Box>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

export const milestonesView: PmView<MilestonesData> = {
  id: "milestones",
  label: "Milestones",
  fetch: async () => {
    const fields = pmFieldsString(config.storyPointFieldId);
    const result = await searchAllSprintIssues(200, fields);
    return { issues: result.issues };
  },
  Component: Milestones,
};
```

- [ ] **Step 3: Register**

Append `milestonesView` to `src/pm/registry.ts` so the final array is:

```typescript
export const views: PmView<any>[] = [
  sprintOverviewView,
  byPersonView,
  blockersView,
  summaryDraftView,
  velocityView,
  milestonesView,
];
```

- [ ] **Step 4: Run all PM tests**

Run: `cd ~/jira-tool && npx vitest run test/pm`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/jira-tool
git add src/pm/views/milestones.tsx test/pm/views/milestones.test.tsx src/pm/registry.ts
git commit -m "PM: add Milestones view"
```

---

## Task 14: Panel issue-row focus + Enter opens issue in browser

Up to now, only the sidebar has focus. The spec requires row-level focus inside panels that show issue lists (By Person, Blockers, Milestones) so `Enter` on a focused row opens the issue in the browser.

We'll do this via a `useFocusedIssue` hook in the shell that exposes `focusedIssueKey` + up/down handlers scoped to panel focus, and views that want to participate render their current focus via a prop.

**Files:**
- Create: `src/pm/open-url.ts`
- Modify: `src/pm/shell.tsx` — add panel-focus mode, `←/Esc` to return, `Enter` on focused row → open
- Modify: `src/pm/types.ts` — extend `PmView` with optional `getIssueKeys(data)` for views that expose rows
- Modify: `src/pm/views/by-person.tsx`, `blockers.tsx`, `milestones.tsx` — highlight focused row
- Modify: `test/pm/shell.test.tsx`
- Create: `test/pm/open-url.test.ts`

- [ ] **Step 1: Create open-url helper**

Create `src/pm/open-url.ts`:

```typescript
import { execFileSync } from "node:child_process";

export function openUrl(url: string, openCmd: (cmd: string, args: string[]) => void = defaultOpen): void {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  openCmd(cmd, [url]);
}

function defaultOpen(cmd: string, args: string[]): void {
  execFileSync(cmd, args);
}
```

- [ ] **Step 2: Write failing open-url test**

Create `test/pm/open-url.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { openUrl } from "../../src/pm/open-url.js";

describe("openUrl", () => {
  it("invokes the open command with the url", () => {
    const spy = vi.fn();
    openUrl("https://example.com", spy);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toEqual(["https://example.com"]);
  });
});
```

Run: `cd ~/jira-tool && npx vitest run test/pm/open-url.test.ts`
Expected: PASS.

- [ ] **Step 3: Extend PmView type to optionally expose issue rows**

Edit `src/pm/types.ts`:

```typescript
export interface PmView<T> {
  id: string;
  label: string;
  fetch: (ctx: FetchCtx) => Promise<T>;
  Component: React.FC<{ data: T; focusedIssueKey?: string | null }>;
  getIssueKeys?: (data: T) => string[];
}
```

- [ ] **Step 4: Update views that have issue rows to implement `getIssueKeys` and accept `focusedIssueKey`**

For **By Person** (`src/pm/views/by-person.tsx`): no per-issue rows (only per-person summaries). Do NOT implement `getIssueKeys`. Skip.

For **Blockers** (`src/pm/views/blockers.tsx`): update `Section` to accept `focusedIssueKey` and highlight the matching row with `inverse`. Export `getIssueKeys` returning all keys across blocked/stale/unassigned in render order.

Patch:

```tsx
function Section({ title, issues, focusedIssueKey }: { title: string; issues: JiraIssue[]; focusedIssueKey?: string | null }) {
  if (issues.length === 0) return null;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="yellow">{title}</Text>
      {issues.map(i => (
        <Box key={i.key}>
          <Box width={10}>
            <Text color="cyan" inverse={focusedIssueKey === i.key}>{i.key}</Text>
          </Box>
          <Text wrap="truncate-end">{i.fields.summary}</Text>
        </Box>
      ))}
    </Box>
  );
}

function Blockers({ data, focusedIssueKey }: { data: BlockersData; focusedIssueKey?: string | null }) {
  // ...existing grouping code unchanged
  // pass focusedIssueKey through to <Section />
}
```

Add at the bottom:

```typescript
export function getBlockersIssueKeys(data: BlockersData): string[] {
  const blocked = data.issues.filter(isBlocked);
  const stale = data.issues.filter(i => !isBlocked(i) && isStale(i));
  const unassigned = data.issues.filter(i => !isBlocked(i) && !isStale(i) && isUnassigned(i));
  return [...blocked, ...stale, ...unassigned].map(i => i.key);
}

// extend the exported view:
blockersView.getIssueKeys = getBlockersIssueKeys;
```

For **Milestones** (`src/pm/views/milestones.tsx`): same pattern. Accept `focusedIssueKey`, render focused row with `inverse`, export `getIssueKeys` returning keys in grouped display order.

```typescript
export function getMilestoneIssueKeys(data: MilestonesData): string[] {
  return groupByVersion(data.issues).flatMap(g => g.issues.map(i => i.key));
}
milestonesView.getIssueKeys = getMilestoneIssueKeys;
```

- [ ] **Step 5: Update shell with panel-focus mode**

Modify `src/pm/shell.tsx`:

```tsx
// Add to state:
const [focusZone, setFocusZone] = useState<"sidebar" | "panel">("sidebar");
const [panelRowIdx, setPanelRowIdx] = useState(0);

// Reset panel row when activating a new view or data changes:
// On activate(view): setFocusZone("panel"); setPanelRowIdx(0);
```

Compute focused issue key:

```tsx
function focusedKey(): string | null {
  if (focusZone !== "panel" || !activeView || !activeState || activeState.kind !== "ready") return null;
  const keys = activeView.getIssueKeys?.(activeState.data) ?? [];
  return keys[panelRowIdx] ?? null;
}
```

Update `useInput`:

```tsx
useInput((input, key) => {
  if (input === "q") { exit(); return; }

  // Panel focus: arrow keys navigate rows, Enter opens in browser, Esc returns.
  if (focusZone === "panel") {
    const keys = (activeView?.getIssueKeys && activeState?.kind === "ready")
      ? activeView.getIssueKeys(activeState.data)
      : [];
    if (key.upArrow || input === "k") {
      setPanelRowIdx(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setPanelRowIdx(i => Math.min(Math.max(0, keys.length - 1), i + 1));
      return;
    }
    if (key.leftArrow || key.escape) {
      setFocusZone("sidebar");
      return;
    }
    if (key.return) {
      const k = keys[panelRowIdx];
      if (k) openUrl(`${config.jira.baseUrl}/browse/${k}`);
      return;
    }
    if (input === "r" && activeId) {
      const active = views.find(v => v.id === activeId);
      if (active) void runFetch(active);
      return;
    }
    return; // swallow other keys in panel mode
  }

  // Sidebar focus (existing behavior)
  if (key.upArrow || input === "k") { setSidebarIdx(i => Math.max(0, i - 1)); return; }
  if (key.downArrow || input === "j") { setSidebarIdx(i => Math.min(views.length - 1, i + 1)); return; }
  if (key.return || key.rightArrow) {
    activate(views[sidebarIdx]);
    setFocusZone("panel");
    setPanelRowIdx(0);
    return;
  }
  if (input === "r" && activeId) {
    const active = views.find(v => v.id === activeId);
    if (active) void runFetch(active);
    return;
  }
  const n = parseInt(input, 10);
  if (!isNaN(n) && n >= 1 && n <= views.length) {
    setSidebarIdx(n - 1);
    activate(views[n - 1]);
    setFocusZone("panel");
    setPanelRowIdx(0);
  }
});
```

Render call — pass `focusedIssueKey`:

```tsx
{activeState.kind === "ready" && (
  <activeView.Component data={activeState.data} focusedIssueKey={focusedKey()} />
)}
```

Import `openUrl` and `config` at the top if not already imported.

- [ ] **Step 6: Add shell test for panel-focus open**

Append to `test/pm/shell.test.tsx`:

```tsx
import * as openUrlMod from "../../src/pm/open-url.js";

it("Enter on focused issue row opens the URL", async () => {
  const viewWithRows = {
    id: "rows",
    label: "Rows",
    fetch: async () => ({ keys: ["WEB-1", "WEB-2"] }),
    Component: ({ data, focusedIssueKey }: any) => (
      <>
        {data.keys.map((k: string) => (
          <React.Fragment key={k}>
            {focusedIssueKey === k ? `[${k}]` : k}
          </React.Fragment>
        ))}
      </>
    ),
    getIssueKeys: (d: any) => d.keys,
  };
  const spy = vi.spyOn(openUrlMod, "openUrl").mockImplementation(() => {});
  const { stdin } = render(<PmApp views={[viewWithRows]} />);
  stdin.write("\r"); // activate -> focus enters panel, idx 0
  await new Promise(r => setTimeout(r, 20));
  stdin.write("\u001B[B"); // down -> idx 1 -> focused WEB-2
  await new Promise(r => setTimeout(r, 20));
  stdin.write("\r"); // Enter -> open WEB-2
  await new Promise(r => setTimeout(r, 20));
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0][0]).toMatch(/WEB-2$/);
  spy.mockRestore();
});

it("Esc returns panel focus to sidebar", async () => {
  const v = {
    id: "rows",
    label: "Rows",
    fetch: async () => ({ keys: ["WEB-1"] }),
    Component: () => <>rows</>,
    getIssueKeys: (d: any) => d.keys,
  };
  const { lastFrame, stdin } = render(<PmApp views={[v, betaView]} />);
  stdin.write("\r"); // activate first
  await new Promise(r => setTimeout(r, 20));
  stdin.write("\u001B"); // Esc -> sidebar
  await new Promise(r => setTimeout(r, 20));
  stdin.write("\u001B[B"); // down in sidebar
  await new Promise(r => setTimeout(r, 20));
  expect(lastFrame()).toMatch(/▸\s*Beta/);
});
```

Also add `import { vi } from "vitest";` at the top of the file.

- [ ] **Step 7: Run all tests**

Run: `cd ~/jira-tool && npx vitest run test/pm`
Expected: all PASS including the two new ones.

- [ ] **Step 8: Commit**

```bash
cd ~/jira-tool
git add src/pm/open-url.ts src/pm/types.ts src/pm/shell.tsx src/pm/views/blockers.tsx src/pm/views/milestones.tsx test/pm/open-url.test.ts test/pm/shell.test.tsx
git commit -m "PM: panel row focus + Enter opens issue in browser"
```

---

## Task 15: Footer with last-fetched time and per-view hints

The current footer is a static string. Spec says it should include last-fetched time for the active view and append view-specific hints.

**Files:**
- Modify: `src/pm/shell.tsx`
- Modify: `src/pm/types.ts` — add optional `footerHint?: string` to `PmView`
- Modify: `test/pm/shell.test.tsx`

- [ ] **Step 1: Extend PmView with optional footerHint**

In `src/pm/types.ts`:

```typescript
export interface PmView<T> {
  id: string;
  label: string;
  fetch: (ctx: FetchCtx) => Promise<T>;
  Component: React.FC<{ data: T; focusedIssueKey?: string | null }>;
  getIssueKeys?: (data: T) => string[];
  footerHint?: string;
}
```

- [ ] **Step 2: Render footer with timestamp and hint**

Update `src/pm/shell.tsx` footer section:

```tsx
function formatAge(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// in render:
<Box>
  <Text dimColor>↑/↓ nav · enter select · r refresh · q quit</Text>
  {activeView?.footerHint && <Text dimColor>  ·  {activeView.footerHint}</Text>}
  {activeState?.kind === "ready" && (
    <Text dimColor>  ·  fetched {formatAge(activeState.fetchedAt)}</Text>
  )}
</Box>
```

- [ ] **Step 3: Write failing test**

Add to `test/pm/shell.test.tsx`:

```tsx
it("footer shows last-fetched hint after ready", async () => {
  const { lastFrame, stdin } = render(<PmApp views={[alphaView]} />);
  stdin.write("\r");
  await new Promise(r => setTimeout(r, 20));
  expect(lastFrame()).toMatch(/fetched\s+\d+/);
});

it("footer appends view-specific hint", async () => {
  const viewWithHint = { ...alphaView, footerHint: "y copy to clipboard" };
  const { lastFrame, stdin } = render(<PmApp views={[viewWithHint]} />);
  stdin.write("\r");
  await new Promise(r => setTimeout(r, 20));
  expect(lastFrame()).toContain("y copy to clipboard");
});
```

- [ ] **Step 4: Run tests**

Run: `cd ~/jira-tool && npx vitest run test/pm/shell.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/jira-tool
git add src/pm/types.ts src/pm/shell.tsx test/pm/shell.test.tsx
git commit -m "PM: footer shows last-fetched time and per-view hints"
```

---

## Task 16: Summary Draft — `y` copies to clipboard

**Files:**
- Modify: `src/pm/views/summary-draft.tsx` — add `footerHint`
- Modify: `src/pm/shell.tsx` — route `y` key to the view's copy handler (or simpler: handle `y` generically for active-view-supplied handler)

Simpler approach: expose an optional `onKey` per view. When active view supplies it, shell forwards non-reserved keys.

- [ ] **Step 1: Extend PmView with optional onKey**

In `src/pm/types.ts`:

```typescript
export interface PmView<T> {
  id: string;
  label: string;
  fetch: (ctx: FetchCtx) => Promise<T>;
  Component: React.FC<{ data: T; focusedIssueKey?: string | null }>;
  getIssueKeys?: (data: T) => string[];
  footerHint?: string;
  onKey?: (input: string, data: T) => void;
}
```

- [ ] **Step 2: Route unreserved keys to active view**

In `src/pm/shell.tsx`, at the end of the `useInput` callback (both zones, before the final early return), add:

```tsx
if (activeView?.onKey && activeState?.kind === "ready") {
  activeView.onKey(input, activeState.data);
}
```

Reserved keys to exclude: `q`, `r`, `1`–`9`, `j`, `k`, arrow keys, Enter, Escape. Gate the call with a check that `input` is a single alphabetic char not in that set.

- [ ] **Step 3: Implement copy in summary-draft**

Update `src/pm/views/summary-draft.tsx`:

```tsx
import { execFileSync } from "node:child_process";

function copyToClipboard(text: string): void {
  const cmd = process.platform === "darwin" ? "pbcopy" : "xclip";
  const args = process.platform === "darwin" ? [] : ["-selection", "clipboard"];
  execFileSync(cmd, args, { input: text });
}

export const summaryDraftView: PmView<SummaryDraftData> = {
  id: "summary-draft",
  label: "Summary Draft",
  footerHint: "y copy",
  fetch: async () => { /* unchanged */ },
  Component: SummaryDraft,
  onKey: (input, data) => {
    if (input === "y") copyToClipboard(data.slackText);
  },
};
```

- [ ] **Step 4: Write a test that `y` invokes the onKey handler**

Append to `test/pm/shell.test.tsx`:

```tsx
it("forwards unreserved keys to active view's onKey", async () => {
  const calls: string[] = [];
  const v = {
    ...alphaView,
    onKey: (input: string) => calls.push(input),
  };
  const { stdin } = render(<PmApp views={[v]} />);
  stdin.write("\r");
  await new Promise(r => setTimeout(r, 20));
  stdin.write("y");
  await new Promise(r => setTimeout(r, 20));
  expect(calls).toContain("y");
});
```

- [ ] **Step 5: Run tests**

Run: `cd ~/jira-tool && npx vitest run test/pm`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
cd ~/jira-tool
git add src/pm/types.ts src/pm/shell.tsx src/pm/views/summary-draft.tsx test/pm/shell.test.tsx
git commit -m "PM: summary draft copies to clipboard with y"
```

---

## Task 17: Minimum terminal width warning

**Files:**
- Modify: `src/pm/shell.tsx`
- Modify: `test/pm/shell.test.tsx`

Below 80 cols, render a warning instead of the UI.

- [ ] **Step 1: Write failing test**

```tsx
import { useStdout } from "ink";
// Skip — ink-testing-library doesn't give us a way to set stdout.columns directly.
// Instead, test by mounting with a forced width via prop.
```

Refactor plan: add an optional `width?: number` prop to `PmApp` for testability. In production, if `width` not supplied, use `process.stdout.columns`.

Test:

```tsx
it("shows width warning when terminal is too narrow", () => {
  const { lastFrame } = render(<PmApp views={[alphaView]} width={60} />);
  expect(lastFrame()).toMatch(/width/i);
  expect(lastFrame()).toMatch(/80/);
});
```

- [ ] **Step 2: Implement**

```tsx
interface PmAppProps {
  views: PmView<any>[];
  width?: number;
}

export function PmApp({ views, width: widthProp }: PmAppProps) {
  const cols = widthProp ?? process.stdout.columns ?? 80;
  if (cols < 80) {
    return (
      <Box><Text color="yellow">PM mode needs at least 80 columns (current: {cols}). Resize terminal.</Text></Box>
    );
  }
  // ... existing body
}
```

- [ ] **Step 3: Run tests**

Run: `cd ~/jira-tool && npx vitest run test/pm/shell.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd ~/jira-tool
git add src/pm/shell.tsx test/pm/shell.test.tsx
git commit -m "PM: warn when terminal is narrower than 80 cols"
```

---

## Task 18: Docs — README and help output

**Files:**
- Modify: `README.md`
- Modify: `src/cli.ts` (the help-banner command list)

- [ ] **Step 1: Add `jj pm` to README command table**

In `README.md`, in the commands table (starting at line 61), add under the existing rows:

```markdown
| `jj pm` | Interactive PM dashboard — sprint overview, blockers, velocity, milestones, and more |
```

- [ ] **Step 2: Mention `jj pm` in the "For Product Managers" section**

Under the existing bullets, add:

```markdown
- **`jj pm`** — An all-in-one interactive dashboard. Left sidebar switches between Sprint Overview, By Person, Blockers & Risk, Summary Draft, Velocity, and Milestones. Read-only; `Enter` on a focused issue opens it in your browser.
```

- [ ] **Step 3: Add `jj pm` row to the `jj help` output**

In `src/cli.ts`, find the help block (inside the `args[0] === "help"` handler near line 495). Add a `jj pm` row in the same format used for `board`:

```typescript
// e.g. (match the existing table render style):
"  pm                Interactive PM dashboard (sprint, blockers, velocity, milestones)",
```

- [ ] **Step 4: Smoke-run**

Run: `cd ~/jira-tool && npm run dev -- help`
Expected: `pm` appears in the listed commands.

- [ ] **Step 5: Commit**

```bash
cd ~/jira-tool
git add README.md src/cli.ts
git commit -m "docs: document jj pm"
```

---

## Task 19: Final verification

- [ ] **Step 1: Build**

Run: `cd ~/jira-tool && npm run build`
Expected: clean build.

- [ ] **Step 2: Run full test suite**

Run: `cd ~/jira-tool && npm test`
Expected: all tests pass, including existing suites and new pm/ suite.

- [ ] **Step 3: Manual smoke test**

Run: `cd ~/jira-tool && npm run dev -- pm`

Verify:
- Banner prints, PM dashboard opens
- Sidebar lists 6 views
- Arrow keys move sidebar focus
- Enter activates each view, data loads
- `r` refetches active view (timestamp updates)
- Arrow keys in panel move row focus (where applicable)
- Enter on focused issue opens browser
- Esc returns to sidebar
- `1`–`6` jumps to view by index
- `q` quits cleanly

- [ ] **Step 4: Re-read all changed files**

Use a brief diff against main to ensure changes match intent:

Run: `cd ~/jira-tool && git log main..HEAD --oneline`

Confirm each commit title makes sense in order.

- [ ] **Step 5: No commit needed** — verification only.

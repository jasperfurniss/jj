# JJ Open-Source Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare JJ for public open-source release — clean up security issues, generalize hardcoded values, add PM features, ship agent skills, write docs, add tests.

**Architecture:** JJ is a TypeScript CLI built with clack/prompts (interactive) and ink/React (board UI). All Jira interaction goes through `jira-client.ts`. New PM commands follow existing patterns: interactive mode with spinners + `--pipe` for scriptable output. Config stays env-var-based via `.env` files.

**Tech Stack:** TypeScript, Node.js 24+, tsup (build), clack/prompts (interactive CLI), ink + React (board TUI), Vitest (testing)

---

## File Map

### New files
- `.gitignore`
- `.env.example`
- `LICENSE`
- `README.md`
- `skills/cursor-rule.mdc` — Cursor agent skill
- `skills/claude-code.md` — Claude Code agent skill
- `src/sprint.ts` — `jj sprint` command logic
- `src/summary.ts` — `jj summary` command logic
- `test/converter.test.ts` — Converter unit tests
- `test/board.test.ts` — Board mapping unit tests
- `test/config.test.ts` — Config validation unit tests
- `vitest.config.ts` — Test runner config

### Modified files
- `package.json` — Rename to `jj-cli`, add vitest, remove node-fetch
- `src/config.ts` — Add new config keys, remove webhook config
- `src/board.ts` — Read columns/status map from config
- `src/board-ui.tsx` — Read transition names from config
- `src/cli.ts` — Remove webhook/serve, add new commands, use commands map, fix command injection, make rich output default
- `src/jira-client.ts` — Add `getSprintIssues` helper, `searchByAssignee`

### Deleted files
- `src/webhook.ts`

---

## Task 1: Git Init & Hygiene

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `LICENSE`

This task MUST be done first — `.gitignore` must exist before `git init`.

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
dist/
.env
jira-output/
.claude/
.cursor/
*.tgz
```

- [ ] **Step 2: Create `.env.example`**

```env
# Required: Your Jira Cloud instance URL
JIRA_BASE_URL=https://yourcompany.atlassian.net

# Required: Email associated with your Jira account
JIRA_EMAIL=you@example.com

# Required: Jira API token
# Generate at https://id.atlassian.com/manage-profile/security/api-tokens
JIRA_API_TOKEN=your-api-token-here

# Required: Your Jira project key (e.g., WEB, APP, ENG)
JIRA_PROJECT=WEB

# Required for `jj board`: Your Jira board ID
# Find it in the URL when viewing your board: /jira/software/projects/WEB/boards/<ID>
JIRA_BOARD_ID=36

# Optional: Default JQL query for `jj list` and `jj` (interactive mode)
# Default: assignee = currentUser() AND sprint in openSprints() ORDER BY rank ASC
# JIRA_DEFAULT_JQL=assignee = currentUser() AND sprint in openSprints() ORDER BY rank ASC

# Optional: Directory for downloaded attachments (default: ./jira-output)
# JIRA_OUTPUT_DIR=./jira-output

# Optional: Transition name for `jj ready` (default: REVIEW)
# JJ_READY_TRANSITION=REVIEW

# Optional: Override board column names (JSON array)
# Default: ["To Do","In Progress","Review","Done"]
# JJ_COLUMNS=["To Do","In Progress","Review","Done"]

# Optional: Override status-to-column mapping (JSON object, keys are lowercase status names)
# JJ_STATUS_MAP={"to do":"To Do","in progress":"In Progress","review":"Review","done":"Done","closed":"Done"}

# Optional: Override column transition name candidates (JSON object, keys are column names, values are arrays of transition name substrings)
# JJ_COLUMN_TRANSITIONS={"To Do":["to do","backlog","open"],"In Progress":["in progress","start"],"Review":["review"],"Done":["done","close","complete","resolve"]}
```

- [ ] **Step 3: Create `LICENSE`**

MIT license, copyright 2026 Jasper Furniss.

- [ ] **Step 4: Initialize git**

```bash
cd ~/jira-tool
git init
git add .gitignore .env.example LICENSE
git commit -m "initial commit: gitignore, env example, license"
```

Verify `.env` is NOT staged: run `git status` and confirm `.env`, `node_modules/`, `dist/`, `jira-output/`, `.claude/`, `.cursor/` are all absent from the tracked files.

- [ ] **Step 5: Add existing source files**

```bash
git add package.json package-lock.json tsconfig.json .tool-versions src/ docs/specs/
git commit -m "add existing source and spec"
```

Note: do NOT add `docs/plans/` — those contain org-specific internal design docs.

---

## Task 2: Remove Webhook & Clean Dependencies

**Files:**
- Delete: `src/webhook.ts`
- Modify: `src/cli.ts` — remove `jj serve` command and webhook imports
- Modify: `src/config.ts` — remove `webhook` config block and `validateWebhookConfig`
- Modify: `package.json` — remove `node-fetch` from dependencies, rename to `jj-cli`

- [ ] **Step 1: Delete `src/webhook.ts`**

```bash
rm src/webhook.ts
```

- [ ] **Step 2: Remove webhook from `src/config.ts`**

Remove the `webhook` property from the `config` object:
```typescript
// DELETE these lines from config object:
  webhook: {
    port: parseInt(process.env.WEBHOOK_PORT || "3456", 10),
    githubSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
    githubUsername: process.env.GITHUB_USERNAME || "",
  },
```

Remove the entire `validateWebhookConfig` function.

- [ ] **Step 3: Remove webhook from `src/cli.ts`**

Remove the import of `validateWebhookConfig` from config:
```typescript
// Change this:
import { config, validateConfig, validateWebhookConfig } from "./config.js";
// To this:
import { config, validateConfig } from "./config.js";
```

Remove the import of `startServer` from webhook:
```typescript
// DELETE this line:
import { startServer } from "./webhook.js";
```

Remove the `jj serve` command block (lines ~579-585 in current cli.ts):
```typescript
// DELETE this block:
  // serve mode: `jj serve`
  if (args[0] === "serve") {
    printBanner();
    validateWebhookConfig();
    startServer();
    return;
  }
```

Remove "jj serve" from the help table output.

- [ ] **Step 4: Update `package.json`**

Change `"name"` from `"jira-to-markdown"` to `"jj-cli"`. Remove `"node-fetch"` from `dependencies`.

```bash
npm uninstall node-fetch
```

Then manually edit `package.json` to set the name:
```json
"name": "jj-cli",
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Should complete without errors. If there are any remaining imports of webhook or node-fetch, fix them.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "remove webhook server and node-fetch dependency"
```

---

## Task 3: Fix Command Injection

**Files:**
- Modify: `src/cli.ts` — replace `execSync` string interpolation with `execFileSync` args arrays

There are three locations with command injection vulnerabilities:

- [ ] **Step 1: Fix `openMode`**

Current code (line ~186-190):
```typescript
async function openMode(issueKey: string) {
  const url = `${config.jira.baseUrl}/browse/${issueKey}`;
  const { execSync } = await import("child_process");
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  execSync(`${cmd} ${url}`);
```

Replace with:
```typescript
async function openMode(issueKey: string) {
  const url = `${config.jira.baseUrl}/browse/${issueKey}`;
  const { execFileSync } = await import("child_process");
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  execFileSync(cmd, [url]);
```

- [ ] **Step 2: Fix `commentMode` editor launch**

Current code (line ~205-206):
```typescript
    const editor = process.env.EDITOR || "nano";
    execSync(`${editor} ${tmpFile}`, { stdio: "inherit" });
```

Replace with:
```typescript
    const { execFileSync } = await import("child_process");
    const editor = process.env.EDITOR || "nano";
    execFileSync(editor, [tmpFile], { stdio: "inherit" });
```

- [ ] **Step 3: Fix `createMode` editor launch**

Current code (line ~260-261):
```typescript
      const editor = process.env.EDITOR || "nano";
      execSync(`${editor} ${tmpFile}`, { stdio: "inherit" });
```

Replace with:
```typescript
      const { execFileSync } = await import("child_process");
      const editor = process.env.EDITOR || "nano";
      execFileSync(editor, [tmpFile], { stdio: "inherit" });
```

- [ ] **Step 4: Fix clipboard command in switch/case**

Current code (line ~766-769):
```typescript
        const proc =
          process.platform === "darwin"
            ? "pbcopy"
            : "xclip -selection clipboard";
        execSync(proc, { input: md });
```

Replace with:
```typescript
        const { execFileSync } = await import("child_process");
        const cmd = process.platform === "darwin" ? "pbcopy" : "xclip";
        const clipArgs = process.platform === "darwin" ? [] : ["-selection", "clipboard"];
        execFileSync(cmd, clipArgs, { input: md });
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts
git commit -m "fix command injection in exec calls"
```

---

## Task 4: Generalize Configuration

**Files:**
- Modify: `src/config.ts` — add new config keys with JSON parsing
- Modify: `src/board.ts` — read columns/status map from config
- Modify: `src/board-ui.tsx` — read transition names from config

- [ ] **Step 1: Add new config keys to `src/config.ts`**

Add these to the `config` export, after the existing `outputDir` line:

```typescript
export const config = {
  jira: {
    baseUrl: process.env.JIRA_BASE_URL || "",
    email: process.env.JIRA_EMAIL || "",
    apiToken: process.env.JIRA_API_TOKEN || "",
    defaultJql:
      process.env.JIRA_DEFAULT_JQL ||
      "assignee = currentUser() AND sprint in openSprints() ORDER BY rank ASC",
    project: process.env.JIRA_PROJECT || "",
    boardId: parseInt(process.env.JIRA_BOARD_ID || "36", 10),
  },
  outputDir: process.env.JIRA_OUTPUT_DIR || "./jira-output",
  readyTransition: process.env.JJ_READY_TRANSITION || "REVIEW",
  board: {
    columns: parseJsonEnv<string[]>("JJ_COLUMNS", ["To Do", "In Progress", "Review", "Done"]),
    statusMap: parseJsonEnv<Record<string, string>>("JJ_STATUS_MAP", {
      "to do": "To Do",
      "in progress": "In Progress",
      "review": "Review",
      "done": "Done",
      "closed": "Done",
      "complete": "Done",
      "completed": "Done",
    }),
    columnTransitions: parseJsonEnv<Record<string, string[]>>("JJ_COLUMN_TRANSITIONS", {
      "To Do": ["to do", "backlog", "open", "reopen"],
      "In Progress": ["in progress", "start progress", "start"],
      "Review": ["review", "in review", "code review"],
      "Done": ["done", "close", "complete", "resolve"],
    }),
  },
};
```

Add this helper function before the `config` export:

```typescript
function parseJsonEnv<T>(key: string, fallback: T): T {
  const raw = process.env[key];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`Warning: ${key} is not valid JSON, using default`);
    return fallback;
  }
}
```

- [ ] **Step 2: Update `src/board.ts` to use config**

Replace the hardcoded `COLUMNS` and `STATUS_MAP` with values from config:

```typescript
import { config } from "./config.js";

export type Column = string;

export const COLUMNS: readonly string[] = config.board.columns;

export const STATUS_MAP: Record<string, string> = config.board.statusMap;

export function mapStatus(statusName: string): string {
  return STATUS_MAP[statusName.toLowerCase()] ?? COLUMNS[0];
}
```

The rest of the file (`truncate`, `wrapWords`, `Card`, `renderBoard`) stays the same, but update the `grouped` initialization in `renderBoard` to use `COLUMNS` dynamically:

```typescript
export function renderBoard(issues: JiraIssue[], sprintName: string): string {
  // ... existing termWidth/colCount/etc. calculations stay the same

  const grouped: Record<string, Card[]> = {};
  for (const col of COLUMNS) {
    grouped[col] = [];
  }

  for (const issue of issues) {
    const col = mapStatus(issue.fields.status.name);
    if (grouped[col]) {
      grouped[col].push({ key: issue.key, summary: issue.fields.summary });
    }
  }

  // Trim Done column to last 5
  const lastCol = COLUMNS[COLUMNS.length - 1];
  if (grouped[lastCol].length > 5) {
    grouped[lastCol] = grouped[lastCol].slice(-5);
  }

  // ... rest of rendering stays the same, but iterate COLUMNS instead of the hardcoded array
```

- [ ] **Step 3: Update `src/board-ui.tsx` to use config**

Replace the hardcoded `COLUMN_TRANSITION_NAMES` with config:

```typescript
import { config } from "./config.js";

// Replace this:
const COLUMN_TRANSITION_NAMES: Record<Column, string[]> = { ... };

// With this:
const COLUMN_TRANSITION_NAMES = config.board.columnTransitions;
```

Update the `grouped` initialization in the `Board` component the same way as in `board.ts` — use `COLUMNS` dynamically.

- [ ] **Step 4: Update `jj ready` in `src/cli.ts` to use configurable transition name**

Replace the hardcoded `"REVIEW"` in `readyMode`:

```typescript
// Change:
    const reviewTransition = transitions.find(
      (t) => t.name.toUpperCase() === "REVIEW"
    );
// To:
    const targetName = config.readyTransition;
    const reviewTransition = transitions.find(
      (t) => t.name.toUpperCase() === targetName.toUpperCase()
    );
```

Update the error message similarly:
```typescript
      p.log.error(
        `No "${targetName}" transition available for ${issueKey}.\nAvailable: ${available}`
      );
```

And the success message:
```typescript
    s.stop(`${issueKey} moved to ${targetName}`);
    p.log.success(pc.green(`${issueKey} is now in ${targetName}`));
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/board.ts src/board-ui.tsx src/cli.ts
git commit -m "make board columns, transitions, and ready target configurable"
```

---

## Task 5: Set Up Testing Infrastructure

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` — add vitest dependency and test script

- [ ] **Step 1: Install vitest**

```bash
cd ~/jira-tool
npm install -D vitest
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Verify `package.json` scripts**

Ensure `"test"` script is set:
```json
"scripts": {
  "build": "tsup src/cli.ts --format esm --dts --clean",
  "dev": "tsx src/cli.ts",
  "test": "vitest run"
}
```

Remove the `"list"` and `"pipe"` scripts — they're developer conveniences that won't make sense for other users.

- [ ] **Step 4: Verify test runner works**

```bash
npm test
```

Should exit cleanly with "no test files found" or similar (no tests yet).

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "add vitest testing infrastructure"
```

---

## Task 6: Tests for Converter

**Files:**
- Create: `test/converter.test.ts`

Tests for `adfToMarkdown` (via `issueToMarkdown`) and `issueToMarkdown` directly.

- [ ] **Step 1: Write tests**

Create `test/converter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { issueToMarkdown, type ConvertOptions } from "../src/converter.js";
import type { JiraIssue } from "../src/jira-client.js";

function makeIssue(overrides: Partial<JiraIssue["fields"]> = {}): JiraIssue {
  return {
    key: "TEST-1",
    fields: {
      summary: "Test issue",
      status: { name: "To Do" },
      priority: { name: "Medium" },
      assignee: { displayName: "Alice", emailAddress: "alice@test.com" },
      reporter: { displayName: "Bob" },
      issuetype: { name: "Task" },
      description: null,
      ...overrides,
    },
  };
}

describe("issueToMarkdown", () => {
  it("renders title with key and summary", () => {
    const md = issueToMarkdown(makeIssue());
    expect(md).toContain("# TEST-1: Test issue");
  });

  it("renders metadata table", () => {
    const md = issueToMarkdown(makeIssue());
    expect(md).toContain("| **Type** | Task |");
    expect(md).toContain("| **Status** | To Do |");
    expect(md).toContain("| **Assignee** | Alice |");
  });

  it("skips metadata table when includeMetadata is false", () => {
    const md = issueToMarkdown(makeIssue(), { includeMetadata: false });
    expect(md).not.toContain("| **Type**");
  });

  it("renders unassigned when assignee is null", () => {
    const md = issueToMarkdown(makeIssue({ assignee: null }));
    expect(md).toContain("| **Assignee** | Unassigned |");
  });

  it("renders parent when present", () => {
    const md = issueToMarkdown(
      makeIssue({ parent: { key: "TEST-0", fields: { summary: "Epic" } } })
    );
    expect(md).toContain("| **Parent** | TEST-0: Epic |");
  });

  it("renders labels when present", () => {
    const md = issueToMarkdown(makeIssue({ labels: ["frontend", "urgent"] }));
    expect(md).toContain("| **Labels** | frontend, urgent |");
  });

  it("renders ADF paragraph description", () => {
    const md = issueToMarkdown(
      makeIssue({
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Hello world" }],
            },
          ],
        },
      })
    );
    expect(md).toContain("## Description");
    expect(md).toContain("Hello world");
  });

  it("renders ADF bold and italic marks", () => {
    const md = issueToMarkdown(
      makeIssue({
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "bold", marks: [{ type: "strong" }] },
                { type: "text", text: " and " },
                { type: "text", text: "italic", marks: [{ type: "em" }] },
              ],
            },
          ],
        },
      })
    );
    expect(md).toContain("**bold**");
    expect(md).toContain("*italic*");
  });

  it("renders ADF code blocks", () => {
    const md = issueToMarkdown(
      makeIssue({
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "codeBlock",
              attrs: { language: "ts" },
              content: [{ type: "text", text: "const x = 1;" }],
            },
          ],
        },
      })
    );
    expect(md).toContain("```ts\nconst x = 1;```");
  });

  it("renders ADF bullet list", () => {
    const md = issueToMarkdown(
      makeIssue({
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "item one" }],
                    },
                  ],
                },
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "item two" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      })
    );
    expect(md).toContain("- item one");
    expect(md).toContain("- item two");
  });

  it("renders ADF heading", () => {
    const md = issueToMarkdown(
      makeIssue({
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "Section" }],
            },
          ],
        },
      })
    );
    expect(md).toContain("## Section");
  });

  it("renders ADF link marks", () => {
    const md = issueToMarkdown(
      makeIssue({
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "click here",
                  marks: [{ type: "link", attrs: { href: "https://example.com" } }],
                },
              ],
            },
          ],
        },
      })
    );
    expect(md).toContain("[click here](https://example.com)");
  });

  it("renders comments when present", () => {
    const md = issueToMarkdown(
      makeIssue({
        comment: {
          comments: [
            {
              author: { displayName: "Carol" },
              body: {
                type: "doc",
                version: 1,
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Great work!" }],
                  },
                ],
              },
              created: "2026-01-15T10:00:00.000Z",
              updated: "2026-01-15T10:00:00.000Z",
            },
          ],
        },
      })
    );
    expect(md).toContain("## Comments");
    expect(md).toContain("**Carol**");
    expect(md).toContain("Great work!");
  });

  it("skips comments when includeComments is false", () => {
    const md = issueToMarkdown(
      makeIssue({
        comment: {
          comments: [
            {
              author: { displayName: "Carol" },
              body: { type: "doc", version: 1, content: [] },
              created: "2026-01-15T10:00:00.000Z",
              updated: "2026-01-15T10:00:00.000Z",
            },
          ],
        },
      }),
      { includeComments: false }
    );
    expect(md).not.toContain("## Comments");
  });

  it("handles null description gracefully", () => {
    const md = issueToMarkdown(makeIssue({ description: null }));
    expect(md).not.toContain("## Description");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/converter.test.ts
git commit -m "add converter unit tests"
```

---

## Task 7: Tests for Board

**Files:**
- Create: `test/board.test.ts`

- [ ] **Step 1: Write tests**

Create `test/board.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mapStatus, COLUMNS } from "../src/board.js";

describe("mapStatus", () => {
  it("maps 'to do' to first column", () => {
    expect(mapStatus("To Do")).toBe("To Do");
  });

  it("maps 'in progress' to In Progress", () => {
    expect(mapStatus("In Progress")).toBe("In Progress");
  });

  it("maps 'review' to Review", () => {
    expect(mapStatus("Review")).toBe("Review");
  });

  it("maps 'done' to Done", () => {
    expect(mapStatus("Done")).toBe("Done");
  });

  it("maps 'closed' to Done", () => {
    expect(mapStatus("Closed")).toBe("Done");
  });

  it("maps 'complete' to Done", () => {
    expect(mapStatus("Complete")).toBe("Done");
  });

  it("is case insensitive", () => {
    expect(mapStatus("IN PROGRESS")).toBe("In Progress");
    expect(mapStatus("done")).toBe("Done");
    expect(mapStatus("TO DO")).toBe("To Do");
  });

  it("falls back to first column for unknown statuses", () => {
    expect(mapStatus("Something Unknown")).toBe(COLUMNS[0]);
  });
});

describe("COLUMNS", () => {
  it("has four default columns", () => {
    expect(COLUMNS).toEqual(["To Do", "In Progress", "Review", "Done"]);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/board.test.ts
git commit -m "add board mapping unit tests"
```

---

## Task 8: Tests for Config Validation

**Files:**
- Create: `test/config.test.ts`

Note: `validateConfig` throws when env vars are missing. We need to test it without polluting the actual env. The `config` object is read at module load time, so we test `validateConfig` by temporarily modifying the config values.

- [ ] **Step 1: Export config as mutable for testing**

The current `config` object uses `const` but its properties are mutable. `validateConfig` reads from `config`, not directly from `process.env`, so we can test by modifying `config` properties. No source changes needed — the current code supports this.

- [ ] **Step 2: Write tests**

Create `test/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { config, validateConfig } from "../src/config.js";

describe("validateConfig", () => {
  const original = {
    baseUrl: config.jira.baseUrl,
    email: config.jira.email,
    apiToken: config.jira.apiToken,
    project: config.jira.project,
  };

  beforeEach(() => {
    config.jira.baseUrl = "https://test.atlassian.net";
    config.jira.email = "test@test.com";
    config.jira.apiToken = "token";
    config.jira.project = "TEST";
  });

  afterEach(() => {
    config.jira.baseUrl = original.baseUrl;
    config.jira.email = original.email;
    config.jira.apiToken = original.apiToken;
    config.jira.project = original.project;
  });

  it("does not throw when all required vars are set", () => {
    expect(() => validateConfig()).not.toThrow();
  });

  it("throws when JIRA_BASE_URL is missing", () => {
    config.jira.baseUrl = "";
    expect(() => validateConfig()).toThrow("JIRA_BASE_URL");
  });

  it("throws when JIRA_EMAIL is missing", () => {
    config.jira.email = "";
    expect(() => validateConfig()).toThrow("JIRA_EMAIL");
  });

  it("throws when JIRA_API_TOKEN is missing", () => {
    config.jira.apiToken = "";
    expect(() => validateConfig()).toThrow("JIRA_API_TOKEN");
  });

  it("throws when JIRA_PROJECT is missing", () => {
    config.jira.project = "";
    expect(() => validateConfig()).toThrow("JIRA_PROJECT");
  });

  it("lists all missing vars in error", () => {
    config.jira.baseUrl = "";
    config.jira.email = "";
    config.jira.apiToken = "";
    config.jira.project = "";
    expect(() => validateConfig()).toThrow("JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add test/config.test.ts
git commit -m "add config validation unit tests"
```

---

## Task 9: `jj sprint` Command

**Files:**
- Create: `src/sprint.ts`
- Modify: `src/jira-client.ts` — add sprint date fields to `JiraSprint` type
- Modify: `src/cli.ts` — add `sprint` command

- [ ] **Step 1: Update `JiraSprint` type in `src/jira-client.ts`**

Add date fields to the existing `JiraSprint` interface:

```typescript
export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
}
```

No other changes to `jira-client.ts` needed — `searchIssues` already fetches everything we need.

- [ ] **Step 2: Create `src/sprint.ts`**

```typescript
import * as p from "@clack/prompts";
import pc from "picocolors";
import { config } from "./config.js";
import { searchIssues, getActiveSprint, type JiraIssue } from "./jira-client.js";
import { mapStatus, COLUMNS } from "./board.js";

interface SprintOverview {
  sprintName: string;
  startDate?: string;
  endDate?: string;
  columns: Record<string, { key: string; summary: string; assignee: string }[]>;
}

async function fetchSprintOverview(): Promise<SprintOverview> {
  const [sprint, result] = await Promise.all([
    getActiveSprint(config.jira.boardId),
    searchIssues(),
  ]);

  const sprintName = sprint?.name ?? "Current Sprint";
  const columns: SprintOverview["columns"] = {};
  for (const col of COLUMNS) {
    columns[col] = [];
  }

  for (const issue of result.issues) {
    const col = mapStatus(issue.fields.status.name);
    if (columns[col]) {
      columns[col].push({
        key: issue.key,
        summary: issue.fields.summary,
        assignee: issue.fields.assignee?.displayName || "Unassigned",
      });
    }
  }

  return {
    sprintName,
    startDate: sprint?.startDate,
    endDate: sprint?.endDate,
    columns,
  };
}

function formatDates(startDate?: string, endDate?: string): string {
  if (!startDate || !endDate) return "";
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(startDate)} – ${fmt(endDate)}`;
}

export function sprintToMarkdown(overview: SprintOverview): string {
  const lines: string[] = [];
  const dates = formatDates(overview.startDate, overview.endDate);
  lines.push(`# ${overview.sprintName}${dates ? ` | ${dates}` : ""}`);
  lines.push("");

  let totalCount = 0;
  for (const col of COLUMNS) {
    const issues = overview.columns[col];
    totalCount += issues.length;
    lines.push(`## ${col} (${issues.length})`);
    lines.push("");
    if (issues.length === 0) {
      lines.push("_No issues_");
    } else {
      for (const issue of issues) {
        lines.push(`- **${issue.key}** ${issue.summary} — _${issue.assignee}_`);
      }
    }
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`Total: ${totalCount} issues`);

  return lines.join("\n");
}

export function sprintToTerminal(overview: SprintOverview): string {
  const lines: string[] = [];
  const dates = formatDates(overview.startDate, overview.endDate);
  lines.push(pc.bold(pc.cyan(overview.sprintName)) + (dates ? pc.dim(` | ${dates}`) : ""));
  lines.push("");

  let totalCount = 0;
  for (const col of COLUMNS) {
    const issues = overview.columns[col];
    totalCount += issues.length;
    lines.push(pc.bold(`${col}`) + pc.dim(` (${issues.length})`));
    if (issues.length === 0) {
      lines.push(pc.dim("  No issues"));
    } else {
      for (const issue of issues) {
        lines.push(`  ${pc.cyan(issue.key)} ${issue.summary} ${pc.dim(`— ${issue.assignee}`)}`);
      }
    }
    lines.push("");
  }

  lines.push(pc.dim(`Total: ${totalCount} issues`));

  return lines.join("\n");
}

export async function runSprint(pipe: boolean): Promise<void> {
  if (pipe) {
    const overview = await fetchSprintOverview();
    process.stdout.write(sprintToMarkdown(overview));
    return;
  }

  const s = p.spinner();
  s.start("Fetching sprint overview...");
  const overview = await fetchSprintOverview();
  s.stop(`${overview.sprintName}`);
  console.log();
  console.log(sprintToTerminal(overview));
}
```

- [ ] **Step 3: Add `sprint` command to `src/cli.ts`**

Add import at top:
```typescript
import { runSprint } from "./sprint.js";
```

Add command block after the `board` command block and before the `serve` block (which is now removed):
```typescript
  // sprint mode: `jj sprint [--pipe]`
  if (args[0] === "sprint") {
    if (!pipeFlag) printBanner();
    validateConfig();
    await runSprint(pipeFlag);
    return;
  }
```

Add to the help table:
```
  │ jj sprint              │ Sprint overview (issues by status + assignee)        │
  │ jj sprint --pipe       │ Sprint overview as markdown (for pasting)            │
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/sprint.ts src/jira-client.ts src/cli.ts
git commit -m "add jj sprint command"
```

---

## Task 10: `jj summary` Command

**Files:**
- Create: `src/summary.ts`
- Modify: `src/cli.ts` — add `summary` command

- [ ] **Step 1: Create `src/summary.ts`**

```typescript
import * as p from "@clack/prompts";
import pc from "picocolors";
import { config } from "./config.js";
import {
  searchIssues,
  getActiveSprint,
  type JiraIssue,
} from "./jira-client.js";
import { mapStatus, COLUMNS } from "./board.js";
import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtempSync } from "fs";

interface GroupedIssues {
  [group: string]: { key: string; summary: string; assignee: string; status: string }[];
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupByAssignee(issues: JiraIssue[]): GroupedIssues {
  const grouped: GroupedIssues = {};
  for (const issue of issues) {
    const name = issue.fields.assignee?.displayName || "Unassigned";
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push({
      key: issue.key,
      summary: issue.fields.summary,
      assignee: name,
      status: issue.fields.status.name,
    });
  }
  return grouped;
}

function groupByComponent(issues: JiraIssue[]): GroupedIssues | null {
  const roleKeywords: Record<string, string[]> = {
    "Product & Content": ["product", "content"],
    Development: ["dev", "development", "engineering", "eng"],
    QA: ["qa", "quality", "test", "testing"],
    Design: ["design", "ux", "ui"],
  };

  const grouped: GroupedIssues = {};
  let matched = 0;

  for (const issue of issues) {
    const components = issue.fields.components?.map((c) => c.name.toLowerCase()) || [];
    const labels = issue.fields.labels?.map((l) => l.toLowerCase()) || [];
    const all = [...components, ...labels];

    let placed = false;
    for (const [role, keywords] of Object.entries(roleKeywords)) {
      if (all.some((tag) => keywords.some((kw) => tag.includes(kw)))) {
        if (!grouped[role]) grouped[role] = [];
        grouped[role].push({
          key: issue.key,
          summary: issue.fields.summary,
          assignee: issue.fields.assignee?.displayName || "Unassigned",
          status: issue.fields.status.name,
        });
        placed = true;
        matched++;
        break;
      }
    }

    if (!placed) {
      if (!grouped["Other"]) grouped["Other"] = [];
      grouped["Other"].push({
        key: issue.key,
        summary: issue.fields.summary,
        assignee: issue.fields.assignee?.displayName || "Unassigned",
        status: issue.fields.status.name,
      });
    }
  }

  // If fewer than 30% of issues matched a role, component grouping isn't useful
  if (issues.length > 0 && matched / issues.length < 0.3) return null;
  return grouped;
}

function renderIssueList(
  issues: { key: string; summary: string; assignee: string; status: string }[]
): string {
  return issues
    .map((i) => `- **${i.key}** ${i.summary} — _${i.assignee}_ (${i.status})`)
    .join("\n");
}

function buildDetailedTemplate(
  sprintName: string,
  startDate: string | undefined,
  endDate: string | undefined,
  issues: JiraIssue[]
): string {
  const dates =
    startDate && endDate ? `${formatDate(startDate)} – ${formatDate(endDate)}` : "Dates TBD";
  const project = config.jira.project;

  const byAssignee = groupByAssignee(issues);

  const prioritiesSection = Object.entries(byAssignee)
    .map(([name, items]) => {
      const list = items.map((i) => `- **${i.key}** ${i.summary} (${i.status})`).join("\n");
      return `### ${name}\n${list}`;
    })
    .join("\n\n");

  return `# ${project} Sprint Roundup — ${sprintName}
Sprint: ${sprintName} | Dates: ${dates}

## PTO Radar
<!-- Add PTO/OOO here -->

## Agenda Highlights
<!-- Add highlights, reminders, notes here -->

## Key Milestones
<!-- Add milestones with dates here -->

## Sprint Priorities
${prioritiesSection}
`;
}

function buildConciseTemplate(
  sprintName: string,
  startDate: string | undefined,
  endDate: string | undefined,
  issues: JiraIssue[]
): string {
  const project = config.jira.project;
  const byComponent = groupByComponent(issues);

  let prioritiesSection: string;

  if (byComponent) {
    prioritiesSection = Object.entries(byComponent)
      .map(([role, items]) => {
        const list = items
          .map((i) => `- **${i.key}** ${i.summary} — _${i.assignee}_`)
          .join("\n");
        return `## ${role}\n${list}`;
      })
      .join("\n\n");
  } else {
    // Fall back to assignee grouping
    const byAssignee = groupByAssignee(issues);
    prioritiesSection = Object.entries(byAssignee)
      .map(([name, items]) => {
        const list = items.map((i) => `- **${i.key}** ${i.summary} (${i.status})`).join("\n");
        return `## ${name}\n${list}`;
      })
      .join("\n\n");
  }

  return `# ${project} Sprint Priorities — ${sprintName}
Sprint Focus: <!-- Fill in sprint focus -->

## OOO
<!-- Add OOO here -->

${prioritiesSection}

## Notes
<!-- Add notes here -->
`;
}

export async function runSummary(opts: {
  pipe: boolean;
  concise: boolean;
}): Promise<void> {
  const [sprint, result] = await Promise.all([
    getActiveSprint(config.jira.boardId),
    searchIssues(),
  ]);

  const sprintName = sprint?.name ?? "Current Sprint";
  const template = opts.concise
    ? buildConciseTemplate(sprintName, sprint?.startDate, sprint?.endDate, result.issues)
    : buildDetailedTemplate(sprintName, sprint?.startDate, sprint?.endDate, result.issues);

  // Pipe mode: output template directly, skip editor
  if (opts.pipe) {
    process.stdout.write(template);
    return;
  }

  // Interactive mode: open in editor
  const tmpDir = mkdtempSync(join(tmpdir(), "jj-summary-"));
  const tmpFile = join(tmpDir, "SPRINT_SUMMARY.md");
  writeFileSync(tmpFile, template);

  const { execFileSync } = await import("child_process");
  const editor = process.env.EDITOR || "nano";
  execFileSync(editor, [tmpFile], { stdio: "inherit" });

  const final = readFileSync(tmpFile, "utf-8").trim();

  if (!final) {
    p.cancel("Empty summary, nothing generated.");
    return;
  }

  const action = await p.select({
    message: "What do you want to do with the summary?",
    options: [
      { value: "clipboard", label: "Copy to clipboard" },
      { value: "stdout", label: "Print to stdout" },
      { value: "file", label: "Save to file" },
    ],
  });

  if (p.isCancel(action)) {
    p.cancel("Cancelled.");
    return;
  }

  switch (action) {
    case "clipboard": {
      const { execFileSync: exec } = await import("child_process");
      try {
        const cmd = process.platform === "darwin" ? "pbcopy" : "xclip";
        const clipArgs = process.platform === "darwin" ? [] : ["-selection", "clipboard"];
        exec(cmd, clipArgs, { input: final });
        p.log.success("Copied to clipboard!");
      } catch {
        p.log.warn("Clipboard not available. Printing instead:\n");
        console.log(final);
      }
      break;
    }
    case "stdout":
      console.log(final);
      break;
    case "file": {
      const filename = `${sprintName.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase()}-summary.md`;
      writeFileSync(filename, final, "utf-8");
      p.log.success(`Saved to ${pc.green(filename)}`);
      break;
    }
  }
}
```

- [ ] **Step 2: Add `summary` command to `src/cli.ts`**

Add import at top:
```typescript
import { runSummary } from "./summary.js";
```

Add command block:
```typescript
  // summary mode: `jj summary [--concise] [--pipe]`
  if (args[0] === "summary") {
    if (!pipeFlag) printBanner();
    validateConfig();
    await runSummary({
      pipe: pipeFlag,
      concise: args.includes("--concise"),
    });
    return;
  }
```

Add to the help table:
```
  │ jj summary             │ Sprint roundup generator (opens $EDITOR)             │
  │ jj summary --concise   │ Concise format (grouped by role)                     │
  │ jj summary --pipe      │ Output auto-generated template to stdout             │
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/summary.ts src/cli.ts
git commit -m "add jj summary command"
```

---

## Task 11: `jj whois` and `jj search` Commands

**Files:**
- Modify: `src/jira-client.ts` — add `searchByAssignee` function
- Modify: `src/cli.ts` — add `whois` and `search` commands

- [ ] **Step 1: Add `searchByAssignee` to `src/jira-client.ts`**

```typescript
export async function searchByAssignee(
  name: string,
  maxResults = 20
): Promise<JiraSearchResult> {
  const jql = `project = ${config.jira.project} AND assignee in membersOf("${name}") AND sprint in openSprints() ORDER BY rank ASC`;

  // membersOf might not work for display names — fall back to displayName search
  try {
    const result = await searchIssues(jql, maxResults);
    if (result.issues.length > 0) return result;
  } catch {
    // Fall through to displayName approach
  }

  // Fallback: search by displayName contains
  const fallbackJql = `project = ${config.jira.project} AND sprint in openSprints() AND assignee != EMPTY ORDER BY rank ASC`;
  const all = await searchIssues(fallbackJql, 200);

  const filtered = all.issues.filter((issue) =>
    issue.fields.assignee?.displayName?.toLowerCase().includes(name.toLowerCase())
  );

  return { issues: filtered };
}
```

- [ ] **Step 2: Add `whois` command to `src/cli.ts`**

Add import of `searchByAssignee`:
```typescript
import {
  searchIssues,
  getIssue,
  downloadAllAttachments,
  getTransitions,
  transitionIssue,
  getActiveSprint,
  addComment,
  createIssue,
  searchIssuesByText,
  searchByAssignee,
} from "./jira-client.js";
```

Add command block:
```typescript
  // whois mode: `jj whois <name> [--pipe]`
  if (args[0] === "whois") {
    if (!pipeFlag) printBanner();
    validateConfig();

    const name = args.slice(1).filter((a) => !a.startsWith("-")).join(" ");
    if (!name) {
      console.error("Usage: jj whois <name>  e.g. jj whois adam");
      process.exit(1);
    }

    const s = pipeFlag ? null : p.spinner();
    s?.start(`Searching for ${name}...`);

    const result = await searchByAssignee(name);

    if (pipeFlag) {
      for (const issue of result.issues) {
        const f = issue.fields;
        console.log(`${issue.key}\t${f.status.name}\t${f.assignee?.displayName || "—"}\t${f.summary}`);
      }
      return;
    }

    s?.stop(`Found ${result.issues.length} issues`);

    if (!result.issues.length) {
      p.log.warn(`No issues found assigned to "${name}" in the current sprint.`);
      return;
    }

    const assigneeName = result.issues[0].fields.assignee?.displayName || name;
    p.log.info(pc.bold(`${assigneeName}'s sprint:`));

    for (const issue of result.issues) {
      const f = issue.fields;
      const status = pc.dim(`[${f.status.name}]`);
      console.log(`  ${pc.cyan(issue.key)} ${f.summary} ${status}`);
    }
    return;
  }
```

- [ ] **Step 3: Add `search` command to `src/cli.ts`**

```typescript
  // search mode: `jj search <text> [--pipe]`
  if (args[0] === "search") {
    if (!pipeFlag) printBanner();
    validateConfig();

    const text = args.slice(1).filter((a) => !a.startsWith("-")).join(" ");
    if (!text) {
      console.error("Usage: jj search <text>  e.g. jj search homepage");
      process.exit(1);
    }

    const s = pipeFlag ? null : p.spinner();
    s?.start(`Searching for "${text}"...`);

    const result = await searchIssuesByText(text, undefined, 20);

    if (pipeFlag) {
      for (const issue of result.issues) {
        const f = issue.fields;
        console.log(`${issue.key}\t${f.status?.name || "—"}\t${f.assignee?.displayName || "—"}\t${f.summary}`);
      }
      return;
    }

    s?.stop(`Found ${result.issues.length} results`);

    if (!result.issues.length) {
      p.log.warn(`No issues found matching "${text}".`);
      return;
    }

    const selected = await p.select({
      message: "Select an issue:",
      options: result.issues.map((issue) => ({
        value: issue.key,
        label: `${pc.cyan(issue.key)} ${issue.fields.summary}`,
        hint: `${issue.fields.status?.name || "—"} · ${issue.fields.issuetype?.name || "—"}`,
      })),
    });

    if (p.isCancel(selected)) {
      p.cancel("Cancelled.");
      return;
    }

    // Fetch full issue and convert
    const full = await fetchAndConvert(selected as string);
    if (!full) return;

    console.log("\n" + full.md);
    return;
  }
```

- [ ] **Step 4: Update `searchIssuesByText` to accept optional issue types**

The current function defaults to `["Epic", "Feature", "Initiative"]`. For `jj search`, we want to search all types. Update the signature default in `src/jira-client.ts`:

Change:
```typescript
export async function searchIssuesByText(
  text: string,
  issueTypes = ["Epic", "Feature", "Initiative"],
  maxResults = 10
): Promise<JiraSearchResult> {
```

To accept `undefined` to mean "all types":
```typescript
export async function searchIssuesByText(
  text: string,
  issueTypes?: string[],
  maxResults = 10
): Promise<JiraSearchResult> {
  const typeClause = issueTypes?.length
    ? ` AND issuetype in (${issueTypes.map((t) => `"${t}"`).join(", ")})`
    : "";
  const jql = `project = ${config.jira.project}${typeClause} AND summary ~ "${text.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
  return searchIssues(jql, maxResults);
}
```

Callers that pass explicit types (like the parent search in `createMode`) are unaffected. The `jj search` command passes `undefined` to search all types.

- [ ] **Step 5: Add to help table**

```
  │ jj whois <name>        │ What's assigned to this person in the sprint?        │
  │ jj search <text>       │ Search issues by summary text                        │
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/jira-client.ts src/cli.ts
git commit -m "add jj whois and jj search commands"
```

---

## Task 12: Make Rich Output the Default

**Files:**
- Modify: `src/cli.ts` — change the output flow to default to rich output instead of showing a menu

- [ ] **Step 1: Replace output menu with direct rich output**

In the `main()` function, after `fetchAndConvert` returns, replace the output selection menu (the `p.select` with clipboard/file/stdout/rich options) with direct rich output:

```typescript
  const result = await fetchAndConvert(issueKey);
  if (!result) return;

  const { md, issue, imagePaths } = result;

  // Rich output: markdown + inline images
  console.log("\n" + md);

  if (imagePaths.size > 0) {
    const { default: terminalImage } = await import("terminal-image");
    const defaultWidth = Math.floor((process.stdout.columns ?? 80) * 0.8);
    for (const [filename, filePath] of imagePaths) {
      const rendered = await terminalImage.file(filePath, { width: defaultWidth });
      process.stdout.write(rendered + "\n");
      p.log.info(filename);
    }
  }

  p.outro(pc.green("Done!"));
```

This removes the menu entirely. Users who want clipboard/file output can use `--pipe` and redirect.

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "make rich output the default display mode"
```

---

## Task 13: Agent Skills

**Files:**
- Create: `skills/cursor-rule.mdc`
- Create: `skills/claude-code.md`

- [ ] **Step 1: Create `skills/` directory and Cursor rule**

```bash
mkdir -p ~/jira-tool/skills
```

Create `skills/cursor-rule.mdc`:

```markdown
---
description: Jira CLI integration via JJ — fetches tickets and lists stories automatically
alwaysApply: false
---

# JJ — Jira integration

JJ is a CLI tool that fetches Jira tickets and converts them to Markdown.

## When the user mentions a Jira issue key (like WEB-1234, PROJ-56, etc.)

Automatically fetch the ticket by running:

```bash
jj <KEY> --pipe
```

Use the full markdown output as context for the conversation. Do not ask the user if they want you to fetch it — just do it.

## When the user asks to list their stories / assigned tickets / current sprint

Run:

```bash
jj list --pipe
```

This returns tab-separated lines: `KEY  STATUS  ASSIGNEE  SUMMARY`

If the user provides custom JQL, pass it:

```bash
jj list --pipe --jql "your jql here"
```

## Other useful commands

- `jj sprint --pipe` — Sprint overview grouped by status with assignees
- `jj whois <name> --pipe` — Issues assigned to a person in the current sprint
- `jj search <text> --pipe` — Search issues by summary text

## Notes

- JJ reads credentials from `.env` in its install directory, or from env vars
- The `--pipe` flag makes it non-interactive (no spinners, no prompts, clean stdout)
- Without `--pipe`, the CLI is interactive — only use `--pipe` in agent context
```

- [ ] **Step 2: Create Claude Code skill**

Create `skills/claude-code.md`:

```markdown
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

- `jj sprint --pipe` — Sprint overview grouped by status
- `jj whois <name> --pipe` — Issues assigned to a person
- `jj search <text> --pipe` — Search issues by summary

Always use `--pipe` in agent context for non-interactive output.
```

- [ ] **Step 3: Commit**

```bash
git add skills/
git commit -m "add Cursor and Claude Code agent skills"
```

---

## Task 14: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
```
     ██╗      ██╗
     ██║      ██║   your helpful jira buddy
     ██║      ██║
██   ██║ ██   ██║
╚█████╔╝ ╚█████╔╝
 ╚════╝   ╚════╝
```

A fast, friendly CLI for Jira Cloud. Fetch tickets as markdown, manage your sprint board in the terminal, generate sprint summaries, and pipe everything into your AI coding agent.

## Setup

1. Clone and build:

```bash
git clone <repo-url> jj
cd jj
npm install
npm run build
npm link   # makes `jj` available globally
```

2. Create your `.env` file:

```bash
cp .env.example .env
```

3. Fill in your credentials:

- **`JIRA_BASE_URL`** — Your Jira Cloud URL (e.g., `https://yourcompany.atlassian.net`)
- **`JIRA_EMAIL`** — Your Jira account email
- **`JIRA_API_TOKEN`** — Generate one at [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- **`JIRA_PROJECT`** — Your project key (e.g., `WEB`, `APP`, `ENG`)
- **`JIRA_BOARD_ID`** — Find it in your board URL: `/jira/software/projects/WEB/boards/<ID>`

4. Verify it works:

```bash
jj list
```

## Commands

| Command | Description |
|---------|-------------|
| `jj` | Interactive: list issues → select → view as markdown |
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

**JJ comes with agent skills that make working with Jira a breeze in AI coding assistants.**

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
| `JJ_STATUS_MAP` | See `.env.example` | Status → column mapping (JSON) |
| `JJ_COLUMN_TRANSITIONS` | See `.env.example` | Transition name candidates (JSON) |

## License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "add README"
```

---

## Task 15: Final Cleanup & Verify

- [ ] **Step 1: Update help table in `cli.ts`**

Make sure the help table in `printHelp` / the `help` command block matches all current commands. Remove `jj serve`. Add `jj sprint`, `jj summary`, `jj whois`, `jj search`. Verify the table formatting is consistent.

- [ ] **Step 2: Run full verification**

```bash
npm run build && npm test
```

Both should pass cleanly.

- [ ] **Step 3: Verify git status is clean**

```bash
git status
```

No untracked files that should be tracked. `.env`, `node_modules/`, `dist/`, `jira-output/`, `.claude/`, `.cursor/` should all be in `.gitignore`.

- [ ] **Step 4: Final commit if needed**

```bash
git add -A
git commit -m "final cleanup: update help table, verify build and tests"
```

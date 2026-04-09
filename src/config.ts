import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  // Look for .env next to the source files (jira-tool root), not cwd
  const envPath = resolve(__dirname, "..", ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const val = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

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

export function validateConfig() {
  const missing: string[] = [];
  if (!config.jira.baseUrl) missing.push("JIRA_BASE_URL");
  if (!config.jira.email) missing.push("JIRA_EMAIL");
  if (!config.jira.apiToken) missing.push("JIRA_API_TOKEN");
  if (!config.jira.project) missing.push("JIRA_PROJECT");
  if (missing.length) {
    throw new Error(
      `Missing required env vars: ${missing.join(", ")}\nCopy .env.example to .env and fill in your values.`
    );
  }
}


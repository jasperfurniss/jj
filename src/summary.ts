import * as p from "@clack/prompts";
import pc from "picocolors";
import { config } from "./config.js";
import {
  searchIssues,
  getActiveSprint,
  type JiraIssue,
} from "./jira-client.js";
import { mapStatus, COLUMNS } from "./board.js";

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Build a flat list of sprint priorities in Erin/Anna's style:
 * each issue is one line with assignee mentioned inline.
 * Excludes Done items — those aren't priorities.
 */
function buildPrioritiesList(issues: JiraIssue[]): {
  slack: string;
  terminal: string;
} {
  const lastCol = COLUMNS[COLUMNS.length - 1];
  const active = issues.filter(
    (i) => mapStatus(i.fields.status.name) !== lastCol
  );

  if (active.length === 0) {
    return {
      slack: "_No active issues in sprint_",
      terminal: pc.dim("  No active issues in sprint"),
    };
  }

  const slackLines: string[] = [];
  const terminalLines: string[] = [];

  for (const issue of active) {
    const assignee = issue.fields.assignee?.displayName;
    const status = issue.fields.status.name;
    const assigneeSuffix = assignee ? ` \u2014 ${assignee}` : "";

    slackLines.push(
      `\u2022 ${issue.fields.summary}${assigneeSuffix} (${status})`
    );
    terminalLines.push(
      `  ${pc.cyan(issue.key)} ${issue.fields.summary}${assignee ? pc.dim(` \u2014 ${assignee}`) : ""} ${pc.dim(`(${status})`)}`
    );
  }

  return {
    slack: slackLines.join("\n"),
    terminal: terminalLines.join("\n"),
  };
}

/**
 * Build a "what got done" section for issues in the Done column.
 */
function buildDoneList(issues: JiraIssue[]): {
  slack: string;
  terminal: string;
} | null {
  const lastCol = COLUMNS[COLUMNS.length - 1];
  const done = issues.filter(
    (i) => mapStatus(i.fields.status.name) === lastCol
  );

  if (done.length === 0) return null;

  const slackLines = done.map(
    (i) => `\u2022 ${i.fields.summary} :white_check_mark:`
  );
  const terminalLines = done.map(
    (i) => `  ${pc.cyan(i.key)} ${i.fields.summary} ${pc.green("\u2713")}`
  );

  return {
    slack: slackLines.join("\n"),
    terminal: terminalLines.join("\n"),
  };
}

/**
 * Build Slack-friendly summary matching the format PMs use.
 */
function buildSlackSummary(
  sprintName: string,
  startDate: string | undefined,
  endDate: string | undefined,
  issues: JiraIssue[]
): string {
  const dates =
    startDate && endDate
      ? `${formatDate(startDate)} \u2013 ${formatDate(endDate)}`
      : "Dates TBD";
  const project = config.jira.project;

  const priorities = buildPrioritiesList(issues);
  const done = buildDoneList(issues);

  let text = `:clipboard: *${project} Sprint Roundup \u2014 ${sprintName}*
Sprint: ${sprintName} | Dates: ${dates}

:palm_tree: *PTO Radar*
_Add PTO/OOO here_

:spiral_calendar_pad: *Agenda Highlights*
_Add highlights, reminders, notes here_

:compass: *Key Milestones*
_Add milestones with dates here_

:dart: *Sprint Priorities*
${priorities.slack}`;

  if (done) {
    text += `\n\n:white_check_mark: *Done*\n${done.slack}`;
  }

  return text + "\n";
}

/**
 * Build concise Slack summary with role-based grouping if components/labels support it,
 * otherwise flat list.
 */
function buildSlackConcise(
  sprintName: string,
  startDate: string | undefined,
  endDate: string | undefined,
  issues: JiraIssue[]
): string {
  const project = config.jira.project;
  const priorities = buildPrioritiesList(issues);

  return `:clipboard: *${project} Sprint Priorities \u2014 ${sprintName}*
Sprint Focus: _Fill in sprint focus_

*OOO*
_Add OOO here_

:dart: *Priorities*
${priorities.slack}

*Notes*
_Add notes here_
`;
}

/**
 * Rich terminal output with colors.
 */
function renderTerminal(
  sprintName: string,
  startDate: string | undefined,
  endDate: string | undefined,
  issues: JiraIssue[]
): string {
  const dates =
    startDate && endDate
      ? `${formatDate(startDate)} \u2013 ${formatDate(endDate)}`
      : "";
  const project = config.jira.project;

  const priorities = buildPrioritiesList(issues);
  const done = buildDoneList(issues);

  const lines: string[] = [];
  lines.push(
    pc.bold(pc.cyan(`${project} Sprint Roundup \u2014 ${sprintName}`)) +
      (dates ? pc.dim(` | ${dates}`) : "")
  );
  lines.push("");
  lines.push(pc.bold(":palm_tree: PTO Radar"));
  lines.push(pc.dim("  Add PTO/OOO here"));
  lines.push("");
  lines.push(pc.bold(":spiral_calendar_pad: Agenda Highlights"));
  lines.push(pc.dim("  Add highlights, reminders, notes here"));
  lines.push("");
  lines.push(pc.bold(":compass: Key Milestones"));
  lines.push(pc.dim("  Add milestones with dates here"));
  lines.push("");
  lines.push(pc.bold(":dart: Sprint Priorities"));
  lines.push(priorities.terminal);

  if (done) {
    lines.push("");
    lines.push(pc.bold(pc.green("\u2713 Done")));
    lines.push(done.terminal);
  }

  return lines.join("\n");
}

export async function runSummary(opts: {
  pipe: boolean;
  concise: boolean;
}): Promise<void> {
  const s = opts.pipe ? null : p.spinner();
  s?.start("Fetching sprint data...");

  const [sprint, result] = await Promise.all([
    getActiveSprint(config.jira.boardId),
    searchIssues(),
  ]);

  const sprintName = sprint?.name ?? "Current Sprint";

  // Build Slack-formatted text for clipboard
  const slackText = opts.concise
    ? buildSlackConcise(sprintName, sprint?.startDate, sprint?.endDate, result.issues)
    : buildSlackSummary(sprintName, sprint?.startDate, sprint?.endDate, result.issues);

  // Pipe mode: output slack text to stdout
  if (opts.pipe) {
    process.stdout.write(slackText);
    return;
  }

  s?.stop(`${sprintName}`);

  // Show rich terminal output
  console.log();
  console.log(
    renderTerminal(sprintName, sprint?.startDate, sprint?.endDate, result.issues)
  );
  console.log();

  // Auto-copy to clipboard
  try {
    const { execFileSync } = await import("child_process");
    const cmd = process.platform === "darwin" ? "pbcopy" : "xclip";
    const clipArgs =
      process.platform === "darwin" ? [] : ["-selection", "clipboard"];
    execFileSync(cmd, clipArgs, { input: slackText });
    p.log.success("Copied to clipboard (Slack format) \u2014 paste it anywhere!");
  } catch {
    p.log.warn("Clipboard not available. Here's the Slack-formatted text:\n");
    console.log(slackText);
  }
}

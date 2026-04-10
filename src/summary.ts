import * as p from "@clack/prompts";
import pc from "picocolors";
import { config } from "./config.js";
import {
  searchAllSprintIssues,
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

interface PersonWork {
  name: string;
  items: { summary: string; status: string }[];
}

/**
 * Group issues by assignee, excluding Done items.
 * Returns people sorted by number of active items (most busy first).
 */
function groupActiveByPerson(issues: JiraIssue[]): PersonWork[] {
  const lastCol = COLUMNS[COLUMNS.length - 1];
  const active = issues.filter(
    (i) => mapStatus(i.fields.status.name) !== lastCol
  );

  const byPerson: Record<string, { summary: string; status: string }[]> = {};
  for (const issue of active) {
    const name = issue.fields.assignee?.displayName || "Unassigned";
    if (!byPerson[name]) byPerson[name] = [];
    byPerson[name].push({
      summary: issue.fields.summary,
      status: issue.fields.status.name,
    });
  }

  return Object.entries(byPerson)
    .map(([name, items]) => ({ name, items }))
    .sort((a, b) => b.items.length - a.items.length);
}

/**
 * Get Done items for the sprint.
 */
function getDoneItems(issues: JiraIssue[]): { summary: string; assignee: string }[] {
  const lastCol = COLUMNS[COLUMNS.length - 1];
  return issues
    .filter((i) => mapStatus(i.fields.status.name) === lastCol)
    .map((i) => ({
      summary: i.fields.summary,
      assignee: i.fields.assignee?.displayName || "Unassigned",
    }));
}

/**
 * Build Slack-friendly summary in Preston/Erin's style.
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
  const people = groupActiveByPerson(issues);
  const done = getDoneItems(issues);

  const focusAreas = people
    .map((person) => {
      const items = person.items
        .map((i) => `\u2022 ${i.summary}`)
        .join("\n");
      return `*${person.name}*\n${items}`;
    })
    .join("\n\n");

  let text = `:clipboard: *${project} Sprint Roundup \u2014 ${sprintName}*
Sprint: ${sprintName} | Dates: ${dates}

:dart: *Sprint Focus:* _Fill in the sprint focus here_

:palm_tree: *PTO Radar*
_Add PTO/OOO here_

:spiral_calendar_pad: *Agenda Highlights*
_Add highlights, reminders, notes here_

:compass: *Key Milestones*
_Add milestones with dates here_

:package: *Primary Focus Areas*

${focusAreas}`;

  if (done.length > 0) {
    const doneList = done
      .map((d) => `\u2022 ${d.summary} :white_check_mark:`)
      .join("\n");
    text += `\n\n:white_check_mark: *Done*\n${doneList}`;
  }

  text += `\n\n:bricks: *To Note*\n_Add any callouts, risks, or context here_\n`;

  return text;
}

/**
 * Build concise Slack summary.
 */
function buildSlackConcise(
  sprintName: string,
  startDate: string | undefined,
  endDate: string | undefined,
  issues: JiraIssue[]
): string {
  const project = config.jira.project;
  const people = groupActiveByPerson(issues);

  const focusAreas = people
    .map((person) => {
      const items = person.items
        .map((i) => `\u2022 ${i.summary}`)
        .join("\n");
      return `*${person.name}*\n${items}`;
    })
    .join("\n\n");

  return `:clipboard: *${project} Sprint Priorities \u2014 ${sprintName}*
Sprint Focus: _Fill in sprint focus_

*OOO*
_Add OOO here_

${focusAreas}

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
  const people = groupActiveByPerson(issues);
  const done = getDoneItems(issues);

  const lines: string[] = [];
  lines.push(
    pc.bold(pc.cyan(`${project} Sprint Roundup \u2014 ${sprintName}`)) +
      (dates ? pc.dim(` | ${dates}`) : "")
  );
  lines.push("");
  lines.push(pc.bold(":dart: Sprint Focus:") + pc.dim(" Fill in the sprint focus here"));
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
  lines.push(pc.bold(":package: Primary Focus Areas"));

  for (const person of people) {
    lines.push(`  ${pc.bold(person.name)}`);
    for (const item of person.items) {
      lines.push(`    \u2022 ${item.summary} ${pc.dim(`(${item.status})`)}`);
    }
    lines.push("");
  }

  if (done.length > 0) {
    lines.push(pc.bold(pc.green(":white_check_mark: Done")));
    for (const d of done) {
      lines.push(`  \u2022 ${d.summary} ${pc.green("\u2713")}`);
    }
    lines.push("");
  }

  lines.push(pc.bold(":bricks: To Note"));
  lines.push(pc.dim("  Add any callouts, risks, or context here"));

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
    searchAllSprintIssues(),
  ]);

  const sprintName = sprint?.name ?? "Current Sprint";

  const slackText = opts.concise
    ? buildSlackConcise(sprintName, sprint?.startDate, sprint?.endDate, result.issues)
    : buildSlackSummary(sprintName, sprint?.startDate, sprint?.endDate, result.issues);

  if (opts.pipe) {
    process.stdout.write(slackText);
    return;
  }

  s?.stop(`${sprintName}`);

  console.log();
  console.log(
    renderTerminal(sprintName, sprint?.startDate, sprint?.endDate, result.issues)
  );
  console.log();

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

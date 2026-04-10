import * as p from "@clack/prompts";
import pc from "picocolors";
import { config } from "./config.js";
import {
  searchIssues,
  getActiveSprint,
  type JiraIssue,
} from "./jira-client.js";
import { mapStatus, COLUMNS } from "./board.js";

interface GroupedIssues {
  [group: string]: {
    key: string;
    summary: string;
    assignee: string;
    status: string;
  }[];
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
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
    const components =
      issue.fields.components?.map((c) => c.name.toLowerCase()) || [];
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

  if (issues.length > 0 && matched / issues.length < 0.3) return null;
  return grouped;
}

/**
 * Build Slack-friendly plain text summary matching the format PMs use.
 * Uses Slack mrkdwn: *bold*, _italic_, :emoji:
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

  const byAssignee = groupByAssignee(issues);

  const prioritiesSection = Object.entries(byAssignee)
    .map(([name, items]) => {
      const list = items
        .map((i) => `\u2022 *${i.key}* ${i.summary} (${i.status})`)
        .join("\n");
      return `*${name}*\n${list}`;
    })
    .join("\n\n");

  return `:clipboard: *${project} Sprint Roundup \u2014 ${sprintName}*
Sprint: ${sprintName} | Dates: ${dates}

:palm_tree: *PTO Radar*
_Add PTO/OOO here_

:spiral_calendar_pad: *Agenda Highlights*
_Add highlights, reminders, notes here_

:compass: *Key Milestones*
_Add milestones with dates here_

:dart: *Sprint Priorities*
${prioritiesSection}
`;
}

function buildSlackConcise(
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
          .map((i) => `\u2022 *${i.key}* ${i.summary} \u2014 _${i.assignee}_`)
          .join("\n");
        return `*${role}*\n${list}`;
      })
      .join("\n\n");
  } else {
    const byAssignee = groupByAssignee(issues);
    prioritiesSection = Object.entries(byAssignee)
      .map(([name, items]) => {
        const list = items
          .map((i) => `\u2022 *${i.key}* ${i.summary} (${i.status})`)
          .join("\n");
        return `*${name}*\n${list}`;
      })
      .join("\n\n");
  }

  return `:clipboard: *${project} Sprint Priorities \u2014 ${sprintName}*
Sprint Focus: _Fill in sprint focus_

*OOO*
_Add OOO here_

${prioritiesSection}

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

  const byAssignee = groupByAssignee(issues);

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

  for (const [name, items] of Object.entries(byAssignee)) {
    lines.push(`  ${pc.bold(name)}`);
    for (const item of items) {
      lines.push(
        `    ${pc.cyan(item.key)} ${item.summary} ${pc.dim(`(${item.status})`)}`
      );
    }
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

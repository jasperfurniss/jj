import * as p from "@clack/prompts";
import pc from "picocolors";
import { config } from "./config.js";
import { searchAllSprintIssues, getActiveSprint } from "./jira-client.js";
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
    searchAllSprintIssues(),
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
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(startDate)} \u2013 ${fmt(endDate)}`;
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
        lines.push(`- **${issue.key}** ${issue.summary} \u2014 _${issue.assignee}_`);
      }
    }
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`Total: ${totalCount} issues`);

  return lines.join("\n");
}

function sprintToTerminal(overview: SprintOverview): string {
  const lines: string[] = [];
  const dates = formatDates(overview.startDate, overview.endDate);
  lines.push(
    pc.bold(pc.cyan(overview.sprintName)) + (dates ? pc.dim(` | ${dates}`) : "")
  );
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
        lines.push(
          `  ${pc.cyan(issue.key)} ${issue.summary} ${pc.dim(`\u2014 ${issue.assignee}`)}`
        );
      }
    }
    lines.push("");
  }

  lines.push(pc.dim(`Total: ${totalCount} issues`));

  return lines.join("\n");
}

interface PersonIssues {
  name: string;
  items: { key: string; summary: string; status: string }[];
}

function groupByPerson(overview: SprintOverview): PersonIssues[] {
  const byPerson: Record<string, { key: string; summary: string; status: string }[]> = {};

  for (const col of COLUMNS) {
    for (const issue of overview.columns[col]) {
      const name = issue.assignee;
      if (!byPerson[name]) byPerson[name] = [];
      byPerson[name].push({
        key: issue.key,
        summary: issue.summary,
        status: col,
      });
    }
  }

  return Object.entries(byPerson)
    .map(([name, items]) => ({ name, items }))
    .sort((a, b) => b.items.length - a.items.length);
}

function sprintByPersonToMarkdown(overview: SprintOverview): string {
  const lines: string[] = [];
  const dates = formatDates(overview.startDate, overview.endDate);
  lines.push(`# ${overview.sprintName}${dates ? ` | ${dates}` : ""}`);
  lines.push("");

  const people = groupByPerson(overview);
  let totalCount = 0;

  for (const person of people) {
    totalCount += person.items.length;
    lines.push(`## ${person.name} (${person.items.length})`);
    lines.push("");
    for (const item of person.items) {
      lines.push(`- **${item.key}** ${item.summary} _(${item.status})_`);
    }
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`Total: ${totalCount} issues`);

  return lines.join("\n");
}

function sprintByPersonToTerminal(overview: SprintOverview): string {
  const lines: string[] = [];
  const dates = formatDates(overview.startDate, overview.endDate);
  lines.push(
    pc.bold(pc.cyan(overview.sprintName)) + (dates ? pc.dim(` | ${dates}`) : "")
  );
  lines.push("");

  const people = groupByPerson(overview);
  let totalCount = 0;

  for (const person of people) {
    totalCount += person.items.length;
    lines.push(pc.bold(person.name) + pc.dim(` (${person.items.length})`));
    for (const item of person.items) {
      lines.push(
        `  ${pc.cyan(item.key)} ${item.summary} ${pc.dim(`(${item.status})`)}`
      );
    }
    lines.push("");
  }

  lines.push(pc.dim(`Total: ${totalCount} issues`));

  return lines.join("\n");
}

export async function runSprint(opts: { pipe: boolean; byPerson: boolean }): Promise<void> {
  if (opts.pipe) {
    const overview = await fetchSprintOverview();
    process.stdout.write(
      opts.byPerson ? sprintByPersonToMarkdown(overview) : sprintToMarkdown(overview)
    );
    return;
  }

  const s = p.spinner();
  s.start("Fetching sprint overview...");
  const overview = await fetchSprintOverview();
  s.stop(`${overview.sprintName}`);
  console.log();
  console.log(
    opts.byPerson ? sprintByPersonToTerminal(overview) : sprintToTerminal(overview)
  );
}

import * as p from "@clack/prompts";
import pc from "picocolors";
import { config } from "./config.js";
import {
  searchIssues,
  getActiveSprint,
  type JiraIssue,
} from "./jira-client.js";
import { writeFileSync, readFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

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

  // If fewer than 30% of issues matched a role, component grouping isn't useful
  if (issues.length > 0 && matched / issues.length < 0.3) return null;
  return grouped;
}

function buildDetailedTemplate(
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
        .map((i) => `- **${i.key}** ${i.summary} (${i.status})`)
        .join("\n");
      return `### ${name}\n${list}`;
    })
    .join("\n\n");

  return `# ${project} Sprint Roundup \u2014 ${sprintName}
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
          .map((i) => `- **${i.key}** ${i.summary} \u2014 _${i.assignee}_`)
          .join("\n");
        return `## ${role}\n${list}`;
      })
      .join("\n\n");
  } else {
    const byAssignee = groupByAssignee(issues);
    prioritiesSection = Object.entries(byAssignee)
      .map(([name, items]) => {
        const list = items
          .map((i) => `- **${i.key}** ${i.summary} (${i.status})`)
          .join("\n");
        return `## ${name}\n${list}`;
      })
      .join("\n\n");
  }

  return `# ${project} Sprint Priorities \u2014 ${sprintName}
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
    ? buildConciseTemplate(
        sprintName,
        sprint?.startDate,
        sprint?.endDate,
        result.issues
      )
    : buildDetailedTemplate(
        sprintName,
        sprint?.startDate,
        sprint?.endDate,
        result.issues
      );

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
        const clipArgs =
          process.platform === "darwin" ? [] : ["-selection", "clipboard"];
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

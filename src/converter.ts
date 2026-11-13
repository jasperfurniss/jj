import type {
  JiraIssue,
  JiraAttachment,
  JiraComment,
  JiraIssueLink,
} from "./jira-client.js";

/**
 * Convert Atlassian Document Format (ADF) to Markdown.
 * Jira Cloud API v3 returns descriptions in ADF JSON.
 */
export function adfToMarkdown(node: any, depth = 0, listIndex?: number): string {
  if (!node) return "";
  if (typeof node === "string") return node;

  // Text node
  if (node.type === "text") {
    let text = node.text || "";
    if (node.marks) {
      for (const mark of node.marks) {
        switch (mark.type) {
          case "strong":
            text = `**${text}**`;
            break;
          case "em":
            text = `*${text}*`;
            break;
          case "code":
            text = `\`${text}\``;
            break;
          case "strike":
            text = `~~${text}~~`;
            break;
          case "link":
            text = `[${text}](${mark.attrs?.href || ""})`;
            break;
        }
      }
    }
    return text;
  }

  const children = (node.content || [])
    .map((child: any) => adfToMarkdown(child, depth))
    .join("");

  switch (node.type) {
    case "doc":
      return children;
    case "paragraph":
      return `${children}\n\n`;
    case "heading": {
      const level = node.attrs?.level || 1;
      return `${"#".repeat(level)} ${children}\n\n`;
    }
    case "bulletList":
      return (
        (node.content || [])
          .map((item: any) => adfToMarkdown(item, depth))
          .join("") + "\n"
      );
    case "orderedList":
      return (
        (node.content || [])
          .map((item: any, i: number) => adfToMarkdown(item, depth, i + 1))
          .join("") + "\n"
      );
    case "listItem": {
      const indent = "  ".repeat(depth);
      const prefix =
        typeof listIndex === "number" ? `${listIndex}. ` : "- ";
      const content = (node.content || [])
        .map((child: any) => adfToMarkdown(child, depth + 1))
        .join("")
        .trim();
      return `${indent}${prefix}${content}\n`;
    }
    case "codeBlock": {
      const lang = node.attrs?.language || "";
      // Jira stores code without a trailing newline; the closing fence needs its own line.
      const code = children.endsWith("\n") ? children : `${children}\n`;
      return `\`\`\`${lang}\n${code}\`\`\`\n\n`;
    }
    case "blockquote":
      return (
        children
          .trimEnd()
          .split("\n")
          .map((line: string) => `> ${line}`)
          .join("\n") + "\n\n"
      );
    case "rule":
      return "---\n\n";
    case "table":
      return convertTable(node);
    case "mediaSingle":
    case "mediaGroup":
      return children;
    case "media": {
      const alt = node.attrs?.alt || "attachment";
      const filename = node.attrs?.alt || node.attrs?.id || "image";
      return `![${alt}](./attachments/${filename})\n\n`;
    }
    case "inlineCard":
    case "blockCard": {
      const url = node.attrs?.url || "";
      return `[${url}](${url})`;
    }
    case "emoji":
      return node.attrs?.shortName || "";
    case "mention":
      return `@${node.attrs?.text || "user"}`;
    case "hardBreak":
      return "\n";
    default:
      return children;
  }
}

function convertTable(node: any): string {
  if (!node.content?.length) return "";

  const rows: string[][] = [];
  let isHeader = false;

  for (const row of node.content) {
    const cells: string[] = [];
    for (const cell of row.content || []) {
      if (cell.type === "tableHeader") isHeader = true;
      const text = (cell.content || [])
        .map((c: any) => adfToMarkdown(c))
        .join("")
        .trim();
      cells.push(text);
    }
    rows.push(cells);
  }

  if (!rows.length) return "";

  const colCount = Math.max(...rows.map((r) => r.length));
  let md = "";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    while (row.length < colCount) row.push("");
    md += `| ${row.join(" | ")} |\n`;
    if (i === 0) {
      md += `| ${Array(colCount).fill("---").join(" | ")} |\n`;
    }
  }

  return md + "\n";
}

function formatComment(comment: JiraComment): string {
  const date = new Date(comment.created).toLocaleDateString();
  const body = adfToMarkdown(comment.body).trim();
  return `**${comment.author.displayName}** (${date}):\n${body}`;
}

export interface IssueLinkSummary {
  id: string;
  /** Reads from this issue's side, for example "blocks" or "is blocked by" */
  relation: string;
  key: string;
  summary: string;
  status: string;
}

export function describeLinks(links: JiraIssueLink[] = []): IssueLinkSummary[] {
  return links.flatMap((link) => {
    const other = link.outwardIssue ?? link.inwardIssue;
    if (!other) return [];
    return [
      {
        id: link.id,
        relation: link.outwardIssue ? link.type.outward : link.type.inward,
        key: other.key,
        summary: other.fields.summary,
        status: other.fields.status?.name ?? "",
      },
    ];
  });
}

export interface ConvertOptions {
  /** Map of attachment filename → local file path */
  imagePaths?: Map<string, string>;
  /** Include comments section */
  includeComments?: boolean;
  /** Include metadata table */
  includeMetadata?: boolean;
}

export function issueToMarkdown(
  issue: JiraIssue,
  options: ConvertOptions = {}
): string {
  const {
    imagePaths = new Map(),
    includeComments = true,
    includeMetadata = true,
  } = options;
  const f = issue.fields;
  const lines: string[] = [];

  // Title
  lines.push(`# ${issue.key}: ${f.summary}\n`);

  // Metadata table
  if (includeMetadata) {
    lines.push("| Field | Value |");
    lines.push("|-------|-------|");
    lines.push(`| **Type** | ${f.issuetype?.name || "—"} |`);
    lines.push(`| **Status** | ${f.status?.name || "—"} |`);
    lines.push(`| **Priority** | ${f.priority?.name || "—"} |`);
    lines.push(
      `| **Assignee** | ${f.assignee?.displayName || "Unassigned"} |`
    );
    lines.push(`| **Reporter** | ${f.reporter?.displayName || "—"} |`);
    if (f.parent) {
      lines.push(
        `| **Parent** | ${f.parent.key}: ${f.parent.fields.summary} |`
      );
    }
    if (f.sprint) {
      const sprintName =
        typeof f.sprint === "string"
          ? f.sprint
          : (f.sprint as { name?: string })?.name || "—";
      lines.push(`| **Sprint** | ${sprintName} |`);
    }
    if (f.labels?.length) {
      lines.push(`| **Labels** | ${f.labels.join(", ")} |`);
    }
    if (f.components?.length) {
      lines.push(
        `| **Components** | ${f.components.map((c) => c.name).join(", ")} |`
      );
    }
    lines.push("");
  }

  // Description
  if (f.description) {
    lines.push("## Description\n");
    let desc = adfToMarkdown(f.description);

    // Replace inline image references with local paths
    for (const [filename, localPath] of imagePaths) {
      desc = desc.replace(
        new RegExp(`\\./attachments/${escapeRegex(filename)}`, "g"),
        localPath
      );
    }

    lines.push(desc);
  }

  // Links and subtasks
  const links = describeLinks(f.issuelinks);
  if (links.length) {
    lines.push("## Links\n");
    for (const link of links) {
      lines.push(`- ${link.relation} ${link.key}: ${link.summary} (${link.status})`);
    }
    lines.push("");
  }

  const subtasks = f.subtasks || [];
  if (subtasks.length) {
    lines.push("## Subtasks\n");
    for (const task of subtasks) {
      lines.push(`- ${task.key}: ${task.fields.summary} (${task.fields.status?.name ?? ""})`);
    }
    lines.push("");
  }

  // Attachments list
  const attachments = f.attachment || [];
  if (attachments.length) {
    lines.push("## Attachments\n");
    for (const att of attachments) {
      const localPath = imagePaths.get(att.filename);
      if (att.mimeType.startsWith("image/")) {
        lines.push(
          `![${att.filename}](${localPath || `./attachments/${att.filename}`})\n`
        );
      } else {
        // Use Jira download URL for non-image attachments (we don't download them)
        const href = att.content || `./attachments/${att.filename}`;
        lines.push(`- [${att.filename}](${href})`);
      }
    }
    lines.push("");
  }

  // Comments
  const comments = f.comment?.comments || [];
  if (includeComments && comments.length) {
    lines.push("## Comments\n");
    for (const comment of comments) {
      lines.push(formatComment(comment));
      lines.push("");
    }
  }

  return lines.join("\n");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
 * A plain JSON view of an issue for scripts and agents. Rich text
 * (description and comments) comes back as Markdown.
 */
export function issueToJson(issue: JiraIssue, baseUrl?: string) {
  const f = issue.fields;

  return {
    key: issue.key,
    url: baseUrl ? `${baseUrl}/browse/${issue.key}` : null,
    summary: f.summary,
    type: f.issuetype?.name ?? null,
    status: f.status?.name ?? null,
    priority: f.priority?.name ?? null,
    assignee: f.assignee?.displayName ?? null,
    reporter: f.reporter?.displayName ?? null,
    parent: f.parent ? { key: f.parent.key, summary: f.parent.fields.summary } : null,
    labels: f.labels ?? [],
    components: (f.components ?? []).map((c) => c.name),
    created: f.created ?? null,
    updated: f.updated ?? null,
    description: f.description ? adfToMarkdown(f.description).trim() : "",
    links: describeLinks(f.issuelinks),
    subtasks: (f.subtasks ?? []).map((task) => ({
      key: task.key,
      summary: task.fields.summary,
      status: task.fields.status?.name ?? "",
    })),
    comments: (f.comment?.comments ?? []).map((c) => ({
      author: c.author.displayName,
      created: c.created,
      body: adfToMarkdown(c.body).trim(),
    })),
  };
}

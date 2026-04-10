import { config } from "./config.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";

interface JiraField {
  summary: string;
  status: { name: string };
  priority: { name: string };
  assignee: { displayName: string; emailAddress: string } | null;
  reporter: { displayName: string } | null;
  issuetype: { name: string };
  parent?: { key: string; fields: { summary: string } };
  sprint?: { name: string } | null;
  description: any; // ADF (Atlassian Document Format) or string
  attachment?: JiraAttachment[];
  comment?: { comments: JiraComment[] };
  labels?: string[];
  components?: { name: string }[];
  [key: string]: any;
}

export interface JiraAttachment {
  id: string;
  filename: string;
  mimeType: string;
  content: string; // download URL
  thumbnail?: string;
}

export interface JiraComment {
  author: { displayName: string };
  body: any;
  created: string;
  updated: string;
}

export interface JiraIssue {
  key: string;
  fields: JiraField;
}

export interface JiraSearchResult {
  issues: JiraIssue[];
  /** Present in deprecated /search; new /search/jql uses isLast/nextPageToken */
  total?: number;
  isLast?: boolean;
  nextPageToken?: string;
}

export interface JiraTransition {
  id: string;
  name: string;
}

export interface JiraTransitionsResult {
  transitions: JiraTransition[];
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
}

export interface JiraSprintResult {
  values: JiraSprint[];
}

function authHeader(): string {
  const encoded = Buffer.from(
    `${config.jira.email}:${config.jira.apiToken}`
  ).toString("base64");
  return `Basic ${encoded}`;
}

async function jiraFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${config.jira.baseUrl}/rest/api/3${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira API error ${res.status}: ${body}`);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export async function searchIssues(
  jql?: string,
  maxResults = 50
): Promise<JiraSearchResult> {
  const query = jql || config.jira.defaultJql;
  return jiraFetch<JiraSearchResult>(
    `/search/jql?jql=${encodeURIComponent(query)}&maxResults=${maxResults}&fields=summary,status,priority,assignee,reporter,issuetype,parent,sprint,description,attachment,comment,labels,components`
  );
}

export async function searchAllSprintIssues(
  maxResults = 200
): Promise<JiraSearchResult> {
  const jql = `project = ${config.jira.project} AND sprint in openSprints() ORDER BY rank ASC`;
  return searchIssues(jql, maxResults);
}

export async function getIssue(key: string): Promise<JiraIssue> {
  return jiraFetch<JiraIssue>(
    `/issue/${key}?fields=summary,status,priority,assignee,reporter,issuetype,parent,sprint,description,attachment,comment,labels,components`
  );
}

export async function downloadAttachment(
  attachment: JiraAttachment,
  outputDir: string
): Promise<string> {
  const dir = resolve(outputDir, "attachments");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const res = await fetch(attachment.content, {
    headers: { Authorization: authHeader() },
  });

  if (!res.ok) throw new Error(`Failed to download ${attachment.filename}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const filePath = join(dir, attachment.filename);
  writeFileSync(filePath, buffer);

  return filePath;
}

export async function downloadAllAttachments(
  attachments: JiraAttachment[],
  outputDir: string
): Promise<Map<string, string>> {
  const pathMap = new Map<string, string>();

  const imageAttachments = attachments.filter((a) =>
    a.mimeType.startsWith("image/")
  );

  await Promise.all(
    imageAttachments.map(async (att) => {
      try {
        const localPath = await downloadAttachment(att, outputDir);
        pathMap.set(att.filename, localPath);
      } catch (e) {
        console.error(`Failed to download ${att.filename}:`, e);
      }
    })
  );

  return pathMap;
}

export async function getTransitions(issueKey: string): Promise<JiraTransition[]> {
  const result = await jiraFetch<JiraTransitionsResult>(
    `/issue/${issueKey}/transitions`
  );
  return result.transitions;
}

export async function transitionIssue(
  issueKey: string,
  transitionId: string
): Promise<void> {
  await jiraFetch<void>(`/issue/${issueKey}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: transitionId } }),
  });
}

async function jiraAgileFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${config.jira.baseUrl}/rest/agile/1.0${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira Agile API error ${res.status}: ${body}`);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export async function getActiveSprint(boardId: number): Promise<JiraSprint | null> {
  const result = await jiraAgileFetch<JiraSprintResult>(
    `/board/${boardId}/sprint?state=active`
  );
  return result.values[0] ?? null;
}

export interface CreateIssueParams {
  summary: string;
  description: string;
  descriptionAdf?: any;
  issueType?: string;
  parentKey?: string;
  labels?: string[];
  components?: string[];
}

export async function createIssue(params: CreateIssueParams): Promise<JiraIssue> {
  const { summary, description, issueType = "Task", parentKey } = params;

  const adf = params.descriptionAdf ?? {
    type: "doc",
    version: 1,
    content: description.split("\n\n").map((block) => ({
      type: "paragraph",
      content: block.split("\n").flatMap((line, i, arr) => {
        const nodes: any[] = [{ type: "text", text: line }];
        if (i < arr.length - 1) nodes.push({ type: "hardBreak" });
        return nodes;
      }),
    })),
  };

  const fields: Record<string, any> = {
    project: { key: config.jira.project },
    summary,
    description: adf,
    issuetype: { name: issueType },
  };

  if (parentKey) {
    fields.parent = { key: parentKey };
  }

  if (params.labels?.length) {
    fields.labels = params.labels;
  }

  if (params.components?.length) {
    fields.components = params.components.map((name) => ({ name }));
  }

  return jiraFetch<JiraIssue>("/issue", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
}

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

export async function searchByAssignee(
  name: string,
  maxResults = 20
): Promise<JiraSearchResult> {
  // Search all sprint issues and filter by displayName match
  const jql = `project = ${config.jira.project} AND sprint in openSprints() AND assignee != EMPTY ORDER BY rank ASC`;
  const all = await searchIssues(jql, 200);

  const filtered = all.issues.filter((issue) =>
    issue.fields.assignee?.displayName?.toLowerCase().includes(name.toLowerCase())
  );

  return { issues: filtered };
}

export async function addComment(
  issueKey: string,
  text: string
): Promise<void> {
  await jiraFetch<void>(`/issue/${issueKey}/comment`, {
    method: "POST",
    body: JSON.stringify({
      body: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text }],
          },
        ],
      },
    }),
  });
}

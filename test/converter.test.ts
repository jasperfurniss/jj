import { describe, it, expect } from "vitest";
import { issueToMarkdown, issueToJson, describeLinks } from "../src/converter.js";
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
    expect(md).toContain("```ts\nconst x = 1;\n```");
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

const BLOCKS = { id: "1", name: "Blocks", inward: "is blocked by", outward: "blocks" };
const linked = (key: string, summary: string, status: string) => ({
  key,
  fields: { summary, status: { name: status } },
});

describe("describeLinks", () => {
  it("reads each link from this issue's side", () => {
    expect(
      describeLinks([
        { id: "10", type: BLOCKS, outwardIssue: linked("WEB-2", "Later", "Backlog") },
        { id: "11", type: BLOCKS, inwardIssue: linked("WEB-3", "Earlier", "Done") },
      ])
    ).toEqual([
      { id: "10", relation: "blocks", key: "WEB-2", summary: "Later", status: "Backlog" },
      { id: "11", relation: "is blocked by", key: "WEB-3", summary: "Earlier", status: "Done" },
    ]);
  });
});

describe("issueToMarkdown links and subtasks", () => {
  it("lists links and subtasks", () => {
    const md = issueToMarkdown(
      makeIssue({
        issuelinks: [{ id: "10", type: BLOCKS, outwardIssue: linked("WEB-2", "Later", "Backlog") }],
        subtasks: [linked("WEB-4", "Sub", "To Do")],
      })
    );
    expect(md).toContain("## Links\n\n- blocks WEB-2: Later (Backlog)");
    expect(md).toContain("## Subtasks\n\n- WEB-4: Sub (To Do)");
  });
});

describe("issueToJson", () => {
  it("returns plain fields with Markdown rich text", () => {
    const json = issueToJson(
      makeIssue({
        description: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
        },
        issuelinks: [{ id: "11", type: BLOCKS, inwardIssue: linked("WEB-3", "Earlier", "Done") }],
      }),
      "https://jira.test"
    );

    expect(json).toMatchObject({
      url: `https://jira.test/browse/${json.key}`,
      description: "Hello",
      links: [{ id: "11", relation: "is blocked by", key: "WEB-3", summary: "Earlier", status: "Done" }],
      subtasks: [],
    });
  });
});

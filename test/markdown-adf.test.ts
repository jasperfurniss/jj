import { describe, it, expect } from "vitest";
import { markdownToAdf, parseInline } from "../src/markdown-adf.js";
import { adfToMarkdown } from "../src/converter.js";

const text = (value: string, marks?: any[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

describe("parseInline", () => {
  it("leaves plain text alone", () => {
    expect(parseInline("hello world")).toEqual([text("hello world")]);
  });

  it("marks bold, italic, strike, and code", () => {
    expect(parseInline("a **b** *c* ~~d~~ `e`")).toEqual([
      text("a "),
      text("b", [{ type: "strong" }]),
      text(" "),
      text("c", [{ type: "em" }]),
      text(" "),
      text("d", [{ type: "strike" }]),
      text(" "),
      text("e", [{ type: "code" }]),
    ]);
  });

  it("turns Markdown links and bare URLs into link marks", () => {
    expect(parseInline("[PR](https://x.test/1) and https://x.test/2.")).toEqual([
      text("PR", [{ type: "link", attrs: { href: "https://x.test/1" } }]),
      text(" and "),
      text("https://x.test/2", [{ type: "link", attrs: { href: "https://x.test/2" } }]),
      text("."),
    ]);
  });

  it("nests marks", () => {
    expect(parseInline("**see [docs](https://x.test)**")).toEqual([
      text("see ", [{ type: "strong" }]),
      text("docs", [{ type: "strong" }, { type: "link", attrs: { href: "https://x.test" } }]),
    ]);
  });

  it("keeps code contents literal", () => {
    expect(parseInline("`**not bold**`")).toEqual([text("**not bold**", [{ type: "code" }])]);
  });

  it("does not treat underscores inside words as italic", () => {
    expect(parseInline("snake_case_name")).toEqual([text("snake_case_name")]);
  });
});

describe("markdownToAdf", () => {
  it("splits paragraphs on blank lines and keeps single line breaks", () => {
    expect(markdownToAdf("one\ntwo\n\nthree").content).toEqual([
      { type: "paragraph", content: [text("one"), { type: "hardBreak" }, text("two")] },
      { type: "paragraph", content: [text("three")] },
    ]);
  });

  it("builds headings, rules, quotes, and code blocks", () => {
    const doc = markdownToAdf("## Title\n\n---\n\n> quoted\n\n```ts\nconst a = 1;\n```");
    expect(doc.content.map((n: any) => n.type)).toEqual([
      "heading",
      "rule",
      "blockquote",
      "codeBlock",
    ]);
    expect(doc.content[0].attrs).toEqual({ level: 2 });
    expect(doc.content[3]).toEqual({
      type: "codeBlock",
      attrs: { language: "ts" },
      content: [text("const a = 1;")],
    });
  });

  it("builds nested bullet and ordered lists", () => {
    const doc = markdownToAdf("- one\n  1. inner\n- two");
    const list = doc.content[0];
    expect(list.type).toBe("bulletList");
    expect(list.content).toHaveLength(2);
    expect(list.content[0].content[1].type).toBe("orderedList");
    expect(list.content[0].content[1].content[0].content[0].content).toEqual([text("inner")]);
  });

  it("starts a new list when the marker type changes", () => {
    const doc = markdownToAdf("- a\n- b\n1. c");
    expect(doc.content.map((n: any) => n.type)).toEqual(["bulletList", "orderedList"]);
  });

  it("builds a table with a header row", () => {
    const doc = markdownToAdf("| A | B |\n| --- | --- |\n| 1 | 2 |");
    const [header, row] = doc.content[0].content;
    expect(header.content.map((c: any) => c.type)).toEqual(["tableHeader", "tableHeader"]);
    expect(row.content[1].content[0].content).toEqual([text("2")]);
  });

  it("produces no empty text nodes", () => {
    const json = JSON.stringify(markdownToAdf("**a**\n\n- \n\n```\n```"));
    expect(json).not.toContain('"text":""');
  });

  it.each([
    "Plain paragraph with **bold**, *italic*, and `code`.",
    "## Heading\n\nBody text",
    "- one\n- two",
    "1. first\n2. second",
    "```js\nconst a = 1;\n```",
    "See [WEB-1](https://x.test/WEB-1).",
    "> quoted text",
    "| A | B |\n| --- | --- |\n| 1 | 2 |",
  ])("round-trips through adfToMarkdown: %s", (markdown) => {
    expect(adfToMarkdown(markdownToAdf(markdown)).trim()).toBe(markdown);
  });
});

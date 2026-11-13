/**
 * Convert Markdown to Atlassian Document Format (ADF), the JSON format Jira
 * Cloud API v3 expects for descriptions and comments. Supports the same set
 * `adfToMarkdown` reads: headings, paragraphs, bullet and ordered lists
 * (nested by indentation), fenced code blocks, blockquotes, rules, tables, and
 * bold, italic, strike, inline code, and links (including bare URLs).
 *
 * Single line breaks inside a paragraph are kept as hard breaks, so text
 * written line by line reads the same in Jira.
 */

type AdfNode = { type: string; [key: string]: any };
type Mark = { type: string; attrs?: Record<string, string> };

export function markdownToAdf(markdown: string): AdfNode {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  return { type: "doc", version: 1, content: parseBlocks(lines) };
}

const FENCE = /^\s*```\s*([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function parseBlocks(lines: string[]): AdfNode[] {
  const blocks: AdfNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++]);
      i++; // closing fence
      const text = code.join("\n");
      blocks.push({
        type: "codeBlock",
        ...(fence[1] ? { attrs: { language: fence[1] } } : {}),
        content: text ? [{ type: "text", text }] : [],
      });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: parseInline(heading[2]),
      });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(lines[i].match(QUOTE)![1]);
        i++;
      }
      blocks.push({ type: "blockquote", content: parseBlocks(quoted) });
      continue;
    }

    if (TABLE_ROW.test(line) && TABLE_DIVIDER.test(lines[i + 1] ?? "")) {
      const rows: string[] = [line];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(lines[i++]);
      blocks.push(buildTable(rows));
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const listLines: string[] = [];
      while (
        i < lines.length &&
        (LIST_ITEM.test(lines[i]) || (lines[i].trim() && /^\s+/.test(lines[i])))
      ) {
        listLines.push(lines[i++]);
      }
      blocks.push(...buildLists(listLines));
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) {
      paragraph.push(lines[i++].trim());
    }
    blocks.push({ type: "paragraph", content: withHardBreaks(paragraph) });
  }

  return blocks;
}

function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i];
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    LIST_ITEM.test(line) ||
    (TABLE_ROW.test(line) && TABLE_DIVIDER.test(lines[i + 1] ?? ""))
  );
}

function withHardBreaks(lines: string[]): AdfNode[] {
  return lines.flatMap((line, index) => [
    ...(index > 0 ? [{ type: "hardBreak" }] : []),
    ...parseInline(line),
  ]);
}

interface ListEntry {
  indent: number;
  ordered: boolean;
  text: string[];
}

/**
 * Builds nested lists from list lines. An item indented deeper than the one
 * before it starts a nested list; an unmarked indented line continues the
 * previous item.
 */
function buildLists(lines: string[]): AdfNode[] {
  const entries: ListEntry[] = [];

  for (const line of lines) {
    const match = line.match(LIST_ITEM);
    if (match) {
      entries.push({
        indent: match[1].length,
        ordered: /\d/.test(match[2]),
        text: [match[3]],
      });
    } else if (entries.length) {
      entries[entries.length - 1].text.push(line.trim());
    }
  }

  let index = 0;

  function buildLevel(indent: number): AdfNode[] {
    const lists: AdfNode[] = [];

    while (index < entries.length && entries[index].indent >= indent) {
      const ordered = entries[index].ordered;
      const items: AdfNode[] = [];

      while (
        index < entries.length &&
        entries[index].indent === indent &&
        entries[index].ordered === ordered
      ) {
        const entry = entries[index++];
        const content: AdfNode[] = [
          { type: "paragraph", content: withHardBreaks(entry.text) },
        ];

        if (index < entries.length && entries[index].indent > indent) {
          content.push(...buildLevel(entries[index].indent));
        }

        items.push({ type: "listItem", content });
      }

      if (!items.length) break;

      lists.push({
        type: ordered ? "orderedList" : "bulletList",
        ...(ordered ? { attrs: { order: 1 } } : {}),
        content: items,
      });
    }

    return lists;
  }

  const result: AdfNode[] = [];
  while (index < entries.length) {
    const before = index;
    result.push(...buildLevel(entries[index].indent));
    if (index === before) index++;
  }
  return result;
}

function splitRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function buildTable(rows: string[]): AdfNode {
  return {
    type: "table",
    content: rows.map((row, rowIndex) => ({
      type: "tableRow",
      content: splitRow(row).map((cell) => ({
        type: rowIndex === 0 ? "tableHeader" : "tableCell",
        content: [{ type: "paragraph", content: parseInline(cell) }],
      })),
    })),
  };
}

const INLINE =
  /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|(?<![\w*])\*(?![\s*])(.+?)(?<![\s*])\*(?![\w*])|(?<![\w_])_(?![\s_])(.+?)(?<![\s_])_(?![\w_])|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/;

/**
 * Parses inline Markdown into text nodes with marks. Marks nest (a link
 * inside bold keeps both), except inline code, which ADF only allows on its
 * own.
 */
export function parseInline(text: string, marks: Mark[] = []): AdfNode[] {
  const nodes: AdfNode[] = [];
  let rest = text;

  const pushText = (value: string, nodeMarks: Mark[]) => {
    if (!value) return;
    nodes.push({
      type: "text",
      text: value,
      ...(nodeMarks.length ? { marks: nodeMarks } : {}),
    });
  };

  while (rest) {
    const match = rest.match(INLINE);

    if (!match || match.index === undefined) {
      pushText(rest, marks);
      break;
    }

    pushText(rest.slice(0, match.index), marks);

    const [whole, code, linkText, href, bold, boldAlt, strike, italic, italicAlt, url] = match;

    if (code !== undefined) {
      pushText(code, [{ type: "code" }]);
    } else if (linkText !== undefined) {
      nodes.push(...parseInline(linkText, [...marks, { type: "link", attrs: { href } }]));
    } else if (bold !== undefined || boldAlt !== undefined) {
      nodes.push(...parseInline(bold ?? boldAlt, [...marks, { type: "strong" }]));
    } else if (strike !== undefined) {
      nodes.push(...parseInline(strike, [...marks, { type: "strike" }]));
    } else if (italic !== undefined || italicAlt !== undefined) {
      nodes.push(...parseInline(italic ?? italicAlt, [...marks, { type: "em" }]));
    } else if (url !== undefined) {
      pushText(url, [...marks, { type: "link", attrs: { href: url } }]);
    }

    rest = rest.slice(match.index + whole.length);
  }

  return nodes;
}

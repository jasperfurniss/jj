import pc from "picocolors";
import type { JiraIssue } from "./jira-client.js";
import { config } from "./config.js";

export type Column = string;

export const COLUMNS: readonly string[] = config.board.columns;

export const STATUS_MAP: Record<string, string> = config.board.statusMap;

export function mapStatus(statusName: string): string {
  return STATUS_MAP[statusName.toLowerCase()] ?? COLUMNS[0];
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "\u2026" : str;
}

function wrapWords(str: string, max: number): string[] {
  const words = str.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if ((current + (current ? " " : "") + word).length > max) {
      if (current) lines.push(current);
      current = truncate(word, max);
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface Card {
  key: string;
  summary: string;
}

export function renderBoard(issues: JiraIssue[], sprintName: string): string {
  const termWidth = process.stdout.columns ?? 100;
  const colCount = COLUMNS.length;
  const totalBorderWidth = colCount + 1 + colCount * 2;
  const colWidth = Math.max(12, Math.floor((termWidth - totalBorderWidth) / colCount));
  const innerWidth = (colWidth + 2) * colCount + (colCount - 1);

  const grouped: Record<string, Card[]> = {};
  for (const col of COLUMNS) {
    grouped[col] = [];
  }

  for (const issue of issues) {
    const col = mapStatus(issue.fields.status.name);
    if (grouped[col]) {
      grouped[col].push({ key: issue.key, summary: issue.fields.summary });
    }
  }

  // Trim last column (typically Done) to last 5
  const lastCol = COLUMNS[COLUMNS.length - 1];
  if (grouped[lastCol].length > 5) {
    grouped[lastCol] = grouped[lastCol].slice(-5);
  }

  const lines: string[] = [];

  const title = truncate(sprintName, innerWidth - 2);
  const titlePadded = title.padStart(Math.floor((innerWidth + title.length) / 2)).padEnd(innerWidth);
  lines.push(pc.bold("\u2554" + "\u2550".repeat(innerWidth) + "\u2557"));
  lines.push(pc.bold("\u2551") + pc.bold(pc.cyan(titlePadded)) + pc.bold("\u2551"));

  const headerDivider =
    "\u2560" + COLUMNS.map(() => "\u2550".repeat(colWidth + 2)).join("\u2566") + "\u2563";
  lines.push(pc.bold(headerDivider));

  const headerRow =
    "\u2551" +
    COLUMNS.map((col) => " " + pc.bold(col.padEnd(colWidth)) + " ").join("\u2551") +
    "\u2551";
  lines.push(headerRow);

  const subDivider =
    "\u2560" + COLUMNS.map(() => "\u2550".repeat(colWidth + 2)).join("\u256C") + "\u2563";
  lines.push(pc.bold(subDivider));

  const cardLines: string[][] = COLUMNS.map((col) => {
    const colLines: string[] = [];
    for (const card of grouped[col]) {
      const keyLine = " " + pc.cyan(card.key.padEnd(colWidth)) + " ";
      colLines.push(keyLine);
      const wrapped = wrapWords(card.summary, colWidth);
      for (const wl of wrapped) {
        colLines.push(" " + pc.dim(wl.padEnd(colWidth)) + " ");
      }
      colLines.push(" " + " ".repeat(colWidth) + " ");
    }
    return colLines;
  });

  const maxRows = Math.max(...cardLines.map((c) => c.length), 1);

  for (let i = 0; i < maxRows; i++) {
    const row =
      "\u2551" +
      COLUMNS.map((_, ci) => cardLines[ci][i] ?? " " + " ".repeat(colWidth) + " ").join("\u2551") +
      "\u2551";
    lines.push(row);
  }

  const bottomBorder =
    "\u255A" + COLUMNS.map(() => "\u2550".repeat(colWidth + 2)).join("\u2569") + "\u255D";
  lines.push(pc.bold(bottomBorder));

  return lines.join("\n");
}

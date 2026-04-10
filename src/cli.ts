#!/usr/bin/env node
import * as p from "@clack/prompts";
import pc from "picocolors";
import { config, validateConfig } from "./config.js";
import {
  searchIssues,
  getIssue,
  downloadAllAttachments,
  getTransitions,
  transitionIssue,
  getActiveSprint,
  addComment,
  createIssue,
  searchIssuesByText,
  searchByAssignee,
} from "./jira-client.js";
import { issueToMarkdown } from "./converter.js";
import { runSprint } from "./sprint.js";
import { runSummary } from "./summary.js";
import { startBoard } from "./board-ui.js";
import { writeFileSync, mkdtempSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { tmpdir } from "os";

function printBanner() {
  const cwd = process.cwd().replace(process.env.HOME || "", "~");
  const b = (s: string) => pc.blue(s);
  console.log(b("     ██╗      ██╗"));
  console.log(b("     ██║      ██║") + "   " + pc.dim("your helpful jira buddy"));
  console.log(b("     ██║      ██║"));
  console.log(b("██   ██║ ██   ██║") + "   " + pc.dim(cwd));
  console.log(b("╚█████╔╝ ╚█████╔╝"));
  console.log(b(" ╚════╝   ╚════╝"));
  console.log();
}

async function listAndSelect(jql?: string) {
  const s = p.spinner();
  s.start("Fetching stories from Jira...");

  try {
    const result = await searchIssues(jql);
    s.stop(`Found ${result.issues.length} issues`);

    if (!result.issues.length) {
      p.log.warn("No issues found for the given query.");
      return null;
    }

    const selected = await p.select({
      message: "Select a story to convert:",
      options: result.issues.map((issue) => ({
        value: issue.key,
        label: `${pc.cyan(issue.key)} ${issue.fields.summary}`,
        hint: `${issue.fields.status.name} · ${issue.fields.assignee?.displayName || "Unassigned"}`,
      })),
    });

    if (p.isCancel(selected)) {
      p.cancel("Cancelled.");
      return null;
    }

    return selected as string;
  } catch (e: any) {
    s.stop("Failed");
    p.log.error(e.message);
    return null;
  }
}

async function fetchAndConvert(issueKey: string) {
  const s = p.spinner();
  s.start(`Fetching ${issueKey}...`);

  try {
    const issue = await getIssue(issueKey);
    s.stop(`Loaded ${issueKey}`);

    // Download images
    const attachments = issue.fields.attachment || [];
    const imageAttachments = attachments.filter((a) =>
      a.mimeType.startsWith("image/")
    );

    let imagePaths = new Map<string, string>();
    if (imageAttachments.length) {
      const s2 = p.spinner();
      s2.start(`Downloading ${imageAttachments.length} image(s)...`);
      const outDir = resolve(config.outputDir, issueKey);
      imagePaths = await downloadAllAttachments(imageAttachments, outDir);
      s2.stop(`Downloaded ${imagePaths.size} image(s)`);
    }

    // Convert to markdown
    const md = issueToMarkdown(issue, { imagePaths });

    return { md, issue, imagePaths };
  } catch (e: any) {
    s.stop("Failed");
    p.log.error(e.message);
    return null;
  }
}

async function pipeMode(issueKey: string) {
  validateConfig();

  const issue = await getIssue(issueKey.toUpperCase());
  const md = issueToMarkdown(issue);
  process.stdout.write(md);
}

async function listMode(jql?: string) {
  validateConfig();

  const result = await searchIssues(jql);

  if (!result.issues.length) {
    console.error("No issues found.");
    process.exit(1);
  }

  for (const issue of result.issues) {
    const f = issue.fields;
    const status = f.status?.name || "—";
    const assignee = f.assignee?.displayName || "Unassigned";
    console.log(`${issue.key}\t${status}\t${assignee}\t${f.summary}`);
  }
}

async function readyMode(ticketNumber: string) {
  validateConfig();

  const issueKey = `${config.jira.project}-${ticketNumber}`.toUpperCase();
  const targetName = config.readyTransition;
  const s = p.spinner();
  s.start(`Moving ${issueKey} to ${targetName}...`);

  try {
    const transitions = await getTransitions(issueKey);
    const reviewTransition = transitions.find(
      (t) => t.name.toUpperCase() === targetName.toUpperCase()
    );

    if (!reviewTransition) {
      const available = transitions.map((t) => t.name).join(", ");
      s.stop("Failed");
      p.log.error(
        `No "${targetName}" transition available for ${issueKey}.\nAvailable: ${available}`
      );
      process.exit(1);
    }

    await transitionIssue(issueKey, reviewTransition.id);
    s.stop(`${issueKey} moved to ${targetName}`);
    p.log.success(pc.green(`${issueKey} is now in ${targetName}`));
  } catch (e: any) {
    s.stop("Failed");
    p.log.error(e.message);
    process.exit(1);
  }
}

async function boardMode() {
  validateConfig();

  console.log(pc.dim("  Fetching sprint board..."));

  try {
    const [sprint, result] = await Promise.all([
      getActiveSprint(config.jira.boardId),
      searchIssues(),
    ]);

    const sprintName = sprint?.name ?? "Current Sprint";
    console.log(pc.dim(`  ${result.issues.length} issues · ${sprintName}\n`));

    await startBoard(result.issues, sprintName);
  } catch (e: any) {
    p.log.error(e.message);
    process.exit(1);
  }
}

async function openMode(issueKey: string) {
  const url = `${config.jira.baseUrl}/browse/${issueKey}`;
  const { execFileSync } = await import("child_process");
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  execFileSync(cmd, [url]);
  p.log.success(`Opened ${pc.cyan(issueKey)} in browser`);
}

async function commentMode(issueKey: string, inlineMessage?: string) {
  let body: string;

  if (inlineMessage) {
    body = inlineMessage.trim();
  } else {
    const { execFileSync } = await import("child_process");

    const tmpDir = mkdtempSync(join(tmpdir(), "jj-comment-"));
    const tmpFile = join(tmpDir, "COMMENT_EDITMSG");
    writeFileSync(tmpFile, "\n# Write your comment above. Lines starting with # are ignored.\n");

    const editor = process.env.EDITOR || "nano";
    execFileSync(editor, [tmpFile], { stdio: "inherit" });

    const raw = readFileSync(tmpFile, "utf-8");
    body = raw
      .split("\n")
      .filter((line) => !line.startsWith("#"))
      .join("\n")
      .trim();
  }

  if (!body) {
    p.cancel("Empty comment, nothing posted.");
    return;
  }

  const s = p.spinner();
  s.start(`Posting comment to ${issueKey}...`);
  await addComment(issueKey, body);
  s.stop("Comment posted");
  p.log.success(pc.green(`Comment added to ${pc.cyan(issueKey)}`));
}

interface CreateOptions {
  message?: string;
  summary?: string;
  type?: string;
  parent?: string;
  pipe?: boolean;
}

async function createMode(opts: CreateOptions = {}) {
  validateConfig();

  let body: string;

  if (opts.message) {
    body = opts.message.trim();
  } else {
    // Check for piped stdin
    const isTTY = process.stdin.isTTY;
    if (!isTTY) {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      body = Buffer.concat(chunks).toString("utf-8").trim();
    } else {
      const { execFileSync } = await import("child_process");

      const tmpDir = mkdtempSync(join(tmpdir(), "jj-create-"));
      const tmpFile = join(tmpDir, "STORY_EDITMSG");
      writeFileSync(
        tmpFile,
        "\n# Paste the Slack conversation or write the story description above.\n# Lines starting with # are ignored.\n"
      );

      const editor = process.env.EDITOR || "nano";
      execFileSync(editor, [tmpFile], { stdio: "inherit" });

      const raw = readFileSync(tmpFile, "utf-8");
      body = raw
        .split("\n")
        .filter((line) => !line.startsWith("#"))
        .join("\n")
        .trim();
    }
  }

  if (!body) {
    p.cancel("Empty description, nothing created.");
    return;
  }

  // Pipe mode: all options provided via flags, no prompts
  if (opts.pipe) {
    if (!opts.summary) {
      console.error("--summary is required in pipe mode");
      process.exit(1);
    }

    const created = await createIssue({
      summary: opts.summary,
      description: body,
      issueType: opts.type || "Task",
      parentKey: opts.parent,
    });

    const url = `${config.jira.baseUrl}/browse/${created.key}`;
    console.log(`${created.key}\t${url}`);
    return;
  }

  // Interactive mode
  p.log.info(pc.dim("Description:"));
  const preview = body.split("\n").slice(0, 5).join("\n");
  console.log(pc.dim(preview + (body.split("\n").length > 5 ? "\n..." : "")));
  console.log();

  const summaryInput = opts.summary || await (async () => {
    const val = await p.text({
      message: "Story summary (title):",
      placeholder: "e.g. Replace deprecated jsx-sort-props ESLint rule",
      validate: (v) => (!v.trim() ? "Summary is required" : undefined),
    });
    if (p.isCancel(val)) { p.cancel("Cancelled."); process.exit(0); }
    return val as string;
  })();

  const issueType = opts.type || await (async () => {
    const val = await p.select({
      message: "Issue type:",
      options: [
        { value: "Task", label: "Task" },
        { value: "Bug", label: "Bug" },
        { value: "Feature", label: "Feature" },
      ],
    });
    if (p.isCancel(val)) { p.cancel("Cancelled."); process.exit(0); }
    return val as string;
  })();

  // Parent search
  let parentKey: string | undefined = opts.parent;
  if (!parentKey) {
    const wantsParent = await p.confirm({
      message: "Link to a parent (Epic/Feature)?",
      initialValue: false,
    });

    if (!p.isCancel(wantsParent) && wantsParent) {
      const searchTerm = await p.text({
        message: "Search for parent by name:",
        placeholder: "e.g. code health",
      });

      if (!p.isCancel(searchTerm) && searchTerm.trim()) {
        const s = p.spinner();
        s.start("Searching...");
        const results = await searchIssuesByText(searchTerm.trim(), ["Epic", "Feature", "Initiative"]);
        s.stop(`Found ${results.issues.length} results`);

        if (results.issues.length) {
          const selected = await p.select({
            message: "Select parent:",
            options: [
              ...results.issues.map((issue) => ({
                value: issue.key,
                label: `${pc.cyan(issue.key)} ${issue.fields.summary}`,
                hint: issue.fields.issuetype?.name,
              })),
              { value: "__none__", label: "None (skip)" },
            ],
          });

          if (!p.isCancel(selected) && selected !== "__none__") {
            parentKey = selected as string;
          }
        } else {
          p.log.warn("No matching epics/features found.");
        }
      }
    }
  }

  const s = p.spinner();
  s.start("Creating issue...");

  const created = await createIssue({
    summary: summaryInput.trim(),
    description: body,
    issueType: issueType as string,
    parentKey,
  });

  s.stop(`Created ${pc.cyan(created.key)}`);

  const url = `${config.jira.baseUrl}/browse/${created.key}`;
  p.log.success(
    `${pc.green(created.key)}: ${summaryInput.trim()}\n  ${pc.dim(url)}`
  );

  const openIt = await p.confirm({
    message: "Open in browser?",
    initialValue: true,
  });
  if (!p.isCancel(openIt) && openIt) {
    await openMode(created.key);
  }
}

interface CloneOptions {
  sourceKey: string;
  summary?: string;
  pipe?: boolean;
}

async function cloneMode(opts: CloneOptions) {
  validateConfig();

  const s = p.spinner();
  s.start(`Fetching ${opts.sourceKey}...`);

  let source: Awaited<ReturnType<typeof getIssue>>;
  try {
    source = await getIssue(opts.sourceKey);
    s.stop(`Loaded ${opts.sourceKey}: ${source.fields.summary}`);
  } catch (e: any) {
    s.stop("Failed");
    p.log.error(e.message);
    process.exit(1);
  }

  const f = source.fields;

  // In pipe mode, require --summary and skip prompts
  if (opts.pipe) {
    if (!opts.summary) {
      console.error("--summary is required in pipe mode");
      process.exit(1);
    }

    const created = await createIssue({
      summary: opts.summary,
      description: "",
      descriptionAdf: f.description || undefined,
      issueType: f.issuetype?.name || "Task",
      parentKey: f.parent?.key,
      labels: f.labels,
      components: f.components?.map((c) => c.name),
    });

    const url = `${config.jira.baseUrl}/browse/${created.key}`;
    console.log(`${created.key}\t${url}`);
    return;
  }

  // Interactive mode — show what we're cloning
  p.log.info(pc.dim("Cloning from:"));
  console.log(`  ${pc.cyan(source.key)} ${f.summary}`);
  console.log(`  Type: ${f.issuetype?.name}  Priority: ${f.priority?.name}`);
  if (f.parent) console.log(`  Parent: ${pc.cyan(f.parent.key)} ${f.parent.fields.summary}`);
  if (f.labels?.length) console.log(`  Labels: ${f.labels.join(", ")}`);
  if (f.components?.length) console.log(`  Components: ${f.components.map((c) => c.name).join(", ")}`);
  console.log();

  const summaryInput = opts.summary || await (async () => {
    const val = await p.text({
      message: "Summary for the new issue:",
      placeholder: f.summary,
      defaultValue: f.summary,
      validate: (v) => (!v.trim() ? "Summary is required" : undefined),
    });
    if (p.isCancel(val)) { p.cancel("Cancelled."); process.exit(0); }
    return val as string;
  })();

  const s2 = p.spinner();
  s2.start("Creating cloned issue...");

  const created = await createIssue({
    summary: summaryInput.trim(),
    description: "",
    descriptionAdf: f.description || undefined,
    issueType: f.issuetype?.name || "Task",
    parentKey: f.parent?.key,
    labels: f.labels,
    components: f.components?.map((c) => c.name),
  });

  s2.stop(`Created ${pc.cyan(created.key)}`);

  const url = `${config.jira.baseUrl}/browse/${created.key}`;
  p.log.success(
    `${pc.green(created.key)}: ${summaryInput.trim()}\n  ${pc.dim(url)}`
  );

  const openIt = await p.confirm({
    message: "Open in browser?",
    initialValue: true,
  });
  if (!p.isCancel(openIt) && openIt) {
    await openMode(created.key);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const pipeFlag = args.includes("--pipe") || args.includes("-p");

  // help mode: `jj help`
  if (args[0] === "help") {
    printBanner();
    console.log([
      "  ┌──────────────────────────────┬───────────────────────────────────────────────────────┐",
      "  │           Command            │                         Usage                         │",
      "  ├──────────────────────────────┼───────────────────────────────────────────────────────┤",
      "  │ jj                           │ Interactive list → select → view as markdown          │",
      "  │ jj <KEY>                     │ Fetch a specific issue (e.g. jj WEB-1234)             │",
      "  │ jj <KEY> --pipe              │ Output issue markdown to stdout                       │",
      "  │ jj list                      │ List assigned sprint issues                           │",
      "  │ jj list --pipe               │ List issues (non-interactive, tab-separated)           │",
      "  │ jj board                     │ Interactive kanban board (move cards between columns)  │",
      "  │ jj sprint                    │ Sprint overview (issues by status + assignee)          │",
      "  │ jj sprint --pipe             │ Sprint overview as markdown                            │",
      "  │ jj summary                   │ Sprint roundup (auto-copies Slack format to clipboard)  │",
      "  │ jj summary --concise         │ Concise format (grouped by role)                       │",
      "  │ jj ready <number>            │ Transition issue to Review (e.g. jj ready 1234)       │",
      "  │ jj open [KEY]                │ Open issue in browser                                  │",
      "  │ jj comment [KEY]             │ Post a comment (-m \"msg\" or opens $EDITOR)             │",
      "  │ jj create                    │ Create issue (-m, $EDITOR, or pipe from stdin)         │",
      "  │ jj clone <KEY>               │ Clone an issue (keeps type, parent, labels)            │",
      "  │ jj whois <name>              │ What's assigned to this person?                        │",
      "  │ jj search <text>             │ Search issues by summary                               │",
      "  └──────────────────────────────┴───────────────────────────────────────────────────────┘",
    ].join("\n"));
    return;
  }

  // clone mode: `jj clone <WEB-1234> [--summary "..."] [--pipe]`
  if (args[0] === "clone") {
    const isPipe = args.includes("--pipe");
    if (!isPipe) printBanner();

    const sourceKey = args[1] && !args[1].startsWith("-") ? args[1].toUpperCase() : undefined;
    if (!sourceKey) {
      console.error("Usage: jj clone <ISSUE-KEY> [--summary \"New title\"] [--pipe]");
      process.exit(1);
    }

    const flagVal = (flag: string) => {
      const idx = args.indexOf(flag);
      return idx !== -1 ? args[idx + 1] : undefined;
    };

    await cloneMode({
      sourceKey,
      summary: flagVal("--summary"),
      pipe: isPipe,
    });
    return;
  }

  // create mode: `jj create [-m "slack convo"] [--summary "..."] [--type Story] [--parent WEB-123] [--pipe]`
  if (args[0] === "create") {
    const isPipe = args.includes("--pipe");
    if (!isPipe) printBanner();

    const flagVal = (flag: string) => {
      const idx = args.indexOf(flag);
      return idx !== -1 ? args[idx + 1] : undefined;
    };

    await createMode({
      message: flagVal("-m"),
      summary: flagVal("--summary"),
      type: flagVal("--type"),
      parent: flagVal("--parent"),
      pipe: isPipe,
    });
    return;
  }

  // sprint mode: `jj sprint [--pipe]`
  if (args[0] === "sprint") {
    if (!pipeFlag) printBanner();
    validateConfig();
    await runSprint(pipeFlag);
    return;
  }

  // summary mode: `jj summary [--concise] [--pipe]`
  if (args[0] === "summary") {
    if (!pipeFlag) printBanner();
    validateConfig();
    await runSummary({
      pipe: pipeFlag,
      concise: args.includes("--concise"),
    });
    return;
  }

  // whois mode: `jj whois <name> [--pipe]`
  if (args[0] === "whois") {
    if (!pipeFlag) printBanner();
    validateConfig();

    const name = args.slice(1).filter((a) => !a.startsWith("-")).join(" ");
    if (!name) {
      console.error("Usage: jj whois <name>  e.g. jj whois adam");
      process.exit(1);
    }

    const s = pipeFlag ? null : p.spinner();
    s?.start(`Searching for ${name}...`);

    const result = await searchByAssignee(name);

    if (pipeFlag) {
      for (const issue of result.issues) {
        const f = issue.fields;
        console.log(`${issue.key}\t${f.status.name}\t${f.assignee?.displayName || "\u2014"}\t${f.summary}`);
      }
      return;
    }

    s?.stop(`Found ${result.issues.length} issues`);

    if (!result.issues.length) {
      p.log.warn(`No issues found assigned to "${name}" in the current sprint.`);
      return;
    }

    const assigneeName = result.issues[0].fields.assignee?.displayName || name;
    p.log.info(pc.bold(`${assigneeName}'s sprint:`));

    for (const issue of result.issues) {
      const f = issue.fields;
      const status = pc.dim(`[${f.status.name}]`);
      console.log(`  ${pc.cyan(issue.key)} ${f.summary} ${status}`);
    }
    return;
  }

  // search mode: `jj search <text> [--pipe]`
  if (args[0] === "search") {
    if (!pipeFlag) printBanner();
    validateConfig();

    const text = args.slice(1).filter((a) => !a.startsWith("-")).join(" ");
    if (!text) {
      console.error("Usage: jj search <text>  e.g. jj search homepage");
      process.exit(1);
    }

    const s = pipeFlag ? null : p.spinner();
    s?.start(`Searching for "${text}"...`);

    const result = await searchIssuesByText(text, undefined, 20);

    if (pipeFlag) {
      for (const issue of result.issues) {
        const f = issue.fields;
        console.log(`${issue.key}\t${f.status?.name || "\u2014"}\t${f.assignee?.displayName || "\u2014"}\t${f.summary}`);
      }
      return;
    }

    s?.stop(`Found ${result.issues.length} results`);

    if (!result.issues.length) {
      p.log.warn(`No issues found matching "${text}".`);
      return;
    }

    const selected = await p.select({
      message: "Select an issue:",
      options: result.issues.map((issue) => ({
        value: issue.key,
        label: `${pc.cyan(issue.key)} ${issue.fields.summary}`,
        hint: `${issue.fields.status?.name || "\u2014"} \u00b7 ${issue.fields.issuetype?.name || "\u2014"}`,
      })),
    });

    if (p.isCancel(selected)) {
      p.cancel("Cancelled.");
      return;
    }

    const full = await fetchAndConvert(selected as string);
    if (!full) return;

    console.log("\n" + full.md);
    return;
  }

  // board mode: `jj board`
  if (args[0] === "board") {
    printBanner();
    await boardMode();
    return;
  }


  // open mode: `jj open [WEB-1234]`
  if (args[0] === "open") {
    printBanner();
    validateConfig();
    let keyOrUndef: string | undefined = args[1]?.toUpperCase();
    if (!keyOrUndef) {
      keyOrUndef = (await listAndSelect()) ?? undefined;
      if (!keyOrUndef) return;
    }
    const key: string = keyOrUndef;
    await openMode(key);
    return;
  }

  // comment mode: `jj comment [WEB-1234] [-m "message"]`
  if (args[0] === "comment") {
    printBanner();
    validateConfig();

    let key = args[1] && !args[1].startsWith("-") ? args[1].toUpperCase() : undefined;
    if (!key) {
      key = (await listAndSelect()) ?? undefined;
      if (!key) return;
    }

    const mIdx = args.indexOf("-m");
    const inlineMessage = mIdx !== -1 ? args[mIdx + 1] : undefined;

    await commentMode(key, inlineMessage);
    return;
  }

  // ready mode: `jj ready 1823`
  if (args[0] === "ready") {
    const ticketNumber = args[1];
    if (!ticketNumber || !/^\d+$/.test(ticketNumber)) {
      console.error("Usage: jj ready <ticket-number>  e.g. jj ready 1823");
      process.exit(1);
    }
    await readyMode(ticketNumber);
    return;
  }

  // Pipe mode: non-interactive, just output markdown to stdout
  // Usage: jira-md WEB-1234 --pipe > .jira/WEB-1234.md
  if (pipeFlag) {
    const key = args.find((a) => !a.startsWith("-") && a !== "list");

    // jira-md list --pipe  → list assigned stories (non-interactive)
    if (args.includes("list") || !key) {
      const customJql = args.includes("--jql")
        ? args[args.indexOf("--jql") + 1]
        : undefined;
      await listMode(customJql);
      return;
    }

    await pipeMode(key);
    return;
  }

  printBanner();

  validateConfig();

  let issueKey: string | null = null;

  // Direct key: `jira-md WEB-9054`
  if (args[0] && !args[0].startsWith("-") && args[0] !== "list") {
    issueKey = args[0].toUpperCase();
  }

  // List mode: `jira-md list` or `jira-md` with no args
  if (!issueKey) {
    const customJql = args.includes("--jql")
      ? args[args.indexOf("--jql") + 1]
      : undefined;

    issueKey = await listAndSelect(customJql);
    if (!issueKey) return;
  }

  const result = await fetchAndConvert(issueKey);
  if (!result) return;

  const { md, imagePaths } = result;

  // Rich output: markdown + inline images
  console.log("\n" + md);

  if (imagePaths.size > 0) {
    const { default: terminalImage } = await import("terminal-image");
    const defaultWidth = Math.floor((process.stdout.columns ?? 80) * 0.8);
    for (const [filename, filePath] of imagePaths) {
      const rendered = await terminalImage.file(filePath, { width: defaultWidth });
      process.stdout.write(rendered + "\n");
      p.log.info(filename);
    }
  }

  p.outro(pc.green("Done!"));
}

main().catch(console.error);
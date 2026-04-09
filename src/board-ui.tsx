import React, { useState, useEffect, useCallback, useRef } from "react";
import { render, Box, Text, useInput, useApp, useStdout, useStdin } from "ink";
import type { JiraIssue } from "./jira-client.js";
import { getTransitions, transitionIssue } from "./jira-client.js";
import { COLUMNS, mapStatus, type Column, type Card } from "./board.js";
import { config } from "./config.js";

interface BoardProps {
  issues: JiraIssue[];
  sprintName: string;
}

const COLUMN_TRANSITION_NAMES = config.board.columnTransitions;

async function findAndExecuteTransition(
  issueKey: string,
  targetColumn: Column
): Promise<{ success: boolean; error?: string }> {
  try {
    const transitions = await getTransitions(issueKey);
    const candidates = COLUMN_TRANSITION_NAMES[targetColumn];
    const match = transitions.find(t =>
      candidates.some(c => t.name.toLowerCase().includes(c))
    );
    if (!match) {
      const available = transitions.map(t => t.name).join(", ");
      return { success: false, error: `No transition to "${targetColumn}". Available: ${available}` };
    }
    await transitionIssue(issueKey, match.id);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

function CardView({ card, isFocused, isGrabbed, isTransitioning }: {
  card: Card;
  isFocused: boolean;
  isGrabbed: boolean;
  isTransitioning: boolean;
}) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text
        bold={isGrabbed}
        inverse={isFocused}
        dimColor={isTransitioning}
        color={isGrabbed ? "yellow" : isFocused ? "cyan" : undefined}
      >
        {card.key}{isTransitioning ? " ..." : ""}
      </Text>
      <Text dimColor wrap="truncate-end">
        {card.summary}
      </Text>
    </Box>
  );
}

function ColumnView({ name, cards, isActive, cursorRow, grabbedKey, transitioning }: {
  name: string;
  cards: Card[];
  isActive: boolean;
  cursorRow: number;
  grabbedKey: string | null;
  transitioning: Set<string>;
}) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexBasis={0}
      borderStyle={isActive ? "double" : "single"}
      borderColor={isActive ? "cyan" : undefined}
    >
      <Box justifyContent="center" paddingX={1}>
        <Text bold color={isActive ? "cyan" : undefined}>
          {name}
        </Text>
        <Text dimColor> ({cards.length})</Text>
      </Box>
      {cards.map((card, i) => (
        <CardView
          key={card.key}
          card={card}
          isFocused={isActive && i === cursorRow}
          isGrabbed={card.key === grabbedKey}
          isTransitioning={transitioning.has(card.key)}
        />
      ))}
      {cards.length === 0 && (
        <Box paddingX={1}>
          <Text dimColor italic>empty</Text>
        </Box>
      )}
    </Box>
  );
}

function Board({ issues, sprintName }: BoardProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { stdin } = useStdin();

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
  const lastCol = COLUMNS[COLUMNS.length - 1];
  if (grouped[lastCol].length > 5) {
    grouped[lastCol] = grouped[lastCol].slice(-5);
  }

  const [columns, setColumns] = useState(grouped);
  const [cursorCol, setCursorCol] = useState(0);
  const [cursorRow, setCursorRow] = useState(0);
  const [grabbed, setGrabbed] = useState<{ key: string; sourceCol: number } | null>(null);
  const [transitioning, setTransitioning] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Refs for mouse handler to access current state without stale closures
  const grabbedRef = useRef(grabbed);
  grabbedRef.current = grabbed;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const dropCard = useCallback((targetColIndex: number, currentGrabbed: { key: string; sourceCol: number }) => {
    if (targetColIndex === currentGrabbed.sourceCol) return;
    const sourceColName = COLUMNS[currentGrabbed.sourceCol];
    const targetColName = COLUMNS[targetColIndex];
    const card = columnsRef.current[sourceColName].find(c => c.key === currentGrabbed.key);
    if (!card) return;

    setColumns(prev => ({
      ...prev,
      [sourceColName]: prev[sourceColName].filter(c => c.key !== currentGrabbed.key),
      [targetColName]: [...prev[targetColName], card],
    }));

    const cardKey = currentGrabbed.key;
    setTransitioning(prev => new Set(prev).add(cardKey));
    setError(null);

    findAndExecuteTransition(cardKey, targetColName).then(result => {
      setTransitioning(prev => {
        const next = new Set(prev);
        next.delete(cardKey);
        return next;
      });
      if (!result.success) {
        setColumns(prev => {
          const movedCard = prev[targetColName].find(c => c.key === cardKey);
          if (!movedCard) return prev;
          return {
            ...prev,
            [targetColName]: prev[targetColName].filter(c => c.key !== cardKey),
            [sourceColName]: [...prev[sourceColName], movedCard],
          };
        });
        setError(`${cardKey}: ${result.error}`);
      }
    });
  }, []);

  useInput((input, key) => {
    if (input === "q" && !grabbed) {
      exit();
      return;
    }

    const colName = COLUMNS[cursorCol];
    const colCards = columns[colName];

    if (key.leftArrow) {
      const newCol = Math.max(0, cursorCol - 1);
      setCursorCol(newCol);
      const targetCards = columns[COLUMNS[newCol]];
      setCursorRow(Math.min(cursorRow, Math.max(0, targetCards.length - 1)));
    } else if (key.rightArrow) {
      const newCol = Math.min(COLUMNS.length - 1, cursorCol + 1);
      setCursorCol(newCol);
      const targetCards = columns[COLUMNS[newCol]];
      setCursorRow(Math.min(cursorRow, Math.max(0, targetCards.length - 1)));
    } else if (key.upArrow) {
      setCursorRow(Math.max(0, cursorRow - 1));
    } else if (key.downArrow) {
      setCursorRow(Math.min(colCards.length - 1, cursorRow + 1));
    } else if (key.return || input === " ") {
      if (!grabbed) {
        if (colCards.length > 0) {
          setGrabbed({ key: colCards[cursorRow].key, sourceCol: cursorCol });
        }
      } else {
        dropCard(cursorCol, grabbed);
        setGrabbed(null);
      }
    } else if (key.escape) {
      setGrabbed(null);
    }
  });

  // Mouse support: enable SGR mouse tracking
  useEffect(() => {
    if (!stdout || !stdin) return;
    stdout.write("\x1b[?1000h\x1b[?1006h");

    const handleData = (data: Buffer) => {
      const str = data.toString();
      const match = str.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
      if (!match) return;
      const [, , xStr, , action] = match;
      if (action !== "M") return; // only handle press
      const x = parseInt(xStr, 10);
      const termWidth = stdout.columns ?? 100;
      const colWidth = Math.floor(termWidth / COLUMNS.length);
      const clickedCol = Math.min(COLUMNS.length - 1, Math.floor((x - 1) / colWidth));

      const currentGrabbed = grabbedRef.current;
      if (currentGrabbed) {
        dropCard(clickedCol, currentGrabbed);
        setGrabbed(null);
      } else {
        setCursorCol(clickedCol);
      }
    };

    stdin.on("data", handleData);
    return () => {
      stdout.write("\x1b[?1000l\x1b[?1006l");
      stdin.off("data", handleData);
    };
  }, [stdout, stdin, dropCard]);

  return (
    <Box flexDirection="column">
      <Box justifyContent="center" paddingY={1}>
        <Text bold color="cyan">{sprintName}</Text>
        {grabbed && (
          <Text color="yellow"> — moving {grabbed.key} (Enter to drop, Esc to cancel, or click column)</Text>
        )}
      </Box>
      <Box>
        {COLUMNS.map((colName, i) => (
          <ColumnView
            key={colName}
            name={colName}
            cards={columns[colName]}
            isActive={cursorCol === i}
            cursorRow={cursorCol === i ? cursorRow : -1}
            grabbedKey={grabbed?.key ?? null}
            transitioning={transitioning}
          />
        ))}
      </Box>
      <Box paddingTop={1}>
        <Text dimColor>
          ←→ columns  ↑↓ cards  Enter/Space grab/drop  Esc cancel  q quit
        </Text>
      </Box>
      {error && (
        <Box>
          <Text color="red">{error}</Text>
        </Box>
      )}
    </Box>
  );
}

export async function startBoard(issues: JiraIssue[], sprintName: string): Promise<void> {
  const app = render(<Board issues={issues} sprintName={sprintName} />);
  await app.waitUntilExit();
}

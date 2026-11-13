import { describe, it, expect } from "vitest";
import { normalizeIssueKey, findTransitions, findUsers } from "../src/resolve.js";

describe("normalizeIssueKey", () => {
  it("prefixes a bare number with the project key", () => {
    expect(normalizeIssueKey("1234", "WEB")).toBe("WEB-1234");
  });

  it("uppercases a full key", () => {
    expect(normalizeIssueKey("web-1234", "WEB")).toBe("WEB-1234");
  });

  it("keeps keys from other projects", () => {
    expect(normalizeIssueKey("APP-5668", "WEB")).toBe("APP-5668");
  });

  it("rejects anything that is not a key or number", () => {
    expect(normalizeIssueKey("done", "WEB")).toBeNull();
    expect(normalizeIssueKey("WEB-", "WEB")).toBeNull();
  });
});

const TRANSITIONS = [
  { id: "11", name: "To Do", to: { name: "Backlog" } },
  { id: "21", name: "In Progress", to: { name: "In Progress" } },
  { id: "31", name: "REVIEW", to: { name: "Review" } },
  { id: "41", name: "Done", to: { name: "Done" } },
  { id: "51", name: "Closed", to: { name: "Closed" } },
];

describe("findTransitions", () => {
  it("matches a transition name, ignoring case", () => {
    expect(findTransitions(TRANSITIONS, "done").map((t) => t.id)).toEqual(["41"]);
  });

  it("matches the status a transition moves to", () => {
    expect(findTransitions(TRANSITIONS, "backlog").map((t) => t.id)).toEqual(["11"]);
  });

  it("treats spaces, hyphens, and underscores the same", () => {
    expect(findTransitions(TRANSITIONS, "in-progress").map((t) => t.id)).toEqual(["21"]);
    expect(findTransitions(TRANSITIONS, "IN_PROGRESS").map((t) => t.id)).toEqual(["21"]);
  });

  it("falls back to a partial match", () => {
    expect(findTransitions(TRANSITIONS, "progress").map((t) => t.id)).toEqual(["21"]);
  });

  it("prefers an exact match over partial ones", () => {
    const transitions = [
      { id: "1", name: "Done" },
      { id: "2", name: "Done (won't do)" },
    ];
    expect(findTransitions(transitions, "done").map((t) => t.id)).toEqual(["1"]);
  });

  it("returns every partial match when the target is ambiguous", () => {
    expect(findTransitions(TRANSITIONS, "o").length).toBeGreaterThan(1);
  });

  it("returns nothing when no transition matches", () => {
    expect(findTransitions(TRANSITIONS, "shipped")).toEqual([]);
  });
});

const USERS = [
  { accountId: "a1", displayName: "Nathan Sinsabaugh", emailAddress: "nathan@example.com" },
  { accountId: "a2", displayName: "Nate Smith" },
  { accountId: "a3", displayName: "Preston Crawford" },
];

describe("findUsers", () => {
  it("matches a display name, ignoring case", () => {
    expect(findUsers(USERS, "preston crawford").map((u) => u.accountId)).toEqual(["a3"]);
  });

  it("matches an email address", () => {
    expect(findUsers(USERS, "nathan@example.com").map((u) => u.accountId)).toEqual(["a1"]);
  });

  it("falls back to a partial match", () => {
    expect(findUsers(USERS, "preston").map((u) => u.accountId)).toEqual(["a3"]);
  });

  it("returns every partial match when the query is ambiguous", () => {
    expect(findUsers(USERS, "na").map((u) => u.accountId)).toEqual(["a1", "a2"]);
  });
});

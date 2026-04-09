import { describe, it, expect } from "vitest";
import { mapStatus, COLUMNS } from "../src/board.js";

describe("mapStatus", () => {
  it("maps 'to do' to first column", () => {
    expect(mapStatus("To Do")).toBe("To Do");
  });

  it("maps 'in progress' to In Progress", () => {
    expect(mapStatus("In Progress")).toBe("In Progress");
  });

  it("maps 'review' to Review", () => {
    expect(mapStatus("Review")).toBe("Review");
  });

  it("maps 'done' to Done", () => {
    expect(mapStatus("Done")).toBe("Done");
  });

  it("maps 'closed' to Done", () => {
    expect(mapStatus("Closed")).toBe("Done");
  });

  it("maps 'complete' to Done", () => {
    expect(mapStatus("Complete")).toBe("Done");
  });

  it("is case insensitive", () => {
    expect(mapStatus("IN PROGRESS")).toBe("In Progress");
    expect(mapStatus("done")).toBe("Done");
    expect(mapStatus("TO DO")).toBe("To Do");
  });

  it("falls back to first column for unknown statuses", () => {
    expect(mapStatus("Something Unknown")).toBe(COLUMNS[0]);
  });
});

describe("COLUMNS", () => {
  it("has four default columns", () => {
    expect(COLUMNS).toEqual(["To Do", "In Progress", "Review", "Done"]);
  });
});

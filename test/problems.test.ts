// Problem copy: the translator picks a table entry, falls back to the raw
// message with the title, and never writes a bracketed id.
import { describe, expect, it } from "vitest";
import { describeProblem, problemLine, problemName, defaultProblemCopy, type ProblemCopyTable } from "../src/problems.js";

const table: ProblemCopyTable = {
  ...defaultProblemCopy,
  "unknown-character": (p) => ({ text: `${problemName(p)} isn't in your cast yet.`, next: "Add them in the cast list." }),
};

describe("describeProblem", () => {
  it("picks the table entry for a code and names the thing by its title", () => {
    const copy = describeProblem({ code: "unknown-character", message: "'Ophelia' is not in the project cast", title: "Ophelia" }, table);
    expect(copy).toEqual({ text: "\u201COphelia\u201D isn't in your cast yet.", next: "Add them in the cast list." });
    expect(describeProblem({ code: "duplicate-gameid", message: "duplicate gameId", title: "Burner Rig" }, table).text)
      .toBe("The Game ID on \u201CBurner Rig\u201D is already used elsewhere.");
  });

  it("falls back to the raw message, prefixed by the title when there is one", () => {
    expect(describeProblem({ code: "never-heard-of-it", message: "copies must be an integer >= 1", title: "Burner Rig" }, table))
      .toEqual({ text: "Burner Rig: copies must be an integer >= 1" });
    expect(describeProblem({ message: "copies must be an integer >= 1", where: "card-7" }, table))
      .toEqual({ text: "copies must be an integer >= 1" });
    expect(describeProblem({ message: "unparseable JSON5" })).toEqual({ text: "unparseable JSON5" });
  });

  it("never emits a bracketed id, even when the message carried one", () => {
    const copy = describeProblem({ message: "no such tag [arrival]", where: "arrival" }, table);
    expect(copy.text).toBe("no such tag");
    for (const p of [
      { code: "dangling-reference", message: "x", where: "c9f2" },
      { code: "dangling-reference", message: "x", where: "c9f2", title: "Arrival" },
      { code: "unknown-property", message: "x", where: "c9f2" },
      { message: "x [c9f2]", where: "c9f2" },
    ]) {
      expect(describeProblem(p, table).text).not.toContain("[");
    }
  });

  it("writes (id ...) only for a dangling reference with no title", () => {
    expect(describeProblem({ code: "dangling-reference", message: "x", where: "c9f2" }, table).text)
      .toBe("(id c9f2) points at something that no longer exists.");
    expect(describeProblem({ code: "dangling-reference", message: "x", where: "c9f2", title: "Arrival" }, table).text)
      .toBe("\u201CArrival\u201D points at something that no longer exists.");
    // A non-dangling entry with no title says "This": an id is not a name.
    expect(describeProblem({ code: "unknown-property", message: "x", where: "c9f2" }, table).text)
      .toBe("This uses a property that isn't set up yet.");
    expect(describeProblem({ code: "unknown-property", message: "x", where: "c9f2" }, table).text).not.toContain("c9f2");
  });

  it("joins the sentence and the next step for a one-line bar", () => {
    expect(problemLine({ code: "missing-name", message: "x" }, table)).toBe("This needs a name.");
    expect(problemLine({ code: "empty", message: "x", title: "Act 2" }, table))
      .toBe("\u201CAct 2\u201D is empty. Add something inside it, or remove it.");
  });

  it("ships a default table for the codes both apps raise", () => {
    expect(Object.keys(defaultProblemCopy).sort()).toEqual([
      "dangling-reference", "duplicate-gameid", "empty", "invalid-gameid",
      "merge-conflict", "missing-name", "stale-build", "unknown-property",
    ]);
    for (const [code, entry] of Object.entries(defaultProblemCopy)) {
      const copy = entry({ code, message: "raw", path: "decks/a.storyletdeck", where: "id-1" });
      expect(copy.text, code).toMatch(/[.!]$/);
      expect(copy.text, code).not.toContain("[");
      expect(copy.text, code).not.toContain("\u2014");
    }
  });
});

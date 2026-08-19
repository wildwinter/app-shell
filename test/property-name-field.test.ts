// @vitest-environment jsdom
// The manners of a property-name field. These are the gameId editor's, and the
// test that matters most is the negative one: what the author typed is still
// there afterwards. Both apps held a copy of this test before the manners were
// lifted here, and each keeps a thin one over its own editor.
import { describe, expect, it, vi } from "vitest";
import { bindPropertyName, propertyNameProblem, firstIllegalPropertyName } from "../src/property-name-field.js";
import { PROPERTY_NAME_HINT } from "../src/property-names.js";

const field = (): { input: HTMLInputElement; host: HTMLElement; commits: string[] } => {
  const host = document.createElement("div");
  const input = document.createElement("input");
  host.append(input);
  const commits: string[] = [];
  bindPropertyName(input, (v) => commits.push(v), { hint: PROPERTY_NAME_HINT });
  return { input, host, commits };
};
const type = (input: HTMLInputElement, text: string): void => {
  input.value = text;
  input.dispatchEvent(new Event("input"));
};
const tab = (input: HTMLInputElement, shift = false): boolean =>
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true }));

describe("bindPropertyName", () => {
  it("keeps what was typed and marks it, rather than rewriting it", () => {
    const { input, host, commits } = field();

    type(input, "isNight");

    expect(input.value).toBe("isNight");
    expect(commits).toEqual(["isNight"]);              // the model gets it verbatim
    expect(input.classList.contains("illegal")).toBe(true);
    expect(firstIllegalPropertyName(host)).toBe(input);
  });

  it("coerces on Tab, and only then", () => {
    const { input, commits } = field();

    type(input, "Is Night!");
    expect(input.value).toBe("Is Night!");

    const notCancelled = tab(input);
    expect(input.value).toBe("is_night");
    expect(notCancelled).toBe(false);                  // preventDefault: focus stays put
    expect(commits.at(-1)).toBe("is_night");
    expect(input.classList.contains("illegal")).toBe(false);
  });

  it("leaves Shift+Tab alone, which is how you leave a field you have not finished", () => {
    const { input } = field();
    type(input, "isNight");
    const notCancelled = tab(input, true);
    expect(input.value).toBe("isNight");
    expect(notCancelled).toBe(true);
  });

  it("does not swallow Tab when there is nothing to coerce", () => {
    const { input } = field();
    type(input, "gold");
    expect(tab(input)).toBe(true);                     // legal: Tab moves on
    type(input, "");
    expect(tab(input)).toBe(true);                     // empty: Tab moves on
    type(input, "!!!");
    expect(tab(input)).toBe(true);                     // nothing usable: Tab moves on
  });

  it("does not mark an empty field, since unfinished is not illegal", () => {
    const { input, host } = field();
    type(input, "");
    expect(input.classList.contains("illegal")).toBe(false);
    expect(firstIllegalPropertyName(host)).toBeNull();
  });

  it("restores the hint when the fault clears, rather than leaving the complaint", () => {
    const { input } = field();
    type(input, "isNight");
    expect(input.title).toMatch(/fold/);
    type(input, "isnight");
    expect(input.title).toBe(PROPERTY_NAME_HINT);
  });

  it("marks a field that was mounted already holding an illegal name", () => {
    // Rows are rebuilt from state, so the first paint has to be honest without
    // waiting for somebody to type into it.
    const input = document.createElement("input");
    input.value = "is-night";
    bindPropertyName(input, vi.fn());
    expect(input.classList.contains("illegal")).toBe(true);
  });
});

describe("propertyNameProblem", () => {
  it("names what happens, per fault, and offers the coercion", () => {
    expect(propertyNameProblem("isNight")).toMatch(/fold/);
    expect(propertyNameProblem("is-night")).toMatch(/subtraction/);
    expect(propertyNameProblem("9lives")).toMatch(/digit/);
    expect(propertyNameProblem("not")).toMatch(/keyword/);
    expect(propertyNameProblem("is night")).toMatch(/lower case letters, digits and underscores/);
    expect(propertyNameProblem("is night")).toContain('Try "is_night"');
    expect(propertyNameProblem("gold")).toBeUndefined();
  });

  it("offers nothing when there is nothing to offer", () => {
    expect(propertyNameProblem("!!!")).not.toContain("Try");
  });
});

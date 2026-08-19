// The property-name rules (property-names.ts). Pinned here because two apps,
// two compilers and eight engine runtimes resolve authored state by them, and
// because the pair has to agree with itself: everything propertyNameify produces
// must be something isValidPropertyName accepts, or an editor would refuse what
// its own Tab key just typed.
//
// The clauses are not house style. They are what `@wildwinter/expr` can parse;
// the header of property-names.ts records the compiled output for each.
import { describe, expect, it } from "vitest";
import {
  propertyNameify, isValidPropertyName, isCaseOnlyPropertyName,
  RESERVED_PROPERTY_NAMES, PROPERTY_NAME_HINT,
} from "../src/property-names.js";

// The canonical tables. Both apps hold a copy against their own implementations,
// so a change here that is not carried across shows up as a parity failure there.
export const NAMES: Array<[string, string]> = [
  ["isNight", "isnight"],
  ["is night", "is_night"],
  ["is-night", "is_night"],          // the silent one: a hyphen is MINUS to expr
  ["Gareth's Debt", "gareths_debt"],
  ["  gold  ", "gold"],
  ["gold!!!", "gold"],
  ["9 lives", "_9_lives"],           // cannot start with a digit
  ["not", "not_"],                   // keyword
  ["TRUE", "true_"],
  ["_private", "_private"],          // a leading underscore is legal, so it stays
  ["a__b", "a_b"],
  ["", ""],
  ["!!!", ""],
  ["___", ""],
  ["café", "caf"],
];

export const VALID: Array<[string, boolean]> = [
  ["gold", true], ["is_night", true], ["_x", true], ["a1", true], ["x_9", true],
  ["isNight", false], ["is-night", false], ["is night", false], ["9lives", false],
  ["", false], ["_", true], ["true", false], ["and", false], ["Gold", false], ["gold ", false],
];

describe("propertyNameify", () => {
  it("coerces the whole table", () => {
    for (const [input, want] of NAMES) {
      expect(propertyNameify(input), JSON.stringify(input)).toBe(want);
    }
  });

  it("produces only names the validator accepts", () => {
    // The property that matters at a call site: Tab offers a name, and the field
    // must not then refuse it.
    for (const [input] of NAMES) {
      const out = propertyNameify(input);
      if (out === "") continue; // "" is "nothing usable", not a name
      expect(isValidPropertyName(out), `${JSON.stringify(input)} -> ${JSON.stringify(out)}`).toBe(true);
    }
  });

  it("is idempotent", () => {
    for (const [input] of NAMES) {
      const once = propertyNameify(input);
      expect(propertyNameify(once), JSON.stringify(input)).toBe(once);
    }
  });
});

describe("isValidPropertyName", () => {
  it("validates the whole table", () => {
    for (const [name, want] of VALID) {
      expect(isValidPropertyName(name), JSON.stringify(name)).toBe(want);
    }
  });

  it("refuses every reserved word", () => {
    for (const word of RESERVED_PROPERTY_NAMES) expect(isValidPropertyName(word)).toBe(false);
  });
});

describe("isCaseOnlyPropertyName", () => {
  it("is true only when folding alone would fix it", () => {
    expect(isCaseOnlyPropertyName("isNight")).toBe(true);
    expect(isCaseOnlyPropertyName("GOLD")).toBe(true);
    expect(isCaseOnlyPropertyName("is-Night")).toBe(false);  // folding leaves a hyphen
    expect(isCaseOnlyPropertyName("9Lives")).toBe(false);    // folding leaves a leading digit
    expect(isCaseOnlyPropertyName("TRUE")).toBe(false);      // folding lands on a keyword
    expect(isCaseOnlyPropertyName("gold")).toBe(false);      // already legal
  });
});

describe("the hint", () => {
  it("describes the rule the validator actually enforces", () => {
    // A hint that drifts from the rule is worse than none: it teaches the wrong thing.
    expect(PROPERTY_NAME_HINT).toMatch(/lower case/i);
    expect(PROPERTY_NAME_HINT).toMatch(/digit/i);
    expect(PROPERTY_NAME_HINT).toMatch(/underscore/i);
  });
});

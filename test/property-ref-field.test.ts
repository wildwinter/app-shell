// @vitest-environment jsdom
// A reference field points at a declaration rather than making one, so it takes a
// different rule: case is fine (the parser folds every reference), a grammar fault
// is not, and naming something undeclared is the fault a declaration field cannot
// have. Declare-then-reference is the ruling this enforces.
import { describe, expect, it, vi } from "vitest";
import { bindPropertyRef, propertyRefProblem, revalidatePropertyRefs, firstIllegalPropertyName } from "../src/property-name-field.js";

const field = (known: string[] = ["danger", "phase", "gold"]) => {
  const host = document.createElement("div");
  const input = document.createElement("input");
  host.append(input);
  const commits: string[] = [];
  let list = [...known];
  bindPropertyRef(input, (v) => commits.push(v), { known: () => list, scope: "world", hint: "Pick a declared @world property." });
  return { host, input, commits, declare: (n: string) => list.push(n), rename: (n: string[]) => { list = n; } };
};
const type = (input: HTMLInputElement, text: string): void => {
  input.value = text;
  input.dispatchEvent(new Event("input"));
};
const tab = (input: HTMLInputElement): boolean =>
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));

describe("bindPropertyRef", () => {
  it("accepts a declared name in any case, because references fold", () => {
    const { input } = field();
    type(input, "danger");
    expect(input.classList.contains("illegal")).toBe(false);
    type(input, "DANGER");
    expect(input.classList.contains("illegal")).toBe(false);
  });

  it("refuses a name nothing declares, and gates Save", () => {
    const { host, input } = field();
    type(input, "dangr");
    expect(input.classList.contains("illegal")).toBe(true);
    expect(input.title).toContain('Did you mean "danger"');
    expect(firstIllegalPropertyName(host)).toBe(input);
  });

  it("lists what IS declared when nothing is close", () => {
    const { input } = field();
    type(input, "weather");
    expect(input.title).toContain('No @world property is called "weather"');
    expect(input.title).toContain('"danger"');
  });

  it("says so plainly when nothing is declared at all", () => {
    const { input } = field([]);
    type(input, "danger");
    expect(input.title).toContain("No @world properties are declared yet");
  });

  it("still refuses a grammar fault, and Tab still coerces one", () => {
    const { input } = field(["is_night"]);
    type(input, "is-night");
    expect(input.title).toMatch(/subtraction/);
    tab(input);
    expect(input.value).toBe("is_night");
    expect(input.classList.contains("illegal")).toBe(false);   // coerced AND declared
  });

  it("does not let Tab coerce an undeclared name, which is not a grammar fault", () => {
    const { input } = field();
    type(input, "weather");
    expect(tab(input)).toBe(true);                             // not swallowed
    expect(input.value).toBe("weather");
  });

  it("offers the declared names as a datalist, refreshed as they change", () => {
    const { host, input, declare } = field();
    const list = host.querySelector("datalist")!;
    expect(input.getAttribute("list")).toBe(list.id);
    expect([...list.querySelectorAll("option")].map((o) => o.value)).toEqual(["danger", "phase", "gold"]);
    declare("weather");
    revalidatePropertyRefs(host);
    expect([...list.querySelectorAll("option")].map((o) => o.value)).toContain("weather");
  });

  it("still gets its datalist when bound BEFORE the field is mounted", () => {
    // The ordinary order for a builder: make the nodes, wire them, then append. The datalist is a
    // sibling of the input, so attaching it at bind time is a no-op here - and the failure is silent,
    // which is how it survived a release.
    const host = document.createElement("div");
    const input = document.createElement("input");
    bindPropertyRef(input, () => {}, { known: () => ["danger"], scope: "world" });
    host.append(input);
    input.dispatchEvent(new Event("input"));           // any use re-tries the attach

    const list = host.querySelector(`datalist#${input.getAttribute("list")}`);
    expect(list).not.toBeNull();
    expect([...list!.querySelectorAll("option")].map((o) => o.value)).toEqual(["danger"]);
  });

  it("re-checks when the declarations change under it, with nothing typed", () => {
    // The case a per-field listener cannot catch: rename the property and the
    // reference is wrong from that moment.
    const { host, input, rename } = field();
    type(input, "danger");
    expect(input.classList.contains("illegal")).toBe(false);

    rename(["danger_level"]);
    revalidatePropertyRefs(host);

    expect(input.classList.contains("illegal")).toBe(true);
    expect(input.title).toContain('Did you mean "danger_level"');
  });

  it("restores the hint when a fault clears", () => {
    const { input } = field();
    type(input, "dangr");
    expect(input.title).toContain("Did you mean");
    type(input, "danger");
    expect(input.title).toBe("Pick a declared @world property.");
  });

  it("does not mark an empty field", () => {
    const { host, input } = field();
    type(input, "");
    expect(input.classList.contains("illegal")).toBe(false);
    expect(firstIllegalPropertyName(host)).toBeNull();
  });
});

describe("propertyRefProblem", () => {
  const known = () => ["danger", "phase"];
  it("separates the grammar faults from the undeclared one", () => {
    expect(propertyRefProblem("danger", { known, scope: "world" })).toBeUndefined();
    expect(propertyRefProblem("Danger", { known, scope: "world" })).toBeUndefined();
    expect(propertyRefProblem("dang-er", { known, scope: "world" })).toMatch(/subtraction/);
    expect(propertyRefProblem("9lives", { known, scope: "world" })).toMatch(/digit/);
    expect(propertyRefProblem("not", { known, scope: "world" })).toMatch(/keyword/);
    expect(propertyRefProblem("weather", { known, scope: "world" })).toMatch(/No @world property/);
  });

  it("suggests only when the suggestion is worth making", () => {
    expect(propertyRefProblem("phse", { known, scope: "world" })).toContain('"phase"');
    // Nothing in the list is within reach of this, so it lists rather than guesses.
    expect(propertyRefProblem("xyzzy", { known, scope: "world" })).not.toContain("Did you mean");
  });
});

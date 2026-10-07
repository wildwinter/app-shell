// @vitest-environment jsdom
// A caption must point at its FIELD, never at a button.
//
// patterkit/patter#44: a `<label>` with no `for` forwards clicks to its first labelable descendant,
// and buttons are labelable. Wrapped around `tagChips`, whose every chip carries a remove button,
// that turned every click on the row's dead space into a press of the first ✕ - so clicking a Game
// Data list value anywhere but its own ✕ deleted the FIRST value in the list.
import { describe, expect, it } from "vitest";
import { labelled, labelledToggle, tagChips, el } from "../src/dom.js";

describe("labelled", () => {
  it("does not forward a click to a chip's remove button", () => {
    const holder = { values: ["alpha", "beta", "gamma"] };
    const row = labelled("Values", tagChips(holder));
    document.body.append(row);

    row.querySelector<HTMLElement>(".shell-tag")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(holder.values).toEqual(["alpha", "beta", "gamma"]);
    row.remove();
  });

  it("captions the add input instead, so the click still lands somewhere useful", () => {
    const row = labelled("Values", tagChips({ values: ["alpha"] })) as HTMLLabelElement;
    document.body.append(row);
    expect(row.control).toBe(row.querySelector("input.shell-tag-input"));
    row.remove();
  });

  it("still labels an ordinary field, which is the common case", () => {
    const input = el("input");
    const row = labelled("Name", input) as HTMLLabelElement;
    document.body.append(row);
    expect(row.tagName).toBe("LABEL");
    expect(row.control).toBe(input);
    row.remove();
  });

  it("keeps an id the caller already set", () => {
    const input = el("input");
    input.id = "mine";
    const row = labelled("Name", input) as HTMLLabelElement;
    expect(row.htmlFor).toBe("mine");
  });

  it("is a plain div when there is no field to caption", () => {
    // Better no caption behaviour than a caption that presses the first button it finds.
    const holder = el("div");
    holder.append(el("button"));
    expect(labelled("Actions", holder).tagName).toBe("DIV");
  });
});

// The family's settings row and its toggle (the 2026-10 Patterpad review,
// ruling C): one row helper and one toggle helper, so a setting in one app
// looks like a setting in the other.
describe("labelled with a hint", () => {
  it("is unchanged without one", () => {
    const row = labelled("Name", el("input"));
    expect(row.tagName).toBe("LABEL");
    expect(row.querySelector(".shell-fieldhint")).toBeNull();
  });

  it("pairs the row with its hint, which describes the field rather than naming it", () => {
    const input = el("input");
    const field = labelled("Build output", input, ["Where ", el("code", undefined, "Publish Bundle"), " writes."]);
    document.body.append(field);
    expect(field.classList.contains("shell-field")).toBe(true);
    const label = field.querySelector<HTMLLabelElement>("label.shell-labelled")!;
    const hint = field.querySelector<HTMLElement>("p.shell-fieldhint")!;
    expect(label.control).toBe(input);
    expect(label.contains(hint)).toBe(false);          // not part of the field's name
    expect(hint.textContent).toBe("Where Publish Bundle writes.");
    expect(hint.querySelector("code")).not.toBeNull();
    expect(input.getAttribute("aria-describedby")).toBe(hint.id);
    field.remove();
  });

  it("keeps a description the field already had", () => {
    const input = el("input");
    input.setAttribute("aria-describedby", "elsewhere");
    const field = labelled("Name", input, "A hint.");
    expect(input.getAttribute("aria-describedby")).toBe(`elsewhere ${field.querySelector(".shell-fieldhint")!.id}`);
  });

  it("captions the field in a field-and-button group, never the button", () => {
    let chose = 0;
    const group = el("div", "shell-inline");
    const path = el("input");
    const choose = el("button", { text: "Choose…", onClick: () => { chose++; } });
    group.append(path, choose);
    const row = labelled("Patter project", group, "A hint.");
    document.body.append(row);
    expect(row.querySelector<HTMLLabelElement>("label")!.control).toBe(path);
    row.querySelector<HTMLElement>(".shell-fieldcap")!.click();
    expect(chose).toBe(0);
    row.remove();
  });
});

describe("labelledToggle", () => {
  it("is caption then box, the box labelled by the caption", () => {
    const { row, input } = labelledToggle("Voiced", { checked: true });
    document.body.append(row);
    expect(row.tagName).toBe("LABEL");
    expect(row.classList.contains("shell-labelled")).toBe(true);
    expect(row.classList.contains("shell-toggle")).toBe(true);
    expect([...row.children].map((c) => c.className)).toEqual(["shell-fieldcap", "shell-toggle-input"]);
    expect(input.type).toBe("checkbox");
    expect(input.checked).toBe(true);
    expect((row as HTMLLabelElement).control).toBe(input);
    row.remove();
  });

  it("flips from its caption and reports the new state", () => {
    const seen: boolean[] = [];
    const { row, input } = labelledToggle("Autosave", { onChange: (on) => seen.push(on) });
    document.body.append(row);
    row.querySelector<HTMLElement>(".shell-fieldcap")!.click();
    expect(input.checked).toBe(true);
    expect(seen).toEqual([true]);
    row.remove();
  });

  it("carries a hint under the row, and the toggle class stays on the row's own line", () => {
    const { row, input } = labelledToggle("Spell-check", { hint: "Underline misspelled words." });
    expect(row.classList.contains("shell-field")).toBe(true);
    const line = row.querySelector(".shell-labelled")!;
    expect(line.classList.contains("shell-toggle")).toBe(true);
    expect(row.querySelector(".shell-fieldhint")!.textContent).toBe("Underline misspelled words.");
    expect(input.getAttribute("aria-describedby")).toBe(row.querySelector(".shell-fieldhint")!.id);
  });

  it("hangs off the row above as a sub-option, and can start disabled", () => {
    const { row, input } = labelledToggle("Embed source language for debug", { sub: true, disabled: true, hint: "Not shippable." });
    expect(row.classList.contains("shell-suboption")).toBe(true);
    expect(input.disabled).toBe(true);
    expect(input.checked).toBe(false);
  });
});

// @vitest-environment jsdom
// A caption must point at its FIELD, never at a button.
//
// patterkit/patter#44: a `<label>` with no `for` forwards clicks to its first labelable descendant,
// and buttons are labelable. Wrapped around `tagChips`, whose every chip carries a remove button,
// that turned every click on the row's dead space into a press of the first ✕ - so clicking a Game
// Data list value anywhere but its own ✕ deleted the FIRST value in the list.
import { describe, expect, it } from "vitest";
import { labelled, tagChips, el } from "../src/dom.js";

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

// The address rules (ids.ts). Pinned here because two apps and four engine
// runtimes address content by these, and because the pair has to agree with
// itself: everything gameIdify produces must be something isValidGameId accepts,
// or the editor would refuse what the slugify button just typed.
import { describe, expect, it } from "vitest";
import { gameIdify, isValidGameId } from "../src/ids.js";

describe("gameIdify", () => {
  it("lower-cases and hyphenates", () => {
    expect(gameIdify("Arrive at the Village Gate")).toBe("arrive-at-the-village-gate");
  });

  it("drops apostrophes rather than hyphenating them", () => {
    // "Gareth's Debt" is a name, not two words: "gareth-s-debt" would be wrong.
    expect(gameIdify("Gareth's Debt")).toBe("gareths-debt");
    expect(gameIdify("Gareth’s Debt")).toBe("gareths-debt");
  });

  it("collapses runs and trims the ends", () => {
    expect(gameIdify("  --Hello,   World!!  ")).toBe("hello-world");
  });

  it("returns EMPTY when there was nothing usable, rather than a stray hyphen", () => {
    expect(gameIdify("---")).toBe("");
    expect(gameIdify("!!!")).toBe("");
    expect(gameIdify("")).toBe("");
  });

  it("cannot produce a path", () => {
    // A gameId names a file in both apps, so this one is load-bearing.
    expect(gameIdify("../../etc/passwd")).toBe("etc-passwd");
  });
});

describe("isValidGameId", () => {
  it("accepts lower case, digits and hyphens between them", () => {
    expect(isValidGameId("arrival")).toBe(true);
    expect(isValidGameId("act-2")).toBe(true);
    expect(isValidGameId("9")).toBe(true);
  });

  it("refuses what a person types before they are told the rules", () => {
    expect(isValidGameId("My Card!")).toBe(false);
    expect(isValidGameId("UPPER")).toBe(false);
    expect(isValidGameId("under_score")).toBe(false);
    expect(isValidGameId("-leading")).toBe(false);
    expect(isValidGameId("trailing-")).toBe(false);
  });

  it("refuses the EMPTY string", () => {
    // "" means "derive one for me", which callers handle before they get here;
    // it is not itself an address.
    expect(isValidGameId("")).toBe(false);
  });
});

describe("the pair agrees with itself", () => {
  it("everything gameIdify produces is something isValidGameId accepts", () => {
    // The Tab-to-slugify button in the editor depends on exactly this: it would
    // be absurd to rewrite somebody's text into something the same panel refuses.
    const inputs = [
      "Arrive at the Village Gate", "Gareth's Debt", "  --Hello,   World!!  ",
      "Ünïcode name", "../../etc/passwd", "9 lives", "MiXeD Case 42", "a--b",
    ];
    for (const input of inputs) {
      const slug = gameIdify(input);
      expect(slug === "" || isValidGameId(slug), `${input} -> ${slug}`).toBe(true);
    }
  });
});

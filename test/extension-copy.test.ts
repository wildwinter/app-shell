// An extension's problems worded for the writer (extension-copy.ts): the rules both apps share, with the
// app's own words for its items, its kinds and where a value is changed.

import { describe, expect, it } from "vitest";
import { entryProblemLine, fieldPhrase, valueProblemSentence } from "../src/extension-copy.js";
import type { EntryProblemWords } from "../src/extension-copy.js";

const fields = [
  { name: "note", label: "Note" },
  { name: "cue", label: "cue", fields: [{ name: "sound", label: "sound" }, { name: "gain", label: "gain" }] },
  { name: "words", label: "words" },
];
const words: EntryProblemWords = {
  extension: "Probe",
  fields: () => fields,
  node: (kind, id) => (kind === "line" && id === "L_greet" ? "“What'll it be, stranger?”" : `the ${kind} ${id}`),
  place: "in the inspector",
  kindWord: (k) => (k === "gameEvent" ? "game event" : k),
};

describe("extension problems for the writer", () => {
  it("names a field by its label, inside a record, and an item of a list", () => {
    expect(fieldPhrase(fields, "note")).toBe("Note");
    expect(fieldPhrase(fields, "cue.sound")).toBe("sound in cue");
    expect(fieldPhrase(fields, "words[1]")).toBe("item 2 of words");
  });

  it("words an entry's problem by its code, as Patterpad does", () => {
    expect(entryProblemLine('entries.line.L_greet.cue.sound: "cue.sound" is required and not set', "required", words))
      .toBe("Probe: “What'll it be, stranger?” needs a sound in cue.");
    expect(entryProblemLine('entries.card.c_1.note: "note" should be text, not a number', "wrong-type", words))
      .toBe("Probe: Note on the card c_1 isn't the kind of value Probe expects. Set it again in the inspector.");
    expect(entryProblemLine("entries.card.c_9: an entry for card \"c_9\", which no longer exists; it is kept, and not compiled", "orphan", words))
      .toBe("Probe: There are values for a card that isn't in the project any more. They're kept, but your game won't get them.");
  });

  it("takes the app's place for where a value is changed", () => {
    const s = valueProblemSentence("not-a-stage", '"act" is "gone", which is not one of its stages', { extension: "Probe", node: "the card “bell”", field: "act", place: "on its page", kindWord: (k) => k });
    expect(s).toEqual({ text: "act on the card “bell” is “gone”, which isn't one of its stages.", next: "Pick one on its page." });
  });

  it("words a pick's missing, ambiguous and clashing names", () => {
    const w = { extension: "Shot", node: "the line “Hello.”", field: "To", place: "in the inspector", kindWord: (k: string) => k };
    expect(valueProblemSentence("not-a-choice", '"to" is "Gaet", which is not one of its choices', w))
      .toEqual({ text: "To on the line “Hello.” is “Gaet”, which isn't one of its choices.", next: "Pick one in the inspector." });
    expect(valueProblemSentence("pick-ambiguous", '"to" is "Gate", which is a cast member and an entry of the list "pointsOfInterest"', w))
      .toEqual({ text: "To on the line “Hello.” is “Gate”, which is a cast member and an entry of the list “pointsOfInterest”, so it's ambiguous.", next: "Rename one of them." });
    expect(valueProblemSentence("pick-clash", '"Gate" is a cast member and an entry of the list "pointsOfInterest", so a value naming it is ambiguous', w))
      .toEqual({ text: "“Gate” is a cast member and an entry of the list “pointsOfInterest”, so To naming it is ambiguous.", next: "Rename one of them." });
  });

  it("leaves a shape or a code it does not know to the app", () => {
    expect(entryProblemLine("the manifest is broken", "required", words)).toBeUndefined();
    expect(entryProblemLine("entries.card.c_1.note: something new", "brand-new-code", words)).toBeUndefined();
  });
});

import { describe, expect, test } from "vitest";
import { extractAnswer } from "./parse.js";

const good = {
  status: "answered",
  answer: "The CLI wraps Copier.",
  citations: [{ path: "sources/platform-cli/platform-cli-mechanism.md", quote: "wraps Copier" }],
};

describe("extractAnswer", () => {
  test("parses a single fenced json block", () => {
    const text = "Here you go:\n```json\n" + JSON.stringify(good) + "\n```\n";
    expect(extractAnswer(text)).toEqual(good);
  });

  test("parses an unlabeled fence", () => {
    const text = "```\n" + JSON.stringify(good) + "\n```";
    expect(extractAnswer(text)).toEqual(good);
  });

  test("last valid fenced block wins", () => {
    const first = { ...good, answer: "draft" };
    const text =
      "```json\n" + JSON.stringify(first) + "\n```\nrevised:\n```json\n" + JSON.stringify(good) + "\n```";
    expect(extractAnswer(text)?.answer).toBe("The CLI wraps Copier.");
  });

  test("skips invalid blocks and keeps the valid one", () => {
    const text = "```json\n{not json\n```\n```json\n" + JSON.stringify(good) + "\n```";
    expect(extractAnswer(text)).toEqual(good);
  });

  test("falls back to bare JSON with no fence", () => {
    expect(extractAnswer(JSON.stringify(good))).toEqual(good);
  });

  test("accepts a no_match refusal", () => {
    const refusal = { status: "no_match", answer: null, citations: [] };
    expect(extractAnswer("```json\n" + JSON.stringify(refusal) + "\n```")).toEqual(refusal);
  });

  test.each([
    ["prose only", "I could not find an answer."],
    ["wrong status", "```json\n" + JSON.stringify({ ...good, status: "maybe" }) + "\n```"],
    ["citations not array", "```json\n" + JSON.stringify({ ...good, citations: "x" }) + "\n```"],
    ["citation missing quote", "```json\n" + JSON.stringify({ ...good, citations: [{ path: "a" }] }) + "\n```"],
    ["answer wrong type", "```json\n" + JSON.stringify({ ...good, answer: 7 }) + "\n```"],
  ])("returns null for %s", (_name, text) => {
    expect(extractAnswer(text)).toBeNull();
  });
});

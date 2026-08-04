import { describe, it, expect } from "vitest";
import { estimateTokens, estimateMessagesTokens } from "../src/tokens.js";

describe("estimateTokens", () => {
  it("returns 0 for empty input", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns a positive integer for non-empty input", () => {
    const n = estimateTokens("Hello, world!");
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThan(0);
  });

  it("grows with input length", () => {
    const short = estimateTokens("one two three");
    const long = estimateTokens("one two three four five six seven eight nine ten");
    expect(long).toBeGreaterThan(short);
  });

  it("lands in a sensible range for a known phrase", () => {
    // ~13 chars / ~2 words: heuristic should be a small single-digit count.
    const n = estimateTokens("Hello, world!");
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(6);
  });
});

describe("estimateMessagesTokens", () => {
  it("sums message content plus per-message overhead", () => {
    const messages = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi there." },
    ];
    const withOverhead = estimateMessagesTokens(messages, 4);
    const withoutOverhead = estimateMessagesTokens(messages, 0);
    expect(withOverhead).toBe(withoutOverhead + 4 * messages.length);
  });

  it("is zero for no messages", () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });
});

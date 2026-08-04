/**
 * A rough, dependency-free token estimator.
 *
 * This is a heuristic, not a real tokenizer. It blends a characters-per-token
 * estimate with a words-per-token estimate to land in a sensible range for
 * English prose and light code. Use it for quick budget checks and relative
 * comparisons — never for billing or hard context-window limits. For accurate
 * counts, call your provider's token-counting endpoint.
 *
 * @module tokens
 */

/** Average characters per token for typical English text (~4 is well established). */
const CHARS_PER_TOKEN = 4;

/** Average tokens per whitespace-delimited word. */
const TOKENS_PER_WORD = 1.3;

/**
 * Estimate the number of tokens in a piece of text.
 *
 * @param text - The text to measure.
 * @returns A non-negative integer estimate (0 for empty input).
 *
 * @example
 * estimateTokens("Hello, world!"); // ~4
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  const chars = text.length;
  const words = text.match(/\S+/g)?.length ?? 0;

  const charEstimate = chars / CHARS_PER_TOKEN;
  const wordEstimate = words * TOKENS_PER_WORD;

  // Average the two signals so neither dominates on unusual inputs
  // (long unbroken strings vs. many short words).
  return Math.max(1, Math.round((charEstimate + wordEstimate) / 2));
}

/** A chat-style message whose content contributes to the token estimate. */
export interface EstimableMessage {
  role: string;
  content: string;
}

/**
 * Estimate tokens across a list of messages, including a small per-message
 * overhead to approximate role/formatting framing.
 *
 * @param messages - The messages to measure.
 * @param perMessageOverhead - Tokens added per message (default 4).
 * @returns The total estimated token count.
 */
export function estimateMessagesTokens(
  messages: readonly EstimableMessage[],
  perMessageOverhead = 4,
): number {
  return messages.reduce(
    (total, message) =>
      total + estimateTokens(message.content) + perMessageOverhead,
    0,
  );
}

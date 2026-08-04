/**
 * A short end-to-end tour of the library.
 *
 * Run it without building the project:
 *   npx tsx examples/usage.ts
 *
 * It renders a template, estimates the prompt's token cost, and evaluates a
 * one-case suite against the offline MockRunner.
 */

import {
  render,
  estimateTokens,
  runSuite,
  MockRunner,
  type EvalSuite,
} from "../src/index.js";

// 1. Render a prompt from a template + variables + a partial.
const prompt = render(
  "Summarize this for {{ audience }}:\n{{ text }}\n{{> tone }}",
  {
    audience: "a busy executive",
    text: "The quarterly numbers are up 12% on strong retention.",
  },
  { partials: { tone: "Keep it to two sentences." } },
);

console.log("Rendered prompt:\n" + prompt + "\n");

// 2. Estimate how many tokens the prompt costs (rough heuristic).
console.log(`Estimated prompt tokens: ~${estimateTokens(prompt)}\n`);

// 3. Evaluate a tiny suite offline.
const suite: EvalSuite = {
  name: "usage-demo",
  cases: [
    {
      name: "mentions the audience",
      prompt,
      assertions: [{ type: "contains", value: "executive" }],
    },
  ],
};

const report = await runSuite(suite, new MockRunner());
console.log(`Eval: ${report.passed}/${report.total} cases passed.`);

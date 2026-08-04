/**
 * Plugging in a real Anthropic runner.
 *
 * `MockRunner` keeps the whole toolkit offline. To evaluate prompts against a
 * real model, implement the same {@link Runner} interface around the Anthropic
 * SDK — nothing else in the pipeline changes.
 *
 * Run it:
 *   npm install @anthropic-ai/sdk   # already a devDependency of this repo
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   npx tsx examples/anthropic-runner.ts
 *
 * Without a key set, it prints setup instructions and exits cleanly rather than
 * throwing, so the file is safe to open and read in any environment.
 */

import Anthropic from "@anthropic-ai/sdk";

import {
  runSuite,
  type EvalSuite,
  type Runner,
  type RunnerRequest,
  type RunnerResponse,
} from "../src/index.js";

/** The model to evaluate against. */
const MODEL = "claude-opus-4-8";

/** A {@link Runner} backed by the Anthropic Messages API. */
export class AnthropicRunner implements Runner {
  readonly name = "anthropic";

  // Reads ANTHROPIC_API_KEY from the environment.
  private readonly client = new Anthropic();

  async run(request: RunnerRequest): Promise<RunnerResponse> {
    const message = await this.client.messages.create({
      model: request.model ?? MODEL,
      max_tokens: request.maxTokens ?? 4096,
      // Let the model decide how much to reason per request; on Opus 4.x this
      // is the recommended setting and needs no token budget to tune.
      thinking: { type: "adaptive" },
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
    });

    // A response may contain thinking blocks alongside text; keep only text.
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      text,
      model: message.model,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    };
  }
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      "Set ANTHROPIC_API_KEY to run this example against a live model:\n" +
        "  export ANTHROPIC_API_KEY=sk-ant-...\n" +
        "  npx tsx examples/anthropic-runner.ts",
    );
    return;
  }

  const suite: EvalSuite = {
    name: "anthropic-demo",
    model: MODEL,
    cases: [
      {
        name: "answers a factual question as JSON",
        template:
          'Reply with only JSON of the form {{ shape }} for: what is the capital of {{ country }}?',
        vars: { shape: '{"capital": string}', country: "France" },
        assertions: [
          { type: "json-path", path: "capital", equals: "Paris" },
        ],
      },
    ],
  };

  const report = await runSuite(suite, new AnthropicRunner());
  console.log(`Eval: ${report.passed}/${report.total} cases passed.`);
  for (const c of report.cases) {
    console.log(`  ${c.passed ? "PASS" : "FAIL"}  ${c.name}`);
  }
}

await main();

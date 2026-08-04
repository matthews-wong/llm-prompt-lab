/**
 * The pluggable model-call abstraction.
 *
 * Every prompt in the toolkit is executed through a {@link Runner}. The library
 * ships with {@link MockRunner} so the whole pipeline — rendering, estimating,
 * and evaluating — runs offline and deterministically. To hit a real model,
 * implement `Runner` around your provider's SDK (see the README for an
 * Anthropic example).
 *
 * @module runner
 */

/** A single request to a model. */
export interface RunnerRequest {
  /** The fully-rendered user prompt. */
  prompt: string;
  /** Optional system prompt. */
  system?: string;
  /** Optional model identifier; the runner may fall back to its own default. */
  model?: string;
  /** Optional maximum output tokens hint. */
  maxTokens?: number;
}

/** Token accounting reported by a runner, when available. */
export interface RunnerUsage {
  inputTokens: number;
  outputTokens: number;
}

/** A single response from a model. */
export interface RunnerResponse {
  /** The model's text output. */
  text: string;
  /** The model that produced the output. */
  model: string;
  /** Token usage, if the runner tracks it. */
  usage?: RunnerUsage;
}

/**
 * The contract every model backend implements. Keep third-party SDKs behind
 * this seam so the rest of the toolkit never depends on a specific provider.
 */
export interface Runner {
  /** A short identifier used in reports and logs. */
  readonly name: string;
  /** Execute one request and resolve with the response. */
  run(request: RunnerRequest): Promise<RunnerResponse>;
}

/** A canned-response rule for {@link MockRunner}. */
export interface MockRule {
  /** Substring or pattern matched against the request prompt. */
  match: string | RegExp;
  /** The response text to return when the rule matches. */
  response: string;
}

/** Configuration for {@link MockRunner}. */
export interface MockRunnerOptions {
  /** Model name reported in responses (default `"mock-1"`). */
  model?: string;
  /** Ordered rules; the first whose `match` hits the prompt wins. */
  rules?: MockRule[];
  /** Used when no rule matches. Defaults to an echo of the prompt. */
  fallback?: string | ((request: RunnerRequest) => string);
}

function ruleMatches(match: string | RegExp, prompt: string): boolean {
  return typeof match === "string" ? prompt.includes(match) : match.test(prompt);
}

/**
 * A deterministic, offline {@link Runner}.
 *
 * With no options it echoes the prompt (prefixed with `[mock]`), except that a
 * prompt mentioning the word "json" yields a small valid JSON object — enough
 * to exercise every built-in assertion type without a network call. Provide
 * `rules` and/or a `fallback` to script exactly what it returns.
 *
 * @example
 * const runner = new MockRunner({
 *   rules: [{ match: /weather/i, response: "It is sunny." }],
 *   fallback: "I don't know.",
 * });
 */
export class MockRunner implements Runner {
  readonly name = "mock";

  private readonly model: string;
  private readonly rules: MockRule[];
  private readonly fallback: (request: RunnerRequest) => string;

  constructor(options: MockRunnerOptions = {}) {
    this.model = options.model ?? "mock-1";
    this.rules = options.rules ?? [];
    this.fallback =
      typeof options.fallback === "function"
        ? options.fallback
        : options.fallback !== undefined
          ? () => options.fallback as string
          : MockRunner.defaultFallback;
  }

  /** Default behavior: return JSON for "json" prompts, otherwise echo. */
  private static defaultFallback(request: RunnerRequest): string {
    if (/\bjson\b/i.test(request.prompt)) {
      return '{"status": "ok", "items": []}';
    }
    return `[mock] ${request.prompt}`;
  }

  async run(request: RunnerRequest): Promise<RunnerResponse> {
    const rule = this.rules.find((r) => ruleMatches(r.match, request.prompt));
    const text = rule ? rule.response : this.fallback(request);

    return {
      text,
      model: request.model ?? this.model,
      usage: {
        inputTokens: request.prompt.length,
        outputTokens: text.length,
      },
    };
  }
}

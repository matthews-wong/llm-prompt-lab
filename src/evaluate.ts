/**
 * A lightweight evaluation harness.
 *
 * Define a suite of cases — each a prompt (or a template plus variables) and a
 * set of assertions — then run it against any {@link Runner}. Assertions cover
 * substring checks, regular expressions, exact equality, and a small
 * "json-schema-ish" shape validator for structured outputs.
 *
 * @module evaluate
 */

import { render, type TemplateContext } from "./template.js";
import type { Runner } from "./runner.js";

/** A minimal, non-recursive shape description for structured-output checks. */
export interface JsonShape {
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  /** For `object`: expected property shapes. */
  properties?: Record<string, JsonShape>;
  /** For `object`: property names that must be present. */
  required?: string[];
  /** For `array`: the shape every item must satisfy. */
  items?: JsonShape;
}

/** One assertion applied to a runner's output. */
export type Assertion =
  | { type: "contains"; value: string; ignoreCase?: boolean }
  | { type: "not-contains"; value: string; ignoreCase?: boolean }
  | { type: "equals"; value: string; trim?: boolean }
  | { type: "regex"; pattern: string; flags?: string }
  | { type: "json-schema"; schema: JsonShape };

/** A single evaluation case. Provide either `prompt` or `template`. */
export interface EvalCase {
  name: string;
  /** A ready-to-send prompt. Mutually exclusive with `template`. */
  prompt?: string;
  /** A template rendered with `vars` (and suite `partials`) to form the prompt. */
  template?: string;
  /** Variables for `template`. */
  vars?: TemplateContext;
  /** Optional per-case system prompt. */
  system?: string;
  /** Optional per-case model override. */
  model?: string;
  /** The checks the output must satisfy. */
  assertions: Assertion[];
}

/** A collection of cases plus shared configuration. */
export interface EvalSuite {
  name: string;
  /** Default model for cases that do not set their own. */
  model?: string;
  /** Partials available to every case's template. */
  partials?: Record<string, string>;
  cases: EvalCase[];
}

/** The outcome of evaluating one assertion. */
export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  message: string;
}

/** The outcome of evaluating one case. */
export interface CaseResult {
  name: string;
  prompt: string;
  output: string;
  passed: boolean;
  assertions: AssertionResult[];
}

/** The outcome of evaluating a whole suite. */
export interface EvalReport {
  suite: string;
  runner: string;
  total: number;
  passed: number;
  failed: number;
  cases: CaseResult[];
}

/** Validate a parsed JSON value against a {@link JsonShape}. Returns error strings. */
export function validateShape(
  value: unknown,
  shape: JsonShape,
  path = "$",
): string[] {
  const typeOf = (v: unknown): JsonShape["type"] => {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    if (typeof v === "object") return "object";
    if (typeof v === "string") return "string";
    if (typeof v === "number") return "number";
    if (typeof v === "boolean") return "boolean";
    return "null";
  };

  const actual = typeOf(value);
  if (actual !== shape.type) {
    return [`${path}: expected ${shape.type}, got ${actual}`];
  }

  const errors: string[] = [];

  if (shape.type === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of shape.required ?? []) {
      if (!(key in obj)) errors.push(`${path}.${key}: required property missing`);
    }
    for (const [key, propShape] of Object.entries(shape.properties ?? {})) {
      if (key in obj) {
        errors.push(...validateShape(obj[key], propShape, `${path}.${key}`));
      }
    }
  }

  if (shape.type === "array" && shape.items) {
    (value as unknown[]).forEach((item, index) => {
      errors.push(...validateShape(item, shape.items as JsonShape, `${path}[${index}]`));
    });
  }

  return errors;
}

/** Evaluate a single assertion against a runner's output. */
export function checkAssertion(output: string, assertion: Assertion): AssertionResult {
  const pass = (message: string): AssertionResult => ({
    assertion,
    passed: true,
    message,
  });
  const fail = (message: string): AssertionResult => ({
    assertion,
    passed: false,
    message,
  });

  switch (assertion.type) {
    case "contains": {
      const haystack = assertion.ignoreCase ? output.toLowerCase() : output;
      const needle = assertion.ignoreCase
        ? assertion.value.toLowerCase()
        : assertion.value;
      return haystack.includes(needle)
        ? pass(`output contains "${assertion.value}"`)
        : fail(`output does not contain "${assertion.value}"`);
    }
    case "not-contains": {
      const haystack = assertion.ignoreCase ? output.toLowerCase() : output;
      const needle = assertion.ignoreCase
        ? assertion.value.toLowerCase()
        : assertion.value;
      return haystack.includes(needle)
        ? fail(`output unexpectedly contains "${assertion.value}"`)
        : pass(`output does not contain "${assertion.value}"`);
    }
    case "equals": {
      const left = assertion.trim ? output.trim() : output;
      const right = assertion.trim ? assertion.value.trim() : assertion.value;
      return left === right
        ? pass("output equals expected value")
        : fail(`output does not equal expected value`);
    }
    case "regex": {
      let re: RegExp;
      try {
        re = new RegExp(assertion.pattern, assertion.flags);
      } catch (error) {
        return fail(`invalid regex: ${(error as Error).message}`);
      }
      return re.test(output)
        ? pass(`output matches /${assertion.pattern}/${assertion.flags ?? ""}`)
        : fail(`output does not match /${assertion.pattern}/${assertion.flags ?? ""}`);
    }
    case "json-schema": {
      let parsed: unknown;
      try {
        parsed = JSON.parse(output);
      } catch {
        return fail("output is not valid JSON");
      }
      const errors = validateShape(parsed, assertion.schema);
      return errors.length === 0
        ? pass("output matches JSON shape")
        : fail(`schema mismatch: ${errors.join("; ")}`);
    }
  }
}

/** Build the prompt for a case, rendering its template when present. */
function resolvePrompt(evalCase: EvalCase, suite: EvalSuite): string {
  if (typeof evalCase.prompt === "string") return evalCase.prompt;
  if (typeof evalCase.template === "string") {
    return render(evalCase.template, evalCase.vars ?? {}, {
      partials: suite.partials,
    });
  }
  throw new Error(`Case "${evalCase.name}" must define either "prompt" or "template".`);
}

/** Run a single case against a runner. */
export async function runCase(
  evalCase: EvalCase,
  runner: Runner,
  suite: EvalSuite,
): Promise<CaseResult> {
  const prompt = resolvePrompt(evalCase, suite);
  const response = await runner.run({
    prompt,
    system: evalCase.system,
    model: evalCase.model ?? suite.model,
  });

  const assertions = evalCase.assertions.map((assertion) =>
    checkAssertion(response.text, assertion),
  );

  return {
    name: evalCase.name,
    prompt,
    output: response.text,
    passed: assertions.every((a) => a.passed),
    assertions,
  };
}

/**
 * Run an entire suite against a runner.
 *
 * @param suite - The suite to evaluate.
 * @param runner - The model backend (e.g. {@link MockRunner}).
 * @returns A structured report with per-case and per-assertion results.
 */
export async function runSuite(suite: EvalSuite, runner: Runner): Promise<EvalReport> {
  const cases: CaseResult[] = [];
  for (const evalCase of suite.cases) {
    cases.push(await runCase(evalCase, runner, suite));
  }

  const passed = cases.filter((c) => c.passed).length;

  return {
    suite: suite.name,
    runner: runner.name,
    total: cases.length,
    passed,
    failed: cases.length - passed,
    cases,
  };
}

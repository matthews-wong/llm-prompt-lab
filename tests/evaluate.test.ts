import { describe, it, expect } from "vitest";
import { MockRunner } from "../src/runner.js";
import {
  runSuite,
  checkAssertion,
  validateShape,
  type EvalSuite,
} from "../src/evaluate.js";

describe("MockRunner", () => {
  it("echoes the prompt by default", async () => {
    const runner = new MockRunner();
    const res = await runner.run({ prompt: "Hello there" });
    expect(res.text).toBe("[mock] Hello there");
    expect(res.model).toBe("mock-1");
    expect(res.usage?.outputTokens).toBe(res.text.length);
  });

  it("returns JSON for prompts mentioning json", async () => {
    const runner = new MockRunner();
    const res = await runner.run({ prompt: "Reply as json please" });
    expect(() => JSON.parse(res.text)).not.toThrow();
  });

  it("honors rules before the fallback", async () => {
    const runner = new MockRunner({
      rules: [{ match: /weather/i, response: "It is sunny." }],
      fallback: "no rule",
    });
    expect((await runner.run({ prompt: "how is the weather" })).text).toBe(
      "It is sunny.",
    );
    expect((await runner.run({ prompt: "something else" })).text).toBe("no rule");
  });
});

describe("checkAssertion", () => {
  it("handles contains / not-contains", () => {
    expect(checkAssertion("abc", { type: "contains", value: "b" }).passed).toBe(true);
    expect(
      checkAssertion("abc", { type: "contains", value: "B", ignoreCase: true }).passed,
    ).toBe(true);
    expect(
      checkAssertion("abc", { type: "not-contains", value: "z" }).passed,
    ).toBe(true);
  });

  it("handles equals with trim", () => {
    expect(
      checkAssertion("  hi  ", { type: "equals", value: "hi", trim: true }).passed,
    ).toBe(true);
    expect(checkAssertion("hi ", { type: "equals", value: "hi" }).passed).toBe(false);
  });

  it("handles regex", () => {
    expect(
      checkAssertion("order-123", { type: "regex", pattern: "\\d+" }).passed,
    ).toBe(true);
    expect(
      checkAssertion("no digits", { type: "regex", pattern: "\\d+" }).passed,
    ).toBe(false);
  });

  it("reports invalid regex as a failure, not a throw", () => {
    const result = checkAssertion("x", { type: "regex", pattern: "(" });
    expect(result.passed).toBe(false);
    expect(result.message).toContain("invalid regex");
  });

  it("validates json-schema shape", () => {
    const schema = {
      type: "object" as const,
      required: ["status"],
      properties: {
        status: { type: "string" as const },
        items: { type: "array" as const, items: { type: "number" as const } },
      },
    };
    expect(
      checkAssertion('{"status":"ok","items":[1,2]}', {
        type: "json-schema",
        schema,
      }).passed,
    ).toBe(true);
    expect(
      checkAssertion('{"items":[1]}', { type: "json-schema", schema }).passed,
    ).toBe(false);
    expect(
      checkAssertion("not json", { type: "json-schema", schema }).passed,
    ).toBe(false);
  });

  it("checks a json-path value with equals", () => {
    const output = '{"status":"ok","items":[{"id":1},{"id":2}]}';
    expect(
      checkAssertion(output, { type: "json-path", path: "status", equals: "ok" })
        .passed,
    ).toBe(true);
    expect(
      checkAssertion(output, { type: "json-path", path: "status", equals: "err" })
        .passed,
    ).toBe(false);
  });

  it("resolves json-path through arrays by numeric index", () => {
    const output = '{"items":[{"id":1},{"id":2}]}';
    expect(
      checkAssertion(output, { type: "json-path", path: "items.1.id", equals: 2 })
        .passed,
    ).toBe(true);
    expect(
      checkAssertion(output, {
        type: "json-path",
        path: "items.0",
        equals: { id: 1 },
      }).passed,
    ).toBe(true);
  });

  it("json-path without equals asserts only presence", () => {
    const output = '{"status":"ok","items":[]}';
    expect(
      checkAssertion(output, { type: "json-path", path: "items" }).passed,
    ).toBe(true);
    const missing = checkAssertion(output, {
      type: "json-path",
      path: "missing.deep",
    });
    expect(missing.passed).toBe(false);
    expect(missing.message).toContain("no value at path");
  });

  it("json-path treats a present null value as resolved", () => {
    const output = '{"error":null}';
    expect(
      checkAssertion(output, { type: "json-path", path: "error" }).passed,
    ).toBe(true);
    expect(
      checkAssertion(output, { type: "json-path", path: "error", equals: null })
        .passed,
    ).toBe(true);
  });

  it("json-path fails on non-JSON output", () => {
    const result = checkAssertion("plain text", {
      type: "json-path",
      path: "status",
    });
    expect(result.passed).toBe(false);
    expect(result.message).toContain("not valid JSON");
  });
});

describe("validateShape", () => {
  it("reports a type mismatch with a path", () => {
    const errors = validateShape(42, { type: "string" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("expected string");
  });

  it("recurses into array items", () => {
    const errors = validateShape([1, "two"], {
      type: "array",
      items: { type: "number" },
    });
    expect(errors.some((e) => e.includes("[1]"))).toBe(true);
  });
});

describe("runSuite", () => {
  it("runs template + prompt cases against the MockRunner", async () => {
    const suite: EvalSuite = {
      name: "demo",
      partials: { sig: "Regards, the team" },
      cases: [
        {
          name: "greeting renders and echoes",
          template: "Say hello to {{ name }}. {{> sig }}",
          vars: { name: "Ada" },
          assertions: [
            { type: "contains", value: "Ada" },
            { type: "contains", value: "Regards" },
          ],
        },
        {
          name: "json output validates",
          prompt: "Return the result as json",
          assertions: [
            {
              type: "json-schema",
              schema: {
                type: "object",
                required: ["status"],
                properties: { status: { type: "string" } },
              },
            },
          ],
        },
      ],
    };

    const report = await runSuite(suite, new MockRunner());
    expect(report.total).toBe(2);
    expect(report.passed).toBe(2);
    expect(report.failed).toBe(0);
  });

  it("marks a case failed when an assertion does not hold", async () => {
    const suite: EvalSuite = {
      name: "failing",
      cases: [
        {
          name: "expects text the mock will not produce",
          prompt: "hello",
          assertions: [{ type: "contains", value: "GOODBYE" }],
        },
      ],
    };
    const report = await runSuite(suite, new MockRunner());
    expect(report.failed).toBe(1);
    expect(report.cases[0]?.passed).toBe(false);
  });
});

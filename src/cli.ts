#!/usr/bin/env node
/**
 * Command-line interface for llm-prompt-lab.
 *
 * Commands:
 *   render <template-file>  Render a template with variables.
 *   eval   <suite-file>     Run an evaluation suite (JSON or YAML) offline.
 *
 * Everything runs through {@link MockRunner}, so the CLI works with no network
 * access and no API key.
 *
 * @module cli
 */

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";

import { render, type TemplateContext } from "./template.js";
import { MockRunner } from "./runner.js";
import { runSuite, type EvalSuite, type EvalReport } from "./evaluate.js";

const USAGE = `llm-prompt-lab — prompt template rendering and offline evaluation

Usage:
  llm-prompt-lab render <template-file> [--var key=value]... [--data data.json] [--partials partials.json]
  llm-prompt-lab eval   <suite-file> [--json]
  llm-prompt-lab help

Examples:
  llm-prompt-lab render examples/greeting.tmpl --var name=Ada --var language=English
  llm-prompt-lab eval examples/suite.json
`;

/** A parsed argv: positional args plus repeatable/scalar flags. */
interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
  vars: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const vars: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    const takesValue = next !== undefined && !next.startsWith("--");

    if (key === "var") {
      if (!takesValue) throw new Error("--var requires a key=value argument");
      vars.push(next!);
      i++;
    } else if (takesValue) {
      flags[key] = next!;
      i++;
    } else {
      flags[key] = true;
    }
  }

  return { positionals, flags, vars };
}

/** Merge `--var key=value` pairs and an optional `--data` JSON file into a context. */
function buildContext(args: ParsedArgs): TemplateContext {
  const context: TemplateContext = {};

  if (typeof args.flags.data === "string") {
    Object.assign(context, JSON.parse(readFileSync(args.flags.data, "utf8")));
  }

  for (const pair of args.vars) {
    const eq = pair.indexOf("=");
    if (eq === -1) throw new Error(`--var expects key=value, got "${pair}"`);
    context[pair.slice(0, eq)] = pair.slice(eq + 1);
  }

  return context;
}

function commandRender(args: ParsedArgs): number {
  const file = args.positionals[0];
  if (!file) {
    process.stderr.write("render: missing <template-file>\n\n" + USAGE);
    return 1;
  }

  const template = readFileSync(file, "utf8");
  const context = buildContext(args);
  const partials =
    typeof args.flags.partials === "string"
      ? JSON.parse(readFileSync(args.flags.partials, "utf8"))
      : undefined;

  process.stdout.write(render(template, context, { partials }) + "\n");
  return 0;
}

/** Load an eval suite from a `.json`, `.yaml`, or `.yml` file. */
function loadSuite(file: string): EvalSuite {
  const raw = readFileSync(file, "utf8");
  const ext = extname(file).toLowerCase();
  const parsed = ext === ".yaml" || ext === ".yml" ? parseYaml(raw) : JSON.parse(raw);
  return parsed as EvalSuite;
}

function printReport(report: EvalReport): void {
  const lines: string[] = [];
  lines.push(`Suite: ${report.suite}  (runner: ${report.runner})`);
  for (const c of report.cases) {
    lines.push(`  ${c.passed ? "PASS" : "FAIL"}  ${c.name}`);
    for (const a of c.assertions) {
      if (!a.passed) lines.push(`        - ${a.message}`);
    }
  }
  lines.push(`\n${report.passed}/${report.total} passed, ${report.failed} failed.`);
  process.stdout.write(lines.join("\n") + "\n");
}

async function commandEval(args: ParsedArgs): Promise<number> {
  const file = args.positionals[0];
  if (!file) {
    process.stderr.write("eval: missing <suite-file>\n\n" + USAGE);
    return 1;
  }

  const suite = loadSuite(file);
  const report = await runSuite(suite, new MockRunner());

  if (args.flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    printReport(report);
  }

  return report.failed === 0 ? 0 : 1;
}

/** Entry point. Returns a process exit code. */
export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);

  switch (command) {
    case "render":
      return commandRender(args);
    case "eval":
      return commandEval(args);
    case "help":
    case "--help":
    case "-h":
    case undefined:
      process.stdout.write(USAGE);
      return command === undefined ? 1 : 0;
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
      return 1;
  }
}

// Execute when run directly (not when imported by tests).
main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`Error: ${(error as Error).message}\n`);
    process.exitCode = 1;
  });

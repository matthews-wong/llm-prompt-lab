/**
 * llm-prompt-lab — a small prompt-engineering toolkit.
 *
 * Public entry point. Re-exports the template renderer, token estimator,
 * evaluation harness, and the pluggable runner interface (with the built-in
 * offline {@link MockRunner}).
 *
 * @packageDocumentation
 */

export {
  render,
  MissingVariableError,
  MissingPartialError,
  PartialCycleError,
  type RenderOptions,
  type TemplateContext,
} from "./template.js";

export {
  estimateTokens,
  estimateMessagesTokens,
  type EstimableMessage,
} from "./tokens.js";

export {
  MockRunner,
  type Runner,
  type RunnerRequest,
  type RunnerResponse,
  type RunnerUsage,
  type MockRule,
  type MockRunnerOptions,
} from "./runner.js";

export {
  runSuite,
  runCase,
  checkAssertion,
  validateShape,
  type Assertion,
  type JsonShape,
  type JsonValue,
  type EvalCase,
  type EvalSuite,
  type AssertionResult,
  type CaseResult,
  type EvalReport,
} from "./evaluate.js";

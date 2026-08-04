/**
 * Prompt template rendering with `{{ variable }}` interpolation and `{{> partial }}`
 * includes.
 *
 * The renderer is intentionally small: it supports dot-path variable lookup and
 * recursive partial expansion, and nothing else. Rendered variable values are
 * inserted verbatim and are never re-scanned for `{{ ... }}`, so a value cannot
 * inject further template syntax.
 *
 * @module template
 */

/** Thrown when a `{{ variable }}` has no matching value and `strict` is enabled. */
export class MissingVariableError extends Error {
  constructor(public readonly variable: string) {
    super(`Missing template variable: "${variable}"`);
    this.name = "MissingVariableError";
  }
}

/** Thrown when a `{{> partial }}` references a partial that was not provided. */
export class MissingPartialError extends Error {
  constructor(public readonly partial: string) {
    super(`Missing partial: "${partial}"`);
    this.name = "MissingPartialError";
  }
}

/** Thrown when partials reference each other in a cycle. */
export class PartialCycleError extends Error {
  constructor(public readonly partial: string) {
    super(`Partial cycle detected at: "${partial}"`);
    this.name = "PartialCycleError";
  }
}

/** Values that may be interpolated into a template. */
export type TemplateContext = Record<string, unknown>;

/** Options controlling {@link render}. */
export interface RenderOptions {
  /** Named partials that can be included with `{{> name }}`. */
  partials?: Record<string, string>;
  /**
   * When `true` (the default), a missing variable or partial throws. When
   * `false`, the offending tag is replaced with an empty string.
   */
  strict?: boolean;
}

const PARTIAL_RE = /\{\{\s*>\s*([\w.-]+)\s*\}\}/g;
const VARIABLE_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Resolve a dot path (e.g. `user.name`) against a context object. */
function lookup(context: TemplateContext, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, context);
}

/** Recursively inline `{{> partial }}` includes, guarding against cycles. */
function expandPartials(
  template: string,
  partials: Record<string, string>,
  strict: boolean,
  seen: ReadonlySet<string>,
): string {
  return template.replace(PARTIAL_RE, (_match, name: string) => {
    if (!(name in partials)) {
      if (strict) throw new MissingPartialError(name);
      return "";
    }
    if (seen.has(name)) throw new PartialCycleError(name);
    return expandPartials(
      partials[name] ?? "",
      partials,
      strict,
      new Set([...seen, name]),
    );
  });
}

/** Stringify a resolved value for insertion into the rendered output. */
function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Render a template string.
 *
 * Partials are expanded first, then `{{ variable }}` tags are substituted, so a
 * partial's own variables resolve against the same context.
 *
 * @param template - The template source.
 * @param context - Variable values, supporting dot-path keys.
 * @param options - Partials and strictness. `strict` defaults to `true`.
 * @returns The rendered string.
 * @throws {MissingVariableError} In strict mode, when a variable is absent.
 * @throws {MissingPartialError} In strict mode, when a partial is absent.
 * @throws {PartialCycleError} When partials form a cycle.
 *
 * @example
 * render("Hello {{ name }}!", { name: "World" }); // "Hello World!"
 */
export function render(
  template: string,
  context: TemplateContext = {},
  options: RenderOptions = {},
): string {
  const { partials = {}, strict = true } = options;

  const expanded = expandPartials(template, partials, strict, new Set());

  return expanded.replace(VARIABLE_RE, (_match, path: string) => {
    const value = lookup(context, path);
    if (value === undefined) {
      if (strict) throw new MissingVariableError(path);
      return "";
    }
    return stringify(value);
  });
}

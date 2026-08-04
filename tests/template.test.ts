import { describe, it, expect } from "vitest";
import {
  render,
  MissingVariableError,
  MissingPartialError,
  PartialCycleError,
} from "../src/template.js";

describe("render", () => {
  it("interpolates simple variables", () => {
    expect(render("Hello {{ name }}!", { name: "World" })).toBe("Hello World!");
  });

  it("tolerates missing whitespace inside tags", () => {
    expect(render("{{a}}-{{ b }}", { a: "1", b: "2" })).toBe("1-2");
  });

  it("resolves dot paths", () => {
    expect(render("{{ user.name }}", { user: { name: "Ada" } })).toBe("Ada");
  });

  it("stringifies non-string values", () => {
    expect(render("{{ n }}", { n: 42 })).toBe("42");
    expect(render("{{ obj }}", { obj: { a: 1 } })).toBe('{"a":1}');
  });

  it("expands partials and resolves their variables", () => {
    const out = render("{{> greeting }}, welcome.", {
      name: "Ada",
    }, {
      partials: { greeting: "Hello {{ name }}" },
    });
    expect(out).toBe("Hello Ada, welcome.");
  });

  it("expands nested partials", () => {
    const out = render("{{> outer }}", {}, {
      partials: { outer: "[{{> inner }}]", inner: "x" },
    });
    expect(out).toBe("[x]");
  });

  it("does not re-scan interpolated values for template syntax", () => {
    // A value containing {{ ... }} must be inserted verbatim, not re-rendered.
    const out = render("{{ payload }}", { payload: "{{ name }}" });
    expect(out).toBe("{{ name }}");
  });

  it("throws on a missing variable in strict mode (default)", () => {
    expect(() => render("{{ missing }}", {})).toThrow(MissingVariableError);
  });

  it("substitutes empty string for a missing variable when not strict", () => {
    expect(render("[{{ missing }}]", {}, { strict: false })).toBe("[]");
  });

  it("throws on a missing partial in strict mode", () => {
    expect(() => render("{{> nope }}", {})).toThrow(MissingPartialError);
  });

  it("detects partial cycles", () => {
    expect(() =>
      render("{{> a }}", {}, { partials: { a: "{{> b }}", b: "{{> a }}" } }),
    ).toThrow(PartialCycleError);
  });
});

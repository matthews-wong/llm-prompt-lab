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

  it("renders a present null value as an empty string even in strict mode", () => {
    // A present-but-null value is distinct from a missing one: it must not
    // throw in strict mode, and stringifies to "".
    expect(render("[{{ a }}]", { a: null })).toBe("[]");
  });

  it("treats a present-but-undefined value as missing in strict mode", () => {
    // A key whose value is `undefined` is indistinguishable from an absent
    // key, so strict mode throws just as it would for a missing variable.
    expect(() => render("{{ a }}", { a: undefined })).toThrow(MissingVariableError);
    // ...and lenient mode blanks it.
    expect(render("[{{ a }}]", { a: undefined }, { strict: false })).toBe("[]");
  });

  it("throws when a nested dot-path is missing in strict mode", () => {
    // `user` is absent, so `user.name` resolves to undefined and must throw.
    expect(() => render("{{ user.name }}", {})).toThrow(MissingVariableError);
  });

  it("throws on a missing partial in strict mode", () => {
    expect(() => render("{{> nope }}", {})).toThrow(MissingPartialError);
  });

  it("substitutes empty string for a missing partial when not strict", () => {
    expect(render("[{{> nope }}]", {}, { strict: false })).toBe("[]");
  });

  it("detects partial cycles", () => {
    expect(() =>
      render("{{> a }}", {}, { partials: { a: "{{> b }}", b: "{{> a }}" } }),
    ).toThrow(PartialCycleError);
  });
});

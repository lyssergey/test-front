import { describe, expect, it } from "vitest";

import type { FieldDef } from "@/lib/api/types";
import {
  arityOf,
  buildFilter,
  draftFromFilter,
  newCondition,
  newGroup,
  toFilterRows,
  validateCondition,
} from "@/lib/filter";

const FIELDS: FieldDef[] = [
  { name: "protocol", label: "Protocol", type: "enum", operators: ["eq"], example: "tls" },
  {
    name: "dst.ip",
    label: "Destination IP",
    type: "ip",
    operators: ["eq", "cidr", "exists"],
    example: "1.2.3.4",
  },
  {
    name: "dst.port",
    label: "Destination port",
    type: "port",
    operators: ["eq", "between"],
    example: "443",
  },
  {
    name: "risk.score",
    label: "Risk",
    type: "number",
    operators: ["gte", "between"],
    example: "70",
  },
  {
    name: "tls.ja3",
    label: "JA3",
    type: "ja3",
    operators: ["eq"],
    pattern: "^[0-9a-f]{32}$",
    example: "a".repeat(32),
  },
  {
    name: "host",
    label: "Host",
    type: "string",
    operators: ["eq", "glob", "in"],
    example: "*.example.net",
  },
];

const fieldMap = new Map(FIELDS.map((field) => [field.name, field]));

function condition(field: string, op: string, values: string[]) {
  return { ...newCondition(fieldMap.get(field)), field, op: op as never, values };
}

describe("arityOf", () => {
  it("follows the upstream arity rules", () => {
    expect(arityOf("exists")).toBe("none");
    expect(arityOf("in")).toBe("many");
    expect(arityOf("between")).toBe("two");
    expect(arityOf("eq")).toBe("one");
  });
});

describe("validateCondition", () => {
  it("requires exactly two bounds for between", () => {
    expect(
      validateCondition(condition("dst.port", "between", ["80"]), fieldMap.get("dst.port")),
    ).toMatch(/lower and an upper/);
    expect(
      validateCondition(condition("dst.port", "between", ["80", "443"]), fieldMap.get("dst.port")),
    ).toBeNull();
  });

  it("accepts exists with no value at all", () => {
    expect(
      validateCondition(condition("dst.ip", "exists", [""]), fieldMap.get("dst.ip")),
    ).toBeNull();
  });

  it("rejects an operator the field does not publish", () => {
    expect(
      validateCondition(condition("protocol", "glob", ["tl*"]), fieldMap.get("protocol")),
    ).toMatch(/does not support/);
  });

  it("enforces the field pattern", () => {
    expect(
      validateCondition(condition("tls.ja3", "eq", ["nope"]), fieldMap.get("tls.ja3")),
    ).toMatch(/does not match/);
    expect(
      validateCondition(condition("tls.ja3", "eq", ["b".repeat(32)]), fieldMap.get("tls.ja3")),
    ).toBeNull();
  });

  it("caps `in` at 50 values", () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `h${String(i)}`);
    expect(validateCondition(condition("host", "in", tooMany), fieldMap.get("host"))).toMatch(
      /At most 50/,
    );
  });
});

describe("buildFilter", () => {
  it("coerces numeric field types to numbers and leaves the rest as strings", () => {
    const draft = {
      ...newGroup("all"),
      children: [condition("dst.port", "eq", ["443"]), condition("protocol", "eq", ["tls"])],
    };
    const { filter } = buildFilter(draft, fieldMap);
    expect(filter).toEqual({
      all: [
        { field: "dst.port", op: "eq", value: 443 },
        { field: "protocol", op: "eq", value: "tls" },
      ],
    });
  });

  it("drops half-finished conditions and reports them", () => {
    const draft = {
      ...newGroup("all"),
      children: [condition("protocol", "eq", ["tls"]), condition("dst.port", "between", ["80"])],
    };
    const { filter, skipped } = buildFilter(draft, fieldMap);
    expect(filter).toEqual({ field: "protocol", op: "eq", value: "tls" });
    expect(skipped).toHaveLength(1);
  });

  it("returns a match-everything filter when nothing is filled in", () => {
    expect(buildFilter(newGroup("all"), fieldMap).filter).toEqual({ all: [] });
  });

  it("wraps a negated group in `not`", () => {
    const draft = {
      ...newGroup("all"),
      negated: true,
      children: [condition("protocol", "eq", ["dns"])],
    };
    expect(buildFilter(draft, fieldMap).filter).toEqual({
      not: { field: "protocol", op: "eq", value: "dns" },
    });
  });

  it("nests groups", () => {
    const inner = {
      ...newGroup("any"),
      children: [condition("protocol", "eq", ["dns"]), condition("protocol", "eq", ["tls"])],
    };
    const draft = { ...newGroup("all"), children: [condition("risk.score", "gte", ["70"]), inner] };
    expect(buildFilter(draft, fieldMap).filter).toEqual({
      all: [
        { field: "risk.score", op: "gte", value: 70 },
        {
          any: [
            { field: "protocol", op: "eq", value: "dns" },
            { field: "protocol", op: "eq", value: "tls" },
          ],
        },
      ],
    });
  });

  it("emits `values` for in and between, never `value`", () => {
    const draft = {
      ...newGroup("all"),
      children: [
        condition("host", "in", ["a.example", "b.example"]),
        condition("dst.port", "between", ["80", "443"]),
      ],
    };
    expect(buildFilter(draft, fieldMap).filter).toEqual({
      all: [
        { field: "host", op: "in", values: ["a.example", "b.example"] },
        { field: "dst.port", op: "between", values: [80, 443] },
      ],
    });
  });

  it("omits both value and values for exists", () => {
    const draft = { ...newGroup("all"), children: [condition("dst.ip", "exists", [""])] };
    expect(buildFilter(draft, fieldMap).filter).toEqual({ field: "dst.ip", op: "exists" });
  });
});

describe("draftFromFilter", () => {
  it("round-trips a filter through the builder state", () => {
    const filter = {
      all: [
        { field: "protocol", op: "eq" as const, value: "tls" },
        {
          any: [
            { field: "dst.port", op: "eq" as const, value: 443 },
            { field: "dst.ip", op: "exists" as const },
          ],
        },
      ],
    };
    expect(buildFilter(draftFromFilter(filter), fieldMap).filter).toEqual(filter);
  });
});

describe("toFilterRows", () => {
  it("renders AND-ed conditions as `field:op:values` rows", () => {
    expect(
      toFilterRows({
        all: [
          { field: "protocol", op: "eq", value: "tls" },
          { field: "dst.port", op: "between", values: [80, 443] },
        ],
      }),
    ).toEqual(["protocol:eq:tls", "dst.port:between:80,443"]);
  });

  it("has no equivalent for any/not, which the histogram endpoint cannot express", () => {
    expect(toFilterRows({ any: [{ field: "protocol", op: "eq", value: "tls" }] })).toBeNull();
    expect(toFilterRows({ not: { field: "protocol", op: "eq", value: "tls" } })).toBeNull();
  });
});

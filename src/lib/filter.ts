import type { FieldDef, FilterCond, FilterNode, FilterOp, Scalar } from "@/lib/api/types";

export type Arity = "none" | "one" | "two" | "many";

/** Upstream rule: `in` takes 1-50 values, `between` exactly 2, `exists` none, the rest one. */
export function arityOf(op: FilterOp): Arity {
  switch (op) {
    case "exists":
      return "none";
    case "in":
      return "many";
    case "between":
      return "two";
    default:
      return "one";
  }
}

export interface ConditionDraft {
  kind: "condition";
  id: string;
  field: string;
  op: FilterOp;
  /** Raw text as typed; coerced to a Scalar only when the filter is built. */
  values: string[];
}

export interface GroupDraft {
  kind: "group";
  id: string;
  mode: "all" | "any";
  negated: boolean;
  children: FilterDraft[];
}

export type FilterDraft = ConditionDraft | GroupDraft;

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter)}`;
}

export function newCondition(field?: FieldDef): ConditionDraft {
  return {
    kind: "condition",
    id: nextId("c"),
    field: field?.name ?? "",
    op: field?.operators[0] ?? "eq",
    values: [""],
  };
}

export function newGroup(mode: "all" | "any" = "all"): GroupDraft {
  return { kind: "group", id: nextId("g"), mode, negated: false, children: [] };
}

export function emptyFilter(): GroupDraft {
  return newGroup("all");
}

const NUMERIC_TYPES = new Set(["port", "number", "bytes", "duration_ms"]);

export function coerceValue(field: FieldDef | undefined, raw: string): Scalar {
  const text = raw.trim();
  if (field && NUMERIC_TYPES.has(field.type)) {
    const n = Number(text);
    return Number.isFinite(n) ? n : text;
  }
  return text;
}

/** Why this condition cannot be sent, or `null` when it can. */
export function validateCondition(
  condition: ConditionDraft,
  field: FieldDef | undefined,
): string | null {
  if (!condition.field) return "Pick a field";
  if (!field) return `Unknown field "${condition.field}"`;
  if (!field.operators.includes(condition.op)) {
    return `${field.label} does not support "${condition.op}"`;
  }

  const filled = condition.values.map((v) => v.trim()).filter((v) => v !== "");
  switch (arityOf(condition.op)) {
    case "none":
      return null;
    case "one":
      if (filled.length !== 1) return "Needs a value";
      break;
    case "two":
      if (filled.length !== 2) return "Needs a lower and an upper bound";
      break;
    case "many":
      if (filled.length < 1) return "Needs at least one value";
      if (filled.length > 50) return "At most 50 values";
      break;
  }

  if (field.pattern) {
    const re = new RegExp(field.pattern);
    const bad = filled.find((v) => !re.test(v));
    if (bad !== undefined) return `"${bad}" does not match ${field.pattern}`;
  }
  if (NUMERIC_TYPES.has(field.type)) {
    const bad = filled.find((v) => !Number.isFinite(Number(v)));
    if (bad !== undefined) return `"${bad}" is not a number`;
  }
  return null;
}

function conditionToNode(
  condition: ConditionDraft,
  field: FieldDef | undefined,
): FilterCond | null {
  if (validateCondition(condition, field) !== null) return null;
  const filled = condition.values.map((v) => v.trim()).filter((v) => v !== "");

  switch (arityOf(condition.op)) {
    case "none":
      return { field: condition.field, op: condition.op };
    case "one":
      return { field: condition.field, op: condition.op, value: coerceValue(field, filled[0]!) };
    default:
      return {
        field: condition.field,
        op: condition.op,
        values: filled.map((v) => coerceValue(field, v)),
      };
  }
}

export interface BuiltFilter {
  filter: FilterNode;
  /** Conditions dropped for being incomplete, with the reason. */
  skipped: { id: string; reason: string }[];
}

/** Builds the API filter, ignoring half-finished rows so the form stays usable while typing. */
export function buildFilter(draft: GroupDraft, fields: Map<string, FieldDef>): BuiltFilter {
  const skipped: BuiltFilter["skipped"] = [];

  function walk(node: FilterDraft): FilterNode | null {
    if (node.kind === "condition") {
      const field = fields.get(node.field);
      const reason = validateCondition(node, field);
      if (reason !== null) {
        if (node.field !== "" || node.values.some((v) => v.trim() !== "")) {
          skipped.push({ id: node.id, reason });
        }
        return null;
      }
      return conditionToNode(node, field);
    }

    const children = node.children.map(walk).filter((n): n is FilterNode => n !== null);
    if (children.length === 0) return null;
    const inner: FilterNode =
      children.length === 1
        ? children[0]!
        : node.mode === "all"
          ? { all: children }
          : { any: children };
    return node.negated ? { not: inner } : inner;
  }

  return { filter: walk(draft) ?? { all: [] }, skipped };
}

/** Rebuilds a draft from a filter, so a shared URL reopens the form it was built in. */
export function draftFromFilter(node: FilterNode): GroupDraft {
  function walk(n: FilterNode): FilterDraft {
    if ("all" in n || "any" in n) {
      const mode = "all" in n ? "all" : "any";
      const children = ("all" in n ? n.all : n.any).map(walk);
      return { kind: "group", id: nextId("g"), mode, negated: false, children };
    }
    if ("not" in n) {
      const inner = walk(n.not);
      if (inner.kind === "group") return { ...inner, negated: !inner.negated };
      return { kind: "group", id: nextId("g"), mode: "all", negated: true, children: [inner] };
    }
    const values =
      n.values !== undefined
        ? n.values.map(String)
        : n.value !== undefined
          ? [String(n.value)]
          : [""];
    return { kind: "condition", id: nextId("c"), field: n.field, op: n.op, values };
  }

  const root = walk(node);
  return root.kind === "group" ? root : { ...newGroup("all"), children: [root] };
}

export function countConditions(draft: FilterDraft): number {
  return draft.kind === "condition"
    ? 1
    : draft.children.reduce((total, child) => total + countConditions(child), 0);
}

/** Those endpoints take only AND-ed rows, so `any` / `not` / nesting has no equivalent. */
export function toFilterRows(filter: FilterNode): string[] | null {
  const conditions: FilterCond[] = [];

  function walk(node: FilterNode): boolean {
    if ("any" in node || "not" in node) return false;
    if ("all" in node) return node.all.every(walk);
    conditions.push(node);
    return true;
  }

  if (!walk(filter)) return null;
  return conditions.map((c) => {
    const values = c.values ?? (c.value !== undefined ? [c.value] : []);
    return `${c.field}:${c.op}:${values.join(",")}`;
  });
}

export function describeFilter(filter: FilterNode): string {
  if ("all" in filter) {
    return filter.all.length === 0 ? "everything" : filter.all.map(describeFilter).join(" and ");
  }
  if ("any" in filter) return `(${filter.any.map(describeFilter).join(" or ")})`;
  if ("not" in filter) return `not ${describeFilter(filter.not)}`;
  if (filter.op === "exists") return `${filter.field} exists`;
  const values = filter.values ?? (filter.value !== undefined ? [filter.value] : []);
  return `${filter.field} ${filter.op} ${values.join(", ")}`;
}

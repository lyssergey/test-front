import type { ProtocolSchema, SchemaField } from "@/lib/api/types";

import { parsePath, readPath } from "./paths";

export interface ViewField {
  path: string;
  title: string;
  type: string;
  unit?: string;
  sensitive: boolean;
}

export interface FieldEntry extends ViewField {
  /** One value, or several when the path ends in an array step (`tls.alpn[]`). */
  values: unknown[];
  isList: boolean;
}

export interface FieldsSection {
  kind: "fields";
  key: string;
  title: string;
  entries: FieldEntry[];
}

export interface TableSection {
  kind: "table";
  key: string;
  title: string;
  columns: ViewField[];
  /** Row-major; a cell is `undefined` when that item omits the field. */
  rows: unknown[][];
}

export type ViewSection = FieldsSection | TableSection;

export interface SchemaView {
  sections: ViewSection[];
  /** Keys present in the payload that the schema does not publish. */
  undocumented: { key: string; value: unknown }[];
  /** Published keys whose payload has another shape: v1 `dns.rcode: "0"` vs `dns.rcode.code`. */
  mismatched: { key: string; value: unknown }[];
}

function humanize(segment: string): string {
  const words = segment.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function toViewField(field: SchemaField): ViewField {
  const view: ViewField = {
    path: field.path,
    title: field.title,
    type: field.type,
    sensitive: field.sensitive === true,
  };
  if (field.unit !== undefined) view.unit = field.unit;
  return view;
}

/** Scalars become definition lists, repeated objects become tables. */
export function buildSchemaView(
  decoded: Record<string, unknown>,
  schema: ProtocolSchema,
): SchemaView {
  const sections: ViewSection[] = [];
  const byKey = new Map<string, ViewSection>();

  const section = <T extends ViewSection>(candidate: T): T => {
    const existing = byKey.get(candidate.key);
    if (existing) return existing as T;
    byKey.set(candidate.key, candidate);
    sections.push(candidate);
    return candidate;
  };

  for (const field of schema.fields) {
    const segments = parsePath(field.path);
    const arrayAt = segments.findIndex((segment) => segment.isArray);
    const isObjectArray = arrayAt !== -1 && arrayAt < segments.length - 1;

    if (isObjectArray) {
      const tablePath = segments
        .slice(0, arrayAt + 1)
        .map((segment) => (segment.isArray ? `${segment.key}[]` : segment.key))
        .join(".");
      const relative = segments
        .slice(arrayAt + 1)
        .map((segment) => (segment.isArray ? `${segment.key}[]` : segment.key))
        .join(".");
      const table = section<TableSection>({
        kind: "table",
        key: tablePath,
        title: humanize(segments[arrayAt]!.key),
        columns: [],
        rows: [],
      });
      if (table.kind === "table") {
        table.columns.push({ ...toViewField(field), path: relative });
      }
      continue;
    }

    const parentKey = segments
      .slice(0, -1)
      .map((segment) => segment.key)
      .join(".");
    const parentSegment = segments.at(-2);
    const fields = section<FieldsSection>({
      kind: "fields",
      key: parentKey,
      title: segments.length <= 2 ? "General" : humanize(parentSegment?.key ?? ""),
      entries: [],
    });
    if (fields.kind === "fields") {
      const values = readPath(decoded, field.path);
      fields.entries.push({
        ...toViewField(field),
        values,
        isList: arrayAt === segments.length - 1,
      });
    }
  }

  for (const current of sections) {
    if (current.kind !== "table") continue;
    const items = readPath(decoded, current.key);
    current.rows = items.map((item) =>
      current.columns.map((column) => readPath(item, column.path)[0]),
    );
  }

  return {
    sections: sections.filter(isNotEmpty),
    ...splitUnmatched(decoded, schema),
  };
}

function isNotEmpty(current: ViewSection): boolean {
  return current.kind === "table"
    ? current.rows.length > 0
    : current.entries.some((entry) => entry.values.length > 0);
}

/** An empty array or object is missing data, not a different shape. */
function isEmptyish(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function splitUnmatched(
  decoded: Record<string, unknown>,
  schema: ProtocolSchema,
): Pick<SchemaView, "undocumented" | "mismatched"> {
  const root = decoded[schema.protocol];
  if (typeof root !== "object" || root === null) return { undocumented: [], mismatched: [] };

  const pathsByKey = new Map<string, string[]>();
  for (const field of schema.fields) {
    const key = parsePath(field.path)[1]?.key;
    if (key === undefined) continue;
    pathsByKey.set(key, [...(pathsByKey.get(key) ?? []), field.path]);
  }

  const undocumented: { key: string; value: unknown }[] = [];
  const mismatched: { key: string; value: unknown }[] = [];

  for (const [key, value] of Object.entries(root as Record<string, unknown>)) {
    const paths = pathsByKey.get(key);
    if (paths === undefined) {
      undocumented.push({ key, value });
    } else if (!isEmptyish(value) && paths.every((path) => readPath(decoded, path).length === 0)) {
      mismatched.push({ key, value });
    }
  }

  return { undocumented, mismatched };
}

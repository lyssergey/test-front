/** Reading `decoded` payloads by the dotted paths `/v1/meta/schema/{protocol}` publishes. */

export interface PathSegment {
  key: string;
  /** The schema writes an array step as `name[]`. */
  isArray: boolean;
}

export function parsePath(path: string): PathSegment[] {
  return path.split(".").map((raw) => {
    const isArray = raw.endsWith("[]");
    return { key: isArray ? raw.slice(0, -2) : raw, isArray };
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** v1 emits a lone object where v2 emits a one-element array (`dns.authority`). */
export function toArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Every value at `path`. An array step multiplies the results; absent yields `[]`. */
export function readPath(root: unknown, path: string): unknown[] {
  let current: unknown[] = [root];

  for (const segment of parsePath(path)) {
    const next: unknown[] = [];
    for (const item of current) {
      const container = asRecord(item)?.[segment.key];
      if (container === undefined) continue;
      if (segment.isArray) next.push(...toArray(container));
      else next.push(container);
    }
    current = next;
  }

  return current.filter((value) => value !== undefined);
}

export function readOne(root: unknown, path: string): unknown {
  return readPath(root, path)[0];
}

/** v1 sends numbers as strings (`status: "200"`, `ttl: "3600"`). */
export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

import { asBoolean, asNumber, asString, toArray } from "./paths";

export interface HttpHeader {
  name: string;
  value: string;
}

export interface HttpBody {
  length?: number;
  contentType?: string;
  preview?: string;
  truncated?: boolean;
}

export interface HttpTransaction {
  method?: string;
  host?: string;
  path?: string;
  version?: string;
  status?: number;
  userAgent?: string;
  requestHeaders: HttpHeader[];
  responseHeaders: HttpHeader[];
  requestBody: HttpBody;
  responseBody: HttpBody;
  fileIds: string[];
  /** Keys the schema does not publish, e.g. `x_forwarded_for` on the v2 decoder. */
  extras: HttpHeader[];
}

/** v2 sends `[{name, value}]`, v1 sends `{name: value}`. */
export function normalizeHeaders(raw: unknown): HttpHeader[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((entry) => {
      const name = asString((entry as Record<string, unknown> | null)?.name);
      if (name === undefined) return [];
      return [{ name, value: asString((entry as Record<string, unknown>).value) ?? "" }];
    });
  }
  if (typeof raw === "object" && raw !== null) {
    return Object.entries(raw as Record<string, unknown>).map(([name, value]) => ({
      name,
      value: asString(value) ?? "",
    }));
  }
  return [];
}

function normalizeBody(raw: unknown): HttpBody {
  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const body: HttpBody = {};
  const length = asNumber(record.length);
  if (length !== undefined) body.length = length;
  const contentType = asString(record.content_type);
  if (contentType !== undefined && contentType !== "") body.contentType = contentType;
  const preview = asString(record.preview);
  if (preview !== undefined && preview !== "") body.preview = preview;
  const truncated = asBoolean(record.truncated);
  if (truncated !== undefined) body.truncated = truncated;
  return body;
}

const KNOWN_KEYS = new Set([
  "method",
  "host",
  "path",
  "version",
  "status",
  "user_agent",
  "request_headers",
  "response_headers",
  "request_body",
  "response_body",
  "file_ids",
]);

export function normalizeHttp(decoded: Record<string, unknown>): HttpTransaction | null {
  const raw = decoded.http;
  if (typeof raw !== "object" || raw === null) return null;
  const http = raw as Record<string, unknown>;

  const transaction: HttpTransaction = {
    requestHeaders: normalizeHeaders(http.request_headers),
    responseHeaders: normalizeHeaders(http.response_headers),
    requestBody: normalizeBody(http.request_body),
    responseBody: normalizeBody(http.response_body),
    fileIds: toArray(http.file_ids).flatMap((id) => {
      const value = asString(id);
      return value === undefined ? [] : [value];
    }),
    extras: Object.entries(http)
      .filter(([key]) => !KNOWN_KEYS.has(key))
      .map(([name, value]) => ({
        name,
        value: asString(value) ?? JSON.stringify(value),
      })),
  };

  const method = asString(http.method);
  if (method !== undefined) transaction.method = method;
  const host = asString(http.host);
  if (host !== undefined) transaction.host = host;
  const path = asString(http.path);
  if (path !== undefined) transaction.path = path;
  const version = asString(http.version);
  if (version !== undefined) transaction.version = version;
  const status = asNumber(http.status);
  if (status !== undefined) transaction.status = status;
  const userAgent =
    asString(http.user_agent) ?? headerValue(transaction.requestHeaders, "user-agent");
  if (userAgent !== undefined) transaction.userAgent = userAgent;

  return transaction;
}

export function headerValue(headers: HttpHeader[], name: string): string | undefined {
  const lower = name.toLowerCase();
  return headers.find((header) => header.name.toLowerCase() === lower)?.value;
}

export function statusClass(
  status: number | undefined,
): "ok" | "redirect" | "warn" | "error" | "unknown" {
  if (status === undefined) return "unknown";
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  if (status >= 300) return "redirect";
  if (status >= 200) return "ok";
  return "unknown";
}

/** Body previews arrive as hex; anything else is shown as text. */
export function isHexPreview(preview: string): boolean {
  return preview.length >= 32 && preview.length % 2 === 0 && /^[0-9a-f]+$/.test(preview);
}

export function requestLine(transaction: HttpTransaction): string {
  const method = transaction.method ?? "?";
  const path = transaction.path ?? "/";
  const version = transaction.version ?? "";
  return `${method} ${path} ${version}`.trim();
}

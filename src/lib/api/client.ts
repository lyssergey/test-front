export interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  /** Extra machine-readable context the error envelope carried. */
  readonly context: Record<string, unknown>;
  /** Populated for FastAPI's 422, whose `detail` is a list rather than a string. */
  readonly issues: ValidationIssue[];
  readonly retryAfterSeconds?: number;

  constructor(init: {
    status: number;
    code: string;
    detail: string;
    context?: Record<string, unknown>;
    issues?: ValidationIssue[];
    retryAfterSeconds?: number;
  }) {
    super(init.detail);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.detail = init.detail;
    this.context = init.context ?? {};
    this.issues = init.issues ?? [];
    if (init.retryAfterSeconds !== undefined) this.retryAfterSeconds = init.retryAfterSeconds;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  // /v1/auth/login answers an HTTP-date instead.
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.round((at - Date.now()) / 1000));
}

async function toApiError(response: Response): Promise<ApiError> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not every failure has a JSON body (a 502 from the proxy, an aborted stream).
  }

  const base = {
    status: response.status,
    retryAfterSeconds,
  } satisfies Partial<ConstructorParameters<typeof ApiError>[0]> & { status: number };

  if (typeof body !== "object" || body === null) {
    return new ApiError({
      ...base,
      code: "http_error",
      detail: `Request failed (${String(response.status)})`,
    });
  }

  const record = body as Record<string, unknown>;

  if (Array.isArray(record.detail)) {
    const issues = record.detail as ValidationIssue[];
    return new ApiError({
      ...base,
      code: "validation_error",
      detail: issues.map((i) => `${i.loc.join(".")}: ${i.msg}`).join("; ") || "Invalid request",
      issues,
    });
  }

  const { detail, code, ...context } = record;
  return new ApiError({
    ...base,
    code: typeof code === "string" ? code : "http_error",
    detail: typeof detail === "string" ? detail : `Request failed (${String(response.status)})`,
    context,
  });
}

export interface CaptureFetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Calls the API through this app's proxy. `path` is the upstream path, e.g. `v1/sensors`. */
export async function captureFetch<T>(path: string, options: CaptureFetchOptions = {}): Promise<T> {
  const { method = "GET", body, headers, signal } = options;
  const response = await fetch(`/api/capture/${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

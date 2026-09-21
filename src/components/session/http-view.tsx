"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import type { CarvedFile, ProtocolSchema } from "@/lib/api/types";
import {
  type HttpBody,
  type HttpHeader,
  isHexPreview,
  normalizeHttp,
  requestLine,
  statusClass,
} from "@/lib/decoded/http";
import { formatBytes } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { CopyButton } from "@/components/ui/copy";

import { SensitiveValue } from "./sensitive";

const STATUS_TONE = {
  ok: "low",
  redirect: "info",
  warn: "medium",
  error: "high",
  unknown: "neutral",
} as const;

/** Reads both decoders: v2 sends header arrays and numbers, v1 a header map and strings. */
export function HttpView({
  decoded,
  schema,
  files,
}: {
  decoded: Record<string, unknown>;
  schema: ProtocolSchema | undefined;
  files: CarvedFile[];
}) {
  const http = normalizeHttp(decoded);
  if (!http) {
    return <p className="text-ink-faint p-3 text-xs">This session carries no decoded HTTP.</p>;
  }

  const sensitiveHeaders =
    schema?.fields.some(
      (field) => field.path === "http.request_headers[].value" && field.sensitive === true,
    ) ?? true;

  return (
    <div data-testid="http-view" className="grid gap-3 p-3 lg:grid-cols-2">
      <Exchange
        direction="request"
        title={requestLine(http)}
        subtitle={http.host}
        headers={http.requestHeaders}
        body={http.requestBody}
        sensitiveHeaders={sensitiveHeaders}
        files={files.filter((file) => http.fileIds.includes(file.id))}
      />
      <Exchange
        direction="response"
        title={http.status === undefined ? "No response decoded" : `HTTP ${String(http.status)}`}
        status={http.status}
        headers={http.responseHeaders}
        body={http.responseBody}
        sensitiveHeaders={sensitiveHeaders}
        files={files.filter((file) => http.fileIds.includes(file.id))}
      />

      {http.extras.length > 0 ? (
        <section className="lg:col-span-2">
          <h3 className="text-2xs text-medium mb-1 tracking-wide uppercase">
            Not in the schema ({http.extras.length})
          </h3>
          <dl className="grid grid-cols-[minmax(8rem,12rem)_1fr] gap-x-3 gap-y-1 text-xs">
            {http.extras.map((extra) => (
              <div key={extra.name} className="col-span-2 grid grid-cols-subgrid">
                <dt className="text-ink-faint font-mono">{extra.name}</dt>
                <dd className="text-ink break-all">{extra.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function Exchange({
  direction,
  title,
  subtitle,
  status,
  headers,
  body,
  sensitiveHeaders,
  files,
}: {
  direction: "request" | "response";
  title: string;
  subtitle?: string;
  status?: number;
  headers: HttpHeader[];
  body: HttpBody;
  sensitiveHeaders: boolean;
  files: CarvedFile[];
}) {
  const Icon = direction === "request" ? ArrowUp : ArrowDown;
  const [revealAll, setRevealAll] = useState(false);
  const masked = sensitiveHeaders && !revealAll;

  return (
    <section className="border-line min-w-0 rounded border">
      <header className="border-line bg-surface-2 flex items-center gap-2 border-b px-2.5 py-1.5">
        <Icon className="text-ink-faint size-3.5 shrink-0" />
        <span className="text-ink truncate font-mono text-xs">{title}</span>
        {status !== undefined ? (
          <Badge tone={STATUS_TONE[statusClass(status)]}>{status}</Badge>
        ) : null}
        {subtitle !== undefined ? (
          <span className="text-2xs text-ink-faint ml-auto truncate">{subtitle}</span>
        ) : null}
        {sensitiveHeaders && headers.length > 0 ? (
          <button
            type="button"
            onClick={() => setRevealAll(!revealAll)}
            className={cn(
              "text-2xs text-ink-faint hover:text-ink inline-flex shrink-0 items-center gap-1",
              subtitle === undefined && "ml-auto",
            )}
          >
            {revealAll ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            {revealAll ? "hide headers" : "reveal headers"}
          </button>
        ) : null}
      </header>

      <div className="divide-line divide-y">
        <dl className="grid grid-cols-[minmax(7rem,11rem)_1fr] gap-x-3 gap-y-0.5 p-2.5 text-xs">
          {headers.length === 0 ? (
            <span className="text-ink-faint col-span-2">No headers decoded.</span>
          ) : (
            headers.map((header, index) => (
              <div
                key={`${header.name}-${String(index)}`}
                className="col-span-2 grid grid-cols-subgrid items-baseline"
              >
                <dt className="text-ink-faint truncate font-mono" title={header.name}>
                  {header.name}
                </dt>
                <dd className="text-ink min-w-0 font-mono">
                  {masked ? (
                    <SensitiveValue value={header.value} />
                  ) : (
                    <span className="break-all">{header.value}</span>
                  )}
                </dd>
              </div>
            ))
          )}
        </dl>

        <BodyBlock body={body} />

        {files.length > 0 ? (
          <div className="p-2.5">
            <h4 className="text-2xs text-ink-faint mb-1 tracking-wide uppercase">
              Carved from this body
            </h4>
            <ul className="space-y-0.5 text-xs">
              {files.map((file) => (
                <li key={file.id} className="text-ink truncate">
                  {file.name} <span className="text-ink-faint">· {formatBytes(file.size)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function BodyBlock({ body }: { body: HttpBody }) {
  const hasContent = body.length !== undefined || body.preview !== undefined;
  if (!hasContent) return <p className="text-2xs text-ink-faint p-2.5">No body.</p>;

  return (
    <div className="p-2.5">
      <div className="text-2xs text-ink-faint mb-1 flex items-center gap-2">
        <span className="tracking-wide uppercase">Body</span>
        {body.length !== undefined ? (
          <span className="tabular">{formatBytes(body.length)}</span>
        ) : null}
        {body.contentType !== undefined ? (
          <span className="font-mono">{body.contentType}</span>
        ) : null}
        {body.truncated === true ? <Badge tone="medium">preview truncated</Badge> : null}
        {body.preview !== undefined ? (
          <CopyButton value={body.preview} className="ml-auto" />
        ) : null}
      </div>

      {body.preview === undefined || body.preview === "" ? (
        <p className="text-2xs text-ink-faint">No preview.</p>
      ) : isHexPreview(body.preview) ? (
        <HexDump hex={body.preview} />
      ) : (
        <pre className="bg-surface-2 text-2xs text-ink-muted max-h-56 scrollbar-thin overflow-auto rounded p-2 font-mono break-all whitespace-pre-wrap">
          {body.preview}
        </pre>
      )}
    </div>
  );
}

/** Previews arrive as hex; 16 bytes a line with the ASCII gutter reads far better. */
function HexDump({ hex }: { hex: string }) {
  const bytes = hex.match(/../g) ?? [];
  const lines: { offset: string; hex: string[]; ascii: string }[] = [];

  for (let index = 0; index < bytes.length; index += 16) {
    const chunk = bytes.slice(index, index + 16);
    lines.push({
      offset: index.toString(16).padStart(6, "0"),
      hex: chunk,
      ascii: chunk
        .map((byte) => {
          const code = Number.parseInt(byte, 16);
          return code >= 32 && code < 127 ? String.fromCharCode(code) : ".";
        })
        .join(""),
    });
  }

  return (
    <div className="bg-surface-2 text-2xs max-h-56 scrollbar-thin overflow-auto rounded p-2 font-mono">
      {lines.map((line) => (
        <div key={line.offset} className="flex gap-3 whitespace-pre">
          <span className="text-ink-faint">{line.offset}</span>
          <span className="text-ink-muted">{line.hex.join(" ").padEnd(47, " ")}</span>
          <span className="text-ink-faint">{line.ascii}</span>
        </div>
      ))}
    </div>
  );
}

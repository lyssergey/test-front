"use client";

import { Download, FileWarning } from "lucide-react";

import type { CarvedFile, SessionId } from "@/lib/api/types";
import { useCan } from "@/lib/auth";
import { formatBytes } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy";
import { EmptyState } from "@/components/ui/states";

export function FilesList({ sessionId, files }: { sessionId: SessionId; files: CarvedFile[] }) {
  const canDownload = useCan("files:download");

  if (files.length === 0) {
    return (
      <EmptyState title="No carved files" hint="Nothing was reconstructed from this session." />
    );
  }

  return (
    <ul className="divide-line divide-y">
      {files.map((file) => (
        <li key={file.id} className="flex items-start gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            {/* Carved names are raw bytes from the wire: they may be non-ASCII or hold separators. */}
            <div className="text-ink truncate text-xs" title={file.name}>
              {file.name}
            </div>
            <div className="text-2xs text-ink-faint flex flex-wrap items-center gap-2">
              <span className="font-mono">{file.mime}</span>
              <span className="tabular">{formatBytes(file.size)}</span>
              <span>{file.source.replace("_", " ")}</span>
              <span className="flex items-center gap-1 font-mono">
                {file.sha256.slice(0, 16)}…
                <CopyButton value={file.sha256} />
              </span>
            </div>
          </div>

          {file.purged ? (
            <Badge tone="medium" title="Past the sensor's file retention">
              <FileWarning className="size-3" /> purged
            </Badge>
          ) : canDownload ? (
            <a
              href={`/api/capture/v1/sessions/${sessionId}/files/${file.id}`}
              className="border-line text-2xs text-ink-muted hover:text-ink inline-flex items-center gap-1 rounded border px-2 py-1"
            >
              <Download className="size-3" /> Download
            </a>
          ) : (
            <Badge tone="neutral" title="Your role has no files:download permission">
              no access
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

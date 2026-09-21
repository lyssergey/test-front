"use client";

import { useEnrichIps } from "@/lib/api/queries";
import type { Endpoint, EnrichResult } from "@/lib/api/types";
import { formatEndpoint } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy";

const REPUTATION_TONE = {
  clean: "low",
  suspicious: "medium",
  malicious: "high",
  unknown: "neutral",
} as const;

export function EndpointPair({ src, dst }: { src: Endpoint; dst: Endpoint }) {
  const enrich = useEnrichIps([src.ip, dst.ip]);

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <EndpointBox label="Source" endpoint={src} intel={enrich.data?.results[src.ip]} />
      <div className="text-ink-faint flex items-center px-1">→</div>
      <EndpointBox label="Destination" endpoint={dst} intel={enrich.data?.results[dst.ip]} />
    </div>
  );
}

function EndpointBox({
  label,
  endpoint,
  intel,
}: {
  label: string;
  endpoint: Endpoint;
  intel: EnrichResult | undefined;
}) {
  return (
    <div className="border-line bg-surface-2/50 min-w-56 flex-1 rounded border p-2">
      <div className="text-2xs text-ink-faint tracking-wide uppercase">{label}</div>
      <div className="flex items-center gap-1.5">
        <span className="text-ink font-mono text-sm">
          {formatEndpoint(endpoint.ip, endpoint.port)}
        </span>
        <CopyButton value={endpoint.ip} />
      </div>
      {endpoint.host !== undefined ? (
        <div className="text-ink-muted truncate text-xs" title={endpoint.host}>
          {endpoint.host}
        </div>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {endpoint.country !== undefined ? (
          <Badge tone="neutral">{endpoint.country}</Badge>
        ) : (
          <Badge tone="neutral" title="No country: the address is internal">
            internal
          </Badge>
        )}
        {intel ? (
          <>
            <Badge tone={REPUTATION_TONE[intel.reputation]}>{intel.reputation}</Badge>
            {intel.org !== undefined ? (
              <span className="text-2xs text-ink-faint truncate" title={intel.org}>
                {intel.asn !== undefined ? `${intel.asn} · ` : ""}
                {intel.org}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

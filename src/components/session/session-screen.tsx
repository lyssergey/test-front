"use client";

import { ArrowLeft, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useProtocolSchema, useSession, useSessionFlow } from "@/lib/api/queries";
import type { SessionId } from "@/lib/api/types";
import { useCan } from "@/lib/auth";
import { formatBytes, formatDuration, formatNumber, formatTimestamp } from "@/lib/format";
import { RiskChip } from "@/components/search/cells";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { TabPanel, Tabs } from "@/components/ui/tabs";

import { Detections } from "./detections";
import { EndpointPair } from "./endpoint-card";
import { FilesList } from "./files-list";
import { FlowChart } from "./flow-chart";
import { GenericProtocolView } from "./generic-view";
import { HttpView } from "./http-view";
import { RelatedList } from "./related-list";

export function SessionScreen({ sessionId }: { sessionId: SessionId }) {
  const router = useRouter();
  const session = useSession(sessionId);
  const schema = useProtocolSchema(session.data?.protocol);
  const flow = useSessionFlow(sessionId);
  const canDownloadPcap = useCan("pcap:download");
  const [tab, setTab] = useState("transaction");

  if (session.isLoading) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (session.isError) {
    return (
      <div className="p-3">
        <Button size="sm" variant="ghost" onClick={() => router.back()} className="mb-2">
          <ArrowLeft className="size-3.5" /> Back
        </Button>
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
      </div>
    );
  }

  const data = session.data!;
  const isHttp = data.protocol === "http";

  return (
    <div data-testid="session-screen" className="h-full scrollbar-thin overflow-y-auto">
      <div className="space-y-2 p-2">
        <Card>
          <div className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="size-3.5" /> Back
              </Button>
              <Badge tone="accent">{data.protocol}</Badge>
              <Badge tone="neutral" title="Which decoder produced the payload below">
                decoder {data.decoder}
              </Badge>
              <RiskChip score={data.risk.score} band={data.risk.band} />
              <span className="tabular text-ink-muted text-xs">
                {formatTimestamp(data.start, { millis: true })} →{" "}
                {formatTimestamp(data.end, { millis: true })} UTC
              </span>
              <span className="tabular text-ink-faint text-xs">
                {formatDuration(data.duration_ms)}
                {data.duration_ms < 0 ? " (ends before it starts)" : ""}
              </span>

              <span className="ml-auto flex items-center gap-2">
                <span className="text-2xs text-ink-faint font-mono">{data.id}</span>
                <CopyButton value={data.id} />
                {data.pcap.available && canDownloadPcap ? (
                  <a
                    href={`/api/capture/v1/sessions/${data.id}/pcap`}
                    className="border-line text-2xs text-ink-muted hover:text-ink inline-flex items-center gap-1 rounded border px-2 py-1"
                  >
                    <Download className="size-3" /> PCAP
                  </a>
                ) : (
                  <Badge
                    tone="neutral"
                    title={
                      canDownloadPcap
                        ? (data.pcap.reason ?? "The packets are no longer stored")
                        : "Your role has no pcap:download permission"
                    }
                  >
                    no pcap
                  </Badge>
                )}
              </span>
            </div>

            <EndpointPair src={data.src} dst={data.dst} />

            <div className="text-2xs text-ink-faint flex flex-wrap items-center gap-3">
              <span>sensor {data.sensor_id}</span>
              <span>transport {data.transport}</span>
              <span className="tabular">
                ↑{formatBytes(data.bytes.up)} ↓{formatBytes(data.bytes.down)}
              </span>
              <span className="tabular">
                {formatNumber(data.packets.up + data.packets.down)} packets
              </span>
              <span className="text-ink-muted truncate">{data.summary}</span>
            </div>

            <Detections detections={data.detections} risk={data.risk} />
          </div>
        </Card>

        <Card>
          <Tabs
            value={tab}
            onValueChange={setTab}
            items={[
              {
                value: "transaction",
                label: isHttp ? "HTTP transaction" : `${data.protocol} transaction`,
              },
              { value: "flow", label: "Flow" },
              {
                value: "files",
                label: `Files${data.files.length > 0 ? ` (${String(data.files.length)})` : ""}`,
              },
              { value: "related", label: "Related" },
              { value: "raw", label: "Raw" },
            ]}
          >
            <TabPanel value="transaction">
              {isHttp ? (
                <HttpView decoded={data.decoded} schema={schema.data} files={data.files} />
              ) : schema.isLoading ? (
                <div className="space-y-1 p-3">
                  {Array.from({ length: 6 }, (_, index) => (
                    <Skeleton key={index} className="h-5 w-full" />
                  ))}
                </div>
              ) : schema.isError ? (
                <div className="p-3">
                  <ErrorState error={schema.error} onRetry={() => void schema.refetch()} />
                </div>
              ) : schema.data ? (
                <GenericProtocolView decoded={data.decoded} schema={schema.data} />
              ) : null}
            </TabPanel>

            <TabPanel value="flow">
              {flow.isLoading ? (
                <Skeleton className="m-3 h-30" />
              ) : flow.isError ? (
                <div className="p-3">
                  <ErrorState error={flow.error} onRetry={() => void flow.refetch()} />
                </div>
              ) : flow.data ? (
                <FlowChart flow={flow.data} />
              ) : null}
            </TabPanel>

            <TabPanel value="files">
              <FilesList sessionId={data.id} files={data.files} />
            </TabPanel>

            <TabPanel value="related">
              <RelatedList sessionId={data.id} />
            </TabPanel>

            <TabPanel value="raw">
              <pre className="text-2xs text-ink-muted max-h-[32rem] scrollbar-thin overflow-auto p-3 font-mono">
                {JSON.stringify(data.decoded, null, 2)}
              </pre>
            </TabPanel>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

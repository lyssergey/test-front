"use client";

import { useQuery } from "@tanstack/react-query";

import { type ApiError, captureFetch } from "./client";
import type {
  ColumnDef,
  EnrichResponse,
  EnumResponse,
  EstimateResponse,
  FieldDef,
  HealthResponse,
  Histogram,
  ProtocolSchema,
  RelatedSessions,
  RelatedWindow,
  Sensor,
  Session,
  SessionFlow,
  SessionId,
} from "./types";

const STATIC = { staleTime: Infinity, retry: 1 } as const;

interface ItemList<T> {
  items: T[];
}

export function useHealth() {
  return useQuery<HealthResponse, ApiError>({
    queryKey: ["health"],
    queryFn: () => captureFetch<HealthResponse>("v1/health"),
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useSensors() {
  return useQuery<Sensor[], ApiError>({
    queryKey: ["sensors"],
    queryFn: async () => (await captureFetch<ItemList<Sensor>>("v1/sensors")).items,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useFields() {
  return useQuery<FieldDef[], ApiError>({
    queryKey: ["meta", "fields"],
    queryFn: async () => (await captureFetch<ItemList<FieldDef>>("v1/meta/fields")).items,
    ...STATIC,
  });
}

export function useColumns() {
  return useQuery<ColumnDef[], ApiError>({
    queryKey: ["meta", "columns"],
    queryFn: async () => (await captureFetch<ItemList<ColumnDef>>("v1/meta/columns")).items,
    ...STATIC,
  });
}

export function useEnum(name: string | undefined) {
  return useQuery<EnumResponse, ApiError>({
    queryKey: ["meta", "enum", name],
    queryFn: () => captureFetch<EnumResponse>(`v1/meta/enums/${name!}`),
    enabled: name !== undefined,
    ...STATIC,
  });
}

export function useProtocolSchema(protocol: string | undefined) {
  return useQuery<ProtocolSchema, ApiError>({
    queryKey: ["meta", "schema", protocol],
    queryFn: () => captureFetch<ProtocolSchema>(`v1/meta/schema/${protocol!}`),
    enabled: protocol !== undefined,
    ...STATIC,
  });
}

export function useSession(id: SessionId) {
  return useQuery<Session, ApiError>({
    queryKey: ["session", id],
    queryFn: () => captureFetch<Session>(`v1/sessions/${id}`),
    retry: 1,
  });
}

export function useSessionFlow(id: SessionId, bucketMs = 1000) {
  return useQuery<SessionFlow, ApiError>({
    queryKey: ["session", id, "flow", bucketMs],
    queryFn: () =>
      captureFetch<SessionFlow>(`v1/sessions/${id}/flow?bucket_ms=${String(bucketMs)}`),
    retry: 1,
  });
}

export function useRelatedSessions(id: SessionId, window: RelatedWindow) {
  return useQuery<RelatedSessions, ApiError>({
    queryKey: ["session", id, "related", window],
    queryFn: () => captureFetch<RelatedSessions>(`v1/sessions/${id}/related?window=${window}`),
    retry: 1,
  });
}

export function useEnrichIps(ips: string[]) {
  const key = [...new Set(ips)].sort();
  return useQuery<EnrichResponse, ApiError>({
    queryKey: ["enrich", key],
    queryFn: () =>
      captureFetch<EnrichResponse>("v1/enrich/ips", { method: "POST", body: { ips: key } }),
    enabled: key.length > 0,
    staleTime: 300_000,
    retry: 1,
  });
}

export interface WindowQuery {
  from: string;
  to: string;
  sensors: string[];
  /** `<field>:<op>:<v1>,<v2>` rows; `null` when the filter has no flat equivalent. */
  rows: string[] | null;
}

function windowParams({ from, to, sensors, rows }: WindowQuery): URLSearchParams {
  const params = new URLSearchParams({ from, to });
  if (sensors.length > 0) params.set("sensors", sensors.join(","));
  for (const row of rows ?? []) params.append("f", row);
  return params;
}

export function useEstimate(query: WindowQuery, enabled: boolean) {
  return useQuery<EstimateResponse, ApiError>({
    queryKey: ["estimate", query],
    queryFn: () => captureFetch<EstimateResponse>(`v1/estimate?${windowParams(query).toString()}`),
    enabled: enabled && query.rows !== null && query.sensors.length > 0,
    staleTime: 30_000,
    retry: false,
  });
}

export function useHistogram(query: WindowQuery, bucketSeconds: number, enabled: boolean) {
  return useQuery<Histogram, ApiError>({
    queryKey: ["histogram", query, bucketSeconds],
    queryFn: () => {
      const params = windowParams(query);
      params.set("bucket_s", String(bucketSeconds));
      return captureFetch<Histogram>(`v1/histogram?${params.toString()}`);
    },
    enabled: enabled && query.rows !== null && query.sensors.length > 0,
    staleTime: 30_000,
    retry: 1,
  });
}

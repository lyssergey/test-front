// Hand-written from backend/openapi.json, for the parts this UI uses.

/** uint64 as a decimal string: exceeds Number.MAX_SAFE_INTEGER, never parse as a number. */
export type SessionId = string;

export type Role = "analyst" | "observer";

export type Permission =
  | "sessions:read"
  | "pcap:download"
  | "files:download"
  | "hunts:write"
  | "cases:write"
  | "imports:create"
  | "live:read";

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  permissions: Permission[];
  sensor_ids: string[];
}

export interface TokenPair {
  access_token: string;
  token_type: "bearer";
  access_expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  user: Profile;
}

export type DecoderVersion = "v1" | "v2";
export type SensorKind = "tap" | "span" | "import";
export type SensorStatus = "online" | "lagging" | "offline";

export interface Sensor {
  id: string;
  name: string;
  site: string;
  kind: SensorKind;
  status: SensorStatus;
  decoder_version: DecoderVersion;
  tz: string;
  retention: { metadata_days: number; pcap_hours: number; files_days: number };
  last_packet_at: string;
  lag_seconds: number;
  /** Legacy 'DD/MM/YYYY HH:mm:ss' in the sensor's tz — not ISO. */
  last_packet_local: string;
}

export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  components: Record<string, { status: string; detail?: string }>;
  /** The capture clock; sits days behind the wall clock. Windows are relative to this. */
  server_time: string;
  version: string;
}

export type FilterOp = "eq" | "in" | "cidr" | "glob" | "gte" | "lte" | "between" | "exists";

export type FieldType =
  | "ip"
  | "cidr"
  | "port"
  | "number"
  | "bytes"
  | "string"
  | "enum"
  | "country"
  | "ja3"
  | "duration_ms"
  | "sensor";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  operators: FilterOp[];
  enum?: string[];
  enum_name?: string;
  pattern?: string;
  example: string;
}

export type KnownColumnType =
  | "ts"
  | "ip_port"
  | "bytes"
  | "risk"
  | "protocol"
  | "duration"
  | "text"
  | "country"
  | "sensor"
  | "id";

export interface ColumnDef {
  key: string;
  label: string;
  /** Widened: the live API serves undocumented types (`geo_hint`), which render as text. */
  type: KnownColumnType | (string & {});
  default_visible: boolean;
  sortable: boolean;
  width_hint: number;
}

export interface EnumValue {
  value: string;
  label: string;
  description?: string;
}

export interface EnumResponse {
  name: string;
  values: EnumValue[];
}

export type Scalar = string | number;

export interface FilterCond {
  field: string;
  op: FilterOp;
  value?: Scalar;
  values?: Scalar[];
}

export type FilterNode =
  FilterCond | { all: FilterNode[] } | { any: FilterNode[] } | { not: FilterNode };

export type SortKey = "ts" | "-ts" | "bytes" | "-bytes" | "risk" | "-risk";

export type SearchState = "queued" | "running" | "done" | "failed" | "cancelled";

export interface SearchCreate {
  sensor_ids: string[];
  from: string;
  to: string;
  filter: FilterNode;
  sort?: SortKey;
}

export type SearchWarningCode = "capture_gap" | "sensor_lagging";

export interface SearchWarning {
  code: SearchWarningCode;
  sensor_id: string;
  from?: string;
  to?: string;
  detail: string;
}

export interface Search {
  id: string;
  state: SearchState;
  sensor_ids: string[];
  from: string;
  to: string;
  filter: FilterNode;
  sort: SortKey;
  created_at: string;
  finished_at?: string;
  progress: {
    scanned_sessions: number;
    total_sessions_estimate: number;
    matched: number;
    matched_is_estimate: boolean;
    percent: number;
  };
  stats: { matched_bytes_up: number; matched_bytes_down: number };
  warnings: SearchWarning[];
}

export type ProtocolName = "dns" | "http" | "tls" | "smtp" | "smb2" | "ssh" | "ntp" | "tcp";
export type Transport = "udp" | "tcp";
export type RiskBand = "low" | "medium" | "high";
export type Severity = "low" | "medium" | "high";

export interface Endpoint {
  ip: string;
  port: number;
  host?: string;
  /** ISO 3166-1 alpha-2; absent for internal addresses. */
  country?: string;
}

export interface ByteCount {
  up: number;
  down: number;
}

export interface Risk {
  score: number;
  band: RiskBand;
  reasons: { code: string; label: string; mitre?: string }[];
}

export interface SessionRow {
  id: SessionId;
  sensor_id: string;
  start: string;
  end: string;
  duration_ms: number;
  protocol: ProtocolName;
  transport: Transport;
  src: Endpoint;
  dst: Endpoint;
  bytes: ByteCount;
  packets: ByteCount;
  risk: Risk;
  intel?: { score: number; source: string };
  summary: string;
  /** "<protocol>/<1|2>"; the version changes the `decoded` shape. */
  decoder: string;
  files_count: number;
  pcap_available: boolean;
}

export interface SearchResults {
  items: SessionRow[];
  /** null + complete=false: caught up, more may come. null + complete=true: the end. */
  next_cursor: string | null;
  complete: boolean;
  matched_so_far: number;
}

export type PcapUnavailableReason = string;

export interface CarvedFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  source: "smtp_attachment" | "http_body";
  purged: boolean;
}

export interface SessionDetection {
  rule_id: string;
  rule: string;
  severity: Severity;
  mitre: { technique_id: string; name: string };
}

export interface Session extends SessionRow {
  /** Keyed by protocol; shape depends on the decoder version. */
  decoded: Record<string, unknown>;
  detections: SessionDetection[];
  files: CarvedFile[];
  pcap: { available: boolean; reason?: PcapUnavailableReason; expired_at?: string };
}

export interface SchemaField {
  /** Dotted path into `decoded`; an array step ends with `[]`. */
  path: string;
  title: string;
  type: string;
  unit?: string;
  sensitive?: boolean;
}

export interface ProtocolSchema {
  protocol: ProtocolName;
  decoder_versions: DecoderVersion[];
  fields: SchemaField[];
}

export interface EstimateResponse {
  estimated_matches: number;
  estimated_sessions_scanned: number;
  is_estimate: true;
}

export interface HistogramBucket {
  t: string;
  coverage: number;
  partial?: true;
  by_protocol: Record<string, number>;
  bytes: number;
}

export interface Histogram {
  bucket_s: number;
  /** Buckets with no capture are omitted — a gap is not a quiet period. */
  buckets: HistogramBucket[];
}

export interface FlowSample {
  /** Bucket start, epoch milliseconds. */
  t: number;
  bytes_up: number;
  bytes_down: number;
  packets_up: number;
  packets_down: number;
}

export interface SessionFlow {
  session_id: SessionId;
  bucket_ms: number;
  /** Empty buckets omitted: plot against `t`, never by index. */
  samples: FlowSample[];
}

export interface RelatedSessions {
  items: SessionRow[];
  next_cursor: string | null;
}

export type RelatedWindow = "15m" | "1h" | "6h";

export interface EnrichResult {
  reputation: "clean" | "suspicious" | "malicious" | "unknown";
  country?: string;
  /** A string upstream, e.g. "AS64500". */
  asn?: string;
  org?: string;
}

/** Keyed by address, not an array. */
export interface EnrichResponse {
  results: Record<string, EnrichResult>;
}

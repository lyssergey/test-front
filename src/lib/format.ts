const NBSP = " ";

export function formatNumber(value: number): string {
  return value.toLocaleString("en-GB").replaceAll(",", NBSP);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${String(bytes)}${NBSP}B`;
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)}${NBSP}${units[unit]!}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 0) return `\u2212${formatDuration(-ms)}`;
  if (ms < 1000) return `${String(Math.round(ms))}${NBSP}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)}${NBSP}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return `${String(minutes)}m${NBSP}${String(rest)}s`;
  return `${String(Math.floor(minutes / 60))}h${NBSP}${String(minutes % 60)}m`;
}

/** Everything is shown in UTC: three sensors, three local zones, one timeline. */
export function formatTimestamp(iso: string, options: { millis?: boolean } = {}): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const date = at.toISOString();
  return options.millis
    ? date.replace("T", " ").replace("Z", "")
    : date.slice(0, 19).replace("T", " ");
}

export function formatTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toISOString().slice(11, 19);
}

export function formatIsoForInput(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toISOString().slice(0, 16);
}

export function parseInputToIso(value: string): string | null {
  if (!value) return null;
  const at = new Date(`${value}:00Z`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export function formatRelative(from: string, to: string): string {
  const delta = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(delta)) return "";
  const sign = delta < 0 ? "-" : "";
  return `${sign}${formatDuration(Math.abs(delta))}`;
}

export function formatEndpoint(ip: string, port: number): string {
  return ip.includes(":") ? `[${ip}]:${String(port)}` : `${ip}:${String(port)}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

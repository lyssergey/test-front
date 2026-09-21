import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ColumnDef, SessionRow } from "@/lib/api/types";

import { Cell } from "./cells";

const ROW: SessionRow = {
  id: "72057639335362590",
  sensor_id: "hq-core",
  start: "2025-10-27T11:59:54.117Z",
  end: "2025-10-27T11:59:55.193Z",
  duration_ms: 1076,
  protocol: "tls",
  transport: "tcp",
  src: { ip: "10.20.2.25", port: 37065, host: "mx1.quillmere.example" },
  dst: { ip: "192.0.2.104", port: 443, host: "weather.example.net", country: "AT" },
  bytes: { up: 12019, down: 8044 },
  packets: { up: 14, down: 11 },
  risk: { score: 10, band: "low", reasons: [] },
  summary: "TLS1.3 weather.example.net",
  decoder: "tls/2",
  files_count: 0,
  pcap_available: true,
};

const SENSOR_NAMES = new Map([["hq-core", "HQ Core"]]);

function column(overrides: Partial<ColumnDef>): ColumnDef {
  return {
    key: "summary",
    label: "Summary",
    type: "text",
    default_visible: true,
    sortable: false,
    width_hint: 200,
    ...overrides,
  };
}

function renderCell(overrides: Partial<ColumnDef>, row: SessionRow = ROW) {
  return render(<Cell column={column(overrides)} row={row} sensorNames={SENSOR_NAMES} />);
}

describe("Cell", () => {
  it("shows the address with its host and country", () => {
    renderCell({ key: "dst", type: "ip_port" });
    expect(screen.getByText("192.0.2.104:443")).toBeInTheDocument();
    expect(screen.getByText(/weather\.example\.net · AT/)).toBeInTheDocument();
  });

  it("resolves the sensor id to its display name", () => {
    renderCell({ key: "sensor", type: "sensor" });
    expect(screen.getByText("HQ Core")).toBeInTheDocument();
  });

  it("keeps the session id verbatim, since it is a uint64 string", () => {
    renderCell({ key: "id", type: "id" });
    expect(screen.getByText("72057639335362590")).toBeInTheDocument();
  });

  it("renders an undocumented column type as text instead of blanking the cell", () => {
    // The live API serves `geo_hint` for dst_country, which the spec does not document.
    renderCell({ key: "dst_country", type: "geo_hint" });
    expect(screen.getByText("AT")).toBeInTheDocument();
  });

  it("falls back to a dash for a column it cannot map at all", () => {
    renderCell({ key: "something_new", type: "brand_new_type" });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("flags a session the API says ended before it started", () => {
    renderCell({ key: "duration", type: "duration" }, { ...ROW, duration_ms: -527 });
    const cell = screen.getByTitle(/ending before it started/);
    expect(cell).toHaveTextContent("527");
  });

  it("shows total bytes with the up and down split", () => {
    renderCell({ key: "bytes", type: "bytes" });
    expect(screen.getByText("20 kB")).toBeInTheDocument();
    expect(screen.getByText(/↑.*12 kB/)).toBeInTheDocument();
  });
});

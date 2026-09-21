import { describe, expect, it } from "vitest";

import type { ProtocolSchema } from "@/lib/api/types";

import { readPath, toArray } from "./paths";
import { buildSchemaView } from "./schema-view";

const DNS_SCHEMA: ProtocolSchema = {
  protocol: "dns",
  decoder_versions: ["v1", "v2"],
  fields: [
    { path: "dns.transaction_id", title: "Transaction id", type: "number" },
    { path: "dns.query.name", title: "Query name", type: "string" },
    { path: "dns.rcode.code", title: "Response code", type: "number" },
    { path: "dns.rcode.name", title: "Response code name", type: "string" },
    { path: "dns.answers[].name", title: "Answer name", type: "string" },
    { path: "dns.answers[].ttl", title: "Answer TTL", type: "number", unit: "seconds" },
    { path: "dns.authority[].name", title: "Authority name", type: "string" },
  ],
};

describe("readPath", () => {
  it("walks a dotted path", () => {
    expect(readPath({ dns: { query: { name: "a.example" } } }, "dns.query.name")).toEqual([
      "a.example",
    ]);
  });

  it("returns nothing for an absent path rather than undefined entries", () => {
    expect(readPath({ dns: {} }, "dns.query.name")).toEqual([]);
  });

  it("fans out over an array step", () => {
    const decoded = { dns: { answers: [{ ttl: 60 }, { ttl: 90 }] } };
    expect(readPath(decoded, "dns.answers[].ttl")).toEqual([60, 90]);
  });

  it("accepts the v1 single object where v2 sends a one-element array", () => {
    const decoded = { dns: { authority: { name: "ns1.example" } } };
    expect(readPath(decoded, "dns.authority[].name")).toEqual(["ns1.example"]);
  });

  it("reads a leaf array of scalars", () => {
    expect(readPath({ tls: { alpn: ["h2", "http/1.1"] } }, "tls.alpn[]")).toEqual([
      "h2",
      "http/1.1",
    ]);
  });
});

describe("toArray", () => {
  it("wraps a lone object and passes arrays through", () => {
    expect(toArray({ a: 1 })).toEqual([{ a: 1 }]);
    expect(toArray([1, 2])).toEqual([1, 2]);
    expect(toArray(undefined)).toEqual([]);
  });
});

describe("buildSchemaView", () => {
  const v2 = {
    dns: {
      transaction_id: 23802,
      query: { name: "assets.example.org" },
      rcode: { code: 0, name: "NOERROR" },
      answers: [{ name: "assets.example.org", ttl: 900 }],
      authority: [],
    },
  };

  it("groups scalars by their parent and repeated objects into tables", () => {
    const view = buildSchemaView(v2, DNS_SCHEMA);
    const kinds = view.sections.map((section) => [section.key, section.kind]);
    expect(kinds).toEqual([
      ["dns", "fields"],
      ["dns.query", "fields"],
      ["dns.rcode", "fields"],
      ["dns.answers[]", "table"],
    ]);
  });

  it("fills table rows in column order", () => {
    const table = buildSchemaView(v2, DNS_SCHEMA).sections.find((s) => s.kind === "table");
    expect(table?.kind === "table" && table.columns.map((c) => c.path)).toEqual(["name", "ttl"]);
    expect(table?.kind === "table" && table.rows).toEqual([["assets.example.org", 900]]);
  });

  it("drops sections whose every field is absent", () => {
    const view = buildSchemaView({ dns: { query: { name: "a.example" } } }, DNS_SCHEMA);
    expect(view.sections.map((section) => section.key)).toEqual(["dns.query"]);
  });

  it("reports payload keys the schema does not publish", () => {
    const view = buildSchemaView(
      { dns: { ...v2.dns, edns: { client_subnet: "10.0.0.0/24" } } },
      DNS_SCHEMA,
    );
    expect(view.undocumented).toEqual([{ key: "edns", value: { client_subnet: "10.0.0.0/24" } }]);
  });

  it("reports a v1 scalar where the schema declares a nested object", () => {
    const v1 = { dns: { transaction_id: "43889", query: { name: "a.example" }, rcode: "0" } };
    const view = buildSchemaView(v1, DNS_SCHEMA);
    expect(view.mismatched).toEqual([{ key: "rcode", value: "0" }]);
    expect(view.undocumented).toEqual([]);
  });

  it("does not call an empty array a shape mismatch", () => {
    const view = buildSchemaView(v2, DNS_SCHEMA);
    expect(view.mismatched).toEqual([]);
  });

  it("marks a sensitive field so the view can mask it", () => {
    const schema: ProtocolSchema = {
      protocol: "smb2",
      decoder_versions: ["v2"],
      fields: [{ path: "smb2.user", title: "User", type: "string", sensitive: true }],
    };
    const view = buildSchemaView({ smb2: { user: "jarek" } }, schema);
    expect(view.sections[0]?.kind === "fields" && view.sections[0].entries[0]?.sensitive).toBe(
      true,
    );
  });
});

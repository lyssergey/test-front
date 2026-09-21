// The proxy attaches a real credential to whatever it forwards, so the surface is listed.
interface Rule {
  methods: readonly string[];
  pattern: RegExp;
}

const SEG = "[^/]+";

const RULES: readonly Rule[] = [
  { methods: ["GET"], pattern: /^v1\/health$/ },
  { methods: ["GET"], pattern: /^v1\/me$/ },
  { methods: ["GET"], pattern: /^v1\/sensors$/ },
  { methods: ["GET"], pattern: /^v1\/meta\/fields$/ },
  { methods: ["GET"], pattern: /^v1\/meta\/columns$/ },
  { methods: ["GET"], pattern: new RegExp(`^v1/meta/enums/${SEG}$`) },
  { methods: ["GET"], pattern: new RegExp(`^v1/meta/schema/${SEG}$`) },
  { methods: ["GET"], pattern: /^v1\/estimate$/ },
  { methods: ["GET"], pattern: /^v1\/histogram$/ },
  { methods: ["GET"], pattern: /^v1\/pivot\/occurrences$/ },
  { methods: ["GET"], pattern: /^v1\/detections$/ },
  { methods: ["POST"], pattern: /^v1\/searches$/ },
  { methods: ["GET", "DELETE"], pattern: new RegExp(`^v1/searches/${SEG}$`) },
  { methods: ["GET"], pattern: new RegExp(`^v1/searches/${SEG}/results$`) },
  { methods: ["GET"], pattern: new RegExp(`^v1/searches/${SEG}/graph$`) },
  { methods: ["POST"], pattern: /^v1\/lql\/parse$/ },
  { methods: ["GET"], pattern: new RegExp(`^v1/sessions/${SEG}$`) },
  { methods: ["GET"], pattern: new RegExp(`^v1/sessions/${SEG}/flow$`) },
  { methods: ["GET"], pattern: new RegExp(`^v1/sessions/${SEG}/related$`) },
  { methods: ["GET"], pattern: new RegExp(`^v1/sessions/${SEG}/pcap$`) },
  { methods: ["GET"], pattern: new RegExp(`^v1/sessions/${SEG}/files/${SEG}$`) },
  { methods: ["POST"], pattern: /^v1\/enrich\/ips$/ },
  { methods: ["GET"], pattern: new RegExp(`^v1/enrich/ips/${SEG}$`) },
];

/** `path` has no leading slash, e.g. `v1/sensors`. */
export function isProxyAllowed(method: string, path: string): boolean {
  if (path.includes("..")) return false;
  const upper = method.toUpperCase();
  return RULES.some((rule) => rule.methods.includes(upper) && rule.pattern.test(path));
}

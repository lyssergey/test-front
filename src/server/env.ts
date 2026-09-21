// Server-only; never sent to the browser.

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  captureApiUrl: required("CAPTURE_API_URL", "http://localhost:8700").replace(/\/+$/, ""),
  sessionCookie: "capture_sid",
  isProduction: process.env.NODE_ENV === "production",
} as const;

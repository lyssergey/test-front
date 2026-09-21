const CAPTURE_API_URL = process.env.CAPTURE_API_URL ?? "http://localhost:8700";

/** Fail early and clearly when the API these tests drive is not running. */
export default async function globalSetup(): Promise<void> {
  try {
    const response = await fetch(`${CAPTURE_API_URL}/v1/health`);
    if (!response.ok) throw new Error(`health returned ${String(response.status)}`);
  } catch (cause) {
    throw new Error(
      `The Capture API is not answering on ${CAPTURE_API_URL}. Start it with ` +
        `\`cd backend && uv run capture-api serve\` (see the README), then run the e2e suite again.`,
      { cause },
    );
  }
}

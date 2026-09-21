import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

interface SampleRow {
  id: string;
  protocol: string;
  sensor_id: string;
}

/**
 * One search for the whole file, cached. Upstream allows twelve searches a
 * minute per user, and the suite has other specs that need that budget.
 */
let sample: Promise<SampleRow[]> | null = null;

async function startSearch(page: Page) {
  const attempt = () =>
    page.request.post("/api/capture/v1/searches", {
      headers: { "idempotency-key": `e2e-sample-${String(Date.now())}` },
      data: {
        sensor_ids: ["hq-core", "dc-east", "harbor-branch"],
        from: "2025-10-27T06:00:00.000Z",
        to: "2025-10-27T12:00:00.000Z",
        filter: { all: [] },
        sort: "-ts",
      },
    });

  let created = await attempt();
  for (let retry = 0; retry < 4; retry += 1) {
    if (created.status() !== 429) break;
    const body = (await created.json()) as { code?: string };
    // Two different 429s: the per-minute rate limit passes on its own, the
    // three-slot limit does not — only a DELETE or ten idle minutes frees it.
    if (body.code === "too_many_searches") {
      throw new Error(
        "All three search slots are held upstream, most likely by an interrupted earlier run. " +
          "They free themselves after ten idle minutes, or restart the API to clear them.",
      );
    }
    const after = Number(created.headers()["retry-after"] ?? "5");
    await page.waitForTimeout((Number.isFinite(after) ? after : 5) * 1000 + 500);
    created = await attempt();
  }
  expect(created.status(), await created.text()).toBe(202);
  return (await created.json()) as { id: string };
}

async function sampleRows(page: Page): Promise<SampleRow[]> {
  sample ??= (async () => {
    const { id } = await startSearch(page);
    const rows: SampleRow[] = [];
    try {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const response = await page.request.get(`/api/capture/v1/searches/${id}/results?limit=500`);
        const body = (await response.json()) as { items: SampleRow[]; complete: boolean };
        rows.splice(0, rows.length, ...body.items);
        if (rows.length >= 200 || body.complete) return rows;
        await page.waitForTimeout(400);
      }
      return rows;
    } finally {
      await page.request.delete(`/api/capture/v1/searches/${id}`);
    }
  })();
  return sample;
}

/** A session of this protocol on this sensor, from the shared sample. */
async function findSession(page: Page, protocol: string, sensor: string): Promise<string> {
  const rows = await sampleRows(page);
  const row = rows.find((item) => item.protocol === protocol && item.sensor_id === sensor);
  expect(
    row,
    `no ${protocol} session on ${sensor} among ${String(rows.length)} sampled rows`,
  ).toBeDefined();
  return row!.id;
}

test.describe("one session in full", () => {
  test("lays out an HTTP transaction, request beside response", async ({ signedIn: page }) => {
    // harbor-branch runs the legacy decoder, whose payload shape differs.
    const id = await findSession(page, "http", "harbor-branch");
    await page.goto(`/sessions/${id}`);

    await expect(page.getByTestId("http-view")).toBeVisible();
    await expect(page.getByText(/decoder http\/[12]/)).toBeVisible();
    await expect(page.getByText("SOURCE")).toBeVisible();
    await expect(page.getByText("DESTINATION")).toBeVisible();

    // Header values are marked sensitive by the schema, so they start masked.
    const reveal = page.getByRole("button", { name: "reveal headers" }).first();
    await expect(reveal).toBeVisible();
    await reveal.click();
    await expect(page.getByText(/User-Agent/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "hide headers" }).first()).toBeVisible();
  });

  test("builds a view for every other protocol out of the published schema", async ({
    signedIn: page,
  }) => {
    const id = await findSession(page, "smb2", "hq-core");
    await page.goto(`/sessions/${id}`);

    const generic = page.getByTestId("generic-view");
    await expect(generic).toBeVisible();
    await expect(generic).toContainText("/v1/meta/schema/smb2");
    // smb2.operations[] is a repeated object, so it becomes a table.
    await expect(generic.getByRole("table")).toBeVisible();
    await expect(generic).toContainText("Operations (4)");
  });

  test("shows the flow, the neighbours and the raw payload", async ({ signedIn: page }) => {
    const id = await findSession(page, "tls", "hq-core");
    await page.goto(`/sessions/${id}`);

    await page.getByRole("tab", { name: "Flow" }).click();
    await expect(page.getByRole("img", { name: /Bytes up and down/ })).toBeVisible();

    await page.getByRole("tab", { name: "Related" }).click();
    await expect(page.getByText(/Same address pair/)).toBeVisible();

    await page.getByRole("tab", { name: "Raw" }).click();
    await expect(page.getByText(/"tls"/)).toBeVisible();
  });

  test("explains a session id that does not exist", async ({ signedIn: page }) => {
    await page.goto("/sessions/1");
    const error = page.getByTestId("error-state");
    await expect(error).toBeVisible();
    await expect(error).toContainText("404 session_not_found");
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  });
});

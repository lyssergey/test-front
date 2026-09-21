import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/** Picked through the API the app proxies, so the spec does not depend on row order. */
async function findSession(page: Page, protocol: string, sensor: string): Promise<string> {
  const start = () =>
    page.request.post("/api/capture/v1/searches", {
      headers: { "idempotency-key": `e2e-${protocol}-${sensor}-${String(Date.now())}` },
      data: {
        sensor_ids: [sensor],
        from: "2025-10-27T06:00:00.000Z",
        to: "2025-10-27T12:00:00.000Z",
        filter: { field: "protocol", op: "eq", value: protocol },
        sort: "-ts",
      },
    });

  // Only three searches per user: an interrupted earlier run can still be
  // holding a slot, and upstream frees it after ten idle minutes.
  let created = await start();
  for (let attempt = 0; created.status() === 429 && attempt < 3; attempt += 1) {
    await page.waitForTimeout(2_000);
    created = await start();
  }
  expect(created.status(), await created.text()).toBe(202);
  const { id } = (await created.json()) as { id: string };

  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const results = await page.request.get(`/api/capture/v1/searches/${id}/results?limit=1`);
      const body = (await results.json()) as { items: { id: string }[]; complete: boolean };
      if (body.items.length > 0) return body.items[0]!.id;
      if (body.complete) throw new Error(`no ${protocol} session on ${sensor}`);
      await page.waitForTimeout(400);
    }
    throw new Error(`timed out looking for a ${protocol} session`);
  } finally {
    await page.request.delete(`/api/capture/v1/searches/${id}`);
  }
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

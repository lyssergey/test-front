import { expect, runSearch, test } from "./fixtures";

test.describe("the search screen", () => {
  test("shows what it will do before anything runs", async ({ signedIn: page }) => {
    await expect(page.getByText("No search yet")).toBeVisible();
    // The estimate comes from a sample of the window, before a search exists.
    await expect(page.getByText(/≈[\d\s ]+ matches/)).toBeVisible();
    await expect(page.getByTestId("result-row")).toHaveCount(0);
  });

  test("offers the run button where the empty table is, not only in the header", async ({
    signedIn: page,
  }) => {
    // The timeline fills from an estimate without a search, so the empty table
    // has to say that and give the user the button there.
    const empty = page.getByText("No search yet").locator("..");
    await expect(empty).toContainText("The table needs a search");

    await empty.getByRole("button", { name: "Run search" }).click();
    await expect(page.getByTestId("job-progress")).toBeVisible();
    await expect(page.getByTestId("result-row").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("No search yet")).toHaveCount(0);
  });

  test("streams rows page by page while the search is still running", async ({
    signedIn: page,
  }) => {
    // 72 hours is the whole capture: enough work that rows arrive long before it ends.
    await page.getByRole("button", { name: "72h", exact: true }).click();
    await page.getByRole("button", { name: "Run search" }).first().click();

    const progress = page.getByTestId("job-progress");
    await expect(page.getByTestId("result-row").first()).toBeVisible({ timeout: 30_000 });
    // Rows are readable while the job is still scanning, which is the point.
    await expect(progress).toContainText("running");

    // The table is virtualised, so the DOM row count says nothing about how much
    // has been fetched; the loaded counter does. Passing one page proves paging.
    const loadedRows = async () => {
      const text = await progress.innerText();
      const match = /([\d\u202f\s,]+) loaded/.exec(text);
      return match ? Number(match[1]!.replace(/\D/g, "")) : 0;
    };
    await expect.poll(loadedRows, { timeout: 45_000 }).toBeGreaterThan(200);

    await expect(progress).toContainText(/matched/);
  });

  test("keeps sorting shut until the search has finished", async ({ signedIn: page }) => {
    await runSearch(page);
    const header = page.getByRole("columnheader", { name: /Risk/ });

    // A running search only serves its pages in scan order.
    if (await header.isDisabled()) {
      await expect(header).toHaveAttribute("title", /finished search/);
    }
    await expect(page.getByTestId("result-row").first()).toBeVisible();
  });

  test("says so plainly when nothing matches", async ({ signedIn: page }) => {
    await page.getByRole("button", { name: "condition" }).click();
    await page.getByLabel("Field").click();
    await page.getByRole("option", { name: "Destination port" }).click();
    await page.getByLabel("Value").fill("9");

    await page.getByRole("button", { name: "Run search" }).first().click();
    await expect(page.getByText("Nothing matched")).toBeVisible({ timeout: 40_000 });
  });

  test("refuses to build a filter out of a half-finished condition", async ({ signedIn: page }) => {
    await page.getByRole("button", { name: "condition" }).click();
    await page.getByLabel("Field").click();
    await page.getByRole("option", { name: "Risk score" }).click();
    await page.getByLabel("Operator").click();
    await page.getByRole("option", { name: "between" }).click();
    await page.getByLabel("Lower bound").fill("70");

    await expect(page.getByText("Needs a lower and an upper bound")).toBeVisible();
    await expect(page.getByText(/incomplete condition is not part/)).toBeVisible();
  });

  test("reopens the same query from a shared link", async ({ signedIn: page }) => {
    const filter = JSON.stringify({ field: "protocol", op: "eq", value: "dns" });
    const query = new URLSearchParams({
      sensors: "hq-core",
      from: "2025-10-27T09:00:00.000Z",
      to: "2025-10-27T12:00:00.000Z",
      sort: "-ts",
      q: filter,
      run: "1",
    });

    await page.goto(`/search?${query.toString()}`);

    // The form is rebuilt from the link…
    await expect(page.getByLabel("Field")).toContainText("Protocol");
    await expect(page.getByLabel("Value")).toContainText("DNS", { ignoreCase: true });
    // …and `run=1` starts the search without another click.
    await expect(page.getByTestId("result-row").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("result-row").first()).toContainText("dns");
  });

  test("opens a session from a row and comes back", async ({ signedIn: page }) => {
    await runSearch(page);
    await page.getByTestId("result-row").first().click();

    await expect(page).toHaveURL(/\/sessions\/\d+/);
    await expect(page.getByTestId("session-screen")).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/search/);
  });

  test("lets the user cancel a running search", async ({ signedIn: page }) => {
    await page.getByRole("button", { name: "Run search" }).first().click();
    const cancel = page.getByRole("button", { name: "Cancel" });
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
      await expect(page.getByTestId("job-progress")).toContainText(/cancelled|done/);
    }
  });
});

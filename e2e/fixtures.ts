import { expect, type Page, test as base } from "@playwright/test";

export const ANALYST = { email: "ana@quillmere.example", password: "demo-analyst" };
export const OBSERVER = { email: "oli@quillmere.example", password: "demo-observer" };

export async function signIn(page: Page, who = ANALYST): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/search/);
  await expect(page.getByRole("button", { name: "Run search" }).first()).toBeEnabled();
}

const rateLimited = (page: Page) =>
  page.getByTestId("error-state").filter({ hasText: "search_rate_limited" });

async function isRateLimited(page: Page): Promise<boolean> {
  return rateLimited(page)
    .waitFor({ state: "visible", timeout: 1_500 })
    .then(() => true)
    .catch(() => false);
}

/** Starts a search, waiting out the twelve-a-minute limit the API enforces. */
export async function clickRun(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.getByRole("button", { name: "Run search" }).first().click();
    if (!(await isRateLimited(page))) return;
    await page.waitForTimeout(8_000);
  }
  throw new Error("still rate limited after eight attempts");
}

/** For a `run=1` link, which starts itself: reload until the limit lets it through. */
export async function reloadPastRateLimit(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 8 && (await isRateLimited(page)); attempt += 1) {
    await page.waitForTimeout(8_000);
    await page.reload();
  }
}

/** Runs the search the query bar currently holds and waits for the first rows. */
export async function runSearch(page: Page): Promise<void> {
  await clickRun(page);
  await expect(page.getByTestId("job-progress")).toBeVisible();
  await expect(page.getByTestId("result-row").first()).toBeVisible({ timeout: 30_000 });
}

/** Signed in, handing back each search the test started: only three per user. */
export const test = base.extend<{ signedIn: Page }>({
  signedIn: async ({ page }, use) => {
    const started: string[] = [];
    page.on("response", (response) => {
      const request = response.request();
      if (
        request.method() !== "POST" ||
        response.status() !== 202 ||
        !response.url().endsWith("/api/capture/v1/searches")
      ) {
        return;
      }
      void response
        .json()
        .then((body: { id?: string }) => {
          if (typeof body.id === "string") started.push(body.id);
        })
        .catch(() => undefined);
    });

    await signIn(page);
    await use(page);

    for (const id of started) {
      await page.request.delete(`/api/capture/v1/searches/${id}`).catch(() => undefined);
    }
  },
});

export { expect };

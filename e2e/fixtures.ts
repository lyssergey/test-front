import { expect, type Page, test as base } from "@playwright/test";

export const ANALYST = { email: "ana@quillmere.example", password: "demo-analyst" };
export const OBSERVER = { email: "oli@quillmere.example", password: "demo-observer" };

export async function signIn(page: Page, who = ANALYST): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/search/);
  await expect(page.getByRole("button", { name: "Run search" })).toBeEnabled();
}

/** Runs the search the query bar currently holds and waits for the first rows. */
export async function runSearch(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Run search" }).click();
  await expect(page.getByTestId("job-progress")).toBeVisible();
  await expect(page.getByTestId("result-row").first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Signed in, with every search the test started handed back afterwards.
 *
 * A user may only hold three searches at once, and one that nobody reads sits
 * on its slot for ten minutes — long enough to fail the rest of the suite.
 */
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

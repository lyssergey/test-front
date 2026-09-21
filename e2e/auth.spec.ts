import { ANALYST, expect, OBSERVER, signIn, test } from "./fixtures";

test.describe("signing in", () => {
  test("sends an unauthenticated visitor to the sign-in screen", async ({ page }) => {
    await page.goto("/search");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("signs in and lands on the search screen", async ({ page }) => {
    await signIn(page);
    await expect(page.getByText("Ana Duarte")).toBeVisible();
    await expect(page.getByText(/capture clock/)).toBeVisible();
  });

  test("keeps the reason on screen when the password is wrong", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ANALYST.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: /sign in|password|details/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("signs out again", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/search");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("the upstream token", () => {
  test("never reaches the browser", async ({ page, context }) => {
    const tokenShaped: string[] = [];
    page.on("response", async (response) => {
      if (!response.url().startsWith("http://localhost:3000/api/")) return;
      const body = await response.text().catch(() => "");
      if (/access_token|refresh_token|"at_|"rt_/.test(body)) tokenShaped.push(response.url());
    });

    await signIn(page);
    await page.goto("/search");

    // Nothing the app served back to the page carried a credential.
    expect(tokenShaped).toEqual([]);

    // The session cookie is opaque and httpOnly, so scripts cannot read it.
    const cookies = await context.cookies();
    const session = cookies.find((cookie) => cookie.name === "capture_sid");
    expect(session).toBeDefined();
    expect(session!.httpOnly).toBe(true);
    expect(session!.sameSite).toBe("Lax");
    expect(session!.value).not.toMatch(/^(at_|rt_)/);
    expect(await page.evaluate(() => document.cookie)).toBe("");

    // And nothing was stashed in web storage either.
    const stored = await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    }));
    expect(stored).toEqual({ local: [], session: [] });
  });

  test("is not in the body the sign-in request answers with", async ({ page }) => {
    await page.goto("/login");
    const login = page.waitForResponse((response) => response.url().endsWith("/api/auth/login"));
    await page.getByLabel("Email").fill(ANALYST.email);
    await page.getByLabel("Password").fill(ANALYST.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    const body: unknown = await (await login).json();
    expect(body).toHaveProperty("user.email", ANALYST.email);
    expect(JSON.stringify(body)).not.toContain("token");
  });
});

test.describe("the read-only account", () => {
  test("only sees the sensors it may read", async ({ page }) => {
    await signIn(page, OBSERVER);
    await expect(page.getByText("Oliver Brandt")).toBeVisible();
    // The observer is granted hq-core and harbor-branch, but not dc-east.
    await expect(page.getByText("observer · 2 sensors")).toBeVisible();

    await page
      .getByRole("button", { name: /sensors|Core|Hafen/ })
      .first()
      .click();
    await expect(page.getByText("HQ Core")).toBeVisible();
    await expect(page.getByText("DC East")).toHaveCount(0);
  });
});

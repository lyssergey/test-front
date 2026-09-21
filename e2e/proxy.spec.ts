import { expect, test } from "./fixtures";

test.describe("the API proxy", () => {
  test("refuses to talk to the API without a session", async ({ request }) => {
    const response = await request.get("/api/capture/v1/sensors");
    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ code: "not_authenticated" });
  });

  test("only forwards the endpoints the UI uses", async ({ signedIn: page }) => {
    const allowed = await page.request.get("/api/capture/v1/sensors");
    expect(allowed.status()).toBe(200);

    // Real endpoints upstream, but outside this UI's surface.
    for (const path of ["v1/cases", "v1/hunts", "v1/auth/login"]) {
      const refused = await page.request.get(`/api/capture/${path}`);
      expect(refused.status(), path).toBe(403);
      expect(await refused.json()).toMatchObject({ code: "proxy_forbidden" });
    }
  });

  test("refuses a method the endpoint does not allow through", async ({ signedIn: page }) => {
    const response = await page.request.delete("/api/capture/v1/sensors");
    expect(response.status()).toBe(403);
  });

  test("answers the session route with the signed-in profile", async ({ signedIn: page }) => {
    const response = await page.request.get("/api/auth/session");
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { role: "analyst", email: "ana@quillmere.example" },
    });
  });
});

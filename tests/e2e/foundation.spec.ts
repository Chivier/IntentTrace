import { expect, test } from "@playwright/test";

test("serves the honest Gate 0 status page", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).toContain("Gate 0");
  expect(body).toContain("尚未实现完整 Trace Viewer");
});

test("serves a machine-readable web health endpoint", async ({ request }) => {
  const response = await request.get("/healthz");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({ service: "web", status: "ok" });
});

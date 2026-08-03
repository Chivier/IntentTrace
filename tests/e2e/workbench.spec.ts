import { expect, test } from "@playwright/test";

const traceId = "33333333-3333-4333-8333-333333333333";
const revisionId = "44444444-4444-4444-8444-444444444444";
const eventId = "55555555-5555-4555-8555-555555555555";
const nodeId = "66666666-6666-4666-8666-666666666666";

test("serves the honest local MVP status and machine health", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "从执行事实到可核验证据图" })).toBeVisible();
  await expect(page.getByText("local_mvp")).toBeVisible();
  await expect(page.getByRole("link", { name: "打开 Trace 工作台" })).toBeVisible();
  const health = await request.get("/healthz");
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ service: "web", status: "ok", gate: 5 });
});

test("links Graph, Gantt, raw evidence, and replay with stable IDs", async ({ page }) => {
  await page.route(`**/api/v1/traces/${traceId}/snapshot**`, async (route) =>
    route.fulfill({
      json: {
        trace: {
          id: traceId,
          title: "Synthetic six-agent trace",
          status: "completed",
          latestIngestSeq: "1",
        },
        raw: {
          events: [
            {
              id: eventId,
              ingestSeq: "1",
              occurredAt: "2026-08-03T00:00:00.000Z",
              kind: "tool_result",
              name: "Escaped <script>alert(1)</script>",
              status: "ok",
              agentId: "backend",
            },
          ],
          nextCursor: null,
        },
        agents: [
          {
            agentId: "backend",
            displayName: "Backend",
            eventIds: [eventId],
            startedAt: "2026-08-03T00:00:00.000Z",
            endedAt: "2026-08-03T00:00:00.000Z",
            errorCount: 0,
          },
        ],
        revision: {
          id: revisionId,
          traceId,
          parentRevisionId: null,
          branchKind: "final",
          eventWatermark: "1",
          createdAt: "2026-08-03T00:00:01.000Z",
          sourceJobId: null,
          stale: false,
        },
      },
    }),
  );
  await page.route(`**/api/v1/traces/${traceId}/graph`, async (route) =>
    route.fulfill({
      json: {
        revision: {
          id: revisionId,
          traceId,
          parentRevisionId: null,
          branchKind: "final",
          eventWatermark: "1",
          createdAt: "2026-08-03T00:00:01.000Z",
          sourceJobId: null,
          stale: false,
        },
        nodes: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            logicalNodeId: nodeId,
            traceId,
            title: "Verified result",
            kind: "result",
            status: "completed",
            claims: [
              {
                kind: "outcome",
                text: "The test passed",
                provenance: "stated",
                confidence: "high",
                evidenceEventIds: [eventId],
              },
            ],
            layout: null,
            pinnedByHuman: false,
            primaryParentId: null,
            primaryAgentId: "backend",
            participantAgentIds: ["backend"],
            artifactIds: [],
            startedAt: null,
            endedAt: null,
          },
        ],
        edges: [],
      },
    }),
  );
  await page.goto(`/traces/${traceId}`);
  await expect(page.getByRole("heading", { name: "Intent Graph" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent Gantt" })).toBeVisible();
  await page.getByText("RESULT · Verified result").click();
  await expect(page.getByText("The test passed")).toBeVisible();
  await page.getByRole("button", { name: /#1 Escaped/ }).click();
  await expect(page.locator("main script")).toHaveCount(0);
  await expect(page.getByText("Escaped <script>alert(1)</script>", { exact: true })).toBeVisible();
  await page.getByLabel("Known at ingest watermark 1").fill("0");
  await expect(page.getByText("0 immutable facts")).toBeVisible();
});

test("keeps keyboard focus visible at 200 percent zoom and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "从执行事实到可核验证据图" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

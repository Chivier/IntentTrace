import { createHash } from "node:crypto";

import { loadRuntimeConfig } from "@intenttrace/config";
import { IntentTraceRepository, StaleSummaryJobError } from "@intenttrace/db";
import { applyProviderPatch } from "@intenttrace/intent-reducer";
import {
  DeepSeekJsonSummaryProvider,
  FoundationMockSummaryProvider,
  OpenAIResponsesSummaryProvider,
  ProviderUnavailableError,
  calculateProviderCost,
  type SummaryProvider,
} from "@intenttrace/summarizer";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import postgres from "postgres";

import { SUMMARY_QUEUE_NAME } from "./policy.js";

const config = loadRuntimeConfig();
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(SUMMARY_QUEUE_NAME, { connection: redis });
const sql = postgres(config.DATABASE_URL, { max: 4 });
const repository = new IntentTraceRepository(sql);
function createProvider(): SummaryProvider {
  if (config.PROVIDER_MODE === "openai") {
    return new OpenAIResponsesSummaryProvider({
      apiKey: config.OPENAI_API_KEY!,
      model: config.OPENAI_MODEL!,
      baseUrl: config.OPENAI_BASE_URL,
      timeoutMs: config.PROVIDER_TIMEOUT_MS,
      maxEvents: config.PROVIDER_MAX_EVENTS,
    });
  }
  if (config.PROVIDER_MODE === "deepseek") {
    return new DeepSeekJsonSummaryProvider({
      apiKey: config.DEEPSEEK_API_KEY!,
      model: config.DEEPSEEK_MODEL!,
      baseUrl: config.DEEPSEEK_BASE_URL,
      timeoutMs: config.PROVIDER_TIMEOUT_MS,
      maxEvents: config.PROVIDER_MAX_EVENTS,
    });
  }
  return new FoundationMockSummaryProvider();
}
const provider = createProvider();
const providerModel =
  config.PROVIDER_MODE === "openai"
    ? config.OPENAI_MODEL!
    : config.PROVIDER_MODE === "deepseek"
      ? config.DEEPSEEK_MODEL!
      : provider.id;
let shuttingDown = false;
let dispatchTimer: NodeJS.Timeout | undefined;

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const worker = new Worker<{ summaryJobId: string }>(
  SUMMARY_QUEUE_NAME,
  async (bullJob) => {
    const context = await repository.claimSummaryJob(bullJob.data.summaryJobId);
    if (!context) return { skipped: true };
    try {
      if (
        provider.egress === "cloud" &&
        (await repository.getProviderSpendToday()) >= config.PROVIDER_DAILY_BUDGET_USD
      ) {
        throw new ProviderUnavailableError("budget");
      }
      const patch = await provider.summarizeChunk({
        jobNonce: context.jobNonce,
        baseRevisionId: context.baseRevisionId,
        eventSketch: context.eventSketch,
        allowedEventIds: context.allowedEventIds,
        allowedArtifactIds: context.allowedArtifactIds,
        allowedAgentIds: context.allowedAgentIds,
        allowedNodeIds: context.graph.nodes.map((node) => node.logicalNodeId),
        locale: "zh-CN",
      });
      const reduced = applyProviderPatch(patch, context.graph, {
        expectedBaseRevisionId: context.baseRevisionId,
        expectedJobNonce: context.jobNonce,
        allowedEventIds: new Set(context.allowedEventIds),
        allowedArtifactIds: new Set(context.allowedArtifactIds),
        allowedAgentIds: new Set(context.allowedAgentIds),
        allowedNodeIds: new Set(context.graph.nodes.map((node) => node.logicalNodeId)),
        allowedEdgeIds: new Set(context.graph.edges.map((edge) => edge.logicalEdgeId)),
        pinnedNodeIds: new Set(
          context.graph.nodes
            .filter((node) => node.pinnedByHuman)
            .map((node) => node.logicalNodeId),
        ),
      });
      if (!reduced.ok) {
        await repository.failSummaryJob(
          context.id,
          reduced.issues[0]?.code ?? "patch_rejected",
          false,
        );
        return { rejected: reduced.issues };
      }
      const usage = provider.takeUsage?.() ?? null;
      const costUsd = usage
        ? calculateProviderCost(
            config.PROVIDER_MODE,
            providerModel,
            usage.inputTokens,
            usage.outputTokens,
          )
        : null;
      const revisionId = await repository.commitSummaryJob(context.id, {
        state: reduced.state,
        changedNodeIds: reduced.changedNodeIds,
        changedEdgeIds: reduced.changedEdgeIds,
        provider: provider.id,
        model: providerModel,
        requestHash: hash({ inputHash: context.inputHash, sketch: context.eventSketch }),
        responseHash: hash(patch),
        diagnostics: reduced.diagnostics,
        egress: provider.egress,
        ...(usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } : {}),
        ...(costUsd === null ? {} : { costUsd }),
      });
      return { revisionId };
    } catch (error) {
      if (error instanceof ProviderUnavailableError) {
        await repository.failSummaryJob(context.id, error.code, false);
        return { rawOnly: true, reason: error.code };
      }
      if (!(error instanceof StaleSummaryJobError)) {
        await repository.failSummaryJob(
          context.id,
          error instanceof Error ? error.name : "worker_failure",
          true,
        );
      }
      throw error;
    }
  },
  { connection: redis, concurrency: 1 },
);

async function dispatch(): Promise<void> {
  if (shuttingDown) return;
  for (const summaryJobId of await repository.listRunnableSummaryJobIds()) {
    await queue.add("summarize", { summaryJobId }, { removeOnComplete: true, removeOnFail: true });
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  if (dispatchTimer) clearInterval(dispatchTimer);
  process.stdout.write(`IntentTrace worker received ${signal}; closing worker and connections.\n`);
  await worker.close();
  await queue.close();
  await redis.quit().catch(() => undefined);
  await sql.end();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).finally(() => {
      process.exitCode = 0;
    });
  });
}

try {
  await Promise.all([queue.waitUntilReady(), worker.waitUntilReady()]);
  await dispatch();
  dispatchTimer = setInterval(
    () => void dispatch().catch((error) => worker.emit("error", error)),
    2000,
  );
  process.stdout.write(
    `IntentTrace worker is consuming ${SUMMARY_QUEUE_NAME} with PostgreSQL idempotency and ${provider.id}.\n`,
  );
} catch (error) {
  process.stderr.write(`IntentTrace worker failed to start: ${String(error)}\n`);
  await shutdown("startup-failure");
  process.exitCode = 1;
}
